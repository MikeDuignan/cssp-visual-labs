# Publication and verification

GitHub Pages serves this repository's `main` branch from `/`, with HTTPS enabled. The source is maintained in `MikeDuignan/CSSP-Cookies`. Source pushes do not automatically update this repository.

The current [release manifest](release.json) identifies the source revision and SHA-256 hashes for the published overview, both entrypoints and all runtime dependencies. No backend or build system is required; `.nojekyll` keeps publication static.

## Runtime mapping

- Source `html-labs/shared/` → `shared/`.
- Source `html-labs/index.html` and `cookie.js` → `cookie-theft/`.
- Source `html-labs/argon2id/index.html`, `model.js` and `argon.js` → `argon2id/`.
- Cookie's shared URLs gain `../`; its companion URL becomes `../argon2id/index.html`; its home URL becomes `../index.html`.
- Argon2id's companion cookie URL becomes `../cookie-theft/index.html`.

The overview and README files describe this public layout. Historical reviews and screenshots remain available within each lab folder. The fictional shop is now `shop.example`, and the cookie inspector distinguishes its hostname, cookie storage and the `localStorage` API.

## Checks

The source rebuild passed 306 main assertions and 156 subsequent interaction checks, independent verification of all 144 Argon2id tags, actual 175–200% browser zoom, background-tab, keyboard, reduced-motion and offline checks. These are the source regression results; publication receives a separate check for its changed directory layout.

The publication runner checks both labs, all chapter states, companion/home links, hostname and inspector text, replay after cookie deletion, server invalidation, matching/nonmatching password verification, activity feedback, narrow layout and reduced motion. It fails on runtime errors, missing assets and external simulation requests. Reports are in [evidence](evidence/).

```bash
npm install --prefix /tmp/cssp-tools playwright@1.64.1
NODE_PATH=/tmp/cssp-tools/node_modules node tests/pages.cjs https://mikeduignan.github.io/cssp-visual-labs/ --quick
```

The runner uses `/usr/bin/google-chrome`. Omit `--quick` to play consequential exchanges in real time. A file:// root URL tests the downloaded repository offline. Full cross-browser certification is not claimed: Chrome received the complete checks, Firefox a source load/layout smoke check; Safari and a screen reader were not tested.
