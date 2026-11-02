"""cdp_lite.py: a small Chrome DevTools Protocol client (Python standard library only) with flattened
sessions, so one connection to the BROWSER can drive a tab and hear Network events from its
out-of-process iframes too. The WebSocket part is the one in tools/lab-recorder-v3/cdp.py (copied, not
imported, so the recorder is never touched). Local connections only (ws://127.0.0.1)."""
from __future__ import annotations

import base64
import json
import os
import socket
import struct
import time
import urllib.request
from typing import Any, Callable


class CDPError(RuntimeError):
    pass


def http_json(port: int, path: str, timeout: float = 3.0) -> Any:
    with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


class WebSocket:
    def __init__(self, url: str, timeout: float = 20.0):
        assert url.startswith("ws://127.0.0.1:") or url.startswith("ws://localhost:"), url
        rest = url[5:]
        hostport, _, path = rest.partition("/")
        host, _, port = hostport.partition(":")
        self.sock = socket.create_connection((host, int(port or 80)), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((f"GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                           f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise CDPError("websocket handshake closed early")
            buf += chunk
        head, _, self._buf = buf.partition(b"\r\n\r\n")
        if b" 101 " not in head.split(b"\r\n", 1)[0]:
            raise CDPError("websocket handshake refused: " + head.decode("latin1")[:200])

    def _read(self, n: int) -> bytes:
        while len(self._buf) < n:
            chunk = self.sock.recv(1 << 20)
            if not chunk:
                raise CDPError("websocket closed")
            self._buf += chunk
        out, self._buf = self._buf[:n], self._buf[n:]
        return out

    def send(self, text: str) -> None:
        data = text.encode("utf-8")
        mask = os.urandom(4)
        n = len(data)
        head = bytes([0x81])
        if n < 126:
            head += bytes([0x80 | n])
        elif n < 65536:
            head += bytes([0x80 | 126]) + struct.pack(">H", n)
        else:
            head += bytes([0x80 | 127]) + struct.pack(">Q", n)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        self.sock.sendall(head + mask + masked)

    def recv(self, timeout: float | None = None) -> str:
        self.sock.settimeout(timeout)
        message = b""
        while True:
            b1, b2 = self._read(2)
            fin, opcode = b1 & 0x80, b1 & 0x0F
            n = b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read(8))[0]
            payload = self._read(n)
            if opcode == 0x8:
                raise CDPError("websocket closed by peer")
            if opcode == 0x9:
                mask = os.urandom(4)
                self.sock.sendall(bytes([0x8A, 0x80 | len(payload)]) + mask +
                                  bytes(b ^ mask[i % 4] for i, b in enumerate(payload)))
                continue
            if opcode == 0xA:
                continue
            message += payload
            if fin:
                return message.decode("utf-8")

    def close(self) -> None:
        try:
            self.sock.close()
        except OSError:
            pass


class Browser:
    """One connection to Chrome's browser endpoint. `call(method, params, session)`; every event that
    arrives (on any session) is appended to self.events with its sessionId."""

    def __init__(self, port: int):
        self.port = port
        self.ws = WebSocket(http_json(port, "/json/version")["webSocketDebuggerUrl"])
        self._id = 0
        self.events: list[dict] = []
        self.on_event: Callable[[dict], None] | None = None

    def _handle(self, msg: dict) -> None:
        msg["_t"] = time.time()
        self.events.append(msg)
        if self.on_event:
            self.on_event(msg)

    def call(self, method: str, params: dict | None = None, session: str | None = None, timeout: float = 20.0) -> dict:
        self._id += 1
        mid = self._id
        m = {"id": mid, "method": method, "params": params or {}}
        if session:
            m["sessionId"] = session
        self.ws.send(json.dumps(m))
        end = time.time() + timeout
        while True:
            left = end - time.time()
            if left <= 0:
                raise CDPError(f"timeout waiting for {method}")
            msg = json.loads(self.ws.recv(timeout=left))
            if msg.get("id") == mid:
                if "error" in msg:
                    raise CDPError(f"{method}: {msg['error']}")
                return msg.get("result", {})
            if "method" in msg:
                self._handle(msg)

    def pump(self, seconds: float) -> None:
        """Read events for `seconds`."""
        end = time.time() + seconds
        while True:
            left = end - time.time()
            if left <= 0:
                return
            try:
                msg = json.loads(self.ws.recv(timeout=left))
            except (socket.timeout, TimeoutError):
                return
            if "method" in msg:
                self._handle(msg)

    def wait_event(self, pred: Callable[[dict], bool], timeout: float = 10.0, since: int = 0) -> dict:
        for e in self.events[since:]:
            if pred(e):
                return e
        end = time.time() + timeout
        while time.time() < end:
            n = len(self.events)
            self.pump(min(0.2, max(0.01, end - time.time())))
            for e in self.events[n:]:
                if pred(e):
                    return e
        raise CDPError("event not seen in time")

    def evaluate(self, session: str, expression: str, await_promise: bool = False, user_gesture: bool = False) -> Any:
        r = self.call("Runtime.evaluate", {"expression": expression, "returnByValue": True,
                                           "awaitPromise": await_promise, "userGesture": user_gesture}, session)
        if "exceptionDetails" in r:
            d = r["exceptionDetails"]
            raise CDPError("JS error: " + (d.get("exception", {}).get("description") or d.get("text", "")))
        return r["result"].get("value")

    def close(self) -> None:
        self.ws.close()
