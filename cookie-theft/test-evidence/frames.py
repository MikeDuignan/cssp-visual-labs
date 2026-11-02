#!/usr/bin/env python3
"""frames.py: capture a frame every ~150 ms across each animated step, to prove the "cause before
effect" rule: a visible packet crosses the wire BEFORE any panel (server log, session store, cookie
jar, capture, account page) changes.

    python3 frames.py --url file:///.../index.html --out frames

Runs real Chrome on its own Xvfb display :118 / port 5394 (so it can run beside the matrix on :117).
For each step it records, at every frame: the step number, whether a .packet element is on screen and
its label, and which panel flags are set (server log keys, jar filled, capture lines, account shown).
That per-frame state is written to frames/<step>.json next to the PNGs, so the ordering can be checked
in numbers as well as by eye. Fresh profile, no network (dead proxy).
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
import cdp_lite

CHROME = "/usr/bin/google-chrome"
DISPLAY = ":118"
PORT = 5394
FLAGS = [
    "--ozone-platform=x11", "--window-position=0,0", "--window-size=1920,1080",
    "--force-device-scale-factor=1", "--no-first-run", "--no-default-browser-check",
    "--password-store=basic", "--disable-infobars", "--disable-features=Translate,MediaRouter",
    "--hide-crash-restore-bubble", "--disable-background-networking", "--disable-gpu",
    "--disable-dev-shm-usage", "--disable-sync", "--no-pings", "--disable-breakpad",
    "--proxy-server=http://127.0.0.1:5335",
]

PROBE = r"""(() => {
  const pkt = document.querySelector('.packet');
  const label = pkt ? pkt.textContent.replace(/\s+/g,' ').trim().slice(0,48) : null;
  const q = (s) => document.querySelector(s);
  return {
    step: (q('#stepCount')||{}).textContent ? q('#stepCount').textContent.trim() : null,
    packet: !!pkt, packetLabel: label, packets: document.querySelectorAll('.packet').length,
    serverKeys: [...document.querySelectorAll('.log-entry')].map(e=>e.dataset.key),
    session: !!q('.sess-row'), jar: !!q('.jar-row'), account: !!q('.credit'),
    capLines: [...document.querySelectorAll('.cap-line')].map(e=>e.textContent.replace(/\s+/g,' ').trim().slice(0,60)),
    capResult: !q('#capResult').hidden, mode: (q('#modeSeg button.on')||{}).dataset ? q('#modeSeg button.on').dataset.mode : null
  };
})()"""


def stop_group(pid):
    if not pid:
        return
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(pid, sig)
        except ProcessLookupError:
            return
        t = time.time() + 4
        while time.time() < t:
            try:
                os.killpg(pid, 0)
            except ProcessLookupError:
                return
            time.sleep(0.1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    scratch = Path(os.environ.get("SCRATCH", tempfile.gettempdir())) / "cookie-theft-frames"
    scratch.mkdir(parents=True, exist_ok=True)

    n = int(DISPLAY[1:])
    if Path(f"/tmp/.X11-unix/X{n}").exists():
        raise SystemExit(f"display {DISPLAY} already exists; refusing")
    xvfb = subprocess.Popen(["Xvfb", DISPLAY, "-screen", "0", "1920x1080x24", "-nolisten", "tcp", "-dpi", "96"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    for _ in range(100):
        if Path(f"/tmp/.X11-unix/X{n}").exists():
            break
        time.sleep(0.05)
    profile = Path(tempfile.mkdtemp(prefix="frames-chrome-", dir=scratch))
    env = {k: v for k, v in os.environ.items() if k not in ("WAYLAND_DISPLAY", "XDG_SESSION_TYPE", "DBUS_SESSION_BUS_ADDRESS")}
    env["DISPLAY"] = DISPLAY
    chrome = subprocess.Popen([CHROME, f"--user-data-dir={profile}", f"--remote-debugging-port={PORT}",
                               "--remote-debugging-address=127.0.0.1", *FLAGS, "about:blank"],
                              env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    try:
        end = time.time() + 30
        while time.time() < end:
            try:
                cdp_lite.http_json(PORT, "/json/version")
                break
            except OSError:
                time.sleep(0.2)
        b = cdp_lite.Browser(PORT)
        tid = b.call("Target.createTarget", {"url": "about:blank"})["targetId"]
        sid = b.call("Target.attachToTarget", {"targetId": tid, "flatten": True})["sessionId"]
        b.call("Runtime.enable", session=sid)
        b.call("Page.enable", session=sid)

        def ev(js):
            return b.evaluate(sid, js)

        def goto(url):
            k = len(b.events)
            b.call("Page.navigate", {"url": url}, sid)
            b.wait_event(lambda e: e.get("method") == "Page.loadEventFired" and e.get("sessionId") == sid, timeout=20, since=k)
            b.pump(0.3)

        def rect(sel):
            return ev(f"(()=>{{const e=document.querySelector({sel!r});if(!e)return null;const r=e.getBoundingClientRect();return{{x:r.left+r.width/2,y:r.top+r.height/2,w:r.width}}}})()")

        def click(sel):
            r = rect(sel)
            for typ in ("mousePressed", "mouseReleased"):
                b.call("Input.dispatchMouseEvent", {"type": typ, "x": r["x"], "y": r["y"], "button": "left", "clickCount": 1}, sid)

        def shot(path):
            d = b.call("Page.captureScreenshot", {"format": "png"}, sid, timeout=30)
            path.write_bytes(base64.b64decode(d["data"]))

        def capture_seq(name, frames, interval=0.15):
            """Take `frames` screenshots `interval` apart, recording the probe state at each."""
            seq = []
            for i in range(frames):
                t = round(i * interval, 2)
                st = ev(PROBE)
                shot(out / f"{name}-f{i:02d}-{int(t*1000):04d}ms.png")
                seq.append({"frame": i, "t": t, **st})
                b.pump(interval)
            (out / f"{name}.json").write_text(json.dumps(seq, indent=1))
            # print the first frame at which each panel content first appears, vs first packet frame
            first_pkt = next((f["t"] for f in seq if f["packet"]), None)
            def first(cond):
                return next((f["t"] for f in seq if cond(f)), None)
            print(f"  {name}: first packet at {first_pkt}s; "
                  f"login-log {first(lambda f: 'login' in f['serverKeys'])}, "
                  f"setcookie-log {first(lambda f: 'setcookie' in f['serverKeys'])}, "
                  f"session-store {first(lambda f: f['session'])}, jar {first(lambda f: f['jar'])}, "
                  f"req-log {first(lambda f: 'req' in f['serverKeys'])}, account {first(lambda f: f['account'])}, "
                  f"capture-cookie {first(lambda f: any('Cookie:' in l or 'STOLEN' in l for l in f['capLines']))}, "
                  f"replay-log {first(lambda f: 'replay' in f['serverKeys'])}, "
                  f"defense-log {first(lambda f: 'defense' in f['serverKeys'])}, "
                  f"capResult {first(lambda f: f['capResult'])}", flush=True)
            return seq

        b.call("Emulation.setDeviceMetricsOverride", {"width": 1920, "height": 1080, "deviceScaleFactor": 1, "mobile": False}, sid)

        # STEP 2: from step 1, click Sign in -> POST /login must cross before the server login line.
        goto(args.url)
        b.pump(0.2)
        click('[data-action="signin"]')
        capture_seq("step2-login", 16)

        # STEP 3: click Continue -> Set-Cookie must leave the server (store+log appear at departure),
        # cross the wire, then the jar fills on arrival.
        click('[data-action="signin"]')  # the "Continue -> server reply" button
        capture_seq("step3-setcookie", 18)

        # STEP 4: click Continue to /account -> GET crosses, attacker copies, then account+req appear.
        click('.continue-btn')
        capture_seq("step4-request", 18)

        # STEP 5: click Replay stolen cookie -> replay packet crosses before the replay log + result.
        click('#btnReplay')
        capture_seq("step5-replay", 18)

        # STEP 6: Next to the defense step (fly cleartext), then Run over HTTPS (fly TLS packet).
        click('#btnNext')
        capture_seq("step6-enter-http", 16)
        click('#btnRunTls')
        capture_seq("step6-https", 18)

        b.call("Target.closeTarget", {"targetId": tid})
        b.close()
    finally:
        try:
            stop_group(chrome.pid)
        finally:
            stop_group(xvfb.pid)
            if profile.exists():
                shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main()
