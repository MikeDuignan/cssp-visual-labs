> Historical review of the previous single-file implementation. See the current [review guide](../README.md) for the rebuilt labs.

# Review of "Cookie Theft · Visual Lab" (2 November 2026)

Scope: `index.html` as published at https://mikeduignan.github.io/cssp-visual-labs/cookie-theft/
(byte-identical to the local file when checked, 82,075 bytes) and `README.md`. Part (a) checks
every statement the page makes against primary sources; part (b) judges the structure of the
page itself. Items marked **fixed** were changed in `index.html` (details and diff summary in
`FIXES.md`). Items marked *not done* are listed there too.

Sources read for this review: RFC 6265 (HTTP State Management Mechanism, §4.1.2, §5.1.4, §5.3,
§8.1, §8.3); RFC 6265bis (the SameSite and "Lax by default" material as summarised by MDN);
RFC 8446 (TLS 1.3, §5.1 record layer, §5.2 record payload protection); RFC 6750 (bearer tokens,
§1.2, §5.2, §5.3); RFC 9112 (HTTP/1.1 request line and `Host`); MDN `Set-Cookie` reference; the
OWASP Session Management Cheat Sheet.

## (a) What the page teaches

Verdicts: **wrong** (a false statement), **misleading** (true as written but leads students to a
false conclusion), **imprecise** (true but loose), **fine**.

| # | Where | Statement | Verdict | Why, and source | Action |
|---|---|---|---|---|---|
| 1 | Step 1 text | "The attacker is on the same network — every packet between her browser and the server passes through their machine." | imprecise | On a switched LAN, being on the same network does not put you in the path; the attacker has to get there (ARP spoofing, a rogue access point, a mirror port). The README's own "Taking it live" section says exactly this ("A Docker bridge is a switch ... ARP spoofing puts the attacker in the path"), but the page did not. | **fixed**: "...has put their machine in the path — by ARP spoofing the LAN, say, or by running the Wi-Fi access point". |
| 2 | Step 1 text | "The connection is plain HTTP, so nothing on the wire is hidden." | fine | RFC 6265 §8.3: without a secure channel "the information in the Cookie and Set-Cookie headers is transmitted in the clear". | none |
| 3 | Step 2 text and capture panel | "She has no session yet, so the browser sends nothing but the login request." The attacker's capture panel showed "Listening on eth0… Waiting for traffic to shop.local" while `POST /login` passed through the tap. | misleading | True about the cookie, but a cleartext `POST /login` carries the password, and `tcpdump -A` on the tap would print it. Students could conclude that only the cookie was ever at risk, and that the attacker had to wait for step 4 to get anything. | **fixed**: the capture panel logs the POST (and its form body) once it has landed; the step text adds "Over plain HTTP the attacker can read that too, password included." Over HTTPS the capture shows an encrypted record instead. |
| 4 | Step 3 text | Server checks the password, creates a random session ID, stores it, returns it in `Set-Cookie`, browser stores it for shop.local. | fine | RFC 6265 §4.1 / §5.3. The ID shown is 32 hex characters = 128 bits, which meets OWASP's "at least 64 bits of entropy" (OWASP recommends 128 for custom IDs). | none |
| 5 | Server log line | `SET-COOKIE session=… · issued to alice · expires in 30m` | imprecise | The `Set-Cookie` shown has no `Expires` or `Max-Age`, so the cookie is a **session cookie** (RFC 6265 §4.1.2.2; MDN: "If unspecified, the cookie becomes a session cookie"). The 30 minutes is the server-side session's lifetime (the store says "expires 12:34"), not a cookie attribute. A student could read it as a cookie expiry. OWASP's idle-timeout guidance (15–30 min for low-risk, 2–5 min for high-value applications) makes 30 min a reasonable example. | **fixed**: log reads "server-side session expires in 30m"; the jar shows "Expires — (session cookie)". |
| 6 | Cookie jar | `Path=/`, `HttpOnly ✗`, `Secure ✗`, `SameSite —` | fine | No `Path` on a cookie set by `/login` gives default-path `/` (RFC 6265 §5.1.4: a uri-path with one `/` yields `/`). The three attributes are absent in the `Set-Cookie` shown. Note for the lecturer: Chromium-based browsers treat a missing `SameSite` as `Lax` by default (MDN, RFC 6265bis), which does not matter for a network attacker. | none |
| 7 | Step 4 text | "the browser attaches Cookie: session=… to every request" | imprecise | Only to requests that match the cookie's domain, path and scheme rules (RFC 6265 §5.4), i.e. requests to shop.local. | **fixed**: "to every request to shop.local". |
| 8 | Step 4 text, footer | "a bearer token" / "session cookie = bearer token" | fine | RFC 6750 §1.2: a token "with the property that any party in possession of the token (a 'bearer') can use the token in any way that any other party in possession of it can". | wording tightened: "whoever holds it is Alice". |
| 9 | Capture panel (HTTP) | `GET /account HTTP/1.1`, `Host: shop.local`, `Cookie: session=…`, "copied — original request passed through" | fine | Request line and `Host` per RFC 9112 §3 and §3.2; `Cookie` header per RFC 6265 §5.4. The tool label said plain `tcpdump`, which prints headers but not the payload; `tcpdump -A` prints it. | **fixed**: label is `tcpdump -A`. |
| 10 | Step 5 text | "The request never came from Alice's browser, and the server cannot tell the difference." | misleading | The page's own server log shows the replay came from 172.28.0.30 instead of 172.28.0.20, and the README's script asks "what could the server have done to notice?". OWASP recommends binding the session to client properties (IP address, User-Agent) precisely because a change "is a very good indicator of session manipulation" (with caveats about NAT and spoofing). The honest statement is that the server *does not check*, because sessions are looked up by ID alone. | **fixed**: "The request never came from Alice's browser — the log even shows a different address — but the server only checks the cookie, and whoever holds the cookie is Alice." |
| 11 | Step 6 text | "HttpOnly and SameSite matter too, but they solve different problems; only TLS stops this attack." | misleading | TLS alone is not enough: if the cookie lacks the `Secure` attribute, an active attacker on the path can induce one `http://shop.local/` request (an injected link, image or redirect) and the browser sends the cookie in the clear. RFC 6265 §8.3: without `Secure`, "the protection provided by the secure channel will be largely moot"; OWASP calls `Secure` mandatory for this reason and notes HTTPS-only hosting does not help if the flag is missing. The page's own Secure card says this ("pairs with TLS"), so the sentence contradicted the card. Also worth saying aloud: TLS stops interception only; OWASP notes it "does not protect against session ID prediction, brute force, client-side tampering or fixation". | **fixed**: "what stops this attack is TLS, with the Secure attribute so the browser never sends the cookie in the clear." README teaching script updated to match. |
| 12 | Capture panel (TLS) | "TLS 1.3 application_data · 412 bytes · `17 03 03 04 9a 2c … d1 8f`" | wrong (detail) | The bytes are a TLS record header: content type `0x17` = application_data (23), legacy version `0x0303`, then a two-byte length (RFC 8446 §5.1, §5.2; all post-handshake records carry opaque_type application_data). `04 9a` is 1,178 bytes, not 412. A student who decodes it (some will) finds the page contradicting itself. | **fixed**: `17 03 03 01 9c` (= 412). The login record added in item 3 uses `00 e9` = 233 bytes. |
| 13 | Capture panel (TLS) | "no readable headers" / "encrypted — the session ID is not visible" | fine, but incomplete | True. What TLS does *not* hide is also worth a line, because students ask: the IP endpoints and port, the server name in the ClientHello (SNI, unless ECH is in use), and sizes and timing. | **fixed**: one extra capture line "still visible: 172.28.0.20 → 172.28.0.10:443 · server name shop.local (SNI) · sizes and timing". |
| 14 | Server log (HTTPS) | Method badge read `TLS /account` | imprecise | After TLS termination the server sees an ordinary `GET /account`; the server log would not log "TLS" as a method. | **fixed**: badge reads `GET` (still in the purple TLS colour) with "over tls 1.3" in the detail line. |
| 15 | Defense card: TLS | "Encrypts the wire. The attacker captures bytes, not the session." | fine | RFC 6265 §8.3; OWASP "Transport Layer Security". | none |
| 16 | Defense card: HttpOnly | "Blocks JavaScript reads of document.cookie (XSS). Does nothing against a network sniffer." | fine | MDN: "Forbids JavaScript from accessing the cookie, for example, through the Document.cookie property ... This mitigates attacks against cross-site scripting (XSS)". RFC 6265 §4.1.2.6. | none |
| 17 | Defense card: Secure | "Keeps the browser from sending this cookie over plain HTTP." (state: "pairs with TLS") | fine | MDN: "sent to the server only when a request is made with the https: scheme (except on localhost)". RFC 6265 §4.1.2.5 adds that Secure protects confidentiality only, not integrity. | none |
| 18 | Defense card: SameSite | "Limits cross-site requests (CSRF). Not a confidentiality control." | fine | MDN Strict/Lax/None semantics; OWASP treats SameSite as defence in depth against CSRF. | none |
| 19 | Narration vs toggles | With the HTTPS toggle on, or the attacker toggle off, steps 1, 2, 4, 5 and 6 still read the plain-HTTP, attacker-present narration ("the attacker captures a copy", "the attacker replays the cookie") while the screen showed ciphertext or an empty capture. | misleading (state-dependent) | The deep link `?step=4&attacker=0` is documented in the README, so these states are intended to be shown. | **fixed**: each affected step has a short HTTPS and no-attacker variant; the narration re-renders on every toggle. |
| 20 | Addresses and ports | 172.28.0.10/.20/.30, `:80` and `:443`, "tls 1.3" | fine | RFC 1918 private range; standard ports. | none |
| 21 | `POST /login` → `200` | | fine | Many sites answer a login with 302/303 to the next page; 200 is not wrong and keeps the log simple. | none |
| 22 | Session store | "issued 12:04:01 · expires 12:34 · last used 12:04" | fine | Consistent with the 30-minute server-side session. | none |
| 23 | README teaching script, step 6 | "TLS is what stops this attack" | misleading | Same as item 11. | **fixed** in README. |
| 24 | README controls | "Click Sign in in the browser, then Continue to /account" | wrong | There was no on-screen path from "Sign in" to "Continue to /account": step 2 ended in a spinner and only the top-bar Next (or the arrow key, or clicking the spinning button again) moved on. This is the behaviour Mike reported. | **fixed** (page and README). |

Nothing the page teaches about the attack itself is wrong: the cookie is a bearer token, it
travels in the clear over HTTP, a copy replays, and encryption in transit is the control. The
corrections above are to the edges of that story (how the attacker got on the path, the password
being exposed too, `Secure` being part of the defence, and a few numbers and labels).

## (b) Structure

### Step flow and state

- **Step 2 is a dead end (the reported hang).** Clicking Sign in runs the `POST /login` animation
  and leaves the button in a `busy` state ("Signing in…" with a spinner) for ever. Nothing on the
  page says that the reply is a separate step; the server log already shows `200`. The only ways
  on were the top-bar Next, the arrow key, or clicking the spinning button a second time. On a
  stacked layout (under 1100 CSS px, which Chrome produces at 175–200 % zoom on a 1920 px screen)
  the Next button and the step text are scrolled off the top of the screen as well. Reproduced in
  every Chrome configuration tested and in Firefox. **Fixed**: when the POST lands, the button
  becomes "Continue → server reply" (same pattern as step 3's "Continue to /account"); in the
  stacked layout the same happens after a short beat.
- **Panels changed before their packet ("appears all of a sudden").** `renderServer()` wrote each
  log line and the session store from the step *number*, so on entering a step the server log and
  store appeared at once, not behind a packet crossing the wire. Measured against Mike's standard
  for the sibling page ("if the request gets sent across, show it going across the cable"). **Fixed**:
  every panel change is gated on a visibility flag set when the causing packet arrives (Set-Cookie's
  server log and store appear as the packet departs the server; the jar waits for arrival); step 6
  now flies a real request packet instead of popping in the defense line. Proven frame-by-frame in
  `FIXES.md` §2 and `test-evidence/frames/`.
- **Toggles did not re-render the narration** (item 19 above). **Fixed.**
- **Replay button bypassed the no-animation guard.** `runStepAnimation` skips animations under
  1100 px, but the Replay button at step 5 calls `animateReplay` directly, which used wire geometry
  that was never measured (`geo.replayX` undefined), producing `translate(NaNpx,NaNpx)` keyframes
  and two console warnings per click. **Fixed**: `animateReplay` applies the result directly when
  animations are off, and `move()` refuses non-finite coordinates.
- Reset, the step dots, Back (no animation) and Next (animated) are consistent; deep links clamp
  out-of-range and non-numeric values. Fine.

### Timers, promises and things that can get stuck

- **Every packet flight awaited `Animation.finished` with no timeout.** `finished` only settles
  during a rendering update, so in a hidden tab (projector window behind another, or the tab
  switched away during auto-play) the step waits until the tab is visible again, and auto-play
  stalls with it. Safari before 13.1 has no `finished` property at all, so `a.finished.catch`
  throws, the step's promise rejects, and the spinner stays for ever (no catch anywhere).
  **Fixed**: `settled()` resolves on `finished`, on `onfinish`/`oncancel`, or on a grace timer
  (duration + 1.2 s), whichever is first; `move()` skips the flight entirely when the tab is
  hidden, geometry is missing or `Element.animate` is absent; `runStepAnimation` now catches and
  applies the step's end state.
- The final "captured" state depended on the secondary stolen-copy animation (a timer fired at
  52 % of the request flight, then a 650 ms flight). On a slow frame it could finish after the
  request and re-render after the step had moved on. **Fixed**: the request's end sets
  `captured` itself; the chip animation only re-renders.
- `prefers-reduced-motion` is honoured twice (CSS `.001s` and `dur()` → 1 ms) and does not hang:
  the code waits on Web Animations objects, not on `animationend`/`transitionend` events. Verified
  in Chrome (emulated) and Firefox (`ui.prefersReducedMotion=1`).
- Auto-play polls `state.animating` every 400 ms and holds 3.8 s per step; with the timeouts above
  it cannot stall. Fine.
- Generation counter (`state.gen`) correctly abandons stale animations when the user clicks ahead;
  rapid Next-spamming settles cleanly (tested).

### Accessibility

- All controls are real `<button>`s or a labelled checkbox; step dots have `aria-label`s and the
  mode buttons `aria-pressed`. The narration block is `aria-live="polite"`, so step changes are
  announced. Fine.
- **Space was captured globally**, so a keyboard user who had tabbed to a button and pressed Space
  got Play/Pause instead of the button (Enter still worked). **Fixed**: when the focused control has
  visible keyboard focus (`:focus-visible`), Space keeps its native behaviour; the shortcut still
  works after mouse use.
- **Focus was lost on every browser-pane re-render** (`innerHTML` replaced the focused button).
  **Fixed**: focus is restored to the new action button when the old one had it.
- Added `aria-current="step"` to the active dot.
- Contrast and size: the lab is designed for a projector, but several labels are 8.5–10.5 px
  (`.tiny`, `.jar-attrs`, `.badge`, product prices) and the keyboard hint uses #5a6b80 on the dark
  background (about 3.6:1). Not changed: it is the look, and the ⤢ enlarge control exists for
  reading the panels. *Not done*, listed in FIXES.md.
- The enlarged-panel overlay has no focus trap (Esc and click-outside work). *Not done.*

### Responsive behaviour

- Under 1100 px the stage stacks, wires are hidden and `animationsEnabled()` is false; everything
  else works (verified at 1024×768, 960×540 and 800×900). The `innerWidth > 1100` check matches the
  `max-width:1100px` media query.
- **Controls scrolled away in the stacked layout.** **Fixed**: in the stacked layout only, the top
  bar is `position: sticky`, so Back / Play / Next / Reset stay reachable. The wide layout is
  unchanged.
- Chrome zoom: 125 % on 1920 px → 1536 CSS px (wide layout), 150 % → 1280 (wide), 175 % → 1097
  and 200 % → 960 (stacked). All tested; none hang after the fix.

### Code-quality notes (no change needed)

- `later()`/`cancelAnims()` clear all timers and animations on every step change; `drawWires()`
  rebuilds the SVG (and any in-flight pulse) on every resize, which is harmless.
- The page uses no storage, fonts, `window.opener`, `history` or network, so browser extensions
  (ad or privacy blockers) and the GitHub referer cannot affect it.
- Continuous CSS animations (wire dash flow, blinking dots, button pulse) are cheap; the CPU-throttled
  (4×) Chrome runs in `test-evidence/` completed every step within the normal times.
