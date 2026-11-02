# Fixes: Password Check · Argon2id

What was broken, how it was reproduced, the root cause, what changed, and how it was verified.
All work is in the single file `index.html` (no external resources, no network requests) plus `README.md`.
Evidence and the test harness are under `test-evidence/`. `git diff` shows the original.

---

## Part A — the reported fault: a spinner that spins and nothing happens

### What Mike reported
On the live lab pages (he was describing the sibling Cookie Theft page, and asked me to check this one
equally) a "sign-in wheel" spins and nothing happens. Browser, window size and motion setting unknown; the
lead later confirmed he was on desktop Chrome on this Linux machine.

### How it was reproduced (real browsers, never guessed)
Harness `test-evidence/lab_matrix.py` drives a real Chrome over the DevTools protocol (headless, and headed
on a private Xvfb display), steps through all seven steps by click and by auto-play, switches every profile,
runs the rig, and records console errors and any step that never settles. Three independent defects fell out,
all reproduced on the ORIGINAL file (`test-evidence/results-original-*.md`):

1. **Permanent spinners on steps 2 and 3.** In Chrome at 1920×1080 the browser card showed a turning wheel
   ("Preparing your account…", "Hashing with Argon2id…") for the whole step, even after the engine had
   finished (see `test-evidence/original-step3-permanent-spinner.png`). A wheel means "wait"; a presenter who
   waits sees exactly "a wheel that spins and nothing happens".
2. **A hidden tab froze a step mid-way.** In headed Chrome with the tab pushed to the background, the login
   step sat on "Verifying your password…" for the entire time it was hidden, and the 256 MiB derivation
   stalled at "pass 1 / 4"; both only resumed when the tab was foregrounded
   (`results-original-xvfb.md`, background-tab notes).
3. **Auto-play raced through animated steps.** Dwell per step on the original was `[4.6, 1.1, 8.4, 4.7, 4.0,
   4.4] s` with motion, and `[4.6, 0.6, 0.5, 4.6, 0.6, 0.5] s` with `prefers-reduced-motion` — several steps
   flashed past in half a second. Reproduced on the LIVE page too (`results-live-original.md`).

### Root cause
- The browser card's spinner was a fixed state of the step, not tied to whether the server had finished, so
  it never stopped (1).
- Waits were built on the Web Animations API `animation.finished` promise, which only settles while the
  document is being painted. A hidden or heavily throttled tab never fires it, so the `await` in the step's
  async function never returned and the step hung behind its spinner (2).
- `prefers-reduced-motion` was read once at load, and the reduced-motion CSS turned the infinite spinner and
  wire animations into a `.001s` loop (restarting ~1000×/s); the auto-play scheduler advanced ~0.6 s after an
  animation ended, so instant animations gave almost no reading time (3).

### What changed (A)
- **Spinners resolve into a tick.** Each browser-card step shows the wheel only while the server is actually
  working and swaps to a tick/cross the moment its result exists (`renderBrowser`, gated on the new
  visibility flags). No wheel can outlive its cause.
- **Every wait is raced against the clock.** `move()` now returns `Promise.race([animation.finished,
  rawSleep(ms+300)])`; `sleep()` is a tracked timer. A per-step **watchdog** (`stepBudget`, `finishStep`)
  jumps to the finished picture if a step ever overruns, and a `visibilitychange` handler completes the
  current step at once when the tab is hidden. So no step can hang in any browser, size or motion setting.
- **Live media queries.** `prefers-reduced-motion` and the 1260 px breakpoint are read live
  (`motionQuery`, `stackedQuery`), so changing the OS motion setting or the window mid-lesson is honoured.
  The infinite `.wire-flow` and `.spinner` animations are switched **off** under reduced motion instead of
  looping at `.001s`.
- **Auto-play holds a readable time.** Each step is held `max(start+4.5 s, animationEnd+1.5 s)`
  (`READ_MS`/`HOLD_MS`), so every step gets at least ~4.5 s, motion on or off.

---

## Part B — Mike's second request: show every message crossing the wire (cause before effect)

### What Mike reported (via the lead)
Looking at the improved page, step 1 still had the request/password just *appear* in the server panel: "does
the request get sent across, and if it does, show it going across the cable." Hard requirement, applied to
the whole page.

### Root cause
The server panels (request log, salt, memory fill, users table) rendered from the step number alone and were
populated by `setStep` the instant the step loaded — before, or independent of, the single packet that used
to fly. Effects preceded their causes.

### What changed (B)
- **A visibility flag per visible thing** (`targetVis`): `reg, salt, tag, stored, created, verified, failed,
  compared, delivered, policy, stolen`. Every server/DB/engine/browser render is gated on these, so nothing
  on the server side appears until its flag is set.
- **An ordered script per animated step** (`stepScript`): a labelled packet crosses the wire FIRST
  (`flyTrip`, ~1.2–1.8 s, sender card highlights on leave, receiver on arrival); only on arrival does the
  receiving panel react, in order. Then the response travels back before the browser shows its result.
- **Every message is now a packet**, with a short label, a lock icon and "TLS" where encrypted:
  `POST /signup: email + password` → server logs it → draws the salt; the derivation (no new message); the
  verifier is written → **201 Created** travels back → "Account created"; **POST /login** → recompute →
  constant-time compare → **200 OK** back → "Welcome back"; **POST /login (wrong)** → compare fails →
  **401** back → "Incorrect password"; and in step 7 the **stolen users row** (`$argon2id$…`, no password)
  travels from the database to the attacker rig, which only then starts guessing.
- **A one-line caption** under the step text (`#stepCue`, `CUES`) names the sequence and is updated live as
  the packet crosses and the server reacts ("The browser sends the form across the wire…", "Received. The
  server draws 16 random bytes of salt.", …).
- **Reduced motion:** packets still cross, in ~0.32 s (`pdur`), order preserved.
- **Stacked layout (wires hidden, ≤1260 px):** the packet becomes a short sender-card → receiver-card
  highlight in the same order (`flyTrip` stacked branch); no hang (same watchdog/clock fallbacks).

### The seven steps: what the viewer sees, in order (nothing appears without a visible cause)

| Step | Ordered sequence (approx. times, 64 MiB, motion on) | Caused-by check |
|---|---|---|
| 1 A password arrives | Form shown. Nothing sent. Server: "waiting for credentials". | nothing on server |
| 2 A fresh random salt | 0.0 s **POST /signup** packet leaves browser (card flashes) → 1.5 s arrives (server flashes) → **register** log line → 2.0 s **salt** log line + salt value fill → browser wheel → "Salt generated". | log + salt only after the packet arrives |
| 3 Argon2id fills memory | No packet. 0.5 s allocate → memory grid fills cell by cell (data-independent then data-dependent, referenced block highlighted) → ~8 s **derive** log line + 32-byte tag + "Verifier derived". | work on the password/salt already received |
| 4 Only the verifier is stored | 0.4 s **insert** log line + users-table row appears → **201 Created** packet travels server→browser → on arrival "Account created". | DB row before the 201; tick after the 201 |
| 5 Login: derive and compare | **POST /login** packet browser→server → recompute sweep → constant-time byte compare (0→32) → **200 OK** log line → **200** packet server→browser → "Welcome back". | engine idle until packet arrives; welcome only after 200 |
| 6 Wrong password, different tag | **POST /login (WRONG)** packet → recompute → compare fails (0/32) → **401** log line → **401** packet back → "Incorrect password". | "Incorrect" only after the 401 arrives |
| 7 Why Argon2id | **LEAK: stolen users row** packet travels database→attacker rig (rig idle, TRIED 0) → on arrival the rig arms → then the rig runs to 1,000,000 guesses. | rig stays idle until the verifier arrives |

### Proof (frames looked at, every 150 ms)
`test-evidence/capture_frames.py` captured real headed-Chrome frame sequences across steps 1, 5, 6 and 7
(JPEGs + `manifest.json` in `test-evidence/frames-*`). `test-evidence/FRAME-EVIDENCE.md` is the per-frame
trace with the cause-before-effect assertions — all pass:

- **step 1:** the POST /signup packet is on the wire to 1.62 s with the server log still "waiting"; the
  register line first appears at 1.92 s (frame `frames-step1-register/frame-00.jpg`: packet out, log waiting).
- **step 5:** the request flies with the comparison blank; the **200 OK** packet is travelling back at ~5 s
  while the browser still says "Verifying…", and "Welcome back" appears only at 6.45 s
  (`frames-step5-login/frame-18.jpg`).
- **step 6:** "Incorrect password" appears at 6.43 s, after the 401 packet (from 4.93 s).
- **step 7:** the LEAK packet is on the wire to 1.62 s with the rig idle; the rig's first hot slots appear at
  2.47 s (`frames-step7-steal/frame-02.jpg`: red packet mid-flight, rig TRIED 0).

I opened those four PNGs/JPEGs with the Read tool and confirmed each shows the packet crossing before the
panel changes.

---

## Part B2 — found on review after the first delivery: the password appeared in the server before it was sent

Mike's requirement was that nothing appears in the server panel before the message that causes it has crossed the wire.
The first delivery met that for the request log, the salt, the verifier row and the verdicts, but the Argon2id engine's
PASSWORD field ("in memory") was hard-coded to show `correct horse battery staple` from the first frame, so on step 1
the server already held the password before the form had been sent. The frame tables in the first delivery did not
record that field, so their "all assertions pass" did not cover it.

Fix (`index.html`): a flag `vis.pwIn`. The engine shows `—` until a request carrying the password has ARRIVED:
step 1 (the register packet sets `vis.reg`), and steps 5 and 6 (the login packet clears `vis.pwIn` at the start and sets
it on arrival). The finished-state fallbacks (hidden tab, watchdog, deep link) set it true, so nothing is left blank.
Re-captured in headed Chrome 153: `server password` is `—` in every frame while the packet is on the wire and fills
at the frame where it arrives, for all three password-carrying steps (`FRAME-EVIDENCE.md`, now with that column).

---

## Part C — content and teaching corrections (verified against primary sources)

Full review in `REVIEW.md`. The corrections actually applied:

1. **SHA-256 rate `~10⁹/s` → `~10¹⁰/s`** (cost-comparison bar and README). A single RTX 4090 (a 24 GiB card)
   benchmarks at ~2.1×10¹⁰ SHA-256 H/s in hashcat; 10⁹ was an order of magnitude low. The million-fold gap
   to Argon2id (still "illustrative") stands. *Misleading → fixed.*
2. **5-word passphrase time labelled as the average.** The displayed ~450 million years is 7776⁵⁄2 ÷ rate
   (the *average* number of guesses, half the keyspace) while the label quoted the whole space (2.8×10¹⁹).
   The row now reads "5-word passphrase (average)"; the notes say "7776⁵ ≈ 2.8×10¹⁹, half of them on
   average". Arithmetic re-derived and confirmed (1.42×10¹⁹ ÷ 1000 ÷ 31,557,600 = 4.50×10⁸ yr).
   *Misleading → fixed.*
3. **Step-7 narration "a million is minutes; a billion is days; a trillion is years"** was true only at the
   19 and 64 MiB profiles (at 256 MiB a million guesses is 1h 23m). The sentence now inserts the selected
   profile's own figures (`{t1m}`/`{t1b}`/`{t1t}`). *Imprecise → fixed.*
4. **Reference-block formula.** The block recipe read `B[L0][j] = G(B[L0][j−1], B[L0][ref])` with "every
   block needs an earlier block", implying the reference is always in the same lane. Per RFC 9106 §3.4.2 the
   reference block can come from any lane (`l = J2 mod p`), as the grid already shows by highlighting the
   referenced column across all lanes. Now `B[lane][j] = G(B[lane][j−1], B[l′][ref])` with "from its own or
   another lane", and the seed-block line generalised from `B[L0]` to `B[lane]`. *Imprecise → fixed.*
5. **Step-1 wording.** "The browser sends only the password" was loose (the form also sends the email). Now:
   "the browser … has no say in the salt or the Argon2id parameters, which the server chooses." *Imprecise.*

**Verified correct and unchanged (highlights; all tags recomputed with argon2-cffi):** all four good tags and
four wrong-password tags are genuine Argon2id v=19 outputs for the password + salt; 0/32 bytes match in every
profile; salt 16 B, tag 32 B; PHC string format and base64 (`a48qkcTn0DWKH2wum016Ew`); 19 MiB/t=2/p=1 is an
OWASP minimum; 64 MiB/t=3/p=4 is RFC 9106's second option (README now also names the first, 2 GiB/t=1/p=4);
data-independent first half of pass 1; GPU-capacity arithmetic (1293 / 384 / 192 / 96) and all "time to try"
values; `~42 ms` and the other per-profile times (measured here as 20/34/68/184 ms, same order). README
updated to match every change above.

---

## Part D — accessibility and structure (fixed where ≥ medium)

- `aria-current="step"` on the active progress dot; `aria-pressed` on the profile buttons (they are a toggle
  group with no pressed state for assistive tech before).
- A CSS-transition fallback in `move()` for browsers without `Element.animate` (Safari < 13.1, legacy Edge),
  so the login step cannot throw an unhandled rejection and leave a spinner.
- `sleep()` is a tracked timer cleared by `cancelAnims()`, so a cancelled step cannot wake up later.
- Already sound and left as-is: keyboard access to every control, `:focus-visible` rings, `aria-live="polite"`
  narration, `aria-hidden` on decorative grids, no external resources/fonts/storage/cookies/network (nothing
  for an ad blocker or privacy extension to break — confirmed by grep and by the empty request log in every
  run), the 256 MiB grid at 256 cells renders fine, 4× CPU throttling completes every step.

---

## Test matrix (final file)

Harness `test-evidence/lab_matrix.py` (Chrome via DevTools) and `firefox_check`/`--screenshot` (Firefox).
Each Chrome config: load; Next through all 7 (mouse); Reset; Back; the in-page buttons through all 7; every
profile at the derivation step (keys 1–4) and by button at the login step; full auto-play to the end; the rig
(restart/pause/finish); keyboard (R, arrows, space, 1–4, F); enlarge + Esc; a resize across the 1260 px
breakpoint mid-derivation and mid-verify; console errors; network requests.

| Suite | Configs | Result |
|---|---|---|
| Chrome headless, 1920×1080 / 1440×900 / 1366×768 / 1280×720 / 1024×768 / 800×900, motion on **and** reduced | 12 | **ALL PASS** (69/69 each; 0 hangs, 0 console errors; auto-play dwell per step 4.3–9.7 s, never below 4.3 s) — `results-final-headless.md` |
| Chrome headed on Xvfb, 1920×1080 motion + reduced, **plus background-tab test** | 3 | **ALL PASS** (69/69, 69/69; hidden tab: step 5 and the 256 MiB fill complete at once) — `results-final-xvfb.md` |
| Chrome zoom/HiDPI (deviceScaleFactor 1.25 / 1.5 / 2.0 → CSS widths 1536 / 1280 / 960, the last one stacked) + one reduced | 4 | **ALL PASS** (69/69 each) — `results-final-hidpi.md` |
| Chrome 4× CPU throttle, 1920×1080 motion + 1366×768 reduced | 2 | **ALL PASS** (69/69 each) — `results-final-throttle.md` |
| Firefox 158 headless, load + screenshot at 1920 / 1280 / 1024 | 3 | `test-evidence/shots-firefox/` (loads clean; corrected SHA-256 label visible) |
| Frame-sequence cause-before-effect, steps 1/5/6/7 | 4 | `test-evidence/FRAME-EVIDENCE.md` — all assertions pass |

**Result: 21 Chrome configurations, 1,449 checks, all pass; 0 hangs, 0 console errors, 0 network requests;
4/4 cause-before-effect frame assertions pass; Firefox loads cleanly at all three sizes.** Chrome 153.0.8010.47,
Firefox 158.0.1, run 2 November 2026 on the file as delivered. `test-evidence/INDEX.md` lists every artefact.

### Not done (low-priority polish)
- **Tiny muted captions (7–9 px mono greys, ~3:1 contrast).** Legible on a monitor, hard on a projector. Left
  as the page's established design; would need a visual redesign Mike hasn't asked for.
- **Full WebDriver-BiDi automation of Firefox.** Firefox 158's direct BiDi endpoint would not connect from
  the stdlib harness in this environment; the required Firefox evidence is a headless load + screenshot
  (done). Chrome carries the full interaction matrix.
- **Safari / macOS:** not installed on this Linux machine, so untested. The code paths that would matter there
  (no `Element.animate` is handled; reduced motion handled) are covered in Chrome and by the fallback.
