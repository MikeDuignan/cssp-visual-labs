# Cookie Theft

[Open the lab](https://mikeduignan.github.io/cssp-visual-labs/cookie-theft/) · [Companion password lab](../argon2id/) · [Controls and review guide](../README.md)

Seven chapters trace login credentials, server verification, Set-Cookie, browser storage, Cookie attachment, server lookup, token replay, TLS limits and revocation. The same session ID stays recognisable across messages and stores. Responses arrive before browser results appear.

## Investigate

- Compare HTTP with HTTPS, with the observer explicitly in or outside the traffic path. HTTP can expose credentials as well as session IDs.
- Inspect the original Set-Cookie beside the later Cookie header.
- Delete or alter the browser's ID and observe the next lookup.
- Replay an earlier captured copy, including after changing transport or deleting the victim's cookie.
- Compare browser deletion, server logout, direct server invalidation and advancing the server clock by 31 minutes.
- Open the cookie-policy bench to test Secure, HttpOnly and explicit SameSite under stated host, method and navigation conditions.

Five prediction activities test deletion, adding TLS, altering an ID, revocation and choosing a defence. Each runs the mechanism and explains the result, including plausible wrong answers.

## Boundaries

`shop.example` names the fictional website, not a browser storage location. The cookie jar and JavaScript's `localStorage` API are separate. The browser keeps a token and cookie metadata; the server keeps the identity record.

The server accepts a replay because its policy checks the bearer ID and validity. It can observe a different client address. Sharing a network does not automatically place the observer in the traffic path.

Captured history persists until an explicit restart. This model has one active session, replaced by a new sign-in. Cookie browser lifetime and the chosen 30-minute server lifetime are distinct. TLS protects transport; it does not revoke an already stolen token. HttpOnly does not make XSS harmless, and SameSite is not a universal CSRF solution.

Open `index.html` directly for offline use, retaining `cookie.js` and `../shared/`. [Primary sources](../SOURCES.md) and contextual inspectors explain the simplifications. Historical REVIEW/FIXES files describe the earlier single-file lab.
