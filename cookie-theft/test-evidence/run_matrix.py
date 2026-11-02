#!/usr/bin/env python3
"""run_matrix.py: drive the Cookie Theft page through real Google Chrome (DevTools protocol) on a
private Xvfb display and record whether any step hangs.

    python3 run_matrix.py --url file:///.../index.html --label fixed --out results/fixed
    python3 run_matrix.py --url https://mikeduignan.github.io/cssp-visual-labs/cookie-theft/ --online ...

Only the browser it starts itself is touched (fresh profile, display :117, debugging port 5391 on
127.0.0.1). Nothing is sent anywhere except the page URL being loaded (and only with --online).
Output: results.json, results.md, and PNG screenshots in --out.

What one configuration runs (the "scenario"):
  1. load, check no console errors;
  2. click Sign in (real mouse event) and watch for 6 s: does anything beyond the spinner happen?
     (this is the state Mike reported); then press Next if still parked;
  3. step through all six steps with the on-screen controls (Continue buttons, Next, Replay stolen
     cookie, Run over HTTPS), each with a hang timeout;
  4. Reset, then auto-play from step 1 to step 6 with Play;
  5. keyboard shortcuts (arrows, T, A, R, Space, Esc), HTTP/HTTPS and attacker toggles;
  6. the three documented deep links.
Hidden-tab and CPU-throttled variants are separate configurations.
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
import cdp_lite  # noqa: E402

CHROME = "/usr/bin/google-chrome"
DISPLAY = ":117"
PORT = 5391
HANG = 8.0          # seconds a step may take before we call it a hang (longest animation is ~1.5 s)

FLAGS = [
    "--ozone-platform=x11", "--window-position=0,0", "--window-size=1920,1080",
    "--force-device-scale-factor=1", "--no-first-run", "--no-default-browser-check",
    "--password-store=basic", "--disable-infobars", "--disable-save-password-bubble",
    "--disable-features=Translate,TranslateUI,PasswordManagerOnboarding,MediaRouter,"
    "OptimizationHints,AutofillServerCommunication,GlobalMediaControls,SidePanelPinning",
    "--hide-crash-restore-bubble", "--disable-background-networking", "--disable-component-update",
    "--disable-sync", "--no-pings", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-session-crashed-bubble", "--noerrdialogs", "--disable-search-engine-choice-screen",
    "--no-service-autorun", "--disable-breakpad",
]
OFFLINE = ["--proxy-server=http://127.0.0.1:5335"]   # nothing listens there: no request can leave

# name, css width, css height, deviceScaleFactor, reduced motion, cpu throttle, hidden tab
CONFIGS = [
    ("1920x1080",            1920, 1080, 1,    False, 1, False),
    ("1920x1080-reduced",    1920, 1080, 1,    True,  1, False),
    ("1440x900",             1440, 900,  1,    False, 1, False),
    ("1366x768",             1366, 768,  1,    False, 1, False),
    ("1366x768-reduced",     1366, 768,  1,    True,  1, False),
    ("1280x720",             1280, 720,  1,    False, 1, False),
    ("1280x720-reduced",     1280, 720,  1,    True,  1, False),
    ("1024x768-stacked",     1024, 768,  1,    False, 1, False),
    ("1024x768-stacked-red", 1024, 768,  1,    True,  1, False),
    ("800x900-stacked",      800,  900,  1,    False, 1, False),
    ("zoom125-1536x864",     1536, 864,  1.25, False, 1, False),   # 1920 px screen, Chrome at 125 %
    ("zoom150-1280x720",     1280, 720,  1.5,  False, 1, False),   # 1920 px screen, Chrome at 150 %
    ("zoom200-960x540",      960,  540,  2,    False, 1, False),   # 1920 px screen, Chrome at 200 %
    ("zoom125-1093x614",     1093, 614,  1.25, False, 1, False),   # 1366 px laptop at 125 %: just under 1100
    ("1920x1080-cpu4x",      1920, 1080, 1,    False, 4, False),
    ("1366x768-cpu4x-red",   1366, 768,  1,    True,  4, False),
    ("1920x1080-hidden-tab", 1920, 1080, 1,    False, 1, True),
]


def port_in_use(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def stop_group(pid: int | None) -> None:
    if not pid:
        return
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(pid, sig)
        except ProcessLookupError:
            return
        end = time.time() + 5
        while time.time() < end:
            try:
                os.killpg(pid, 0)
            except ProcessLookupError:
                return
            time.sleep(0.1)


class Chrome:
    def __init__(self, scratch: Path, online: bool):
        self.scratch = scratch
        self.online = online
        self.xvfb = self.proc = None
        self.profile = None
        self.browser = None

    def __enter__(self):
        n = int(DISPLAY[1:])
        if Path(f"/tmp/.X11-unix/X{n}").exists():
            raise RuntimeError(f"display {DISPLAY} exists already; refusing to start")
        if port_in_use(PORT):
            raise RuntimeError(f"port {PORT} in use; refusing to start")
        self.xvfb = subprocess.Popen(["Xvfb", DISPLAY, "-screen", "0", "1920x1080x24", "-nolisten", "tcp", "-dpi", "96"],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        for _ in range(100):
            if Path(f"/tmp/.X11-unix/X{n}").exists():
                break
            time.sleep(0.05)
        self.scratch.mkdir(parents=True, exist_ok=True)
        self.profile = Path(tempfile.mkdtemp(prefix="cookie-theft-chrome-", dir=self.scratch))
        env = {k: v for k, v in os.environ.items() if k not in ("WAYLAND_DISPLAY", "XDG_SESSION_TYPE", "DBUS_SESSION_BUS_ADDRESS")}
        env["DISPLAY"] = DISPLAY
        args = [CHROME, f"--user-data-dir={self.profile}", f"--remote-debugging-port={PORT}",
                "--remote-debugging-address=127.0.0.1", *FLAGS, *([] if self.online else OFFLINE), "about:blank"]
        self.proc = subprocess.Popen(args, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        end = time.time() + 30
        while time.time() < end:
            try:
                self.version = cdp_lite.http_json(PORT, "/json/version")
                break
            except OSError:
                time.sleep(0.2)
        else:
            self.__exit__()
            raise RuntimeError("Chrome did not open its debugging port")
        self.browser = cdp_lite.Browser(PORT)
        return self

    def __exit__(self, *exc):
        if self.browser:
            try:
                self.browser.call("Browser.close", timeout=5)
            except Exception:
                pass
            self.browser.close()
        if self.proc:
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
            stop_group(self.proc.pid)
        if self.xvfb:
            stop_group(self.xvfb.pid)
        if self.profile and self.profile.exists():
            shutil.rmtree(self.profile, ignore_errors=True)


# ---------------------------------------------------------------- page driver
STATE_JS = r"""(() => {
  const q = (s) => document.querySelector(s);
  const t = (s) => { const e = q(s); return e ? e.textContent.trim() : null; };
  return {
    step: t('#stepCount'), title: t('#stepTitle'),
    busy: !!q('.login-btn.busy'), signin: !!q('.login-btn'), cont: !!q('.continue-btn'),
    sent: !!q('[data-action="signin"].sent'),
    spinner: !!q('.spinner'), account: !!q('.credit'), jar: !!q('.jar-row'),
    capLines: [...document.querySelectorAll('.cap-line, .cap-empty')].map(e => e.textContent.trim()),
    stepNo: parseInt((t('#stepCount') || '0').replace(/\D+/g, ' ').trim().split(' ')[0], 10),
    capResult: !(q('#capResult').hidden), replayDisabled: q('#btnReplay').disabled,
    serverKeys: [...document.querySelectorAll('.log-entry')].map(e => e.dataset.key),
    packets: document.querySelectorAll('.packet').length,
    mode: (q('#modeSeg button.on') || {}).dataset ? q('#modeSeg button.on').dataset.mode : null,
    attacker: q('#attackerToggle').checked, playLabel: t('#playLabel'),
    tls: t('#btnRunTls'), defense: !q('#defenseStrip').hidden,
    width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    hidden: document.hidden, fullscreen: !!document.fullscreenElement,
    expanded: !!q('.card.expanded'), focus: document.activeElement && (document.activeElement.id || document.activeElement.className || document.activeElement.tagName)
  };
})()"""


class Page:
    def __init__(self, b: cdp_lite.Browser, sid: str, log: list):
        self.b, self.sid, self.log = b, sid, log
        self.console: list[str] = []
        b.on_event = self._event
        b.call("Runtime.enable", session=sid)
        b.call("Log.enable", session=sid)
        b.call("Page.enable", session=sid)

    def _event(self, m):
        if m.get("sessionId") != self.sid:
            return
        meth = m.get("method")
        p = m.get("params", {})
        if meth == "Runtime.exceptionThrown":
            d = p["exceptionDetails"]
            self.console.append("EXCEPTION " + (d.get("exception", {}).get("description") or d.get("text", "")))
        elif meth == "Runtime.consoleAPICalled" and p.get("type") in ("error", "warning", "assert"):
            self.console.append(p["type"] + " " + " ".join(str(a.get("value", a.get("description", ""))) for a in p.get("args", [])))
        elif meth == "Log.entryAdded" and p["entry"].get("level") in ("error", "warning"):
            self.console.append("log:" + p["entry"]["level"] + " " + p["entry"].get("text", ""))

    def ev(self, js, await_promise=False):
        return self.b.evaluate(self.sid, js, await_promise=await_promise)

    def state(self):
        return self.ev(STATE_JS)

    def goto(self, url):
        n = len(self.b.events)
        self.b.call("Page.navigate", {"url": url}, self.sid)
        self.b.wait_event(lambda e: e.get("method") == "Page.loadEventFired" and e.get("sessionId") == self.sid, timeout=20, since=n)
        self.b.pump(0.4)

    def rect(self, selector):
        return self.ev(f"(()=>{{const e=document.querySelector({selector!r});if(!e)return null;const r=e.getBoundingClientRect();return {{x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}}}})()")

    def click(self, selector):
        r = self.rect(selector)
        if not r or r["w"] == 0:
            raise RuntimeError(f"cannot click {selector}: not on screen")
        # scroll into view first (stacked layouts scroll)
        self.ev(f"document.querySelector({selector!r}).scrollIntoView({{block:'center'}})")
        r = self.rect(selector)
        for typ in ("mouseMoved", "mousePressed", "mouseReleased"):
            self.b.call("Input.dispatchMouseEvent", {"type": typ, "x": r["x"], "y": r["y"], "button": "left", "clickCount": 1}, self.sid)
        self.b.pump(0.05)

    def key(self, key, code, vk, text=None):
        p = {"type": "keyDown", "key": key, "code": code, "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk}
        if text:
            p["text"] = text
        self.b.call("Input.dispatchKeyEvent", p, self.sid)
        self.b.call("Input.dispatchKeyEvent", {"type": "keyUp", "key": key, "code": code, "windowsVirtualKeyCode": vk}, self.sid)
        self.b.pump(0.05)

    def wait(self, js_pred, timeout=HANG, every=0.1):
        """Returns seconds taken, or None on timeout (= a hang)."""
        t0 = time.time()
        while time.time() - t0 < timeout:
            if self.ev(f"!!({js_pred})"):
                return round(time.time() - t0, 2)
            self.b.pump(every)
        return None

    def settle(self, timeout=HANG):
        """Wait until no packet is flying (all animations done)."""
        return self.wait("document.querySelectorAll('.packet').length===0", timeout)

    def shot(self, path: Path):
        d = self.b.call("Page.captureScreenshot", {"format": "png"}, self.sid, timeout=30)
        path.write_bytes(base64.b64decode(d["data"]))


KEYS = {"ArrowRight": ("ArrowRight", "ArrowRight", 39), "ArrowLeft": ("ArrowLeft", "ArrowLeft", 37),
        "Space": (" ", "Space", 32, " "), "t": ("t", "KeyT", 84, "t"), "a": ("a", "KeyA", 65, "a"),
        "r": ("r", "KeyR", 82, "r"), "f": ("f", "KeyF", 70, "f"), "Escape": ("Escape", "Escape", 27)}


def run_config(chrome: Chrome, cfg, base_url: str, out: Path, log: list) -> dict:
    name, w, h, dsf, reduced, cpu, hidden = cfg
    b = chrome.browser
    res = {"config": name, "width": w, "height": h, "dsf": dsf, "reduced": reduced, "cpu": cpu, "hidden_tab": hidden,
           "checks": {}, "console": [], "verdict": "PASS"}
    checks = res["checks"]

    def check(key, ok, detail=""):
        checks[key] = {"ok": bool(ok), "detail": detail}
        if not ok:
            res["verdict"] = "FAIL"
        log.append(f"  [{'ok' if ok else 'FAIL'}] {name}: {key} {detail}")

    tid = b.call("Target.createTarget", {"url": "about:blank"})["targetId"]
    sid = b.call("Target.attachToTarget", {"targetId": tid, "flatten": True})["sessionId"]
    page = Page(b, sid, log)
    b.call("Emulation.setDeviceMetricsOverride", {"width": w, "height": h, "deviceScaleFactor": dsf, "mobile": False}, sid)
    if reduced:
        b.call("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]}, sid)
    if cpu > 1:
        b.call("Emulation.setCPUThrottlingRate", {"rate": cpu}, sid)
    sep = "&" if "?" in base_url else "?"
    try:
        # ---- 1. load
        page.goto(base_url)
        st = page.state()
        check("load", st["step"] == "Step 1 of 6" and st["signin"], f"innerWidth={st['width']} dpr={st['dpr']} reduced={st['reduced']}")
        page.shot(out / f"{name}-01-load.png")

        hidden_tid = None
        if hidden:
            # put the page in a background tab, then drive it by script while it is hidden
            hidden_tid = b.call("Target.createTarget", {"url": "about:blank"})["targetId"]
            b.call("Target.activateTarget", {"targetId": hidden_tid})
            b.pump(0.5)
            check("tab_is_hidden", page.state()["hidden"], "")
            page.ev("document.querySelector('[data-action=\"signin\"]').click()")
        else:
            # ---- 2. the reported path: click Sign in, then watch
            page.click('[data-action="signin"]')
        t_signin = time.time()
        t = page.wait("document.querySelector('#stepCount').textContent.trim()==='Step 2 of 6'", 3)
        check("signin_goes_to_step2", t is not None, f"{t}s")
        # what happens in the next 6 s with no further input?
        progressed = page.wait("!document.querySelector('.login-btn.busy')", 6)
        st = page.state()
        res["spinner_after_signin"] = {"spinner_still_busy_after_6s": progressed is None, "state": st["step"], "sent": st["sent"], "cont": st["cont"]}
        check("signin_spinner_resolves", progressed is not None,
              "spinner still spinning after 6 s with nothing else to click (Mike's report)" if progressed is None else f"spinner replaced after {progressed}s (sent={st['sent']})")
        check("signin_offers_continue", st["sent"] and not st["busy"], "browser shows 'Continue → server reply' after the POST lands")
        check("capture_shows_login_post", any("POST /login" in l for l in st["capLines"]), "the attacker's tcpdump shows the cleartext login too")
        page.shot(out / f"{name}-02-after-signin.png")
        # proceed to step 3 by the on-screen affordance if there is one, else Next
        if st["sent"] or st["cont"]:
            if hidden:
                page.ev("(document.querySelector('.continue-btn')||document.querySelector('[data-action=\"signin\"]')).click()")
            else:
                page.click('.continue-btn' if st["cont"] else '[data-action="signin"]')
        else:
            if hidden:
                page.ev("document.getElementById('btnNext').click()")
            else:
                page.click('#btnNext')
        # ---- 3. step 3: Set-Cookie animation must end with jar filled and Continue button
        t = page.wait("document.querySelector('.jar-row') && document.querySelector('.continue-btn')")
        check("step3_setcookie_completes", t is not None, f"{t}s")
        page.shot(out / f"{name}-03-cookie-set.png")
        if hidden:
            page.ev("(document.querySelector('.continue-btn')||document.getElementById('btnNext')).click()")
        else:
            page.click('.continue-btn' if page.state()["cont"] else '#btnNext')
        t = page.wait("document.querySelector('.credit') && [...document.querySelectorAll('.cap-line')].some(e=>/Cookie:/.test(e.textContent))")
        check("step4_request_and_capture_complete", t is not None, f"{t}s")
        page.shot(out / f"{name}-04-captured.png")
        # ---- replay
        st = page.state()
        check("replay_enabled_at_step4", not st["replayDisabled"], "")
        if hidden:
            page.ev("document.getElementById('btnReplay').click()")
        else:
            page.click('#btnReplay')
        t = page.wait("!document.getElementById('capResult').hidden && document.querySelector('[data-key=replay]')")
        check("step5_replay_completes", t is not None, f"{t}s")
        page.shot(out / f"{name}-05-replayed.png")
        # replay again at step 5 (second click path)
        if hidden:
            page.ev("document.getElementById('btnReplay').click()")
        else:
            page.click('#btnReplay')
        t = page.wait("!document.getElementById('capResult').hidden && document.querySelectorAll('.packet').length===0")
        check("replay_again_completes", t is not None, f"{t}s")
        # ---- step 6 and HTTPS
        if hidden:
            page.ev("document.getElementById('btnNext').click()")
        else:
            page.click('#btnNext')
        t = page.wait("document.querySelector('#stepCount').textContent.trim()==='Step 6 of 6' && !document.getElementById('defenseStrip').hidden")
        check("step6_defense_shown", t is not None, f"{t}s")
        if hidden:
            page.ev("document.getElementById('btnRunTls').click()")
        else:
            page.click('#btnRunTls')
        t = page.wait("[...document.querySelectorAll('.cap-line')].some(e=>/application_data/.test(e.textContent)) && document.querySelectorAll('.packet').length===0 && document.getElementById('btnRunTls').disabled")
        check("step6_https_run_completes", t is not None, f"{t}s")
        page.shot(out / f"{name}-06-https.png")
        st = page.state()
        check("https_replay_disabled", st["replayDisabled"] and st["mode"] == "https", "")

        if hidden:
            b.call("Target.activateTarget", {"targetId": tid})
            b.pump(0.5)
            check("tab_visible_again", not page.state()["hidden"], "")
            page.shot(out / f"{name}-07-foreground.png")
            b.call("Target.closeTarget", {"targetId": hidden_tid})

        # ---- 4. Reset + auto-play through all six steps
        page.click('#btnReset')
        st = page.state()
        check("reset", st["step"] == "Step 1 of 6" and st["mode"] == "http" and st["attacker"] and not st["jar"], "")
        page.click('#btnPlay')
        t0 = time.time()
        t = page.wait("document.querySelector('#stepCount').textContent.trim()==='Step 6 of 6' && document.querySelector('#playLabel').textContent.trim()==='Play' && document.querySelectorAll('.packet').length===0", 45)
        st = page.state()
        check("autoplay_reaches_step6", t is not None, f"{t}s; account={st['account']} serverKeys={st['serverKeys']}")
        # at step 6 the replay result panel is hidden by design (the defense step re-runs the request)
        check("autoplay_state_complete", st["account"] and st["jar"] and "replay" in st["serverKeys"] and "defense" in st["serverKeys"], "")
        page.shot(out / f"{name}-08-autoplay-end.png")

        # ---- 5. keyboard + toggles
        page.key(*KEYS["r"])
        check("key_r_reset", page.state()["step"] == "Step 1 of 6", "")
        for i in range(5):
            page.key(*KEYS["ArrowRight"])
            t = page.settle()
            if t is None:
                break
        st = page.state()
        check("keys_arrow_right_x5", t is not None and st["step"] == "Step 6 of 6" and st["account"] and "replay" in st["serverKeys"], f"step={st['step']} account={st['account']} serverKeys={st['serverKeys']}")
        page.key(*KEYS["t"])
        t = page.wait("[...document.querySelectorAll('.cap-line')].some(e=>/application_data/.test(e.textContent)) && document.querySelectorAll('.packet').length===0")
        check("key_t_https", t is not None and page.state()["mode"] == "https", f"{t}s")
        page.key(*KEYS["t"])
        # flipping back re-runs the request as a visible packet; the cleartext capture lands after it
        t = page.wait("[...document.querySelectorAll('.cap-line')].some(e=>/Cookie:/.test(e.textContent)) && document.querySelectorAll('.packet').length===0")
        st = page.state()
        check("key_t_back_to_http", t is not None and st["mode"] == "http", f"{t}s")
        page.key(*KEYS["a"])
        st = page.state()
        check("key_a_attacker_off", not st["attacker"] and any("not in the path" in l for l in st["capLines"]) and st["replayDisabled"], "")
        page.key(*KEYS["a"])
        check("key_a_attacker_on", page.state()["attacker"], "")
        page.key(*KEYS["ArrowLeft"])
        check("key_arrow_left", page.state()["step"] == "Step 5 of 6", "")
        # Space = play/pause (focus is on body after keys)
        page.ev("document.activeElement && document.activeElement.blur()")
        page.key(*KEYS["Space"])
        st = page.state()
        check("key_space_play", st["playLabel"] == "Pause", "")
        page.key(*KEYS["Space"])
        check("key_space_pause", page.state()["playLabel"] == "Play", "")
        # toggles by mouse
        page.click('#modeSeg button[data-mode="https"]')
        t = page.settle()
        check("click_https_toggle", t is not None and page.state()["mode"] == "https", "")
        page.click('#modeSeg button[data-mode="http"]')
        check("click_http_toggle", page.state()["mode"] == "http", "")
        page.click('.switch .track')
        check("click_attacker_toggle_off", not page.state()["attacker"], "")
        page.click('.switch .track')
        check("click_attacker_toggle_on", page.state()["attacker"], "")
        # enlarge a panel, Esc restores; Present (fullscreen) by click, F exits
        page.click('#serverCard .expand-btn')
        check("expand_panel", page.state()["expanded"], "")
        page.key(*KEYS["Escape"])
        check("esc_restores_panel", not page.state()["expanded"], "")
        page.click('#btnFull')
        b.pump(0.6)
        fs = page.state()["fullscreen"]
        page.key(*KEYS["f"])
        b.pump(0.6)
        check("present_fullscreen_toggle", fs and not page.state()["fullscreen"], f"entered={fs}")
        # Back then forward again must re-run cleanly (no stale state)
        cur = page.state()["stepNo"]
        page.click('#btnBack'); page.click('#btnBack')
        page.click('#btnNext')
        t = page.settle()
        st = page.state()
        check("back_back_next_clean", t is not None and st["stepNo"] == cur - 1, f"from step {cur} to {st['stepNo']}")
        # spam Next during an animation: must not get stuck
        page.key(*KEYS["r"])
        for _ in range(7):
            page.key(*KEYS["ArrowRight"])
            b.pump(0.12)
        t = page.settle()
        st = page.state()
        check("rapid_next_spam_settles", t is not None and st["step"] == "Step 6 of 6", f"{t}s step={st['step']}")

        # ---- 6. deep links
        page.goto(base_url + sep + "step=4")
        st = page.state()
        check("deeplink_step4", st["step"] == "Step 4 of 6" and st["account"] and st["jar"] and any("Cookie:" in l for l in st["capLines"]) and not st["replayDisabled"], "")
        page.goto(base_url + sep + "step=6&https=1")
        st = page.state()
        check("deeplink_step6_https", st["step"] == "Step 6 of 6" and st["mode"] == "https" and st["defense"] and any("application_data" in l for l in st["capLines"]) and st["tls"] == "Encrypted ✓", "")
        page.shot(out / f"{name}-09-deeplink-https.png")
        page.goto(base_url + sep + "step=4&attacker=0")
        st = page.state()
        check("deeplink_step4_noattacker", st["step"] == "Step 4 of 6" and not st["attacker"] and any("not in the path" in l for l in st["capLines"]) and st["replayDisabled"], "")
        page.goto(base_url + sep + "step=abc")
        check("deeplink_garbage", page.state()["step"] == "Step 1 of 6", "")
    except Exception as e:  # a driver failure is recorded as a failure, never hidden
        check("driver_exception", False, repr(e))
        try:
            page.shot(out / f"{name}-99-exception.png")
        except Exception:
            pass
    res["console"] = page.console
    check("no_console_errors", not page.console, "; ".join(page.console)[:400])
    try:
        b.call("Target.closeTarget", {"targetId": tid})
    except Exception:
        pass
    b.on_event = None
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--label", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--online", action="store_true", help="allow network (for the live URL)")
    ap.add_argument("--only", nargs="*", help="config names to run")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    scratch = Path(os.environ.get("SCRATCH", tempfile.gettempdir())) / "cookie-theft-test"
    log: list[str] = []
    results = []
    cfgs = [c for c in CONFIGS if not args.only or c[0] in args.only]
    with Chrome(scratch, args.online) as chrome:
        ver = chrome.version.get("Browser", "?")
        log.append(f"# {args.label}: {ver} url={args.url}")
        print(log[-1], flush=True)
        for cfg in cfgs:
            t0 = time.time()
            r = run_config(chrome, cfg, args.url, out, log)
            r["seconds"] = round(time.time() - t0, 1)
            results.append(r)
            print(f"{r['verdict']:4} {cfg[0]:24} {r['seconds']:6.1f}s  " + "; ".join(k for k, v in r["checks"].items() if not v["ok"]), flush=True)
    (out / "results.json").write_text(json.dumps({"label": args.label, "browser": ver, "url": args.url, "results": results}, indent=1))
    (out / "log.txt").write_text("\n".join(log) + "\n")
    # markdown table
    lines = [f"## {args.label}: {ver}", "", f"URL: `{args.url}`", "",
             "| configuration | CSS viewport | DSF | reduced motion | CPU | hidden tab | spinner stuck after Sign in? | failed checks | console errors | verdict |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    for r in results:
        sp = r.get("spinner_after_signin", {})
        stuck = "yes" if sp.get("spinner_still_busy_after_6s") else "no"
        failed = ", ".join(k for k, v in r["checks"].items() if not v["ok"]) or "none"
        lines.append(f"| {r['config']} | {r['width']}x{r['height']} | {r['dsf']} | {'on' if r['reduced'] else 'off'} | {r['cpu']}x | {'yes' if r['hidden_tab'] else 'no'} | {stuck} | {failed} | {len(r['console'])} | {r['verdict']} |")
    (out / "results.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines[4:]))


if __name__ == "__main__":
    main()
