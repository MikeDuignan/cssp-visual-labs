#!/usr/bin/env python3
"""capture_frames.py: capture an ordered frame sequence across a step transition in a REAL headed Chrome on
a private Xvfb display, and record the DOM state at each frame, so the evidence shows the packet crossing
the wire BEFORE the server panel changes. One sequence per transition; JPEG frames + a manifest.

Usage: python3 capture_frames.py --page FILE [--port 5397]
Writes frames-<seq>/frame-NN.jpg and frames-<seq>/manifest.json next to this script.
"""
from __future__ import annotations

import argparse
import base64
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lab_matrix import Chrome, Tab, settled  # noqa: E402

HERE = Path(__file__).resolve().parent

CAP = r"""(() => {
  const q = s => document.querySelector(s);
  const has = k => !!document.querySelector('[data-key="' + k + '"]');
  const pk = [...document.querySelectorAll('.packet')].map(p => ({
    cls: p.className.replace('packet', '').trim(),
    text: (p.textContent || '').replace(/\s+/g, ' ').trim(),
    x: Math.round(p.getBoundingClientRect().left)
  }));
  return {
    step: ((q('#stepCount') || {}).textContent || '').trim(),
    cue: ((q('#stepCue') || {}).textContent || '').trim(),
    packets: pk.length, packet: pk[0] || null,
    srv_register: has('register'), srv_salt: has('salt'), srv_derive: has('derive'),
    srv_insert: has('insert'), srv_login: has('login'), srv_fail: has('fail'),
    saltVal: ((q('#engineSalt') || {}).textContent || '').trim(),
    dbRow: !!q('.db-row'), cellsOn: document.querySelectorAll('#memWrap .cell.on').length,
    verdict: (q('#cmpVerdict') || {}).className ? q('#cmpVerdict').className.replace('match', '').trim() : '',
    browserH3: ((q('#browserPage h3') || {}).textContent || '').trim(),
    browserSpinner: !!q('#browserPage .spinner'),
    rigHot: document.querySelectorAll('.gpu-slot.hot').length, rigCount: ((q('#rigCount') || {}).textContent || '').trim()
  };
})()"""


def advance_to(tab, target):
    """Click Next until the given settled step index is reached."""
    tab.click("#btnReset")
    tab.wait(lambda s: settled(0, s), 10)
    for i in range(1, target + 1):
        tab.click("#btnNext")
        tab.wait(lambda s, i=i: settled(i, s), 40)


def capture_sequence(tab, name, trigger, dur, every=0.16, maxframes=28):
    out = HERE / f"frames-{name}"
    out.mkdir(parents=True, exist_ok=True)
    frames = []
    trigger()                      # fire the transition, then start grabbing at once
    t0 = time.time()
    n = 0
    while time.time() - t0 < dur and n < maxframes:
        s = tab.js(CAP)
        data = tab.b.call("Page.captureScreenshot", {"format": "jpeg", "quality": 72}, tab.sid, timeout=30)["data"]
        (out / f"frame-{n:02d}.jpg").write_bytes(base64.b64decode(data))
        s["t"] = round(time.time() - t0, 2)
        s["frame"] = f"frame-{n:02d}.jpg"
        frames.append(s)
        n += 1
        dt = every - ((time.time() - t0) - s["t"])
        if dt > 0:
            tab.b.pump(dt)
    (out / "manifest.json").write_text(json.dumps(frames, indent=1))
    # a compact ordered trace for the console / FIXES.md
    print(f"\n=== {name} ({n} frames) ===", flush=True)
    for f in frames:
        srv = "".join(k for k, on in (("R", f["srv_register"]), ("s", f["srv_salt"]), ("d", f["srv_derive"]),
                                      ("i", f["srv_insert"]), ("L", f["srv_login"]), ("F", f["srv_fail"])) if on) or "-"
        print(f"  {f['t']:>4}s pkts={f['packets']} [{(f['packet'] or {}).get('text','')[:34]:<34}] "
              f"srvlog={srv:<6} db={int(f['dbRow'])} cells={f['cellsOn']:>3} verdict={f['verdict'][:4]:<4} "
              f"browser='{f['browserH3'][:22]}' rigHot={f['rigHot']}", flush=True)
    return frames


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", required=True)
    ap.add_argument("--port", type=int, default=5397)
    a = ap.parse_args()
    page = a.page if "://" in a.page else "file://" + str(Path(a.page).resolve())
    with Chrome(a.port, headless=False, window=(1920, 1080)) as chrome:
        print(chrome.version.get("Browser"), flush=True)
        tab = Tab(chrome, page, 1920, 1080)
        try:
            # Step 1: the register packet must cross before the server log / salt appear
            advance_to(tab, 0)
            capture_sequence(tab, "step1-register", lambda: tab.click("#btnNext"), dur=3.6)
            # Step 5 (good login): login packet -> recompute -> compare -> 200 back -> browser welcome
            advance_to(tab, 3)
            capture_sequence(tab, "step5-login", lambda: tab.click("#btnNext"), dur=8.5, maxframes=34)
            # Step 6 (wrong password): wrong packet -> compare fail -> 401 back
            advance_to(tab, 4)
            capture_sequence(tab, "step6-wrong", lambda: tab.click("#btnNext"), dur=8.5, maxframes=34)
            # Step 7 (steal): verifier travels DB -> rig before the rig runs
            advance_to(tab, 5)
            capture_sequence(tab, "step7-steal", lambda: tab.click("#btnNext"), dur=4.2)
        finally:
            tab.close()


if __name__ == "__main__":
    main()
