# Authentication under the surface

Two companion interactive exhibits for COMP09031 Cybersecurity and Secure Programming, ATU Galway.

- **[Cookie Theft](https://mikeduignan.github.io/cssp-visual-labs/cookie-theft/)** — trace a session ID through login, two stores, lookup, capture, replay and revocation.
- **[Password Check — Argon2id](https://mikeduignan.github.io/cssp-visual-labs/argon2id/)** — follow registration, salt, memory dependencies, verifier storage, comparison and offline guesses.

[Open the shared overview](https://mikeduignan.github.io/cssp-visual-labs/).

## Use the exhibits

Each lab has seven guided chapters, an exploration bench and five prediction activities. Play runs one sequence and stops; optional **Continue chapters** adds a five-second reading pause. The labelled moment timeline reconstructs the complete state, including explanations and event history.

**Pause** freezes the logical clock, even midway through a packet. **Replay** repeats the current sequence. Inspect a visible object to pause and see its actual values, role, visibility and relevant misconception. **Show inspection points** makes the objects easy to find. **Focus view** and **Enlarge detail** support live teaching.

Use Space, left/right arrows, R and F for playback, previous/next moment, restart and focus view when focus is outside a control. Focused controls keep native keyboard behaviour. Escape closes an inspector and restores focus. Reduced motion preserves causal order through stable states and captions. Hidden tabs pause explicitly and resume on request.

Prediction activities run the related experiment and explain both correct and incorrect reasoning. The field-notes download saves observations, evidence and a student's explanation locally.

## Review a complete mechanism

1. In Cookie Theft, play chapter 3. Pause Set-Cookie in transit: the server record exists while the browser jar still waits.
2. Finish, enter Explore, delete the browser cookie and replay the captured ID. Then invalidate the server record and replay again.
3. In Password Check, play chapter 3 to inspect allocation, dependency reads and passes. Chapter 4 stores the verifier before the response returns.
4. Compare chapters 5 and 6: the whole tag is compared for both matching and nonmatching passwords.
5. Try a prediction, inspect the evidence, explain the outcome and retry.

The fictional website is `shop.example`, using the reserved example domain. Its hostname is separate from the browser cookie jar and the JavaScript `localStorage` API.

## Offline use

Download or clone the whole repository, then open `index.html`, `cookie-theft/index.html` or `argon2id/index.html`. Keep `shared/` with the lab folders. No installation, build, backend, account, CDN, external font or runtime service is needed.

Optional static hosting:

```bash
python3 -m http.server 8000
```

Visit `http://localhost:8000/`. Responsive layouts retain packet direction, captions and controls at high zoom and on narrow screens.

## Data, boundaries and maintenance

- [Cookie lesson and experiments](cookie-theft/README.md)
- [Password lesson and verified data](argon2id/README.md)
- [Primary sources and model limits](SOURCES.md)
- [Publication and verification](DEPLOYMENT.md)

The source lives in `MikeDuignan/CSSP-Cookies`; this repository holds the public layout. Pushing the source repository alone does not update this site. GitHub Pages publishes this repository's `main` branch at `/`.

Argon2id uses 144 genuine precomputed outputs and preserves all eight original values. Inputs are constrained to verified examples; there is no live hashing or fabricated benchmark. The memory grid is conceptual. Session IDs, topology, timeouts and attacker budgets are fictional teaching inputs. Neither lab sends a real login or attack.

The dated REVIEW/FIXES documents and older screenshots inside each lab folder describe the previous implementation and are retained as history.
