#!/usr/bin/env python3
"""run_firefox.py: the same click-through in headless Firefox over WebDriver BiDi (Python stdlib only;
reuses the WebSocket class from cdp_lite.py). Fresh profile, no network (dead proxy), port 5393.

    python3 run_firefox.py --url file:///.../index.html --label fixed --out results/fixed-firefox

Checks: load, Sign in -> spinner resolves into 'Continue -> server reply', step 3 Set-Cookie completes,
step 4 request + capture, replay, step 6 HTTPS run, keyboard arrows through all steps, auto-play,
the ?step=6&https=1 deep link, and the same with prefers-reduced-motion (Firefox pref
ui.prefersReducedMotion=1). Screenshots are written for the main states.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cdp_lite import WebSocket  # noqa: E402

FIREFOX = "/usr/bin/firefox"
PORT = 5393   # 5392 was held by another agent's browser when this was written
HANG = 8.0

PREFS = {
    "remote.active-protocols": 1,            # BiDi
    "browser.shell.checkDefaultBrowser": False,
    "browser.startup.homepage_override.mstone": "ignore",
    "datareporting.policy.dataSubmissionEnabled": False,
    "toolkit.telemetry.reportingpolicy.firstRun": False,
    "app.update.enabled": False,
    "app.update.auto": False,
    "network.proxy.type": 1,                 # every non-loopback request goes to a dead proxy
    "network.proxy.http": "127.0.0.1", "network.proxy.http_port": 5335,
    "network.proxy.ssl": "127.0.0.1", "network.proxy.ssl_port": 5335,
    "network.proxy.no_proxies_on": "",
    "extensions.update.enabled": False,
    "browser.newtabpage.enabled": False,
    "layout.css.devPixelsPerPx": "1.0",
}


def port_in_use(port):
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


class Bidi:
    def __init__(self, port):
        self.ws = WebSocket(f"ws://127.0.0.1:{port}/session")
        self._id = 0
        self.events = []

    def call(self, method, params=None, timeout=20):
        self._id += 1
        mid = self._id
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        end = time.time() + timeout
        while True:
            m = json.loads(self.ws.recv(timeout=max(0.1, end - time.time())))
            if m.get("id") == mid:
                if m.get("type") == "error":
                    raise RuntimeError(f"{method}: {m.get('error')}: {m.get('message')}")
                return m.get("result", {})
            if m.get("type") == "event":
                self.events.append(m)

    def pump(self, seconds):
        end = time.time() + seconds
        while time.time() < end:
            try:
                m = json.loads(self.ws.recv(timeout=max(0.01, end - time.time())))
            except (socket.timeout, TimeoutError):
                return
            if m.get("type") == "event":
                self.events.append(m)


class Firefox:
    def __init__(self, scratch: Path, reduced: bool, width: int, height: int):
        self.scratch, self.reduced, self.w, self.h = scratch, reduced, width, height
        self.proc = None
        self.profile = None
        self.bidi = None
        self.ctx = None

    def __enter__(self):
        if port_in_use(PORT):
            raise RuntimeError(f"port {PORT} in use; refusing to start")
        # /usr/bin/firefox is the snap on this machine: a confined snap cannot read a profile under
        # /tmp, so the throw-away profile lives next to this script (under $HOME) and is deleted after.
        self.scratch.mkdir(parents=True, exist_ok=True)
        self.profile = Path(tempfile.mkdtemp(prefix="ff-profile-", dir=self.scratch))
        prefs = dict(PREFS)
        if self.reduced:
            prefs["ui.prefersReducedMotion"] = 1
        (self.profile / "user.js").write_text("".join(f"user_pref({json.dumps(k)}, {json.dumps(v)});\n" for k, v in prefs.items()))
        env = {k: v for k, v in os.environ.items() if k not in ("WAYLAND_DISPLAY", "DISPLAY", "XDG_SESSION_TYPE")}
        env["MOZ_HEADLESS"] = "1"
        self.proc = subprocess.Popen([FIREFOX, "-headless", "-no-remote", "-new-instance", "-profile", str(self.profile),
                                      f"--remote-debugging-port={PORT}", f"--window-size={self.w},{self.h}", "about:blank"],
                                     env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        end = time.time() + 90
        while time.time() < end:
            if port_in_use(PORT):
                break
            time.sleep(0.2)
        else:
            self.__exit__()
            raise RuntimeError("Firefox did not open its BiDi port")
        time.sleep(0.5)
        self.bidi = Bidi(PORT)
        r = self.bidi.call("session.new", {"capabilities": {}})
        self.version = r.get("capabilities", {}).get("browserVersion", "?")
        self.bidi.call("session.subscribe", {"events": ["log.entryAdded"]})
        tree = self.bidi.call("browsingContext.getTree")
        self.ctx = tree["contexts"][0]["context"]
        try:
            self.bidi.call("browsingContext.setViewport", {"context": self.ctx, "viewport": {"width": self.w, "height": self.h}})
        except Exception:
            pass
        return self

    def __exit__(self, *exc):
        if self.bidi:
            try:
                self.bidi.call("browser.close", timeout=5)
            except Exception:
                pass
            self.bidi.ws.close()
        if self.proc:
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
            for sig in (signal.SIGTERM, signal.SIGKILL):
                try:
                    os.killpg(self.proc.pid, sig)
                    time.sleep(0.5)
                except ProcessLookupError:
                    break
        if self.profile and self.profile.exists():
            shutil.rmtree(self.profile, ignore_errors=True)

    # ---- page helpers
    def ev(self, js):
        r = self.bidi.call("script.evaluate", {"expression": f"JSON.stringify((()=>{{ return ({js}); }})())",
                                               "target": {"context": self.ctx}, "awaitPromise": False})
        if r.get("type") == "exception":
            raise RuntimeError("JS exception: " + json.dumps(r.get("exceptionDetails", {}).get("text")))
        v = r["result"].get("value")
        return json.loads(v) if isinstance(v, str) else v

    def goto(self, url):
        self.bidi.call("browsingContext.navigate", {"context": self.ctx, "url": url, "wait": "complete"}, timeout=30)
        self.bidi.pump(0.4)

    def click(self, selector):
        self.ev(f"document.querySelector({selector!r}).scrollIntoView({{block:'center'}})")
        r = self.ev(f"(()=>{{const e=document.querySelector({selector!r});if(!e)return null;const b=e.getBoundingClientRect();return {{x:b.left+b.width/2,y:b.top+b.height/2,w:b.width}}}})()")
        if not r or not r["w"]:
            raise RuntimeError(f"cannot click {selector}")
        self.bidi.call("input.performActions", {"context": self.ctx, "actions": [{"type": "pointer", "id": "m", "actions": [
            {"type": "pointerMove", "x": int(r["x"]), "y": int(r["y"])}, {"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0}]}]})
        self.bidi.pump(0.05)

    def key(self, value):
        self.bidi.call("input.performActions", {"context": self.ctx, "actions": [{"type": "key", "id": "k", "actions": [
            {"type": "keyDown", "value": value}, {"type": "keyUp", "value": value}]}]})
        self.bidi.pump(0.05)

    def wait(self, pred, timeout=HANG):
        t0 = time.time()
        while time.time() - t0 < timeout:
            if self.ev(f"!!({pred})"):
                return round(time.time() - t0, 2)
            self.bidi.pump(0.1)
        return None

    def shot(self, path: Path):
        r = self.bidi.call("browsingContext.captureScreenshot", {"context": self.ctx}, timeout=30)
        path.write_bytes(base64.b64decode(r["data"]))


STATE = """{step: document.querySelector('#stepCount').textContent.trim(), busy: !!document.querySelector('.login-btn.busy'),
 sent: !!document.querySelector('[data-action="signin"].sent'), cont: !!document.querySelector('.continue-btn'),
 account: !!document.querySelector('.credit'), jar: !!document.querySelector('.jar-row'),
 cap: [...document.querySelectorAll('.cap-line, .cap-empty')].map(e=>e.textContent.trim()),
 capResult: !document.getElementById('capResult').hidden, replayDisabled: document.getElementById('btnReplay').disabled,
 keys: [...document.querySelectorAll('.log-entry')].map(e=>e.dataset.key), packets: document.querySelectorAll('.packet').length,
 mode: document.querySelector('#modeSeg button.on').dataset.mode, play: document.querySelector('#playLabel').textContent.trim(),
 width: innerWidth, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, tls: document.getElementById('btnRunTls').textContent.trim()}"""

ARROW_RIGHT, SPACE = "", " "


def run(cfg_name, url, out, reduced, w, h, scratch, log):
    res = {"config": cfg_name, "width": w, "height": h, "reduced": reduced, "checks": {}, "verdict": "PASS", "console": []}

    def check(k, ok, d=""):
        res["checks"][k] = {"ok": bool(ok), "detail": d}
        if not ok:
            res["verdict"] = "FAIL"
        log.append(f"  [{'ok' if ok else 'FAIL'}] {cfg_name}: {k} {d}")

    sep = "&" if "?" in url else "?"
    with Firefox(scratch, reduced, w, h) as ff:
        res["browser"] = "Firefox " + ff.version
        try:
            ff.goto(url)
            st = ff.ev(STATE)
            check("load", st["step"] == "Step 1 of 6", f"innerWidth={st['width']} reduced={st['reduced']}")
            check("reduced_motion_applied", st["reduced"] == reduced, "")
            ff.shot(out / f"{cfg_name}-01-load.png")
            ff.click('[data-action="signin"]')
            t = ff.wait("document.querySelector('#stepCount').textContent.trim()==='Step 2 of 6'", 3)
            check("signin_goes_to_step2", t is not None, f"{t}s")
            t = ff.wait("!document.querySelector('.login-btn.busy')", 6)
            st = ff.ev(STATE)
            res["spinner_still_busy_after_6s"] = t is None
            check("signin_spinner_resolves", t is not None, "spinner still spinning after 6 s" if t is None else f"after {t}s sent={st['sent']}")
            ff.shot(out / f"{cfg_name}-02-after-signin.png")
            if st["sent"]:
                ff.click('[data-action="signin"]')
            else:
                ff.click('#btnNext')
            t = ff.wait("document.querySelector('.jar-row') && document.querySelector('.continue-btn')")
            check("step3_setcookie_completes", t is not None, f"{t}s")
            ff.shot(out / f"{cfg_name}-03-cookie-set.png")
            ff.click('.continue-btn' if ff.ev(STATE)["cont"] else '#btnNext')
            t = ff.wait("document.querySelector('.credit') && [...document.querySelectorAll('.cap-line')].some(e=>/Cookie:/.test(e.textContent))")
            check("step4_request_and_capture_complete", t is not None, f"{t}s")
            ff.shot(out / f"{cfg_name}-04-captured.png")
            ff.click('#btnReplay')
            t = ff.wait("!document.getElementById('capResult').hidden && document.querySelector('[data-key=replay]')")
            check("step5_replay_completes", t is not None, f"{t}s")
            ff.shot(out / f"{cfg_name}-05-replayed.png")
            ff.click('#btnNext')
            t = ff.wait("document.querySelector('#stepCount').textContent.trim()==='Step 6 of 6' && !document.getElementById('defenseStrip').hidden")
            check("step6_defense_shown", t is not None, f"{t}s")
            ff.click('#btnRunTls')
            t = ff.wait("[...document.querySelectorAll('.cap-line')].some(e=>/application_data/.test(e.textContent)) && document.querySelectorAll('.packet').length===0 && document.getElementById('btnRunTls').disabled")
            check("step6_https_run_completes", t is not None, f"{t}s")
            ff.shot(out / f"{cfg_name}-06-https.png")
            # keyboard: reset, five arrows
            ff.key("r")
            check("key_r_reset", ff.ev(STATE)["step"] == "Step 1 of 6", "")
            for _ in range(5):
                ff.key(ARROW_RIGHT)
                t = ff.wait("document.querySelectorAll('.packet').length===0")
                if t is None:
                    break
            st = ff.ev(STATE)
            check("keys_arrow_right_x5", t is not None and st["step"] == "Step 6 of 6" and st["account"] and "replay" in st["keys"], f"step={st['step']}")
            ff.key("t")
            t = ff.wait("[...document.querySelectorAll('.cap-line')].some(e=>/application_data/.test(e.textContent)) && document.querySelectorAll('.packet').length===0")
            check("key_t_https", t is not None and ff.ev(STATE)["mode"] == "https", f"{t}s")
            ff.key("a")
            st = ff.ev(STATE)
            check("key_a_attacker_off", any("not in the path" in l for l in st["cap"]) and st["replayDisabled"], "")
            # auto-play from the start
            ff.click('#btnReset')
            ff.click('#btnPlay')
            t = ff.wait("document.querySelector('#stepCount').textContent.trim()==='Step 6 of 6' && document.querySelector('#playLabel').textContent.trim()==='Play' && document.querySelectorAll('.packet').length===0", 45)
            st = ff.ev(STATE)
            check("autoplay_reaches_step6", t is not None and st["account"] and "replay" in st["keys"] and "defense" in st["keys"], f"{t}s keys={st['keys']}")
            ff.shot(out / f"{cfg_name}-08-autoplay-end.png")
            ff.goto(url + sep + "step=6&https=1")
            st = ff.ev(STATE)
            check("deeplink_step6_https", st["step"] == "Step 6 of 6" and st["mode"] == "https" and any("application_data" in l for l in st["cap"]) and st["tls"] == "Encrypted ✓", "")
            ff.goto(url + sep + "step=4&attacker=0")
            st = ff.ev(STATE)
            check("deeplink_step4_noattacker", st["step"] == "Step 4 of 6" and any("not in the path" in l for l in st["cap"]) and st["replayDisabled"], "")
        except Exception as e:
            check("driver_exception", False, repr(e))
            try:
                ff.shot(out / f"{cfg_name}-99-exception.png")
            except Exception:
                pass
        errs = [e for e in ff.bidi.events if e.get("method") == "log.entryAdded" and e["params"].get("level") in ("error", "warn")]
        res["console"] = [str(e["params"].get("text")) for e in errs]
        check("no_console_errors", not errs, "; ".join(res["console"])[:300])
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--label", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    scratch = Path(__file__).resolve().parent / "ff-profiles-tmp"   # must be under $HOME for the snap
    log = []
    results = []
    for name, reduced, w, h in [("ff-1920x1080", False, 1920, 1080), ("ff-1920x1080-reduced", True, 1920, 1080),
                                ("ff-1366x768", False, 1366, 768), ("ff-1024x768-stacked", False, 1024, 768)]:
        t0 = time.time()
        r = run(name, args.url, out, reduced, w, h, scratch, log)
        r["seconds"] = round(time.time() - t0, 1)
        results.append(r)
        print(f"{r['verdict']:4} {name:22} {r.get('browser','?'):16} {r['seconds']:6.1f}s  " + "; ".join(k for k, v in r["checks"].items() if not v["ok"]), flush=True)
    (out / "results.json").write_text(json.dumps({"label": args.label, "url": args.url, "results": results}, indent=1))
    (out / "log.txt").write_text("\n".join(log) + "\n")
    lines = [f"## {args.label}: {results[0].get('browser', 'Firefox')} (headless)", "", f"URL: `{args.url}`", "",
             "| configuration | CSS viewport | reduced motion | spinner stuck after Sign in? | failed checks | console errors | verdict |", "|---|---|---|---|---|---|---|"]
    for r in results:
        failed = ", ".join(k for k, v in r["checks"].items() if not v["ok"]) or "none"
        lines.append(f"| {r['config']} | {r['width']}x{r['height']} | {'on' if r['reduced'] else 'off'} | {'yes' if r.get('spinner_still_busy_after_6s') else 'no'} | {failed} | {len(r['console'])} | {r['verdict']} |")
    (out / "results.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines[4:]))


if __name__ == "__main__":
    main()
