#!/usr/bin/env python3
"""lab_matrix.py: drive the Argon2id visual lab in a REAL Chrome through the DevTools protocol and record
whether every step, control and profile completes, with console errors, in a matrix of viewport sizes,
prefers-reduced-motion settings, device scale factors, CPU throttling and (on Xvfb) a background tab.

Nothing here guesses: every check is a DOM probe of the running page, driven by real mouse and keyboard
events (Input.dispatchMouseEvent / Input.dispatchKeyEvent), not by calling the page's functions.

Usage:
  python3 lab_matrix.py --page FILE_OR_URL --label NAME [--suite headless|hidpi|throttle|xvfb|live|all]
                        [--port 5392] [--quick]
Writes results-<label>.md, results-<label>.json and shots-<label>/*.png next to this script.

Only Chrome instances started by this script are touched; it uses its own user-data-dir in the scratchpad
and its own Xvfb display (:109). It never attaches to a browser it did not start.
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
HERE = Path(__file__).resolve().parent
SCRATCH = Path(os.environ.get("LAB_SCRATCH", "/tmp/claude-1000/-home-mike-Desktop-Code-Video-Maker/"
                              "4ca8bc3e-26c3-45eb-b7cc-8918ec5fd9d3/scratchpad"))
XVFB_DISPLAY = ":109"

BASE_FLAGS = [
    "--no-first-run", "--no-default-browser-check", "--password-store=basic", "--disable-infobars",
    "--disable-features=Translate,TranslateUI,MediaRouter,OptimizationHints,GlobalMediaControls",
    "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-pings",
    "--disable-gpu", "--disable-dev-shm-usage", "--noerrdialogs", "--disable-search-engine-choice-screen",
    "--no-service-autorun", "--disable-breakpad", "--force-device-scale-factor=1",
]

PROBE = r"""
(() => {
  const q = s => document.querySelector(s);
  const t = s => ((q(s) || {}).textContent || '').trim();
  const wires = q('#wires');
  return {
    step: t('#stepCount'), title: t('#stepTitle'), browserH3: t('#browserPage h3'),
    browserSpinner: !!q('#browserPage .spinner'), engSpinner: !!q('#engOut .spinner'),
    packets: document.querySelectorAll('.packet').length,
    salt: t('#engineSalt'), tag: !!q('#engOut .taghex'), passLabel: t('#passLabel'),
    verdict: (q('#cmpVerdict') || {}).className || '', cmpCount: t('#cmpCount'),
    dbRow: !!q('.db-row'), rigCount: t('#rigCount'), rigBtn: t('#rigRun'), rigNote: t('#rigNote'),
    chipM: t('#chipM'), memTotal: t('#memTotal'), rig1m: t('#rig1m'), rigPass: t('#rigPass'),
    gotoBtns: [...document.querySelectorAll('[data-goto]')].map(b => b.dataset.goto),
    playLabel: t('#playLabel'), fullBtn: t('#btnFull'),
    innerWidth: innerWidth, innerHeight: innerHeight, dpr: devicePixelRatio,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    stacked: wires ? getComputedStyle(wires).display === 'none' : null,
    hidden: document.hidden, fullscreen: !!document.fullscreenElement, expanded: !!q('.card.expanded'),
    cellsOn: document.querySelectorAll('#memWrap .cell.on').length,
    cells: document.querySelectorAll('#memWrap .cell').length,
    hot: document.querySelectorAll('.gpu-slot.hot').length,
    backNow: !!(q('#btnBack') && q('#btnBack').disabled), nextDis: !!(q('#btnNext') && q('#btnNext').disabled)
  };
})()
"""

STEP_NAMES = ["A password arrives", "A fresh random salt", "Argon2id fills memory", "Only the verifier is stored",
              "Login: derive and compare", "Wrong password, different tag", "Why Argon2id"]


def settled(i: int, s: dict) -> bool:
    """The visible end state of step index i (0..6)."""
    if s["step"] != f"Step {i + 1} of 7" or s["packets"]:
        return False
    if i == 0:
        return s["browserH3"] == "Create your account"
    if i == 1:
        return s["salt"].startswith("6b8f")
    if i == 2:
        return s["tag"] and "real" in s["passLabel"] and not s["engSpinner"]
    if i == 3:
        # the users row is stored AND the 201 has reached the browser ("Account created", goto 4 offered)
        return s["dbRow"] and ("4" in s["gotoBtns"]) and not s["browserSpinner"]
    if i == 4:
        return "ok" in s["verdict"].split() and "5" in s["gotoBtns"] and not s["engSpinner"]
    if i == 5:
        return "bad" in s["verdict"].split() and "6" in s["gotoBtns"] and not s["engSpinner"]
    if i == 6:
        return s["rigCount"] == "1,000,000"
    return False


def _port_in_use(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _stop_group(pid):
    if not pid:
        return
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(pid, sig)
        except ProcessLookupError:
            return
        end = time.time() + (6 if sig == signal.SIGTERM else 3)
        while time.time() < end:
            try:
                os.killpg(pid, 0)
            except ProcessLookupError:
                return
            time.sleep(0.1)


class Chrome:
    """A Chrome this script starts and stops. headless=False means a private Xvfb display."""

    def __init__(self, port: int, headless: bool = True, window=(1920, 1080), offline: bool = True):
        self.port, self.headless, self.window, self.offline = port, headless, window, offline
        self.proc = self.xvfb = None
        self.profile = None
        self.browser = None

    def __enter__(self):
        if _port_in_use(self.port):
            raise RuntimeError(f"port {self.port} is in use; refusing to start")
        env = {k: v for k, v in os.environ.items() if k not in ("WAYLAND_DISPLAY", "XDG_SESSION_TYPE", "DBUS_SESSION_BUS_ADDRESS")}
        flags = list(BASE_FLAGS)
        if self.headless:
            flags.append("--headless=new")
        else:
            n = int(XVFB_DISPLAY[1:])
            if Path(f"/tmp/.X11-unix/X{n}").exists():
                raise RuntimeError(f"display {XVFB_DISPLAY} already exists; refusing to start")
            self.xvfb = subprocess.Popen(["Xvfb", XVFB_DISPLAY, "-screen", "0", f"{self.window[0]}x{self.window[1]}x24",
                                          "-nolisten", "tcp", "-dpi", "96"],
                                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            for _ in range(100):
                if Path(f"/tmp/.X11-unix/X{n}").exists():
                    break
                time.sleep(0.05)
            env["DISPLAY"] = XVFB_DISPLAY
            flags += ["--ozone-platform=x11", "--window-position=0,0", "--start-maximized"]
        if self.offline:
            # every non-loopback connection goes to a dead proxy: nothing can leave this machine
            flags.append("--proxy-server=http://127.0.0.1:5335")
        SCRATCH.mkdir(parents=True, exist_ok=True)
        self.profile = Path(tempfile.mkdtemp(prefix="argon2id-lab-chrome-", dir=SCRATCH))
        args = [CHROME, f"--user-data-dir={self.profile}", f"--remote-debugging-port={self.port}",
                "--remote-debugging-address=127.0.0.1", f"--window-size={self.window[0]},{self.window[1]}",
                *flags, "about:blank"]
        self.proc = subprocess.Popen(args, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                     start_new_session=True)
        end = time.time() + 30
        while time.time() < end:
            try:
                self.version = cdp_lite.http_json(self.port, "/json/version")
                break
            except OSError:
                time.sleep(0.2)
        else:
            self.__exit__()
            raise RuntimeError("Chrome did not open its debugging port")
        self.browser = cdp_lite.Browser(self.port)
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
            _stop_group(self.proc.pid)
        if self.xvfb:
            _stop_group(self.xvfb.pid)
        if self.profile and self.profile.exists() and self.profile.parent == SCRATCH:
            shutil.rmtree(self.profile, ignore_errors=True)


class Tab:
    """One page target with its own flattened session, console log and request log."""

    def __init__(self, chrome: Chrome, url: str, width: int, height: int, dsf: float = 1.0, reduced: bool = False,
                 cpu: float = 1.0, shots_dir: Path | None = None, tag: str = ""):
        self.b = chrome.browser
        self.tid = self.b.call("Target.createTarget", {"url": "about:blank"})["targetId"]
        self.sid = self.b.call("Target.attachToTarget", {"targetId": self.tid, "flatten": True})["sessionId"]
        self.console: list[str] = []
        self.requests: list[str] = []
        self.shots_dir = shots_dir
        self.tag = tag
        self.nshot = 0
        for m in ("Page.enable", "Runtime.enable", "Log.enable", "Network.enable"):
            self.b.call(m, {}, self.sid)
        self.b.call("Emulation.setDeviceMetricsOverride",
                    {"width": width, "height": height, "deviceScaleFactor": dsf, "mobile": False}, self.sid)
        self.b.call("Emulation.setEmulatedMedia",
                    {"features": [{"name": "prefers-reduced-motion", "value": "reduce" if reduced else "no-preference"}]},
                    self.sid)
        if cpu and cpu != 1.0:
            self.b.call("Emulation.setCPUThrottlingRate", {"rate": cpu}, self.sid)
        prev = self.b.on_event
        self.b.on_event = self._on_event
        self._prev_handler = prev
        self.b.call("Page.navigate", {"url": url}, self.sid)
        self.b.wait_event(lambda e: e.get("sessionId") == self.sid and e.get("method") == "Page.loadEventFired", timeout=30)
        self.b.pump(0.6)

    def _on_event(self, e):
        if self._prev_handler:
            self._prev_handler(e)
        if e.get("sessionId") != self.sid:
            return
        m, p = e.get("method"), e.get("params", {})
        if m == "Runtime.exceptionThrown":
            d = p.get("exceptionDetails", {})
            self.console.append("EXCEPTION " + (d.get("exception", {}).get("description") or d.get("text", "")))
        elif m == "Runtime.consoleAPICalled" and p.get("type") in ("error", "warning", "assert"):
            self.console.append(p["type"].upper() + " " + " ".join(str(a.get("value", a.get("description", ""))) for a in p.get("args", [])))
        elif m == "Log.entryAdded" and p.get("entry", {}).get("level") in ("error", "warning"):
            en = p["entry"]
            self.console.append(f"LOG {en.get('level')} {en.get('source')} {en.get('text')} {en.get('url', '')}")
        elif m == "Network.requestWillBeSent":
            self.requests.append(p.get("request", {}).get("url", ""))

    def js(self, expr: str, await_promise: bool = False):
        return self.b.evaluate(self.sid, expr, await_promise=await_promise)

    def probe(self) -> dict:
        self.b.pump(0.02)
        return self.js(PROBE)

    def rect(self, selector: str):
        return self.js(f"""(() => {{ const el = document.querySelector({json.dumps(selector)}); if (!el) return null;
            el.scrollIntoView({{block: 'center', inline: 'nearest'}}); const r = el.getBoundingClientRect();
            return {{x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height}}; }})()""")

    def click(self, selector: str) -> bool:
        r = self.rect(selector)
        if not r or r["w"] == 0:
            return False
        self.b.pump(0.05)
        x, y = r["x"], r["y"]
        self.b.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y}, self.sid)
        self.b.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1}, self.sid)
        self.b.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1}, self.sid)
        return True

    KEYS = {
        "ArrowRight": ("ArrowRight", 39, None), "ArrowLeft": ("ArrowLeft", 37, None), "PageDown": ("PageDown", 34, None),
        " ": ("Space", 32, " "), "r": ("KeyR", 82, "r"), "f": ("KeyF", 70, "f"), "Escape": ("Escape", 27, None),
        "1": ("Digit1", 49, "1"), "2": ("Digit2", 50, "2"), "3": ("Digit3", 51, "3"), "4": ("Digit4", 52, "4"),
    }

    def key(self, k: str):
        code, vk, text = self.KEYS[k]
        p = {"type": "keyDown", "key": k, "code": code, "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk}
        if text:
            p["text"] = text
        self.b.call("Input.dispatchKeyEvent", p, self.sid)
        self.b.call("Input.dispatchKeyEvent", {"type": "keyUp", "key": k, "code": code, "windowsVirtualKeyCode": vk}, self.sid)

    def wait(self, pred, timeout: float, every: float = 0.1):
        """Poll the probe until pred(state) is true; returns (ok, seconds, last_state)."""
        t0 = time.time()
        s = self.probe()
        while not pred(s):
            if time.time() - t0 > timeout:
                return False, time.time() - t0, s
            self.b.pump(every)
            s = self.probe()
        return True, time.time() - t0, s

    def shot(self, name: str):
        if not self.shots_dir:
            return
        self.shots_dir.mkdir(parents=True, exist_ok=True)
        self.nshot += 1
        data = self.b.call("Page.captureScreenshot", {"format": "png"}, self.sid, timeout=30)["data"]
        (self.shots_dir / f"{self.tag}-{self.nshot:02d}-{name}.png").write_bytes(base64.b64decode(data))

    def metrics(self, width: int, height: int, dsf: float = 1.0):
        self.b.call("Emulation.setDeviceMetricsOverride",
                    {"width": width, "height": height, "deviceScaleFactor": dsf, "mobile": False}, self.sid)

    def close(self):
        self.b.on_event = self._prev_handler
        try:
            self.b.call("Target.closeTarget", {"targetId": self.tid})
        except Exception:
            pass


# ----------------------------------------------------------------------------------------------------------------------
def run_config(chrome: Chrome, page: str, cfg: dict, shots_dir: Path, quick: bool = False, strict: bool = True) -> dict:
    """One full pass: load, click through, in-page buttons, back, profiles, auto-play, rig, keys, present, enlarge."""
    name = cfg["name"]
    res = {"config": name, "checks": [], "hangs": [], "console": [], "requests": [], "notes": []}

    def check(label, ok, detail=""):
        res["checks"].append({"check": label, "ok": bool(ok), "detail": detail})
        if not ok:
            print(f"    FAIL {label}: {detail}", flush=True)

    tab = Tab(chrome, page, cfg["w"], cfg["h"], cfg.get("dsf", 1.0), cfg.get("reduced", False), cfg.get("cpu", 1.0),
              shots_dir, tag=name)
    try:
        s = tab.probe()
        res["env"] = {k: s[k] for k in ("innerWidth", "innerHeight", "dpr", "reduced", "stacked")}
        print(f"  [{name}] innerWidth={s['innerWidth']} dpr={s['dpr']} reduced={s['reduced']} stacked={s['stacked']}", flush=True)
        check("page loads at step 1", settled(0, s), s["step"])
        check("reduced-motion emulation applied", s["reduced"] == cfg.get("reduced", False), str(s["reduced"]))
        tab.shot("load")

        # ---- 1. click Next through every step with the mouse ----
        for i in range(1, 7):
            tab.click("#btnNext")
            ok, dt, s = tab.wait(lambda st, i=i: settled(i, st), timeout=40)
            check(f"Next -> step {i + 1} ({STEP_NAMES[i]}) completes", ok, f"{dt:.1f}s" if ok else f"TIMEOUT after {dt:.0f}s: {json.dumps(s)[:400]}")
            if not ok:
                res["hangs"].append(f"step {i + 1} via Next: {json.dumps(s)[:600]}")
            if strict:
                check(f"step {i + 1}: no spinner left on screen", not s["browserSpinner"] and not s["engSpinner"],
                      f"browserSpinner={s['browserSpinner']} engSpinner={s['engSpinner']}")
            elif s["browserSpinner"] or s["engSpinner"]:
                res["notes"].append(f"step {i + 1}: a spinner stays on screen after the step completed (browser={s['browserSpinner']}, engine={s['engSpinner']})")
            if i in (2, 4, 6):
                tab.shot(f"step{i + 1}")
        check("Next disabled on the last step", s["nextDis"])

        # ---- 2. Reset, then Back ----
        tab.click("#btnReset")
        ok, dt, s = tab.wait(lambda st: settled(0, st), 10)
        check("Reset returns to step 1", ok, s["step"])
        for _ in range(3):
            tab.click("#btnNext")
        ok, dt, s = tab.wait(lambda st: settled(3, st), 40)
        check("three Nexts reach step 4", ok, s["step"])
        tab.click("#btnBack")
        ok, dt, s = tab.wait(lambda st: settled(2, st), 10)
        check("Back returns to step 3 (tag shown, no spinner)", ok and not s["engSpinner"], f"{s['step']} engSpinner={s['engSpinner']}")
        tab.click("#btnBack")
        ok, dt, s = tab.wait(lambda st: settled(1, st), 10)
        check("Back returns to step 2", ok, s["step"])

        # ---- 3. the in-page buttons (Create account ... Start over) ----
        tab.click("#btnReset")
        tab.wait(lambda st: settled(0, st), 10)
        for i, goto in enumerate(["1", "2", "3", "4", "5", "6"], start=1):
            ok, dt, s = tab.wait(lambda st, g=goto: g in st["gotoBtns"], 30)
            check(f"in-page button to step {i + 1} is offered", ok, f"after {dt:.1f}s buttons={s['gotoBtns']}")
            if not ok:
                res["hangs"].append(f"in-page button for step {i + 1} never appeared: {json.dumps(s)[:400]}")
                break
            tab.click(f'[data-goto="{goto}"]')
            ok, dt, s = tab.wait(lambda st, i=i: settled(i, st), 40)
            check(f"in-page button -> step {i + 1} completes", ok, f"{dt:.1f}s" if ok else f"TIMEOUT {json.dumps(s)[:400]}")
            if not ok:
                res["hangs"].append(f"step {i + 1} via in-page button: {json.dumps(s)[:600]}")
        ok, dt, s = tab.wait(lambda st: "0" in st["gotoBtns"], 15)
        if ok:
            tab.click('[data-goto="0"]')
            ok, dt, s = tab.wait(lambda st: settled(0, st), 10)
        check("Start over returns to step 1", ok, s["step"])

        # ---- 4. every profile at the derivation step (keys 1-4), and by clicking at the login step ----
        tab.click("#btnNext"); tab.wait(lambda st: settled(1, st), 20)
        tab.click("#btnNext"); tab.wait(lambda st: settled(2, st), 40)
        expect = {"1": ("m = 19 MiB", "19,456"), "2": ("m = 64 MiB", "65,536"), "3": ("m = 128 MiB", "131,072"), "4": ("m = 256 MiB", "262,144")}
        order = ["4", "1", "3", "2"] if not quick else ["4", "2"]
        for k in order:
            tab.key(k)
            ok, dt, s = tab.wait(lambda st, k=k: st["chipM"] == expect[k][0] and settled(2, st), 45)
            check(f"key {k}: derivation replays and completes at {expect[k][0]}", ok,
                  f"{dt:.1f}s cells={s['cellsOn']}/{s['cells']} total={s['memTotal']}" if ok else f"TIMEOUT {json.dumps(s)[:400]}")
            if not ok:
                res["hangs"].append(f"profile key {k} at step 3: {json.dumps(s)[:600]}")
            check(f"key {k}: grid has every cell filled", s["cellsOn"] == s["cells"] and s["cells"] > 0, f"{s['cellsOn']}/{s['cells']}")
            check(f"key {k}: KiB total matches", expect[k][1] in s["memTotal"], s["memTotal"])
            if k == "4":
                tab.shot("profile256")
        # profile buttons by mouse at the login step
        tab.click("#btnNext"); tab.wait(lambda st: settled(3, st), 20)
        tab.click("#btnNext"); ok, dt, s = tab.wait(lambda st: settled(4, st), 40)
        check("step 5 completes before profile switch", ok, f"{dt:.1f}s")
        for prof, label in (("light", "m = 19 MiB"), ("heavy", "m = 256 MiB"), ("balanced", "m = 64 MiB")):
            tab.click(f'#profileSeg [data-profile="{prof}"]')
            ok, dt, s = tab.wait(lambda st, label=label: st["chipM"] == label and settled(4, st), 20)
            check(f"profile button {prof} at step 5 keeps the comparison complete", ok, f"{dt:.1f}s verdict={s['verdict']}")
            if not ok:
                res["hangs"].append(f"profile button {prof} at step 5: {json.dumps(s)[:600]}")

        # ---- 5. auto-play from the start ----
        tab.click("#btnReset")
        tab.wait(lambda st: settled(0, st), 10)
        tab.click("#btnPlay")
        t0 = time.time()
        timeline = []
        last = None
        deadline = t0 + (150 if cfg.get("cpu", 1.0) == 1.0 else 200)
        while time.time() < deadline:
            s = tab.probe()
            if s["step"] != last:
                timeline.append((round(time.time() - t0, 1), s["step"]))
                last = s["step"]
            if settled(6, s) and s["playLabel"] == "Play":
                break
            tab.b.pump(0.25)
        ok = settled(6, s) and s["playLabel"] == "Play"
        dwell = [round(timeline[j + 1][0] - timeline[j][0], 1) for j in range(len(timeline) - 1)]
        res["autoplay"] = {"ok": ok, "total_s": round(time.time() - t0, 1), "timeline": timeline, "dwell_s": dwell}
        check("auto-play reaches step 7 and stops", ok, f"{res['autoplay']['total_s']}s, dwell per step {dwell}")
        if not ok:
            res["hangs"].append(f"auto-play: {json.dumps(s)[:600]} timeline={timeline}")
        check("auto-play gives at least 3 s on every step", all(d >= 3.0 for d in dwell) and len(dwell) == 6, f"dwell {dwell}")
        tab.shot("autoplay-end")

        # ---- 6. the attacker rig button: (it has already run to 1,000,000) restart, pause, restart, finish ----
        tab.click("#rigRun")
        tab.b.pump(0.5)
        s = tab.probe()
        check("Run the rig: click restarts the rig", s["rigBtn"].startswith("Pause") and s["hot"] > 0, f"btn={s['rigBtn']} hot={s['hot']}")
        tab.click("#rigRun")
        tab.b.pump(0.4)
        s = tab.probe()
        n1 = s["rigCount"]
        tab.b.pump(0.6)
        s2 = tab.probe()
        check("Run the rig: pause stops the counter", s["rigBtn"].startswith("Run") and s["hot"] == 0 and s2["rigCount"] == n1,
              f"btn={s['rigBtn']} hot={s['hot']} count {n1} -> {s2['rigCount']}")
        tab.click("#rigRun")
        ok, dt, s = tab.wait(lambda st: st["rigCount"] == "1,000,000" and st["rigBtn"].startswith("Run again"), 25)
        check("Run the rig: restart runs to 1,000,000", ok, f"{dt:.1f}s {s['rigBtn']} note={s['rigNote'][:60]}")
        if not ok:
            res["hangs"].append(f"rig: {json.dumps(s)[:400]}")
        check("rig time table: 1 million at 64 MiB = 16m 40s", s["rig1m"] == "16m 40s", s["rig1m"])
        check("rig passphrase row shows ~450 million years at 64 MiB", "450" in s["rigPass"] and "million" in s["rigPass"], s["rigPass"])

        # ---- 7. keyboard: R, arrows, space, 1-4 at other steps, F ----
        tab.key("r")
        ok, dt, s = tab.wait(lambda st: settled(0, st), 10)
        check("R resets", ok, s["step"])
        tab.key("ArrowRight")
        ok, dt, s = tab.wait(lambda st: settled(1, st), 20)
        check("ArrowRight advances", ok, s["step"])
        tab.key("ArrowLeft")
        ok, dt, s = tab.wait(lambda st: settled(0, st), 10)
        check("ArrowLeft goes back", ok, s["step"])
        tab.key("3")
        tab.b.pump(0.3)
        s = tab.probe()
        check("key 3 at step 1 switches the profile", s["chipM"] == "m = 128 MiB", s["chipM"])
        tab.key("2")
        tab.key(" ")
        tab.b.pump(0.5)
        s = tab.probe()
        check("space starts Play", s["playLabel"] == "Pause", s["playLabel"])
        tab.key(" ")
        tab.b.pump(0.3)
        s = tab.probe()
        check("space pauses Play", s["playLabel"] == "Play", s["playLabel"])
        tab.key("f")
        tab.b.pump(0.8)
        s = tab.probe()
        res["notes"].append(f"Present (F): fullscreenElement={s['fullscreen']} button={s['fullBtn']!r}")
        if s["fullscreen"]:
            tab.key("f")
            tab.b.pump(0.6)
            s = tab.probe()
            check("F again exits fullscreen", not s["fullscreen"], str(s["fullscreen"]))
        tab.click("#btnFull")
        tab.b.pump(0.8)
        s = tab.probe()
        if s["fullscreen"]:
            tab.click("#btnFull")
            tab.b.pump(0.5)
        check("page still responsive after Present", tab.probe()["step"].startswith("Step"), "")

        # ---- 8. enlarge a panel, Esc ----
        tab.click("#engineCard .expand-btn")
        tab.b.pump(0.4)
        s = tab.probe()
        check("enlarge panel opens", s["expanded"], str(s["expanded"]))
        tab.key("Escape")
        tab.b.pump(0.4)
        s = tab.probe()
        check("Esc restores the panel", not s["expanded"], str(s["expanded"]))

        # ---- 9. resize across the 1260 px breakpoint in the middle of the derivation ----
        if not quick:
            tab.key("r")
            tab.wait(lambda st: settled(0, st), 10)
            tab.click("#btnNext"); tab.wait(lambda st: settled(1, st), 20)
            tab.click("#btnNext")
            tab.b.pump(1.2)
            other = (1024, 768) if cfg["w"] > 1260 else (1920, 1080)
            tab.metrics(other[0], other[1], cfg.get("dsf", 1.0))
            tab.b.pump(1.0)
            tab.metrics(cfg["w"], cfg["h"], cfg.get("dsf", 1.0))
            ok, dt, s = tab.wait(lambda st: settled(2, st), 40)
            check("derivation survives a resize across the breakpoint", ok, f"{dt:.1f}s" if ok else f"TIMEOUT {json.dumps(s)[:300]}")
            if not ok:
                res["hangs"].append(f"resize mid-derive: {json.dumps(s)[:600]}")
            tab.click("#btnNext"); tab.wait(lambda st: settled(3, st), 20)
            tab.click("#btnNext")
            tab.b.pump(0.6)
            tab.metrics(other[0], other[1], cfg.get("dsf", 1.0))
            tab.b.pump(0.8)
            tab.metrics(cfg["w"], cfg["h"], cfg.get("dsf", 1.0))
            ok, dt, s = tab.wait(lambda st: settled(4, st), 40)
            check("login verify survives a resize across the breakpoint", ok, f"{dt:.1f}s" if ok else f"TIMEOUT {json.dumps(s)[:300]}")
            if not ok:
                res["hangs"].append(f"resize mid-verify: {json.dumps(s)[:600]}")

        tab.b.pump(0.3)
        res["console"] = list(tab.console)
        res["requests"] = sorted(set(tab.requests))
        check("no console errors or warnings", not tab.console, "; ".join(tab.console)[:500])
        extra = [u for u in res["requests"] if not (u.startswith("file://") or u.rstrip("/") == page.rstrip("/") or u.startswith("data:"))]
        check("no network requests beyond the page itself", not extra, "; ".join(extra)[:300])
    finally:
        tab.close()
    res["pass"] = all(c["ok"] for c in res["checks"]) and not res["hangs"]
    print(f"  [{name}] {'PASS' if res['pass'] else 'FAIL'}: {sum(c['ok'] for c in res['checks'])}/{len(res['checks'])} checks", flush=True)
    return res


def run_background_tab(chrome: Chrome, page: str, shots_dir: Path, label: str) -> dict:
    """Xvfb only: start the login verification, push the tab to the background (activate another tab) and see
    whether the step completes while hidden, and after the tab comes back."""
    res = {"config": "xvfb-background-tab", "checks": [], "hangs": [], "console": [], "notes": []}

    def check(lbl, ok, detail=""):
        res["checks"].append({"check": lbl, "ok": bool(ok), "detail": detail})
        if not ok:
            print(f"    FAIL {lbl}: {detail}", flush=True)

    tab = Tab(chrome, page, 1920, 1080, shots_dir=shots_dir, tag="bg")
    b = chrome.browser
    try:
        b.call("Target.activateTarget", {"targetId": tab.tid})
        tab.b.pump(0.5)
        for i in (1, 2, 3):
            tab.click("#btnNext")
            tab.wait(lambda st, i=i: settled(i, st), 40)
        tab.click("#btnNext")  # step 5: packet flight + sweep + byte compare (~4 s)
        tab.b.pump(0.15)
        other = b.call("Target.createTarget", {"url": "about:blank"})["targetId"]
        b.call("Target.activateTarget", {"targetId": other})
        ok, dt, s = tab.wait(lambda st: st["hidden"], 5)
        check("tab goes to the background (document.hidden)", ok, str(s["hidden"]))
        ok, dt, s = tab.wait(lambda st: settled(4, st), 12)
        res["notes"].append(f"hidden tab: step 5 {'completed' if ok else 'did NOT complete'} within {dt:.1f}s "
                            f"(spinner={s['browserSpinner']}, verdict={s['verdict']!r}, cmp={s['cmpCount']!r})")
        hidden_done = ok
        b.call("Target.activateTarget", {"targetId": tab.tid})
        ok, dt, s = tab.wait(lambda st: settled(4, st), 30)
        check("step 5 completes after the tab is foregrounded again", ok, f"{dt:.1f}s (completed while hidden: {hidden_done})")
        if not ok:
            res["hangs"].append(f"background tab, step 5: {json.dumps(s)[:600]}")
        tab.shot("after-background")
        # same for the derivation
        tab.click("#btnBack"); tab.click("#btnBack")
        tab.wait(lambda st: settled(2, st), 10)
        tab.key("4")
        tab.b.pump(1.0)
        b.call("Target.activateTarget", {"targetId": other})
        tab.wait(lambda st: st["hidden"], 5)
        ok, dt, s = tab.wait(lambda st: settled(2, st), 20)
        res["notes"].append(f"hidden tab: 256 MiB derivation {'completed' if ok else 'did NOT complete'} within {dt:.1f}s (passLabel={s['passLabel']!r})")
        b.call("Target.activateTarget", {"targetId": tab.tid})
        ok, dt, s = tab.wait(lambda st: settled(2, st), 40)
        check("derivation completes after the tab is foregrounded again", ok, f"{dt:.1f}s")
        if not ok:
            res["hangs"].append(f"background tab, derive: {json.dumps(s)[:600]}")
        b.call("Target.closeTarget", {"targetId": other})
        res["console"] = list(tab.console)
        check("no console errors", not tab.console, "; ".join(tab.console)[:300])
    finally:
        tab.close()
    res["pass"] = all(c["ok"] for c in res["checks"]) and not res["hangs"]
    print(f"  [background-tab] {'PASS' if res['pass'] else 'FAIL'} notes={res['notes']}", flush=True)
    return res


# ----------------------------------------------------------------------------------------------------------------------
SIZES = [(1920, 1080), (1440, 900), (1366, 768), (1280, 720), (1024, 768), (800, 900)]


def suite_configs(suite: str, quick: bool) -> list[dict]:
    cfgs = []
    if suite in ("headless", "all"):
        for w, h in SIZES:
            for reduced in (False, True):
                cfgs.append({"name": f"chrome-{w}x{h}-{'reduce' if reduced else 'motion'}", "w": w, "h": h, "reduced": reduced})
    if suite in ("hidpi", "all"):
        # a 1920x1080 screen at Chrome zoom / HiDPI 125 %, 150 % and 200 %: the CSS viewport shrinks
        for dsf in (1.25, 1.5, 2.0):
            w, h = round(1920 / dsf), round(1080 / dsf)
            cfgs.append({"name": f"chrome-zoom{int(dsf * 100)}-{w}x{h}-motion", "w": w, "h": h, "dsf": dsf, "reduced": False})
        cfgs.append({"name": "chrome-zoom150-1280x720-reduce", "w": 1280, "h": 720, "dsf": 1.5, "reduced": True})
    if suite in ("throttle", "all"):
        cfgs.append({"name": "chrome-1920x1080-motion-cpu4x", "w": 1920, "h": 1080, "reduced": False, "cpu": 4})
        cfgs.append({"name": "chrome-1366x768-reduce-cpu4x", "w": 1366, "h": 768, "reduced": True, "cpu": 4})
    if suite == "live":
        cfgs.append({"name": "live-1920x1080-motion", "w": 1920, "h": 1080, "reduced": False})
        cfgs.append({"name": "live-1280x720-reduce", "w": 1280, "h": 720, "reduced": True})
    if suite == "xvfb":
        cfgs.append({"name": "xvfb-1920x1080-motion", "w": 1920, "h": 1080, "reduced": False})
        cfgs.append({"name": "xvfb-1920x1080-reduce", "w": 1920, "h": 1080, "reduced": True})
    return cfgs


def write_results(label: str, page: str, results: list[dict], chrome_version: str):
    out_json = HERE / f"results-{label}.json"
    out_json.write_text(json.dumps(results, indent=1))
    lines = [f"# Argon2id lab test matrix: {label}", "",
             f"Page: `{page}`  ", f"Chrome: {chrome_version}  ", f"Run: {time.strftime('%Y-%m-%d %H:%M:%S')}", "",
             "| Config | CSS viewport | reduced motion | stacked | checks | hangs | console errors | auto-play dwell (s) | result |",
             "|---|---|---|---|---|---|---|---|---|"]
    for r in results:
        env = r.get("env", {})
        ap = r.get("autoplay", {})
        lines.append(f"| {r['config']} | {env.get('innerWidth', '')}×{env.get('innerHeight', '')} @{env.get('dpr', '')} | "
                     f"{env.get('reduced', '')} | {env.get('stacked', '')} | "
                     f"{sum(c['ok'] for c in r['checks'])}/{len(r['checks'])} | {len(r['hangs'])} | {len(r['console'])} | "
                     f"{ap.get('dwell_s', '')} | {'PASS' if r['pass'] else 'FAIL'} |")
    lines.append("")
    for r in results:
        fails = [c for c in r["checks"] if not c["ok"]]
        if fails or r["hangs"] or r["notes"] or r["console"]:
            lines.append(f"## {r['config']}")
            for c in fails:
                lines.append(f"- FAIL: {c['check']} — {c['detail']}")
            for h in r["hangs"]:
                lines.append(f"- HANG: {h}")
            for n in r["notes"]:
                lines.append(f"- note: {n}")
            for c in r["console"]:
                lines.append(f"- console: {c}")
            lines.append("")
    lines.append("## Every check, per config")
    lines.append("")
    for r in results:
        lines.append(f"### {r['config']}")
        for c in r["checks"]:
            lines.append(f"- {'ok  ' if c['ok'] else 'FAIL'} {c['check']}" + (f" ({c['detail']})" if c["detail"] else ""))
        if r.get("requests"):
            lines.append(f"- requests seen: {', '.join(r['requests'])}")
        lines.append("")
    (HERE / f"results-{label}.md").write_text("\n".join(lines))
    print(f"wrote {HERE / f'results-{label}.md'}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", required=True, help="file path or URL")
    ap.add_argument("--label", required=True)
    ap.add_argument("--suite", default="headless", choices=["headless", "hidpi", "throttle", "xvfb", "live", "all"])
    ap.add_argument("--port", type=int, default=5392)
    ap.add_argument("--quick", action="store_true", help="fewer profiles, no resize test")
    ap.add_argument("--lenient", action="store_true", help="record permanent spinners as notes instead of failures")
    ap.add_argument("--only", default="", help="comma list of config names to run")
    a = ap.parse_args()
    page = a.page if "://" in a.page else "file://" + str(Path(a.page).resolve())
    shots = HERE / f"shots-{a.label}"
    cfgs = suite_configs(a.suite, a.quick)
    if a.only:
        keep = set(a.only.split(","))
        cfgs = [c for c in cfgs if c["name"] in keep]
    results = []
    headless = a.suite != "xvfb"
    offline = a.suite != "live"
    with Chrome(a.port, headless=headless, offline=offline) as chrome:
        ver = chrome.version.get("Browser", "?")
        print(f"{ver} headless={headless} page={page}", flush=True)
        for cfg in cfgs:
            try:
                results.append(run_config(chrome, page, cfg, shots, quick=a.quick, strict=not a.lenient))
            except Exception as e:  # a crash of the harness is itself a finding
                results.append({"config": cfg["name"], "checks": [{"check": "harness ran", "ok": False, "detail": repr(e)}],
                                "hangs": [f"harness exception: {e!r}"], "console": [], "notes": [], "pass": False})
                print(f"  [{cfg['name']}] harness exception: {e!r}", flush=True)
        if a.suite == "xvfb":
            results.append(run_background_tab(chrome, page, shots, a.label))
    write_results(a.label, page, results, ver)
    print("ALL PASS" if all(r["pass"] for r in results) else "SOME FAILURES", flush=True)


if __name__ == "__main__":
    main()
