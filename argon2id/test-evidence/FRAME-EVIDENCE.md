# Frame-sequence evidence: each packet crosses BEFORE the server panel changes

Captured in real headed Chrome 153 on a private Xvfb display, 1920x1080, motion on, one screenshot every ~0.28 s (re-captured after the
engine's PASSWORD field was gated on the packet arriving). Each row is one frame. `server password` is the PASSWORD field in the Argon2id
engine panel: `—` until the request carrying it has arrived. `srvlog` letters = Register, salt, derive, insert, Login, Fail lines present in the request log.


## step1-register — POST /signup crosses, THEN the server's password field fills, the register log line and the salt appear

| t (s) | packet on wire | server password | srvlog | salt | DB | cells | verdict | browser card |
|---|---|---|---|---|---|---|---|---|
| 0.12 | POST /signup TLS · email + pas | — | — | — | — | 0 | — | Preparing your account… |
| 0.4 | POST /signup TLS · email + pas | — | — | — | — | 0 | — | Preparing your account… |
| 0.68 | POST /signup TLS · email + pas | — | — | — | — | 0 | — | Preparing your account… |
| 0.96 | POST /signup TLS · email + pas | — | — | — | — | 0 | — | Preparing your account… |
| 1.23 | POST /signup TLS · email + pas | — | — | — | — | 0 | — | Preparing your account… |
| 1.51 | POST /signup TLS · email + pas | — | — | — | — | 0 | — | Preparing your account… |
| 1.78 |  | correct hors | R | — | — | 0 | — | Preparing your account… |
| 2.06 |  | correct hors | R | — | — | 0 | — | Preparing your account… |
| 2.33 |  | correct hors | Rs | yes | — | 0 | — | Salt generated |
| 2.61 |  | correct hors | Rs | yes | — | 0 | — | Salt generated |
| 2.88 |  | correct hors | Rs | yes | — | 0 | — | Salt generated |
| 3.16 |  | correct hors | Rs | yes | — | 0 | — | Salt generated |
| 3.43 |  | correct hors | Rs | yes | — | 0 | — | Salt generated |
| 3.71 |  | correct hors | Rs | yes | — | 0 | — | Salt generated |

## step5-login — POST /login crosses, THEN the server holds the password and recomputes, compares, 200 goes back, THEN the browser shows welcome

| t (s) | packet on wire | server password | srvlog | salt | DB | cells | verdict | browser card |
|---|---|---|---|---|---|---|---|---|
| 0.11 | POST /login TLS · email + pass | — | Rsdi | yes | 1 | 64 | — | Verifying your password… |
| 0.39 | POST /login TLS · email + pass | — | Rsdi | yes | 1 | 64 | — | Verifying your password… |
| 0.66 | POST /login TLS · email + pass | — | Rsdi | yes | 1 | 64 | — | Verifying your password… |
| 0.94 | POST /login TLS · email + pass | — | Rsdi | yes | 1 | 64 | — | Verifying your password… |
| 1.21 | POST /login TLS · email + pass | — | Rsdi | yes | 1 | 64 | — | Verifying your password… |
| 1.49 | POST /login TLS · email + pass | — | Rsdi | yes | 1 | 64 | — | Verifying your password… |
| 1.76 |  | correct hors | Rsdi | yes | 1 | 64 | — | Verifying your password… |
| 2.04 |  | correct hors | Rsdi | yes | 1 | 64 | — | Verifying your password… |
| 2.31 |  | correct hors | Rsdi | yes | 1 | 64 | — | Verifying your password… |
| 2.59 |  | correct hors | Rsdi | yes | 1 | 64 | — | Verifying your password… |
| 2.86 |  | correct hors | Rsdi | yes | 1 | 64 | — | Verifying your password… |
| 3.14 |  | correct hors | Rsdi | yes | 1 | 64 | — | Verifying your password… |
| 3.41 |  | correct hors | Rsdi | yes | 1 | 64 | wait | Verifying your password… |
| 3.69 |  | correct hors | Rsdi | yes | 1 | 64 | wait | Verifying your password… |
| 3.96 |  | correct hors | Rsdi | yes | 1 | 64 | wait | Verifying your password… |
| 4.24 |  | correct hors | Rsdi | yes | 1 | 64 | wait | Verifying your password… |
| 4.51 |  | correct hors | Rsdi | yes | 1 | 64 | wait | Verifying your password… |
| 4.79 | 200 OK session issued | correct hors | RsdiL | yes | 1 | 64 | ok flash | Verifying your password… |
| 5.06 | 200 OK session issued | correct hors | RsdiL | yes | 1 | 64 | ok flash | Verifying your password… |
| 5.34 | 200 OK session issued | correct hors | RsdiL | yes | 1 | 64 | ok flash | Verifying your password… |
| 5.61 | 200 OK session issued | correct hors | RsdiL | yes | 1 | 64 | ok flash | Verifying your password… |
| 5.9 | 200 OK session issued | correct hors | RsdiL | yes | 1 | 64 | ok flash | Verifying your password… |
| 6.18 | 200 OK session issued | correct hors | RsdiL | yes | 1 | 64 | ok flash | Verifying your password… |
| 6.46 |  | correct hors | RsdiL | yes | 1 | 64 | ok flash | Welcome back, Alice |
| 6.74 |  | correct hors | RsdiL | yes | 1 | 64 | ok flash | Welcome back, Alice |
| 7.01 |  | correct hors | RsdiL | yes | 1 | 64 | ok flash | Welcome back, Alice |
| 7.29 |  | correct hors | RsdiL | yes | 1 | 64 | ok flash | Welcome back, Alice |
| 7.56 |  | correct hors | RsdiL | yes | 1 | 64 | ok flash | Welcome back, Alice |
| 7.84 |  | correct hors | RsdiL | yes | 1 | 64 | ok flash | Welcome back, Alice |
| 8.11 |  | correct hors | RsdiL | yes | 1 | 64 | ok flash | Welcome back, Alice |
| 8.39 |  | correct hors | RsdiL | yes | 1 | 64 | ok flash | Welcome back, Alice |

## step6-wrong — A wrong password crosses, THEN the server holds it, compares and fails, 401 goes back, THEN the browser says incorrect

| t (s) | packet on wire | server password | srvlog | salt | DB | cells | verdict | browser card |
|---|---|---|---|---|---|---|---|---|
| 0.11 | POST /login WRONG TLS · one ch | — | RsdiL | yes | 1 | 64 | — | Checking the password… |
| 0.4 | POST /login WRONG TLS · one ch | — | RsdiL | yes | 1 | 64 | — | Checking the password… |
| 0.68 | POST /login WRONG TLS · one ch | — | RsdiL | yes | 1 | 64 | — | Checking the password… |
| 0.96 | POST /login WRONG TLS · one ch | — | RsdiL | yes | 1 | 64 | — | Checking the password… |
| 1.23 | POST /login WRONG TLS · one ch | — | RsdiL | yes | 1 | 64 | — | Checking the password… |
| 1.51 | POST /login WRONG TLS · one ch | — | RsdiL | yes | 1 | 64 | — | Checking the password… |
| 1.78 |  | correct hors | RsdiL | yes | 1 | 64 | — | Checking the password… |
| 2.06 |  | correct hors | RsdiL | yes | 1 | 64 | — | Checking the password… |
| 2.33 |  | correct hors | RsdiL | yes | 1 | 64 | — | Checking the password… |
| 2.61 |  | correct hors | RsdiL | yes | 1 | 64 | — | Checking the password… |
| 2.9 |  | correct hors | RsdiL | yes | 1 | 64 | — | Checking the password… |
| 3.18 |  | correct hors | RsdiL | yes | 1 | 64 | wait | Checking the password… |
| 3.46 |  | correct hors | RsdiL | yes | 1 | 64 | wait | Checking the password… |
| 3.73 |  | correct hors | RsdiL | yes | 1 | 64 | wait | Checking the password… |
| 4.01 |  | correct hors | RsdiL | yes | 1 | 64 | wait | Checking the password… |
| 4.28 |  | correct hors | RsdiL | yes | 1 | 64 | wait | Checking the password… |
| 4.56 |  | correct hors | RsdiL | yes | 1 | 64 | wait | Checking the password… |
| 4.85 | 401 Unauthorized no session is | correct hors | RsdiLF | yes | 1 | 64 | bad flash | Checking the password… |
| 5.13 | 401 Unauthorized no session is | correct hors | RsdiLF | yes | 1 | 64 | bad flash | Checking the password… |
| 5.41 | 401 Unauthorized no session is | correct hors | RsdiLF | yes | 1 | 64 | bad flash | Checking the password… |
| 5.7 | 401 Unauthorized no session is | correct hors | RsdiLF | yes | 1 | 64 | bad flash | Checking the password… |
| 5.98 | 401 Unauthorized no session is | correct hors | RsdiLF | yes | 1 | 64 | bad flash | Checking the password… |
| 6.26 | 401 Unauthorized no session is | correct hors | RsdiLF | yes | 1 | 64 | bad flash | Checking the password… |
| 6.53 |  | correct hors | RsdiLF | yes | 1 | 64 | bad flash | Incorrect password |
| 6.81 |  | correct hors | RsdiLF | yes | 1 | 64 | bad flash | Incorrect password |
| 7.08 |  | correct hors | RsdiLF | yes | 1 | 64 | bad flash | Incorrect password |
| 7.36 |  | correct hors | RsdiLF | yes | 1 | 64 | bad flash | Incorrect password |
| 7.63 |  | correct hors | RsdiLF | yes | 1 | 64 | bad flash | Incorrect password |
| 7.91 |  | correct hors | RsdiLF | yes | 1 | 64 | bad flash | Incorrect password |
| 8.18 |  | correct hors | RsdiLF | yes | 1 | 64 | bad flash | Incorrect password |
| 8.46 |  | correct hors | RsdiLF | yes | 1 | 64 | bad flash | Incorrect password |

## step7-steal — The stolen users row crosses to the rig BEFORE the rig starts

| t (s) | packet on wire | server password | srvlog | salt | DB | cells | verdict | browser card |
|---|---|---|---|---|---|---|---|---|
| 0.12 | LEAK stolen users row $argon2i | correct hors | RsdiLF | yes | 1 | 64 | — | Argon2id makes every guess |
| 0.4 | LEAK stolen users row $argon2i | correct hors | RsdiLF | yes | 1 | 64 | — | Argon2id makes every guess |
| 0.68 | LEAK stolen users row $argon2i | correct hors | RsdiLF | yes | 1 | 64 | — | Argon2id makes every guess |
| 0.96 | LEAK stolen users row $argon2i | correct hors | RsdiLF | yes | 1 | 64 | — | Argon2id makes every guess |
| 1.25 | LEAK stolen users row $argon2i | correct hors | RsdiLF | yes | 1 | 64 | — | Argon2id makes every guess |
| 1.53 | LEAK stolen users row $argon2i | correct hors | RsdiLF | yes | 1 | 64 | — | Argon2id makes every guess |
| 1.81 |  | correct hors | RsdiLF | yes | 1 | 64 | — | Argon2id makes every guess |
| 2.1 |  | correct hors | RsdiLF | yes | 1 | 64 | — | Argon2id makes every guess |
| 2.38 |  | correct hors | RsdiLF | yes | 1 | 64 | — | Argon2id makes every guess |
| 2.66 |  | correct hors | RsdiLF | yes | 1 | 64 | — | Argon2id makes every guess |
| 2.93 |  | correct hors | RsdiLF | yes | 1 | 64 | — | Argon2id makes every guess |
| 3.21 |  | correct hors | RsdiLF | yes | 1 | 64 | — | Argon2id makes every guess |
| 3.5 |  | correct hors | RsdiLF | yes | 1 | 64 | — | Argon2id makes every guess |
| 3.78 |  | correct hors | RsdiLF | yes | 1 | 64 | — | Argon2id makes every guess |
| 4.06 |  | correct hors | RsdiLF | yes | 1 | 64 | — | Argon2id makes every guess |
