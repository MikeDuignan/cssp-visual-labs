#!/usr/bin/env python3
"""firefox_check.py: drive the Argon2id lab in a REAL headless Firefox through WebDriver BiDi (Firefox 129+
dropped CDP). A fresh profile each run (in the scratchpad), optionally with ui.prefersReducedMotion=1, and a
dead proxy so nothing can leave the machine. Clicks and keys are real input.performActions events.

Usage: python3 firefox_check.py --page FILE --label NAME [--port 5393]
Writes results-<label>.md and shots-<label>/*.png next to this script.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import websocket  # websocket-client

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lab_matrix import PROBE, STEP_NAMES, settled  # noqa: E402

FIREFOX = "/usr/bin/firefox"
HERE = Path(__file__).resolve().parent
SCRATCH = Path(os.environ.get("LAB_SCRATCH", "/tmp/claude-1000/-home-mike-Desktop-Code-Video-Maker/"
                              "4ca8bc3e-26c3-45eb-b7cc-8918ec5fd9d3/scratchpad"))

KEYS = {"ArrowRight": "", "ArrowLeft": "", " ": " ", "r": "r", "f": "f", "Escape": "",
        "1": "1", "2": "2", "3": "3", "4": "4"}


class Firefox:
    def __init__(self, port: int, reduced: bool, width=1920, height=1080):
        self.port, self.reduced, self.width, self.height = port, reduced, width, height
        self.proc = None
        self.profile = None
        self.ws = None
        self._id = 0
        self.events = []
        self.context = None

    def __enter__(self):
        SCRATCH.mkdir(parents=True, exist_ok=True)
        self.profile = Path(tempfile.mkdtemp(prefix="argon2id-lab-firefox-", dir=SCRATCH))
        prefs = {
            "remote.active-protocols": 1, "browser.shell.checkDefaultBrowser": False,
            "datareporting.policy.dataSubmissionEnabled": False, "app.update.enabled": False,
            "toolkit.telemetry.enabled": False, "browser.startup.homepage": "about:blank",
            "browser.startup.page": 0, "network.proxy.type": 1, "network.proxy.http": "127.0.0.1",
            "network.proxy.http_port": 5335, "network.proxy.ssl": "127.0.0.1", "network.proxy.ssl_port": 5335,
            "network.proxy.no_proxies_on": "", "dom.disable_open_during_load": False,
            "ui.prefersReducedMotion": 1 if self.reduced else 0,
        }
        (self.profile / "user.js").write_text("".join(f"user_pref({json.dumps(k)}, {json.dumps(v)});\n" for k, v in prefs.items()))
        env = {k: v for k, v in os.environ.items() if k not in ("WAYLAND_DISPLAY", "XDG_SESSION_TYPE", "DBUS_SESSION_BUS_ADDRESS")}
        env["MOZ_HEADLESS"] = "1"
        self.proc = subprocess.Popen([FIREFOX, "--headless", f"--remote-debugging-port={self.port}", "--profile", str(self.profile),
                                      "--no-remote", "--new-instance", f"--window-size={self.width},{self.height}", "about:blank"],
                                     env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        end = time.time() + 40
        while time.time() < end:
            try:
                self.ws = websocket.create_connection(f"ws://127.0.0.1:{self.port}/session", timeout=30)
                break
            except Exception:
                time.sleep(0.3)
        else:
            self.__exit__()
            raise RuntimeError("Firefox did not open its BiDi port")
        r = self.call("session.new", {"capabilities": {}})
        self.version = r.get("capabilities", {}).get("browserVersion", "?")
        self.call("session.subscribe", {"events": ["log.entryAdded"]})
        tree = self.call("browsingContext.getTree", {})
        self.context = tree["contexts"][0]["context"]
        self.call("browsingContext.setViewport", {"context": self.context, "viewport": {"width": self.width, "height": self.height}})
        return self

    def call(self, method, params, timeout=40):
        self._id += 1
        mid = self._id
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        end = time.time() + timeout
        while time.time() < end:
            self.ws.settimeout(max(0.1, end - time.time()))
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                if msg.get("type") == "error":
                    raise RuntimeError(f"{method}: {msg}")
                return msg.get("result", {})
            if msg.get("type") == "event":
                self.events.append(msg)
        raise RuntimeError(f"timeout waiting for {method}")

    def pump(self, seconds):
        end = time.time() + seconds
        while time.time() < end:
            try:
                self.ws.settimeout(max(0.05, end - time.time()))
                msg = json.loads(self.ws.recv())
                if msg.get("type") == "event":
                    self.events.append(msg)
            except Exception:
                return

    def console_errors(self):
        out = []
        for e in self.events:
            if e.get("method") == "log.entryAdded":
                p = e["params"]
                if p.get("level") in ("error", "warn"):
                    out.append(f"{p.get('level')} {p.get('type')} {p.get('text')}")
        return out

    def js(self, expr):
        r = self.call("script.evaluate", {"expression": f"JSON.stringify({expr})", "target": {"context": self.context},
                                          "awaitPromise": False, "resultOwnership": "none"})
        if r.get("type") == "exception":
            raise RuntimeError("JS exception: " + json.dumps(r.get("exceptionDetails", {}))[:300])
        return json.loads(r["result"]["value"])

    def navigate(self, url):
        self.call("browsingContext.navigate", {"context": self.context, "url": url, "wait": "complete"})
        self.pump(0.5)

    def probe(self):
        self.pump(0.02)
        return self.js(PROBE)

    def wait(self, pred, timeout, every=0.12):
        t0 = time.time()
        s = self.probe()
        while not pred(s):
            if time.time() - t0 > timeout:
                return False, time.time() - t0, s
            self.pump(every)
            s = self.probe()
        return True, time.time() - t0, s

    def click(self, selector):
        r = self.js(f"""(() => {{ const el = document.querySelector({json.dumps(selector)}); if (!el) return null;
            el.scrollIntoView({{block: 'center'}}); const b = el.getBoundingClientRect();
            return {{x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), w: b.width}}; }})()""")
        if not r or not r["w"]:
            return False
        self.call("input.performActions", {"context": self.context, "actions": [{"type": "pointer", "id": "mouse", "actions": [
            {"type": "pointerMove", "x": r["x"], "y": r["y"]}, {"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0}]}]})
        return True

    def key(self, k):
        v = KEYS[k]
        self.call("input.performActions", {"context": self.context, "actions": [{"type": "key", "id": "kb", "actions": [
            {"type": "keyDown", "value": v}, {"type": "keyUp", "value": v}]}]})

    def shot(self, path: Path):
        data = self.call("browsingContext.captureScreenshot", {"context": self.context})["data"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(base64.b64decode(data))

    def __exit__(self, *exc):
        try:
            if self.ws:
                self.call("browser.close", {}, timeout=5)
        except Exception:
            pass
        try:
            if self.ws:
                self.ws.close()
        except Exception:
            pass
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
        if self.profile and self.profile.exists() and self.profile.parent == SCRATCH:
            shutil.rmtree(self.profile, ignore_errors=True)


def run(page: str, label: str, port: int, reduced: bool, width: int, height: int, shots: Path) -> dict:
    name = f"firefox-{width}x{height}-{'reduce' if reduced else 'motion'}"
    res = {"config": name, "checks": [], "hangs": [], "console": [], "notes": []}

    def check(lbl, ok, detail=""):
        res["checks"].append({"check": lbl, "ok": bool(ok), "detail": detail})
        if not ok:
            print(f"    FAIL {lbl}: {detail}", flush=True)

    with Firefox(port, reduced, width, height) as fx:
        res["version"] = fx.version
        fx.navigate(page)
        s = fx.probe()
        res["env"] = {k: s[k] for k in ("innerWidth", "innerHeight", "dpr", "reduced", "stacked")}
        print(f"  [{name}] Firefox {fx.version} innerWidth={s['innerWidth']} reduced={s['reduced']} stacked={s['stacked']}", flush=True)
        check("page loads at step 1", settled(0, s), s["step"])
        check("reduced-motion pref applied", s["reduced"] == reduced, str(s["reduced"]))
        fx.shot(shots / f"{name}-01-load.png")
        for i in range(1, 7):
            fx.click("#btnNext")
            ok, dt, s = fx.wait(lambda st, i=i: settled(i, st), 40)
            check(f"Next -> step {i + 1} ({STEP_NAMES[i]}) completes", ok, f"{dt:.1f}s" if ok else f"TIMEOUT {json.dumps(s)[:300]}")
            check(f"step {i + 1}: no spinner left on screen", not s["browserSpinner"] and not s["engSpinner"], "")
            if not ok:
                res["hangs"].append(f"step {i + 1}: {json.dumps(s)[:500]}")
            if i in (2, 4):
                fx.shot(shots / f"{name}-0{i}-step{i + 1}.png")
        fx.shot(shots / f"{name}-07-step7.png")
        # in-page buttons
        fx.click("#btnReset")
        fx.wait(lambda st: settled(0, st), 10)
        for i, goto in enumerate(["1", "2", "3", "4", "5", "6"], start=1):
            ok, dt, s = fx.wait(lambda st, g=goto: g in st["gotoBtns"], 30)
            check(f"in-page button to step {i + 1} is offered", ok, f"{dt:.1f}s")
            if not ok:
                break
            fx.click(f'[data-goto="{goto}"]')
            ok, dt, s = fx.wait(lambda st, i=i: settled(i, st), 40)
            check(f"in-page button -> step {i + 1} completes", ok, f"{dt:.1f}s" if ok else f"TIMEOUT {json.dumps(s)[:300]}")
            if not ok:
                res["hangs"].append(f"in-page step {i + 1}: {json.dumps(s)[:500]}")
        # profiles at the derivation step
        fx.key("r"); fx.wait(lambda st: settled(0, st), 10)
        fx.key("ArrowRight"); fx.wait(lambda st: settled(1, st), 20)
        fx.key("ArrowRight"); fx.wait(lambda st: settled(2, st), 40)
        expect = {"1": "m = 19 MiB", "2": "m = 64 MiB", "3": "m = 128 MiB", "4": "m = 256 MiB"}
        for k in ("4", "1", "3", "2"):
            fx.key(k)
            ok, dt, s = fx.wait(lambda st, k=k: st["chipM"] == expect[k] and settled(2, st), 45)
            check(f"key {k}: derivation completes at {expect[k]}", ok, f"{dt:.1f}s cells={s['cellsOn']}/{s['cells']}" if ok else f"TIMEOUT {json.dumps(s)[:300]}")
            if not ok:
                res["hangs"].append(f"profile {k}: {json.dumps(s)[:500]}")
        fx.shot(shots / f"{name}-08-profile64.png")
        # auto-play
        fx.click("#btnReset"); fx.wait(lambda st: settled(0, st), 10)
        fx.click("#btnPlay")
        t0 = time.time(); timeline = []; last = None
        while time.time() - t0 < 150:
            s = fx.probe()
            if s["step"] != last:
                timeline.append((round(time.time() - t0, 1), s["step"])); last = s["step"]
            if settled(6, s) and s["playLabel"] == "Play":
                break
            fx.pump(0.25)
        ok = settled(6, s) and s["playLabel"] == "Play"
        dwell = [round(timeline[j + 1][0] - timeline[j][0], 1) for j in range(len(timeline) - 1)]
        res["autoplay"] = {"ok": ok, "total_s": round(time.time() - t0, 1), "timeline": timeline, "dwell_s": dwell}
        check("auto-play reaches step 7 and stops", ok, f"{res['autoplay']['total_s']}s dwell {dwell}")
        check("auto-play gives at least 3 s on every step", all(d >= 3.0 for d in dwell) and len(dwell) == 6, f"dwell {dwell}")
        # rig
        fx.click("#rigRun"); fx.pump(0.5); s = fx.probe()
        check("Run the rig: click restarts", s["rigBtn"].startswith("Pause") and s["hot"] > 0, f"{s['rigBtn']} hot={s['hot']}")
        fx.click("#rigRun"); fx.pump(0.4); s = fx.probe()
        check("Run the rig: pause", s["rigBtn"].startswith("Run"), s["rigBtn"])
        fx.click("#rigRun")
        ok, dt, s = fx.wait(lambda st: st["rigCount"] == "1,000,000", 25)
        check("Run the rig: runs to 1,000,000", ok, f"{dt:.1f}s")
        # keys and panels
        fx.key("r"); ok, dt, s = fx.wait(lambda st: settled(0, st), 10); check("R resets", ok, s["step"])
        fx.key(" "); fx.pump(0.5); s = fx.probe(); check("space starts Play", s["playLabel"] == "Pause", s["playLabel"])
        fx.key(" "); fx.pump(0.3); s = fx.probe(); check("space pauses Play", s["playLabel"] == "Play", s["playLabel"])
        fx.click("#engineCard .expand-btn"); fx.pump(0.4); s = fx.probe(); check("enlarge panel opens", s["expanded"])
        fx.key("Escape"); fx.pump(0.4); s = fx.probe(); check("Esc restores the panel", not s["expanded"])
        fx.key("f"); fx.pump(0.8); s = fx.probe()
        res["notes"].append(f"Present (F): fullscreenElement={s['fullscreen']} button={s['fullBtn']!r}")
        if s["fullscreen"]:
            fx.key("f"); fx.pump(0.6)
        fx.pump(0.3)
        res["console"] = fx.console_errors()
        check("no console errors or warnings", not res["console"], "; ".join(res["console"])[:400])
    res["pass"] = all(c["ok"] for c in res["checks"]) and not res["hangs"]
    print(f"  [{name}] {'PASS' if res['pass'] else 'FAIL'}: {sum(c['ok'] for c in res['checks'])}/{len(res['checks'])}", flush=True)
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", required=True)
    ap.add_argument("--label", required=True)
    ap.add_argument("--port", type=int, default=5393)
    a = ap.parse_args()
    page = a.page if "://" in a.page else "file://" + str(Path(a.page).resolve())
    shots = HERE / f"shots-{a.label}"
    results = []
    for width, height, reduced in ((1920, 1080, False), (1920, 1080, True), (1024, 768, False)):
        try:
            results.append(run(page, a.label, a.port, reduced, width, height, shots))
        except Exception as e:
            results.append({"config": f"firefox-{width}x{height}-{'reduce' if reduced else 'motion'}", "checks": [{"check": "harness ran", "ok": False, "detail": repr(e)}],
                            "hangs": [repr(e)], "console": [], "notes": [], "pass": False})
            print(f"  harness exception: {e!r}", flush=True)
    lines = [f"# Argon2id lab: Firefox (WebDriver BiDi) run: {a.label}", "", f"Page: `{page}`  ",
             f"Firefox: {results[0].get('version', '?')}  ", f"Run: {time.strftime('%Y-%m-%d %H:%M:%S')}", "",
             "| Config | CSS viewport | reduced | stacked | checks | hangs | console | auto-play dwell (s) | result |", "|---|---|---|---|---|---|---|---|---|"]
    for r in results:
        env = r.get("env", {}); ap_ = r.get("autoplay", {})
        lines.append(f"| {r['config']} | {env.get('innerWidth', '')}×{env.get('innerHeight', '')} | {env.get('reduced', '')} | {env.get('stacked', '')} | "
                     f"{sum(c['ok'] for c in r['checks'])}/{len(r['checks'])} | {len(r['hangs'])} | {len(r['console'])} | {ap_.get('dwell_s', '')} | {'PASS' if r['pass'] else 'FAIL'} |")
    lines.append("")
    for r in results:
        lines.append(f"## {r['config']}")
        for c in r["checks"]:
            lines.append(f"- {'ok  ' if c['ok'] else 'FAIL'} {c['check']}" + (f" ({c['detail']})" if c["detail"] else ""))
        for n in r["notes"]:
            lines.append(f"- note: {n}")
        for c in r["console"]:
            lines.append(f"- console: {c}")
        lines.append("")
    (HERE / f"results-{a.label}.md").write_text("\n".join(lines))
    print("ALL PASS" if all(r["pass"] for r in results) else "SOME FAILURES", flush=True)


if __name__ == "__main__":
    main()
