# test-evidence: what is in here

> The screenshot and frame images mentioned below (`frames-*/`, `shots-*/`, `*.png`) are not in this public repository (about 35 MB); the scripts, the per-frame tables and every results file are. `results-final-after-password-gate.md` is the last full run (12 headless configurations and the headed run with the background-tab test, all passing) on the delivered file.

All runs drive a REAL browser (Chrome 153 through the DevTools protocol; Firefox 158 headless) with real
mouse and keyboard events, started by the scripts themselves in a throw-away profile on a private port /
Xvfb display. Nothing here touched Mike's own Chrome or display :1, and the page made no network request
in any run (the request log is checked every time).

## Scripts
- `lab_matrix.py` — the interaction matrix: load; Next through all seven steps; Reset; Back; the in-page
  buttons through all seven; every profile by key (1–4) at the derivation step and by button at the login
  step; auto-play to the end; the rig (restart/pause/finish); keyboard (R, arrows, space, 1–4, F); enlarge +
  Esc; a resize across the 1260 px breakpoint mid-derivation and mid-verify; console errors; network
  requests. Suites: `headless` (6 sizes × motion on/off), `xvfb` (headed, + a background-tab test), `hidpi`
  (deviceScaleFactor 1.25 / 1.5 / 2 = Chrome zoom 125 / 150 / 200 % on a 1920 px screen), `throttle`
  (4× CPU), `live` (the published URL).
- `capture_frames.py` — frame sequences (every ~0.16 s) across the step 1, 5, 6 and 7 transitions in headed
  Chrome, with the DOM state recorded per frame.
- `firefox_check.py` — a WebDriver-BiDi driver for Firefox. It could not connect to Firefox 158's direct
  BiDi endpoint in this environment, so Firefox evidence is the headless `--screenshot` set below.
- `cdp_lite.py` — the stdlib DevTools client (copied from the CSSP-Cookies demos).

## Results, final file (the page as delivered)
- `results-final-headless.md` — 12 configs (1920×1080, 1440×900, 1366×768, 1280×720, 1024×768, 800×900 ×
  motion / reduced).
- `results-final-xvfb.md` — headed Chrome, motion + reduced, plus the background-tab test.
- `results-final-hidpi.md` — zoom 125 / 150 / 200 % (200 % = 960 CSS px, stacked layout) + 150 % reduced.
- `results-final-throttle.md` — 4× CPU throttle.
- `FRAME-EVIDENCE.md` + `frames-step1-register/`, `frames-step5-login/`, `frames-step6-wrong/`,
  `frames-step7-steal/` — the cause-before-effect proof: per-frame table and the JPEG frames
  (`manifest.json` holds the DOM state per frame).
- `shots-final-*/` — a curated set of full-page screenshots from the final runs (load, step 3, step 5,
  step 7, 256 MiB profile, auto-play end, after the background-tab test).
- `shots-firefox/` — Firefox 158 headless load screenshots at 1920×1080, 1280×720 and 1024×768.

## Results, original file (what was broken)
- `results-original-smoke.md`, `results-original-headless.md`, `results-original-xvfb.md` — the original
  page: auto-play dwell of 0.5–1.1 s on animated steps, permanent spinners on steps 2–3 (recorded as notes;
  these runs used `--lenient`), and the background-tab stall (xvfb notes).
- `results-live-original.md` — the LIVE published page at the time of review (identical to the original
  file), two configs, reproducing the auto-play defect.
- `original-step3-permanent-spinner.png` — the original page after the derivation finished, wheel still
  turning in the browser card. `original-step5-settled.png` — the original page's login step for comparison.

## Results, first round of fixes (before the packet rework)
- `results-fixed-smoke.md`, `results-fixed-headless.md`, `results-fixed-xvfb.md`,
  `results-fixed-hidpi-throttle.md`, `results-fixed-throttle.md` — all pass; kept to show the hang fixes
  alone were sufficient before the cause-before-effect rework was added on top. Their screenshots were
  removed to keep the folder small.
