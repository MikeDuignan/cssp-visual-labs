> Historical review of the previous single-file implementation. See the current [review guide](../README.md) for the rebuilt labs.

# Cookie Theft · Visual Lab — fixes (2 November 2026)

Repairs to `index.html` for the hang Mike reported on 2 November 2026 (the Sign-in spinner "spins
round and nothing happens"), plus the content and robustness defects from `REVIEW.md`, and the
"show it crossing the wire" / "cause before effect" standard the lead applied from Mike's feedback
on the sibling Argon2id page. The page is still one self-contained file: no external resources, no
network requests, same look, same six steps, same controls, same deep links.

Evidence is under `test-evidence/` (scripts, results tables, screenshots and per-frame state).

---

## 1. The reported hang

### What was broken
After clicking **Sign in**, the button entered a `busy` state — the spinner — and stayed there.
Step 2's `POST /login` animation finished and the server log showed `200`, but **nothing on the
page told the viewer how to go on**. The only ways forward were the top-bar **Next**, the `→` key,
or clicking the still-spinning button a second time. On a projector, with the mouse on the browser
pane, it looks frozen. This is exactly "the wheel spins and nothing happens".

Two things made it worse:
- **Stacked layout (< 1100 CSS px).** Chrome produces this from browser **zoom** on a normal
  screen: 1920 px at 175 % zoom is ~1097 CSS px, at 200 % it is 960. In the stacked layout the
  control bar and step text scroll off the top, so even **Next** was out of view. Mike did not say
  his zoom level; this is a plausible trigger for "nothing happens".
- **No timeout on any animation.** Every packet flight `await`ed `Animation.finished`, which only
  settles during a rendering update. In a **background tab** (the projector window behind another)
  `finished` never settles, so the step waited indefinitely and auto-play stalled. On **Safari
  before 13.1** there is no `finished` property at all, so `a.finished.catch` throws and the
  step's promise rejects with no handler — a permanent spinner. (Safari is not installed here, so
  this path is reasoned, not reproduced; see "Not verified".)

### How it was reproduced
Real Google Chrome 153 (`/usr/bin/google-chrome`) driven over the DevTools protocol on a private
Xvfb display, fresh `--user-data-dir`, `--remote-debugging-port=5391` on 127.0.0.1, offline (a dead
proxy so nothing can leave the machine). Script: `test-evidence/run_matrix.py`. For each
configuration it clicks **Sign in** and then watches for six seconds with no further input. On the
original file the check `signin_spinner_resolves` **failed in every Chrome configuration**
(1920×1080, 1920×1080 + reduced motion, and the 1024×768 stacked layout), with the probe recording
`spinner_still_busy_after_6s: true`. The stacked run also logged two console warnings
(`Invalid keyframe value for property transform: translate(NaNpx,NaNpx)`), from the Replay button —
see §3. Screenshots `test-evidence/results/original-chrome/*-02-after-signin.jpg` show the spinner.

### Root cause
The login step modelled the request but not the reply: it set the button to `busy` and never gave
the viewer a way to advance **in the browser**, where their attention (and mouse) is. The lack of
animation timeouts turned several secondary situations (hidden tab, missing `Animation.finished`)
into the same visible symptom.

### The fix
- When the `POST /login` packet **arrives**, the button becomes **"Continue → server reply"** (the
  same affordance as step 3's "Continue to /account"), and the caption reads "Login sent · press
  Continue (or →) to see the reply". Clicking it advances to step 3. The spinner only shows while
  the packet is actually in flight.
- In the stacked layout, the top control bar is now `position: sticky`, so Back / Play / Next /
  Reset stay on screen while the page scrolls.
- `settled(anim, ms)` resolves on `finished`, on `onfinish`/`oncancel`, **or on a grace timer**
  (animation duration + 1.2 s), whichever is first. `move()` skips the flight entirely (short beat,
  then resolve) when the tab is hidden, when geometry has not been measured, when a coordinate is
  non-finite, or when `Element.animate` is absent. `runStepAnimation` wraps the step in try/catch
  and, on any error, cancels and jumps to the step's settled end state. **No step can hang.**

---

## 2. "Show it crossing the wire" and cause before effect

Mike's note on the sibling page: content "just seems to appear all of a sudden in the server page …
if the request gets sent across, show it going across the cable." Audited against that standard,
this page had the same gap: `renderServer()` wrote each log line and the session store from the
**step number**, so on entering a step the lines appeared at once — before (or without) a packet.

### The fix
Every panel change is now gated on a **visibility flag** that is set only when the causing packet
has arrived (for server-originated responses — Set-Cookie — the server log line and session store
appear as the packet **departs** the server, which is the server's own action; the browser-side
effect, the jar, waits for arrival). Flags: `sent`, `session`, `jar`, `accountReq`, `account`,
`captured`, `replayed`, `defenseReq`. On an animated advance, `setStep()` clears the flags that
step's packets will set, so nothing shows before its packet. Step 6 now **flies a real request**
(cleartext on entry, then a TLS packet when you flip to HTTPS) instead of popping the defense line
in with no packet. Cross-wire packets last 1.3–1.5 s (login and Set-Cookie raised from 1.05/1.15 s
to 1.3 s; request and replay already 1.5/1.45 s); the short drops (cookie into the jar, stolen copy
into the capture) stay quick on purpose.

### What the viewer sees, per step (ordered; timings approximate, reduced motion collapses them)

**Step 1 — setup.** Static: login page, idle server ("waiting for traffic…"), empty jar, empty
capture ("Listening on eth0…"), attacker node in the path. No packets. The narration adapts to the
toggles (HTTP / HTTPS, attacker on / off).

**Step 2 — Alice logs in.** (0.0 s) blue **`POST /login`** packet leaves the browser; server still
reads "waiting for traffic", capture "Listening…". (~1.3 s) packet reaches the server; **only now**
the server logs `POST /login 200`, the attacker's capture shows the cleartext POST **with the
password**, and the browser button turns into "Continue → server reply". No panel changes before
the packet lands.

**Step 3 — the server issues a cookie.** (0.0 s) the server mints the session: the **session store
row** and the green **`SET-COOKIE`** log line appear **as** the green Set-Cookie packet leaves the
server (server-side cause = packet departure). The cookie **jar stays empty**. (~1.3 s) the packet
reaches the browser; a small cookie chip drops into the jar; **only then** the jar fills
(`session=…`, `HttpOnly ✗ Secure ✗ SameSite — Expires — (session cookie)`).

**Step 4 — every request carries the cookie.** (0.0 s) blue **`GET /account` + `Cookie: session=…`**
packet leaves the browser; account pane shows "Sending the session cookie…", server log unchanged,
capture unchanged. (~0.8 s) a red **stolen copy** peels off at the tap and drops into the capture
panel; the capture then shows the copied `Cookie:` line ("copied — original request passed
through"). (~1.5 s) the packet reaches the server; **only now** the server logs `GET /account` and
the browser renders Alice's account ($1,234.56). Nothing in the account pane or server log appears
before the GET lands.

**Step 5 — the attacker replays the cookie.** (0.0 s) red **`REPLAY session=…`** packet lifts out
of the capture, joins the wire at the tap, and travels to the server; the replay log line and the
"authenticated / $1,234.56" result are **not** shown yet. (~1.45 s) the packet reaches the server;
**only now** the server logs the replay `from 172.28.0.30`, the capture notes "replay from
172.28.0.30", and the result panel shows "Welcome back, Alice · $1,234.56".

**Step 6 — the defense.** On entry (HTTP) a **`GET /account`** packet crosses again; on arrival the
defense log line and the cleartext capture appear (attacker still reads the cookie). The four
defense cards and **Run over HTTPS** prompt the flip. Clicking it (or the HTTPS toggle, or `T`)
flies a **purple TLS packet**; on arrival the capture shows a TLS 1.3 `application_data` record
("encrypted — the session ID is not visible", plus a line on what TLS does **not** hide), the TLS
defense card lights up, and the server log line reads "over tls 1.3". Nothing in the capture or
server log changes before the packet lands.

### Proof
`test-evidence/frames.py` captures a frame roughly every 150 ms (nominal; each screenshot adds
overhead, so real spacing is a little longer) across steps 2–6 including the replay and the HTTPS
flip, and records the per-frame state in `frames/<step>.json`. For every step the labelled packet
is on the wire while the caused panel is still empty, and the panel changes only in the first frame
**after** the packet is gone:

| step | packet on wire, effect absent | effect appears |
|---|---|---|
| 2 login | `POST /login` present, server "waiting for traffic" | server logs POST after packet gone |
| 3 Set-Cookie | Set-Cookie/cookie packet present, **jar empty** | jar fills after packet gone (store/log at departure) |
| 4 request | `GET /account` present, **account hidden, server unchanged** | account + req log after packet gone |
| 5 replay | `REPLAY` present, **no replay log, no result** | replay log + result after packet gone |
| 6 HTTPS | TLS packet present, **capture unchanged** | ciphertext capture + defense log after packet gone |

I looked at the PNGs with the Read tool: `frames/step2-login-f01-0150ms.jpg` (POST on the wire,
server "waiting for traffic"), `step3-setcookie-f03-0450ms.jpg` (Set-Cookie packet mid-wire, jar
empty), `step4-request-f05-0750ms.jpg`, `step5-replay-f04-0600ms.jpg`, `step6-https-f04-0600ms.jpg`.

---

## 3. Other defects fixed (from REVIEW.md)

Content (teaching) corrections, each with its source in `REVIEW.md`:

- **"only TLS stops this attack" → TLS with the Secure attribute.** TLS alone is not enough: without
  `Secure`, an active attacker can provoke one plain-HTTP request and the browser sends the cookie
  in the clear (RFC 6265 §8.3; OWASP). Step 6 text and README updated. (REVIEW #11, #23)
- **"the server cannot tell the difference" → the server only checks the cookie.** The page's own
  log shows the replay from a different address; the honest point is that the server does not check,
  not that it cannot (OWASP: an address change is "a very good indicator of session manipulation").
  (REVIEW #10)
- **Attacker "on the same network" → "has put their machine in the path"** (ARP spoof / rogue AP /
  mirror port). Being on a switched LAN is not enough. (REVIEW #1)
- **The login POST is now shown in the capture** (cleartext, password included, over HTTP; an
  encrypted record over HTTPS), and step 2 says so. Before, the attacker appeared to get nothing
  until step 4. (REVIEW #3)
- **TLS capture hex `17 03 03 04 9a` → `17 03 03 01 9c`** so the two-byte length decodes to the
  412 bytes shown (RFC 8446 §5.1/5.2: `0x17` application_data, `0x0303`, length). The login record
  uses `00 e9` = 233. Added a line listing what TLS does **not** hide (IPs, SNI, sizes/timing).
  (REVIEW #12, #13)
- **Server method badge `TLS /account` → `GET /account`** (purple, "over tls 1.3" in the detail):
  after TLS termination the server sees a normal GET. (REVIEW #14)
- **Set-Cookie "expires in 30m" → "server-side session expires in 30m"**, and the jar now shows
  **"Expires — (session cookie)"**: the cookie shown has no `Expires`/`Max-Age`, so it is a session
  cookie (RFC 6265 §4.1.2.2; MDN). The 30 min is the server session's lifetime. (REVIEW #5)
- **"to every request" → "to every request to shop.local"** (cookies are scoped; RFC 6265 §5.4).
  (REVIEW #7)
- **tcpdump → `tcpdump -A`** (the flag that prints the ASCII payload the panel shows). (REVIEW #9)
- **Narration now adapts to the toggles.** With HTTPS on or the attacker off, steps 1, 2, 4, 5 and
  6 no longer claim "the attacker captures a copy" over an empty/encrypted capture; each has a short
  `https` / `noAttacker` variant and re-renders on every toggle (the `?attacker=0` deep link is
  documented, so these states are meant to be shown). (REVIEW #19)

Structure / robustness / accessibility:

- **Replay button no longer produces `NaN` keyframes** in the stacked layout: `animateReplay`
  applies the result directly when animations are off, and `move()` rejects non-finite coordinates.
  (REVIEW §b "Replay button bypassed the no-animation guard")
- **Focus survives a browser-pane re-render**: focus is restored to the new action button when the
  old one had it (`innerHTML` had been dropping it). (REVIEW §b accessibility)
- **Space no longer hijacked from a focused control**: when a button/toggle has visible keyboard
  focus, Space keeps its native behaviour; the global play shortcut still works after mouse use.
- **`aria-current="step"`** added to the active step dot.
- **`visibilitychange`**: on returning to the tab, the stage re-measures and redraws any state an
  animation skipped while hidden.

---

## 4. Verification

- **Content:** every statement checked against RFC 6265 / 6265bis, RFC 8446, RFC 9110/9112,
  RFC 6750, MDN and the OWASP Session Management Cheat Sheet — see the table in `REVIEW.md`.
- **Chrome matrix** (`test-evidence/run_matrix.py`, results in `test-evidence/results/`): 17
  configurations — 1920×1080, 1440×900, 1366×768, 1280×720, 1024×768, 800×900; reduced motion on
  and off; Chrome zoom 125 / 150 / 200 % (emulated as deviceScaleFactor 1.25 / 1.5 / 2 with the
  resulting CSS widths, including 1093 px just under the stacking breakpoint); 4× CPU throttling;
  and a background tab. Each configuration loads the page, clicks **Sign in** and checks the spinner
  resolves, steps through all six steps by clicking the on-screen controls and by auto-play, runs
  the replay and the HTTPS defence, exercises every keyboard shortcut and both toggles, enlarges a
  panel, toggles fullscreen, spams Next during an animation, and follows the three documented deep
  links — all with a per-step hang timeout. See `results/fixed-chrome/results.md` for the table and
  `results/original-chrome/` for the before. (The first full run after the cause-before-effect
  change had exactly one failing check, `key_t_back_to_http`, in the eight wide-layout
  configurations without reduced motion: the harness read the capture immediately after the `T`
  key, but flipping back to HTTP now flies a packet first. The check was corrected to wait for the
  packet, as its HTTPS twin already did, and the matrix re-run; the spinner column was "no" and the
  console-error count 0 in every configuration of both runs.)
- **Live page** (`results/live-original-chrome/`): the published URL, loaded online in the same
  Chrome, is byte-identical to the original file and reproduces the stuck spinner.
- **Firefox** (`test-evidence/run_firefox.py`, headless, WebDriver BiDi): the same click-through at
  1920×1080, 1366×768, the stacked 1024×768 and with `prefers-reduced-motion`. All pass.
- **Frame sequences** (`test-evidence/frames.py`): per-step proof of cause before effect (§2).

Nothing in this lab can judge whether it *reads* right on Mike's projector — the wording and the
pacing are his call. This file records what was changed and that it no longer hangs and no longer
shows a panel before its packet.

## 5. Not done (optional polish)

- **Small type / contrast.** Several labels are 8.5–10.5 px and the keyboard hint is ~3.6:1 on the
  dark background — below WCAG AA. Left as the deliberate projector look; the ⤢ enlarge control is
  there for reading panels up close. Changing it would shift the layout Mike approved.
- **No focus trap in the enlarged-panel overlay.** Esc and click-outside both close it; Tab can
  still reach controls behind the backdrop. Low impact for a single-operator projector tool.
- **Single return packet for the account reply.** Step 4 and step 6 fly one request packet
  browser→server and reveal the reply on arrival, rather than a second packet coming back. The
  request is shown crossing (Mike's standard); adding a return packet would be a larger change and
  is not needed to remove any "appears from nowhere" gap. Revisit if Mike wants the reply shown
  travelling back too.
- **Historical step-4 request line restyles to "over tls 1.3" after the HTTPS flip** at step 6
  (it was an HTTP request). Pre-existing behaviour; harmless, and the whole scenario at step 6 is
  "now encrypted". Not changed.

## Not verified

- **Safari / WebKit** is not installed on this machine, so the `Animation.finished`-absent path is
  reasoned from the Web Animations history, not reproduced. The timeout/fallback (`settled()`)
  makes the page safe regardless, but a real Safari check is still worth doing before relying on it
  in that browser.
- Whether the lab **reads and paces** correctly on Mike's projector — his judgement.
