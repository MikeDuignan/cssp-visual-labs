# Review: Password Check · Argon2id (visual lab)

Reviewed 2 November 2026 against the file as published (local `index.html` was byte-identical to
https://mikeduignan.github.io/cssp-visual-labs/argon2id/ at the time of review). Sources checked:
RFC 9106 (Argon2), the OWASP Password Storage Cheat Sheet, the argon2-cffi reference implementation
(all eight tags recomputed), and hashcat benchmark reports for the GPU rates. The companion
`FIXES.md` says what was changed; `test-evidence/` holds the browser runs.

Verdicts: **wrong** = teaches something false; **misleading** = true but likely to be misread;
**imprecise** = loose wording or an approximation not labelled as one; **fine** = checked and correct.

## 1. What the page teaches

### 1.1 Argon2id design

| Statement | Verdict | Note / source |
|---|---|---|
| "The first half of pass 1 is data-independent, the rest data-dependent" (step 3, legend, README) | fine | RFC 9106 §3.4.1.3: pass 0, slices 0 and 1 use Argon2i indexing; everything else Argon2d. Four slices per pass, so exactly the first half of the first pass. |
| Grid: "1 cell = 1 MiB", totals "65,536 × 1 KiB · 4 lanes × 16 MiB" etc. | fine | m is in KiB (RFC §3.1). 19456/1024 = 19, 65536/1024/4 = 16 per lane, 131072/1024/4 = 32, 262144/1024/4 = 64. The grids show 19, 64, 128 and 256 cells. |
| Seed blocks `B[L0][0] = H′(H0 ‖ 0 ‖ lane)` | fine (now `B[lane][…]`) | RFC §3.2 steps 3–4: `B[i][0] = H'(H0 ‖ LE32(0) ‖ LE32(i))`, `B[i][1] = H'(H0 ‖ LE32(1) ‖ LE32(i))`. Written for L0 only; changed to `B[lane]`. |
| Block recipe `B[L0][j] = G(B[L0][j−1], B[L0][ref])`, "every block needs an earlier block" | imprecise | The reference block may come from any lane (RFC §3.4.2, `l = J2 mod p`), except in the first segment of the first pass. The grid highlights the reference column across all lanes, but the formula said the same lane. Now reads `B[l′][ref]` with "from its own or another lane". |
| "In pass 1 a block can only reference blocks already written; later passes may reach anywhere" (code comment driving the animation) | fine | A simplification of §3.4.2 (later passes exclude the current segment), acceptable for the picture. |
| Tag = `H′(B[0][last] ⊕ … ⊕ B[p−1][last])` | fine | RFC §3.2 steps 7–8. |
| Version `v=19` in the PHC string | fine | RFC §3.1: version byte 0x13 = 19. |
| "Argon2id … hybrid … side-channel resistant like Argon2i, then Argon2d" (README) | fine | RFC §1 and §4 ("if you consider side-channel attacks a viable threat, choose Argon2id"). |

### 1.2 Parameters and profiles

| Statement | Verdict | Note / source |
|---|---|---|
| 19 MiB · t=2 · p=1 labelled "OWASP minimum" | fine | OWASP lists m=19456 (19 MiB), t=2, p=1 as one of five equally strong minimums (46 MiB/t=1 … 7 MiB/t=5). README now says it is one of several. |
| 64 MiB · t=3 · p=4 labelled "RFC 9106 option 2" | fine | RFC §4: "t=3 iterations, p=4 lanes, m=2^16 (64 MiB)… SECOND RECOMMENDED option". README now also names the first option (2 GiB, t=1, p=4). |
| 128 MiB · t=3 · p=4 "high", 256 MiB · t=4 · p=4 "very high" | fine | Not from a standard; labelled as demonstration profiles. |
| "~42 ms / verify" and 24 / 78 / 213 ms | fine (illustrative, labelled) | Recomputed here with argon2-cffi: 20 / 34 / 68 / 184 ms on this machine, same order. README says "measured on one machine, illustrative". |
| Salt: 16 bytes from a CSPRNG, "not secret", "stored with the hash", "random per user" | fine | RFC §3.1: "16 bytes is RECOMMENDED for password hashing"; §4: 128-bit salt sufficient. Salt is 16 bytes (22 base64 chars) in the file. |
| Tag: 32 bytes | fine | RFC §4 recommended options use a 256-bit tag; all tags in the file are 32 bytes. |
| PHC string `$argon2id$v=19$m=…,t=…,p=…$salt$hash`, base64 without padding | fine | Matches the PHC string format used by the reference implementation and argon2-cffi; salt base64 `a48qkcTn0DWKH2wum016Ew` recomputed from the hex. |
| "The tags shown are real Argon2id outputs" | fine | All four good tags and all four wrong-password tags recomputed with argon2-cffi (`hash_secret_raw`, Type.ID, v=19) and match exactly. |
| "0 of 32 bytes match in all four profiles" | fine | Counted: 0, 0, 0, 0. (For random 32-byte tags the expected number of equal bytes is 0.125, so 0 is the normal outcome, not a special property of Argon2.) |

### 1.3 Storage and verification

| Statement | Verdict | Note |
|---|---|---|
| "The database keeps the verifier; the plaintext is discarded… hashes, not passwords" | fine | |
| "reads the salt and parameters from the stored PHC string, reruns Argon2id… compares the two 32-byte tags in constant time… never decrypts" | fine | Standard library behaviour (e.g. `PasswordHasher.verify`). |
| "One changed character produces a completely different tag" | fine | Demonstrated with the real wrong-password tags. |
| "the server returns 401, no session… rate-limit 5/min… rehash on upgrade" | fine | Server-side policy, presented as this server's choice. |
| Constant-time comparison, "no early exit", "all 32 still checked" | fine | OWASP does not discuss it, but it is the normal implementation (e.g. `secrets.compare_digest`, `crypto.timingSafeEqual`). README explains what it protects against. |
| "The browser sends only the password — the salt and Argon2id parameters are chosen by the server" (step 1) | imprecise | The form also sends the email; the intended point is that the client contributes nothing to the KDF. Reworded: "it has no say in the salt or the Argon2id parameters, which the server chooses". |
| "password crosses the wire once, over TLS" | fine | |

### 1.4 The attacker rig (every number recomputed)

Rates per profile: 5000, 1000, 400, 200 guesses/s (labelled illustrative). Year = 31,557,600 s.

| Displayed | Recomputed | Verdict |
|---|---|---|
| 24 GiB / 19 MiB → 1,293 concurrent; / 64 → 384; / 128 → 192; / 256 → 96 | 1293.47, 384, 192, 96 | fine |
| "384 slots × 64 MiB = 24 GiB" | 24,576 MiB = 24 GiB | fine |
| 64 MiB: 1 million → 16m 40s; 1 billion → 11.6 days; 1 trillion → 31.7 years | 1,000 s; 11.57 days; 31.69 years | fine |
| 19 MiB: 3m 20s / 2.3 days / 6.3 years | 200 s / 2.31 d / 6.34 y | fine |
| 128 MiB: 41m 40s / 28.9 days / 79.2 years | 2,500 s / 28.94 d / 79.2 y | fine |
| 256 MiB: 1h 23m / 57.9 days / 158.4 years | 5,000 s / 57.87 d / 158.4 y | fine |
| 5-word passphrase "~2.8×10¹⁹", time ~450 million years at 64 MiB | 7776⁵ = 2.843×10¹⁹; the code divides by rate with 1.42×10¹⁹ = half the space = average search; 1.42×10¹⁹ / 1000 / 31,557,600 = 4.50×10⁸ years | **misleading → fixed**: the figure was the *average* (half the space) while the label quoted the *whole* space. Row now says "(average)" and the note says "half of 7776⁵ on average". |
| Step-7 narration "A million guesses is minutes; a billion is days; a trillion is years" | True at 19 and 64 MiB; at 256 MiB a million is 1h 23m and a billion 58 days | **imprecise → fixed**: the narration now inserts the profile's own figures. |
| Argon2id "~10³/s" on a 24 GiB GPU at 64 MiB / t=3 / p=4 | No reliable public benchmark for these parameters (hashcat added Argon2 in 7.0; the only figure found online is a disclaimed ChatGPT estimate of 60–100/s). A memory-bandwidth bound (≈1 TB/s ÷ ≈576 MiB of traffic per hash) gives ≈1,700/s as a ceiling. | fine as an *illustrative upper bound*; labelled illustrative; generous to the attacker, which is the safe direction. README now says so. |
| SHA-256 "~10⁹/s" | hashcat on one RTX 4090 (a 24 GiB card): ≈21.2 GH/s = 2×10¹⁰/s | **imprecise → fixed** to ~10¹⁰/s (page and README). The point (a million-fold gap) stands. |
| Cost bars 22 % vs 100 % | Not to scale (the real gap is seven orders of magnitude); labelled "illustrative" | fine |

### 1.5 Other claims

| Statement | Verdict |
|---|---|
| "Salt, rate limiting, and entropy still matter" | fine |
| "Raising m costs an attacker memory; raising t costs both memory and time" (README) | fine (t multiplies time and memory bandwidth; memory *allocation* is set by m) |
| README "W3C"-style slips: none; "the browser form does not send anything" | fine |
| "This page does not hash anything at runtime" | fine (values are precomputed; verified above) |

**Anything wrong that Mike was teaching?** No statement was outright wrong. Two numbers were
misleading or loose: the passphrase row (average time labelled as the whole space) and the
SHA-256 rate (an order of magnitude low for today's cards); and the step-7 sentence was only true
for two of the four profiles. All three are fixed.

## 2. Structure, code and accessibility

**Mike's cause-before-effect request (2 November 2026).** After the first round of fixes Mike still found the
page unclear: in step 1 the request/password just appeared in the server panel instead of being shown
crossing the wire. This was addressed with a full packet rework — every browser↔server message (and the
step-7 verifier theft) now crosses the wire as a labelled packet, and no server-side panel changes until the
packet that causes it has arrived. See **Part B of FIXES.md** for the ordered per-step sequence and the
frame-by-frame proof (`test-evidence/FRAME-EVIDENCE.md`).

### 2.1 Defects found (and fixed; details in FIXES.md)

1. **Spinners that nothing ever stops (steps 2 and 3).** The browser card showed a turning wheel
   ("Preparing your account…", "Hashing with Argon2id…") for the whole of steps 2 and 3, even after
   the engine had finished (screenshot `test-evidence/original-step3-permanent-spinner.png`). A wheel
   signals "wait": a presenter who waits sees "a spinner that spins and nothing happens". The wheel
   now stops and becomes a tick when the salt is drawn / the fill finishes. — medium.
2. **Hidden tab = stuck spinner.** `move()` awaited a Web Animation's `finished` promise, which only
   settles while the document is being painted. Reproduced in headed Chrome: with the tab in the
   background, step 5 sat on "Verifying your password…" for the whole 12 s it was hidden, and the
   256 MiB fill stalled at "pass 1 / 4" (timers throttled to once a second). Both resumed only when
   the tab came back. Any step is now completed on the spot when the tab is hidden, waits are raced
   against the clock, and a per-step watchdog finishes the step if anything overruns. — high.
3. **Auto-play raced past animated steps.** The scheduler polled every 0.6 s while animating and
   advanced as soon as the animation ended, so step 2 got 1.1 s of reading time, and with
   `prefers-reduced-motion` (instant animations) steps 2, 3, 5 and 6 got 0.5–0.6 s each: the lesson
   flew past in a few seconds. Reproduced in both headless and headed Chrome. Auto-play now holds each
   step 4.5 s from its start and 1.5 s after its animation. — high (for anyone using Play).
4. **Two breakpoints that could drift.** The CSS stacked at `max-width:1260px`; the script tested
   `window.innerWidth > 1260`. The same today, but two places to keep in step; the script now uses
   the same media query. — low.
5. **`prefers-reduced-motion` was read once at load** and the CSS made the infinite spinner and wire
   animations run at 0.001 s (restarting a thousand times a second). Now read live; the infinite
   animations stop under reduced motion. — low/medium.
6. **No Web Animations API → exception.** On a browser without `Element.animate` (Safari < 13.1,
   legacy Edge) `move()` threw inside an async function: the promise rejected unhandled and the login
   spinner would never resolve. A CSS-transition fallback timed by the clock now covers it. — low
   (no such browser is in use here).
7. **Untracked sleeps.** `sleep()` used a bare `setTimeout`; a cancelled step's timers still fired
   (harmless, they bailed on a generation check, but wasteful during rapid clicking). Now tracked and
   cleared with everything else. — low.
8. **Accessibility:** profile buttons had no pressed state for assistive tech; dots had no current
   step. Added `aria-pressed` and `aria-current="step"`. Keyboard access, focus rings (`:focus-visible`),
   `aria-live="polite"` narration and `aria-hidden` on the decorative grids were already in place. — low.

### 2.2 Checked and sound

- Step flow, `targetVis()` and `setStep()` keep the picture consistent for forward, back, dot
  jumps, in-page buttons, deep links (`?step=`, `?profile=`) and Reset. Back never animates; forward
  does. Generation counters (`state.gen`) cancel stale animations on every navigation and profile switch.
- Profile switching (buttons and keys 1–4) replays the fill at step 3 and recomputes the verifier in
  place elsewhere; every profile's grid fills completely (19, 64, 128, 256 cells) in the matrix runs.
- Reset stops Play, stops the rig, returns to step 1, keeps the chosen profile (documented).
- Present (`F`) uses `requestFullscreen` inside try/catch; Esc collapses an enlarged panel.
- Responsive: below 1260 px the stage stacks, wires are hidden and the script skips the wire
  animation and shows each step's finished state at once (no waits at all in that layout). Chrome at
  150 % zoom on a 1920 px screen is 1280 CSS px: still the wide layout, cells 12 px; at 200 % (960 px)
  the stacked layout. Both run clean.
- Performance: the memory grid is at most 256 cells and the GPU grid 384; per-column class toggles
  are cheap. At 4× CPU throttling every step still completes within its budget.
- No external resources, fonts, storage, cookies or network requests: nothing for an ad blocker or
  privacy extension to break (verified by grep and by the request log in every Chrome run).
- Contrast and type size: several captions are 7–9 px mono in muted greys (`#5f7187` on `#0b1118`,
  roughly 3:1). Legible on a monitor; on a projector they are hard to read. Not changed (it is the
  design); listed under "not done" in FIXES.md.

## 3. Reproduction summary (original file)

- Headless Chrome 153, 1920×1080, motion: every step completed by click and by Play; auto-play dwell
  [4.6, **1.1**, 8.4, 4.7, 4.0, 4.4] s; permanent spinners at steps 2 and 3; no console errors.
- Headed Chrome 153 on Xvfb, reduced motion: auto-play dwell [4.6, **0.6, 0.5**, 4.6, **0.6, 0.5**] s.
- Headed Chrome, background tab: step 5 did not complete in 12 s hidden; 256 MiB fill stalled at
  pass 1; both completed after foregrounding.
- Stacked widths (≤1260 px): no hang; steps show their finished state immediately.
- Full tables: `test-evidence/results-original-*.md` and `results-live-original.md` (the live page).
