# Cookie Theft · Visual Lab — test evidence (2 November 2026)

Everything here was produced on this machine with the real browsers installed on it, each started
by the scripts in this folder on a private display / port with a throw-away profile and a dead
proxy (nothing could leave the machine except the one deliberate live-URL load). Mike's own Chrome,
display `:1` and every process not started by these scripts were never touched.

| file | what it is |
|---|---|
| `run_matrix.py` | Chrome (DevTools protocol) matrix: 17 configurations × the full scenario (load, Sign in and watch, all six steps by clicking, replay, HTTPS defence, Reset + auto-play, every keyboard shortcut and toggle, enlarge panel, fullscreen, rapid Next, the three deep links), each wait bounded by an 8 s hang timeout. Writes `results.json`, `results.md`, `log.txt`, screenshots. |
| `run_firefox.py` | The same click-through in headless Firefox over WebDriver BiDi, with and without `prefers-reduced-motion`, wide and stacked. |
| `frames.py` | Frame sequences (nominally every 150 ms) across steps 2–6 including the replay and the HTTPS flip, with the per-frame panel state in `frames/<step>.json`. |
| `cdp_lite.py` | Tiny stdlib DevTools/WebSocket client (copied from Mike's CSSP-Cookies demos). |
| `shrink_evidence.sh` | Converts the screenshots to 960-px JPEG and builds one contact sheet per frame sequence, so the folder fits in the repo. |

## Before: the original page (as published)

`results/original-chrome/` — Chrome 153, original file, three configurations. Every one reproduces
Mike's report: after **Sign in** the spinner is still spinning six seconds later with nothing else to
click. The stacked layout also logs two console warnings (`Invalid keyframe value … translate(NaNpx,NaNpx)`)
from the Replay button. Screenshots `*-02-after-signin.jpg` show the stuck state.

| configuration | spinner stuck after Sign in? | console errors | verdict |
|---|---|---|---|
| 1920x1080 | yes | 0 | FAIL |
| 1920x1080 + reduced motion | yes | 0 | FAIL |
| 1024x768 (stacked) | yes | 2 | FAIL |

`results/live-original-chrome/` — the **published URL** loaded online in the same Chrome
(1920×1080): identical behaviour (the live file is byte-identical to the original). Its one console
error is a `404` for the browser's automatic `/favicon.ico` request on GitHub Pages, not anything the
page references (it loads no resources at all).

## After: the fixed page

`results/fixed-chrome/results.md` — Chrome 153, final `index.html`, all 17 configurations
**PASS**, spinner column "no" throughout, **0 console errors**:

| configuration | CSS viewport | DSF | reduced motion | CPU | hidden tab | spinner stuck? | failed checks | verdict |
|---|---|---|---|---|---|---|---|---|
| 1920x1080 | 1920x1080 | 1 | off | 1x | no | no | none | PASS |
| 1920x1080-reduced | 1920x1080 | 1 | on | 1x | no | no | none | PASS |
| 1440x900 | 1440x900 | 1 | off | 1x | no | no | none | PASS |
| 1366x768 | 1366x768 | 1 | off | 1x | no | no | none | PASS |
| 1366x768-reduced | 1366x768 | 1 | on | 1x | no | no | none | PASS |
| 1280x720 | 1280x720 | 1 | off | 1x | no | no | none | PASS |
| 1280x720-reduced | 1280x720 | 1 | on | 1x | no | no | none | PASS |
| 1024x768-stacked | 1024x768 | 1 | off | 1x | no | no | none | PASS |
| 1024x768-stacked-red | 1024x768 | 1 | on | 1x | no | no | none | PASS |
| 800x900-stacked | 800x900 | 1 | off | 1x | no | no | none | PASS |
| zoom125-1536x864 (1920 px screen at 125 %) | 1536x864 | 1.25 | off | 1x | no | no | none | PASS |
| zoom150-1280x720 (1920 px at 150 %) | 1280x720 | 1.5 | off | 1x | no | no | none | PASS |
| zoom200-960x540 (1920 px at 200 %, stacked) | 960x540 | 2 | off | 1x | no | no | none | PASS |
| zoom125-1093x614 (1366 px laptop at 125 %, just under 1100) | 1093x614 | 1.25 | off | 1x | no | no | none | PASS |
| 1920x1080-cpu4x | 1920x1080 | 1 | off | 4x | no | no | none | PASS |
| 1366x768-cpu4x-red | 1366x768 | 1 | on | 4x | no | no | none | PASS |
| 1920x1080-hidden-tab (driven while in a background tab) | 1920x1080 | 1 | off | 1x | yes | no | none | PASS |

`results/fixed-firefox/results.md` — Firefox 158.0.1 (headless, BiDi), final file:

| configuration | reduced motion | spinner stuck? | failed checks | console errors | verdict |
|---|---|---|---|---|---|
| ff-1920x1080 | off | no | none | 0 | PASS |
| ff-1920x1080-reduced | on | no | none | 0 | PASS |
| ff-1366x768 | off | no | none | 0 | PASS |
| ff-1024x768-stacked | off | no | none | 0 | PASS |

## Cause before effect: frame sequences

`frames/` — one JPEG per frame (`<step>-fNN-<nominal ms>.jpg`), one contact sheet per step
(`<step>-SHEET.jpg`) and the per-frame state (`<step>.json`: packet on screen and its label,
server-log keys, session store, jar, capture lines, account, result panel). In every sequence the
labelled packet is on the wire while the panel it causes is still empty, and the panel changes only
in the first frame after the packet is gone (for the Set-Cookie step the server log and store appear
as the packet departs the server, and the jar fills only after it arrives). The nominal 150 ms
spacing understates real time slightly because each screenshot takes time; the ordering is what the
sequences prove. Details and the per-step narrative are in `../FIXES.md` §2.

## Not covered

Safari / WebKit (not installed here). How the lab reads and paces on Mike's projector is his
judgement; nothing here can measure that.
