# Password Check — Argon2id

Companion to [Cookie Theft](../cookie-theft/index.html). Open `index.html` directly; retain `model.js`, `argon.js` and `../shared/`. All runtime dependencies are local. [Open the published lab](https://mikeduignan.github.io/cssp-visual-labs/argon2id/).

The shared [review guide](../README.md) explains playback, keyboard controls, projection, inspectors, reduced motion and activities.

## The learning journey

1. The password travels over TLS and becomes available at the server only after arrival.
2. The server chooses a fresh random 16-byte salt for the example record.
3. Argon2id allocates one total memory budget, initialises lanes, reads dependencies, fills and revisits the space, then derives a tag.
4. A visible internal transfer writes the PHC verifier. Temporary plaintext and work memory are released. Only after the response returns does the browser show account creation.
5. Login retrieves the record’s existing salt and parameters, derives a candidate and compares the entire tag before returning success.
6. The changed example password produces a genuine different result. All 32 tag bytes are compared before failure; no wrong password position is diagnosed.
7. The database copy reaches the attacker, enabling local guesses. A stated memory budget illustrates concurrent full-memory capacity.

Inspect algorithm, version, parameters, salt and tag separately in the PHC string. Memory, passes, lanes, temporary password, database, comparison, network transfer and stolen verifier have contextual inspectors.

## Verified inputs only

The page deliberately offers **two passwords, two salts and 36 parameter combinations**. It never presents an invented hash for arbitrary text. All 144 tags are generated independently with `argon2-cffi` and bundled in `../shared/argon-vectors.js`; no expensive computation runs on the UI thread or elsewhere in the browser.

- Original: `correct horse battery staple`
- Changed: `correct horse battery stapl3`
- Salt A: `6b8f2a91c4e7d0358a1f6c2e9b4d7a13` (original lab value)
- Salt B: an independent 16-byte random value drawn once using Python `secrets.token_hex(16)`, then frozen in the generator for reproducibility.
- Memory: 19, 64, 128 or 256 MiB, expressed in the PHC string as KiB.
- Passes: 2, 3 or 4.
- Lanes: 1, 2 or 4, sharing the configured total memory.
- Argon2id v=19; tag length 32 bytes.

Replaying a frozen example is not a new production registration. Real new password records need fresh random salts. The famous demo phrase is predictable and is **not a password recommendation**.

The original balanced result remains:

```text
$argon2id$v=19$m=65536,t=3,p=4$a48qkcTn0DWKH2wum016Ew$1nkl60G8pVYvjf8TiZey4XA1aiXcB8MT4VDOo0etN2c
```

All four original correct tags and all four original changed-password tags are preserved exactly. The generator asserts those eight values as well as reproducing the full matrix.

The fixture generator and the complete source regression suite are maintained in `CSSP-Cookies/html-labs/tests/`. Published-layout checks are documented in [DEPLOYMENT.md](../DEPLOYMENT.md).

## Experiments

Draft parameter edits do not change the stored verifier. **Apply & register new example** explicitly replaces the example record and applies all selected values together. Verification always uses the recipe stored with the record, even if the draft controls differ.

- Verify the original or changed example password.
- Compare two accounts with independent salts, then deliberately reuse the same salt to reveal identical inputs/results.
- Change total memory independently of passes or lanes.
- Copy the verifier and run either verified offline guess.
- Test the sixth online attempt under a chosen five-per-minute policy, then see a local offline test proceed.
- Change the stated attacker memory budget between 4, 8, 24 and 48 GiB.

## What the visual means

The grid uses eight **conceptual regions per lane**, not one cell per Argon2 block and not a scale model. P/R/W identify the previous, reference and written block in a simplified dependency illustration. Actual reference selection, segment rules and later-pass mixing are more detailed; the inspector and source links say so.

Allocation is `m` total, divided among `p` lanes. `t` passes revisit that allocation. Increasing passes adds work and memory traffic; it does not multiply the allocation. The first half of pass 1 uses data-independent addressing, then addressing is data-dependent.

No measured runtime is displayed. The old hardware-specific timing and speculative cracking-rate tables were removed. Teaching duration is deliberately slowed and independent of hardware performance. The memory-budget arithmetic assumes full-memory evaluations and ignores overhead, bandwidth, compute limits and time–memory tradeoffs. It is a capacity illustration, not throughput or a guaranteed cracking time.

For 24 GiB and 64 MiB per evaluation, the capacity calculation is `floor(24 × 1024 / 64) = 384`. Four lanes still share the same 64 MiB. Password generation and guess order matter alongside per-guess cost.

Deep links remain available: `?step=3&profile=high`; profiles `light`, `balanced`, `high`, `heavy` retain their original parameter sets. The seven original step numbers map to the same concepts.
