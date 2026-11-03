# Primary sources and claim map

Reviewed for the rebuild on 3 November 2026. These are optional external reading; the exhibits work without them.

| Claim or boundary | Primary source |
|---|---|
| Fictional `shop.example` hostname; `.example` is reserved for examples, while `.local` has multicast-DNS semantics | [RFC 2606 §2](https://www.rfc-editor.org/rfc/rfc2606.html#section-2), [RFC 6762 §3](https://www.rfc-editor.org/rfc/rfc6762.html#section-3) |
| JavaScript `localStorage` is a Web Storage API, separate from HTTP cookie handling | [HTML Standard: Web Storage](https://html.spec.whatwg.org/multipage/webstorage.html#the-localstorage-attribute), [RFC 6265](https://www.rfc-editor.org/rfc/rfc6265.html) |
| Set-Cookie stores name/value and metadata; Cookie sends eligible name/value pairs; host/path scope and cookie lifetime | [RFC 6265 §§4–5](https://www.rfc-editor.org/rfc/rfc6265.html#section-4) |
| Cleartext exposure, session identifiers and Secure limitations | [RFC 6265 §8](https://www.rfc-editor.org/rfc/rfc6265.html#section-8) |
| Explicit Strict/Lax/None, safe top-level navigation, None/Secure and default-mode distinctions | [HTTPbis cookie draft -22 §§5.6.7–5.8](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-5.6.7); the page identifies the pinned draft, rather than presenting it as a final RFC |
| Transport protection and endpoint plaintext boundary | [RFC 8446 §5](https://www.rfc-editor.org/rfc/rfc8446.html#section-5) |
| Server-side expiry/invalidation, independent browser storage, client properties and session-token handling | [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) |
| SameSite is defence in depth, not universal CSRF protection | [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) |
| Argon2id inputs, total memory, lanes, passes, hybrid addressing, blocks and reference dependencies | [RFC 9106 §3](https://www.rfc-editor.org/rfc/rfc9106.html#section-3) |
| Salt/tag sizes, recommended profiles and time–memory tradeoffs | [RFC 9106 §§4, 7](https://www.rfc-editor.org/rfc/rfc9106.html#section-4) |
| Password-storage practice, salts and work factors; 19 MiB/t=2/p=1 as one minimum configuration | [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) |
| PHC field order and encodings | [PHC string format specification](https://github.com/P-H-C/phc-string-format/blob/master/phc-sf-spec.md) |
| Reproducible Argon2id derivation and stored-verifier checks | [argon2-cffi API](https://argon2-cffi.readthedocs.io/en/stable/api.html) |
| Equal-length digest comparison without content-dependent early exit | [Python hmac.compare_digest documentation](https://docs.python.org/3/library/hmac.html#hmac.compare_digest) |

## Evidence versus illustration

The tags and base64 encodings are exact, independently reproducible data. The fixtures contain no password-strength or performance claims.

The network topology, accounts, session IDs, 30-minute server lifetime, five-per-minute online allowance and all animation timings are chosen teaching examples. The grid and reference arrows simplify the real algorithm. The page’s temporary-memory release is a state-model transition, not a secure-erasure guarantee in JavaScript.

The memory-capacity calculation is explicit arithmetic: floor(budget in MiB / m in MiB). It assumes full-memory evaluations with no overhead; real attackers face other resource constraints and can make time–memory tradeoffs. No measured runtimes, fabricated benchmark precision, hardware guess rates or guaranteed cracking times are displayed.

The model accepts a replay because its server checks the bearer ID and session validity, not because servers cannot observe different clients. It assumes an observer is deliberately in the traffic path; sharing a network alone is insufficient.
