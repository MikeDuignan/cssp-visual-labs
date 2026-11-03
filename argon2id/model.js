/* Pure teaching model. Every displayed tag comes from the verified fixture matrix. */
(() => {
  'use strict';
  const { event, clone } = LabKit,
    V = ARGON_VECTORS;
  const defaults = () => ({ m: 65536, t: 3, p: 4, salt: 0, budget: 24 });
  const get = (params, salt = 0, password = 0) =>
    V.vectors[`${params.m}:${params.t}:${params.p}:${salt}:${password}`];
  const phc = (r) =>
    `$argon2id$v=19$m=${r.params.m},t=${r.params.t},p=${r.params.p}$${V.saltB64[r.salt]}$${r.tag.b64}`;
  const initial = (params) => ({
    params: { m: params.m, t: params.t, p: params.p },
    budget: params.budget || 24,
    events: [],
    password: null,
    clientPassword: 0,
    salt: null,
    tag: null,
    stored: null,
    candidate: null,
    comparison: null,
    browser: 'form',
    serverOp: 'Waiting for registration',
    memory: { allocated: false, pass: 0, fraction: 0, phase: 'idle' },
    stolen: null,
    offline: null,
    onlineAttempts: 0,
    compareSalts: null
  });
  const flight = (from, to, label, detail, tls = true) => ({
    from,
    to,
    label,
    detail,
    tls,
    payload: detail
  });
  function receive(s, login = false, wrong = 0) {
    return [
      event(
        login ? 'Prepare login' : 'Prepare registration',
        login
          ? 'The browser supplies a password. It does not choose the verifier’s salt or parameters.'
          : 'Alice prepares an email and password. The server will choose salt and parameters.',
        (x) => {
          x.browser = 'waiting';
          x.clientPassword = wrong;
          x.password = null;
          x.tag = null;
          x.candidate = null;
          x.comparison = null;
          x.memory = { allocated: false, pass: 0, fraction: 0, phase: 'idle' };
        },
        {
          phase: 'PREPARE',
          duration: 1000,
          done: 'The browser is ready. No new password is present in server memory.'
        }
      ),
      event(
        login ? 'POST /login' : 'POST /register',
        'The password travels inside TLS. The endpoints can read it; a network observer sees ciphertext.',
        (x) => {
          x.password = wrong;
          x.serverOp = login ? 'Login password received' : 'Registration password received';
        },
        {
          phase: 'TRAVEL',
          duration: 2200,
          flight: flight(
            'browser',
            'server',
            login ? 'POST /login' : 'POST /register',
            `email=alice@example.test\npassword=${V.passwords[wrong]}`
          ),
          done: 'The request arrived. The plaintext password now exists at the server endpoint.'
        }
      )
    ];
  }
  const saltEvent = (si) =>
    event(
      'Choose a salt',
      'The server uses a fresh random 16-byte salt for this example password record.',
      (x) => {
        x.salt = si;
        x.serverOp = 'Salt selected for this record';
      },
      {
        phase: 'RANDOM',
        duration: 1800,
        done: `Example salt ${si ? 'B' : 'A'} is ready. It is public and will be stored with the verifier. Replaying this lesson reuses the frozen example.`
      }
    );
  function derive(
    s,
    { password = 0, salt = s.salt ?? 0, params = s.params, compact = false, offline = false } = {}
  ) {
    const result = get(params, salt, password),
      t = params.t;
    const out = [
      event(
        'Allocate memory',
        `Reserve ${params.m / 1024} MiB total for one derivation, split across ${params.p} lane${params.p === 1 ? '' : 's'}.`,
        (x) => {
          x.params = clone(params);
          x.memory = { allocated: true, pass: 0, fraction: 0, phase: 'allocate' };
          x.serverOp = offline ? 'Offline workspace allocated' : 'Argon2id workspace allocated';
        },
        {
          phase: 'ALLOCATE',
          duration: compact ? 1000 : 1600,
          done: `${params.m / 1024} MiB total allocated. ${params.p} lanes share that total; they do not multiply it.`
        }
      )
    ];
    if (!compact)
      out.push(
        event(
          'Initialise lanes',
          'Initial values depend on the password, salt and parameters. Each lane begins with two actual 1 KiB blocks.',
          (x) => {
            x.memory = { allocated: true, pass: 1, fraction: 0.12, phase: 'seed' };
            x.serverOp = 'Lane starts initialised';
          },
          {
            phase: 'INITIALISE',
            duration: 1700,
            done: 'The lane starts are initialised. The visible grid is a conceptual grouping, not one cell per real block.'
          }
        ),
        event(
          'Read → mix → write',
          'One update depends on the previous block and a reference block. Read them, mix their data, then write the next block.',
          (x) => {
            x.memory = { allocated: true, pass: 1, fraction: 0.25, phase: 'dependency' };
            x.serverOp = 'Dependency update complete';
          },
          {
            phase: 'DEPENDENCY',
            duration: 2600,
            done: 'Previous block + reference block feed a new block. Discarding needed memory forces extra recomputation.'
          }
        )
      );
    out.push(
      event(
        'Pass 1 · first half',
        'The first half of pass 1 uses data-independent addressing: reference locations do not depend on the password-derived memory contents.',
        (x) => {
          x.memory = { allocated: true, pass: 1, fraction: 0.5, phase: 'independent' };
          x.serverOp = 'First half of pass 1 complete';
        },
        {
          phase: 'FILL',
          duration: compact ? 1250 : 2300,
          memoryMotion: { pass: 1, from: 0.0, to: 0.5, kind: 'independent' },
          done: 'First half of pass 1 completed using data-independent addressing.'
        }
      ),
      event(
        'Pass 1 · second half',
        'Argon2id switches to data-dependent addressing for the rest of the first pass.',
        (x) => {
          x.memory = { allocated: true, pass: 1, fraction: 1, phase: 'dependent' };
          x.serverOp = 'Pass 1 complete';
        },
        {
          phase: 'FILL',
          duration: compact ? 1250 : 2300,
          memoryMotion: { pass: 1, from: 0.5, to: 1, kind: 'dependent' },
          done: 'Pass 1 completed. The same allocated memory will be revisited.'
        }
      )
    );
    for (let pass = 2; pass <= t; pass++)
      out.push(
        event(
          `Pass ${pass} of ${t}`,
          `Revisit the same ${params.m / 1024} MiB. Pass ${pass} mixes existing memory; it does not allocate another full buffer.`,
          (x) => {
            x.memory = { allocated: true, pass, fraction: 1, phase: 'dependent' };
            x.serverOp = 'Pass ' + pass + ' complete';
          },
          {
            phase: 'REVISIT',
            duration: compact ? 1500 : 2400,
            memoryMotion: { pass, from: 0, to: 1, kind: 'dependent' },
            done: `Pass ${pass} of ${t} completed using the same allocated space.`
          }
        )
      );
    out.push(
      event(
        'Produce the tag',
        'Combine the final lane blocks and produce a 32-byte tag.',
        (x) => {
          x.tag = clone(result);
          x.memory = { allocated: true, pass: t, fraction: 1, phase: 'final' };
          x.serverOp = 'Derived tag ready';
          if (offline) x.candidate = clone(result);
        },
        {
          phase: 'DERIVE',
          duration: 1500,
          done: `All ${t} passes finished. Genuine precomputed result: ${result.hex.slice(0, 12)}… (${32} bytes). Teaching duration is not a runtime measurement.`
        }
      )
    );
    return out;
  }
  function store(s) {
    const record = {
      params: clone(s.params),
      salt: s.salt ?? 0,
      tag: clone(get(s.params, s.salt ?? 0, 0))
    };
    return [
      event(
        'Write the verifier',
        'The server writes algorithm, version, parameters, salt and tag to the users database.',
        (x) => {
          x.stored = clone(record);
          x.serverOp = 'Verifier stored';
        },
        {
          phase: 'STORE',
          duration: 1800,
          flight: flight('engine', 'database', 'Store PHC verifier', phc(record), false),
          done: 'The users row contains the PHC verifier. It has no plaintext password column.'
        }
      ),
      event(
        'Discard temporary secrets',
        'The server no longer needs this request’s plaintext password or work memory.',
        (x) => {
          x.password = null;
          x.memory.allocated = false;
          x.memory.phase = 'released';
        },
        {
          phase: 'DISCARD',
          duration: 1400,
          done: 'The model releases the temporary password and work buffer. The public salt and verifier remain.'
        }
      ),
      event(
        '201 Created',
        'The account-created response travels back. The browser must wait for it.',
        (x) => {
          x.browser = 'created';
        },
        {
          phase: 'RESPOND',
          duration: 2100,
          flight: flight('server', 'browser', '201 Created', 'Account created'),
          done: 'The response reached Alice’s browser. It can now show “Account created”.'
        }
      )
    ];
  }
  function verify(s, wrong = 0) {
    if (!s.stored)
      return [
        event('No record', 'Register an example account before verifying a password.', () => {}, {
          duration: 1200
        })
      ];
    const r = clone(s.stored),
      candidate = get(r.params, r.salt, wrong),
      ok = candidate.hex === r.tag.hex;
    return [
      ...receive(s, true, wrong),
      event(
        'Read stored verifier',
        'Retrieve the existing salt and parameters from the database. Do not generate a fresh salt for verification.',
        (x) => {
          x.salt = r.salt;
          x.params = clone(r.params);
          x.serverOp = 'Stored salt and parameters loaded';
        },
        {
          phase: 'READ',
          duration: 1800,
          flight: flight('database', 'engine', 'Read salt + parameters', phc(r), false),
          done: `Verification reuses salt ${r.salt ? 'B' : 'A'} and m=${r.params.m}, t=${r.params.t}, p=${r.params.p} from the record.`
        }
      ),
      ...derive(s, { password: wrong, salt: r.salt, params: r.params, compact: true }),
      event(
        'Compare all 32 bytes',
        'Compare the entire derived tag with the stored tag. There is no early exit and no password-character diagnosis.',
        (x) => {
          x.candidate = clone(candidate);
          x.comparison = { ok, checked: 32 };
          x.serverOp = ok ? 'Tags match' : 'Tags differ';
          x.password = null;
          x.memory.allocated = false;
          x.memory.phase = 'released';
        },
        {
          phase: 'COMPARE',
          duration: 2200,
          compareMotion: true,
          done: ok
            ? 'All 32 bytes compared: match. A session may now be issued.'
            : 'All 32 bytes compared: mismatch. No information about an incorrect password position is returned.'
        }
      ),
      event(
        ok ? '200 OK' : '401 Unauthorized',
        `${ok ? 'Success' : 'Failure'} response travels back. The browser still awaits its result.`,
        (x) => {
          x.browser = ok ? 'verified' : 'denied';
          x.onlineAttempts++;
        },
        {
          phase: 'RESPOND',
          duration: 2100,
          flight: flight(
            'server',
            'browser',
            ok ? '200 OK' : '401 Unauthorized',
            ok ? 'Password verified · session may be issued' : 'Incorrect credentials'
          ),
          done: ok
            ? 'The browser receives 200. Password verification establishes identity; session creation is the next mechanism.'
            : 'The browser receives 401. The server recomputed and compared; it did not decrypt or locate a wrong character.'
        }
      )
    ];
  }
  function steal(s) {
    if (!s.stored)
      return [
        event(
          'No verifier',
          'Register an account before simulating a database compromise.',
          () => {},
          { duration: 1000 }
        )
      ];
    return [
      event(
        'Database compromise',
        'A copy of the stored verifier travels to the attacker. No plaintext password is in this row.',
        (x) => {
          x.stolen = clone(x.stored);
          x.offline = { guesses: 0, ok: null };
        },
        {
          phase: 'COPY',
          duration: 2400,
          flight: {
            ...flight('database', 'observer', 'Copy the verifier', phc(s.stored), false),
            kind: 'leak'
          },
          done: 'The attacker has algorithm, version, parameters, salt and tag. Offline guesses no longer need the login server.'
        }
      ),
      event(
        'Budget each guess',
        `Under a ${s.budget || 24} GiB memory budget, each full-memory evaluation needs its own ${s.stored.params.m / 1024} MiB.`,
        () => {},
        {
          phase: 'BUDGET',
          duration: 1800,
          done: 'Memory-only capacity is budget ÷ configured memory per guess, rounded down. It is not a guess rate or a cracking time.'
        }
      )
    ];
  }
  function offlineGuess(s, wrong = 1) {
    if (!s.stolen)
      return [
        event('No stolen verifier', 'Copy the database verifier first.', () => {}, {
          duration: 1000
        })
      ];
    const r = s.stolen,
      c = get(r.params, r.salt, wrong),
      ok = c.hex === r.tag.hex;
    return [
      event(
        'Choose an offline guess',
        `The attacker tests the verified example “${V.passwords[wrong]}” locally. No login request is sent.`,
        (x) => {
          x.offline = { ...x.offline, trying: wrong };
        },
        {
          phase: 'GUESS',
          duration: 1300,
          done: 'The attacker supplies a guess to its own evaluation, with the stolen salt and parameters.'
        }
      ),
      event(
        'Pay the work cost',
        `A full evaluation uses ${r.params.m / 1024} MiB and ${r.params.t} passes, split into ${r.params.p} lanes.`,
        () => {},
        {
          phase: 'COMPUTE',
          duration: 2400,
          done: 'The conceptual offline evaluation completed. This is a verified fixture, not a measured performance test.'
        }
      ),
      event(
        'Compare locally',
        'Compare the entire candidate tag with the stolen tag.',
        (x) => {
          x.offline = {
            guesses: (x.offline?.guesses || 0) + 1,
            ok,
            trying: wrong,
            candidate: clone(c)
          };
        },
        {
          phase: 'COMPARE',
          duration: 1800,
          done: ok
            ? 'The example guess matches. This publicly shown demo phrase is predictable; word count alone does not make a password strong.'
            : 'The example guess does not match. The attacker can keep testing locally; server rate limits do not apply.'
        }
      )
    ];
  }
  function limited(s) {
    return [
      event(
        'Set the test condition',
        'Assume five online failures have already occurred this simulated minute. This server allows five attempts per minute.',
        (x) => {
          x.onlineAttempts = 5;
          x.browser = 'waiting';
          x.comparison = null;
        },
        {
          phase: 'SETUP',
          duration: 1500,
          done: 'Test precondition: this client has used the server’s five-attempt allowance.'
        }
      ),
      event('Send attempt six', 'A sixth online attempt travels to the login server.', () => {}, {
        phase: 'TRAVEL',
        duration: 2000,
        flight: flight('browser', 'server', 'POST /login · #6', 'password=' + V.passwords[1]),
        done: 'The sixth request arrived. The server can apply its online policy.'
      }),
      event(
        'Apply rate limit',
        'Reject the request under the chosen five-per-minute policy.',
        (x) => {
          x.serverOp = 'Online rate limit reached';
          x.onlineAttempts = 6;
        },
        {
          phase: 'POLICY',
          duration: 1500,
          done: 'The policy blocks this attempt before another derivation. It cannot control offline copies.'
        }
      ),
      event(
        '429 response',
        'The server sends a rate-limit response back.',
        (x) => {
          x.browser = 'limited';
        },
        {
          phase: 'RESPOND',
          duration: 2000,
          flight: flight('server', 'browser', '429 Too Many Requests', 'Try later'),
          done: 'The browser receives 429. A stolen verifier still allows local offline tests.'
        }
      )
    ];
  }
  function saltComparison(s, reuse = false) {
    const a = get(s.params, 0, 0),
      b = get(s.params, reuse ? 0 : 1, 0);
    return [
      event(
        'Compare two records',
        'Give Alice and Ben the same password and parameters; change only the salt policy.',
        (x) => {
          x.compareSalts = { reuse, a: clone(a), b: clone(b) };
        },
        {
          phase: 'COMPARE',
          duration: 2200,
          done: reuse
            ? 'With the same password, salt and parameters, the tags are identical. A global salt exposes equality and permits shared work.'
            : 'Same password, different random salts: different tags. Salt is public; its per-record variation prevents identical verifiers.'
        }
      )
    ];
  }
  function registered(opts = defaults()) {
    let s = initial(opts);
    const all = [
      ...receive(s),
      saltEvent(opts.salt || 0),
      ...derive(s, { salt: opts.salt || 0 }),
      ...store({ ...s, salt: opts.salt || 0 })
    ];
    for (const b of all) b.apply(s);
    return s;
  }
  function journey(opts) {
    let s = initial(opts);
    const list = [];
    function add(short, title, text, takeaway, beats) {
      list.push({ short, title, text, takeaway, beats });
      for (const b of beats) b.apply(s);
    }
    add(
      'The password',
      'It arrives as a password. It leaves no password record.',
      'The browser submits an email and password over TLS. Follow it to the server before looking inside the derivation.',
      'The password is available at the endpoints. TLS protects its journey, not a compromised endpoint.',
      receive(s)
    );
    add(
      'The salt',
      'Give this record its own starting point.',
      'A fresh random salt makes records differ even when people choose the same password. It is stored openly; secrecy is not its job.',
      'At login, reuse this record’s salt. Generating a new one would change the result.',
      [saltEvent(opts.salt || 0)]
    );
    add(
      'The work',
      'A guess needs workspace, not just arithmetic.',
      'Watch allocation, dependencies and repeated passes. Lanes share one memory budget. The grid groups work conceptually; it is not a trace of individual Argon2 blocks.',
      'Memory is allocated once per evaluation. Passes revisit it; lanes split it.',
      derive(s)
    );
    add(
      'The record',
      'Keep the verifier. Discard the temporary password.',
      'The PHC string packages everything needed for verification except the password. Select any component to understand its role.',
      'A public salt is expected. The database stores a verifier, not a decryptable password.',
      store(s)
    );
    add(
      'A match',
      'Run the same recipe. Compare the result.',
      'A new login retrieves the stored salt and parameters, derives a candidate tag, and compares all bytes. The browser waits for the response.',
      'Successful password verification can now establish a session. The companion lab follows that token.',
      verify(s, 0)
    );
    add(
      'A mismatch',
      'One changed character. A different result.',
      'The last character changes from e to 3. The server performs the same work and full comparison. It does not identify which password character was wrong.',
      '“Mismatch” is about whole tags, not a hint about a password position.',
      verify(s, 1)
    );
    add(
      'The stolen row',
      'A verifier is an invitation to guess offline.',
      'A database copy lets the attacker evaluate guesses without contacting this server. Memory and computation cost each guess; an online rate limit cannot govern them.',
      'There is no promised cracking time. Password generation, guess order and hardware matter.',
      steal(s)
    );
    return list;
  }
  window.ArgonModel = {
    V,
    defaults,
    get,
    phc,
    initial,
    receive,
    saltEvent,
    derive,
    store,
    verify,
    steal,
    offlineGuess,
    limited,
    saltComparison,
    registered,
    journey
  };
})();
