(() => {
  'use strict';
  const K = LabKit,
    { esc, inspect, pill, empty, event, node, clone } = K;
  const IDS = [
    '9f2c8a41d7b0e55c3a96f2d18b7e04aa',
    '41c9a763b58f201ee06d89a2c74f35b0',
    'f1603bc87a1ed4299d82a5e064fc7b31'
  ];
  const short = (id) => (id ? `${id.slice(0, 6)}…${id.slice(-4)}` : 'no token');
  const ticket = (id, title = 'SESSION ID', cls = '') =>
    inspect(
      'token',
      `<span class="ticket-mark" aria-hidden="true">◈</span><span class="token-value"><span class="token-label">${title}</span>${esc(id)}</span>`,
      `token ${cls}`,
      id
    );
  const defaults = () => ({
    transport: 'HTTP',
    inPath: true,
    secure: false,
    httpOnly: false,
    sameSite: 'Lax'
  });
  const initial = (opts) => ({
    opts: clone(opts),
    events: [],
    epoch: 0,
    clock: 0,
    jar: null,
    session: null,
    captures: [],
    replayToken: null,
    credentials: false,
    observation: 'No traffic has crossed the connection.',
    browser: 'signed-out',
    serverOp: 'Waiting for a request',
    serverDetail: 'No credentials received. No session exists.',
    lookup: null,
    request: null,
    response: null,
    issuedResponse: null,
    attackerResult: null,
    policyResult: null
  });
  const active = (s) => s.session && s.session.status === 'active' && s.clock < s.session.expires;
  const accepts = (s, t) => !!(t && active(s) && t === s.session.id);
  const captured = (s) => s.replayToken || s.captures.at(-1)?.id || null;
  const setCookie = (id, a) =>
    `session=${id}; Path=/; ${a.httpOnly ? 'HttpOnly; ' : ''}${a.secure ? 'Secure; ' : ''}SameSite=${a.sameSite}`;
  function observe(s, label, token, password) {
    if (!s.opts.inPath) {
      s.observation = 'Observer is outside the traffic path. This exchange is not visible here.';
      return;
    }
    if (s.opts.transport === 'HTTPS') {
      s.observation =
        'TLS ciphertext observed. Headers, password and cookie value are not readable on this connection.';
      return;
    }
    s.observation = `Readable HTTP: ${label}.${password ? ' The login password is exposed too.' : ''}`;
    if (password) s.credentials = true;
    if (token) {
      s.captures.push({ id: token, via: label, transport: 'HTTP' });
      if (!s.replayToken) s.replayToken = token;
    }
  }
  function trip(
    s,
    {
      from = 'browser',
      to = 'server',
      label,
      detail = '',
      token = null,
      password = false,
      arrive = () => {},
      done,
      kind = '',
      copy = false
    }
  ) {
    const tls = s.opts.transport === 'HTTPS';
    const payload = password
      ? 'POST /login HTTP/1.1\nHost: shop.example\n' +
        (token ? 'Cookie: session=' + token + '\n' : '') +
        '\nemail=alice@example.test&password=springtime42'
      : token
        ? label === 'Set-Cookie'
          ? 'Set-Cookie: ' + setCookie(token, s.opts)
          : 'Cookie: session=' + token
        : detail;
    const flight = { from, to, label, detail, token, password, tls, kind, payload };
    const finish = (x) => {
      observe(x, label, copy ? null : token, password);
      arrive(x);
      x.lastPacket = clone(flight);
    };
    if (copy && token && !tls && s.opts.inPath)
      return [
        event(
          'To the tap',
          `${label} leaves the ${from}. The observer is explicitly in the traffic path.`,
          () => {},
          {
            phase: 'SEND',
            duration: 1600,
            flight: { ...flight, to: 'tap' },
            done: 'The message has reached the tap. The destination has not processed it.'
          }
        ),
        event(
          'Copy the ID',
          'A copy of the readable ID branches to the observer. The original message is preserved.',
          (x) => observe(x, label, token, false),
          {
            phase: 'COPY',
            duration: 1250,
            flight: {
              from: 'tap',
              to: 'observer',
              label: 'Copy · ' + short(token),
              detail: 'original remains intact',
              token,
              tls: false,
              kind: 'leak',
              payload: 'session=' + token
            },
            done: `The observer keeps ${short(token)} from ${label} over HTTP. The original is still in transit.`
          }
        ),
        event('Reach the destination', `The original ${label} continues to the ${to}.`, finish, {
          phase: 'ARRIVE',
          duration: 1500,
          flight: { ...flight, from: 'tap' },
          done
        })
      ];
    return [
      event(
        label,
        `${label} travels ${from} → ${to}.${tls ? ' Plaintext at the endpoints; ciphertext on the connection.' : ' Its content is readable on the connection.'}`,
        finish,
        { phase: 'TRAVEL', duration: 2200, flight, done }
      )
    ];
  }
  function loginRequest(s) {
    const e = eligible(s);
    return [
      event(
        'Prepare credentials',
        'Alice prepares her email and password. There is no new session cookie yet.',
        (x) => {
          x.browser = 'waiting';
          x.serverOp = 'Waiting for credentials';
          x.serverDetail = 'Nothing has arrived yet.';
          x.lookup = null;
        },
        {
          phase: 'PREPARE',
          duration: 1200,
          done: 'The browser prepared a login. The server has not received these credentials.'
        }
      ),
      ...trip(s, {
        label: 'POST /login',
        detail: 'email + password',
        token: e.token,
        password: true,
        arrive: (x) => {
          x.serverOp = 'Credentials received';
          x.serverDetail =
            'Email and password now exist at the server endpoint. Verification comes next.';
          x.request = {
            line: 'POST /login',
            header: e.token ? 'Cookie: session=' + e.token : 'No Cookie header (fresh login)',
            transport: x.opts.transport,
            client: 'Alice'
          };
        },
        done: 'POST /login has arrived. The server can now verify the password.'
      })
    ];
  }
  function issue(s) {
    const id = IDS[s.epoch] || 'b40715daec69f023a8c51d09' + s.epoch.toString(16).padStart(8, '0'),
      attrs = { secure: s.opts.secure, httpOnly: s.opts.httpOnly, sameSite: s.opts.sameSite };
    const valid =
      !(attrs.secure && s.opts.transport === 'HTTP') &&
      !(attrs.sameSite === 'None' && !attrs.secure);
    return [
      event(
        'Verify the password',
        'The server checks Alice’s password using its stored verifier.',
        (x) => {
          x.serverOp = 'Password verified';
          x.serverDetail = 'Identity established. A session can now be created.';
        },
        {
          phase: 'PROCESS',
          duration: 1600,
          done: 'Password verification succeeds. No new session has been created yet.'
        }
      ),
      event(
        'Create a session',
        'The server creates a random session ID and a server-side record for Alice.',
        (x) => {
          x.epoch++;
          x.session = { id, user: 'Alice', status: 'active', expires: x.clock + 30 };
          x.serverOp = 'Session created';
          x.serverDetail =
            'The ID points to Alice in the session store. It does not contain her password.';
        },
        {
          phase: 'STORE',
          duration: 1700,
          done: `The server stores ${short(id)} → Alice, valid for 30 simulated minutes. The browser has no new cookie yet.`
        }
      ),
      ...trip(s, {
        from: 'server',
        to: 'browser',
        label: 'Set-Cookie',
        detail: short(id),
        token: id,
        kind: 'token',
        copy: true,
        arrive: (x) => {
          x.response = {
            line: '200 OK',
            header: 'Set-Cookie: ' + setCookie(id, attrs),
            transport: x.opts.transport
          };
          x.issuedResponse = clone(x.response);
          x.browser = 'response-arrived';
        },
        done: 'The login response reached the browser. Set-Cookie is now available for the browser to process.'
      }),
      event(
        'Store in the browser',
        'The browser checks the Set-Cookie attributes and updates its own cookie jar.',
        (x) => {
          if (valid) x.jar = { id, ...attrs };
          x.browser = valid ? 'signed-in' : 'cookie-rejected';
          x.serverOp = 'Waiting for the next request';
          x.serverDetail = 'The server-side session exists independently of the browser’s storage.';
        },
        {
          phase: 'UPDATE',
          duration: 1400,
          done: valid
            ? `The browser stores ${short(id)}. The server stores the matching record. These are different stores.`
            : 'The browser rejects this policy: Secure needs HTTPS; SameSite=None needs Secure. The server record still exists.'
        }
      )
    ];
  }
  function eligible(s, scenario = 'same') {
    if (!s.jar) return { token: null, reason: 'There is no cookie in this browser.' };
    if (s.jar.secure && s.opts.transport === 'HTTP')
      return { token: null, reason: 'Secure excludes this plain HTTP request.' };
    if (scenario === 'other-host')
      return {
        token: null,
        reason: 'other.test does not match this host-only shop.example cookie.'
      };
    if (scenario === 'cross-post' && s.jar.sameSite !== 'None')
      return {
        token: null,
        reason: `Explicit SameSite=${s.jar.sameSite} excludes this cross-site POST.`
      };
    if (scenario === 'cross-get' && s.jar.sameSite === 'Strict')
      return { token: null, reason: 'SameSite=Strict excludes this cross-site navigation.' };
    return {
      token: s.jar.id,
      reason:
        scenario === 'cross-get'
          ? `SameSite=${s.jar.sameSite} allows this top-level safe GET. Host and path match.`
          : 'Host shop.example and Path=/ match; scheme and SameSite policy permit attachment.'
    };
  }
  function account(s, { replay = false, scenario = 'same' } = {}) {
    const e = replay
      ? {
          token: captured(s),
          reason: 'An independent client sets its own Cookie header from the captured copy.'
        }
      : eligible(s, scenario);
    const ok = accepts(s, e.token),
      who = replay ? 'observer' : 'browser';
    const reason = !e.token
      ? 'No session ID was supplied.'
      : !s.session || e.token !== s.session.id
        ? 'The supplied ID has no matching server record.'
        : !active(s)
          ? `The matching record is ${s.session.status === 'active' ? 'expired' : s.session.status}.`
          : 'The ID matches an active record for Alice.';
    if (replay && !e.token)
      return [
        event(
          'No copy to replay',
          'No captured token exists. First create an HTTP exchange with the observer in the path.',
          (x) => {
            x.attackerResult = 'No captured token';
          },
          { duration: 1300, done: 'No replay was sent: there is no captured session ID.' }
        )
      ];
    return [
      event(
        replay ? 'Prepare a replay' : 'Choose the cookie',
        e.reason,
        (x) => {
          if (replay) x.attackerResult = null;
          else x.browser = 'waiting';
          x.lookup = null;
        },
        {
          phase: 'PREPARE',
          duration: 1500,
          done: `${e.reason} ${e.token ? 'Selected: ' + short(e.token) : 'Cookie header omitted.'}`
        }
      ),
      ...trip(s, {
        from: who,
        to: 'server',
        label: scenario === 'cross-post' ? 'POST /account' : 'GET /account',
        detail: e.token ? short(e.token) : 'no Cookie header',
        token: e.token,
        copy: !replay && !!e.token,
        arrive: (x) => {
          x.request = {
            line: scenario === 'cross-post' ? 'POST /account' : 'GET /account',
            header: e.token ? 'Cookie: session=' + e.token : '(Cookie header absent)',
            transport: x.opts.transport,
            client: replay ? 'Attacker · 172.28.0.30' : 'Alice · 172.28.0.20'
          };
          x.serverOp = 'Request received';
          x.serverDetail = 'Request arrived. Authentication has not been decided yet.';
        },
        done: 'The request arrived. The server can now look up the supplied session ID.'
      }),
      event(
        'Look up the ID',
        'The server checks the supplied ID against its own session store.',
        (x) => {
          x.lookup = { token: e.token, ok, reason, client: replay ? 'Attacker' : 'Alice' };
          x.serverOp = ok ? 'Lookup → Alice' : 'Lookup → refused';
          x.serverDetail = reason;
        },
        {
          phase: 'LOOKUP',
          duration: 1900,
          done: `${ok ? 'Lookup succeeds.' : 'Lookup fails.'} ${reason} The client still awaits the response.`
        }
      ),
      ...trip(s, {
        from: 'server',
        to: who,
        label: ok ? '200 OK' : '401 Unauthorized',
        detail: ok ? 'Alice’s account' : 'authentication required',
        kind: replay ? 'leak' : '',
        arrive: (x) => {
          x.response = {
            line: ok ? '200 OK' : '401 Unauthorized',
            header: 'Content-Type: application/json',
            transport: x.opts.transport
          };
          if (replay) x.attackerResult = ok ? '200 · Alice’s account' : '401 · Access denied';
          else x.browser = ok ? 'account' : 'denied';
        },
        done: ok
          ? `${replay ? 'The attacker’s client' : 'Alice’s browser'} receives 200 and displays Alice’s account. The valid bearer token was sufficient under this policy.`
          : `${replay ? 'The attacker’s client' : 'Alice’s browser'} receives 401. ${reason}`
      })
    ];
  }
  const deletion = () =>
    event(
      'Delete browser copy',
      'Alice deletes the cookie in her own browser. No request is sent to the server.',
      (s) => {
        s.jar = null;
        s.browser = 'local-cleared';
      },
      {
        phase: 'DELETE',
        duration: 1600,
        done: 'The browser cookie is gone. The server record and captured copies are unchanged.'
      }
    );
  const invalidate = () =>
    event(
      'Invalidate on server',
      'The server operator revokes this session record.',
      (s) => {
        if (s.session) s.session.status = 'revoked';
        s.serverOp = 'Session revoked';
        s.serverDetail = 'All clients using this ID will fail the next lookup.';
      },
      {
        phase: 'REVOKE',
        duration: 1700,
        done: 'The server marks the session revoked. Copies still exist, but the server will no longer accept them.'
      }
    );
  const expire = () =>
    event(
      'Advance server clock',
      'Advance the simulated server clock by 31 minutes.',
      (s) => {
        s.clock += 31;
        if (s.session && s.clock >= s.session.expires) s.session.status = 'expired';
        s.serverOp = 'Session expired';
        s.serverDetail = 'The server’s lifetime has ended. Browser storage is separate.';
      },
      {
        phase: 'EXPIRE',
        duration: 1700,
        done: 'The server session has expired. The browser cookie and captured ID are still present.'
      }
    );
  function established(opts = defaults()) {
    let s = initial(opts);
    for (const b of [...loginRequest(s), ...issue(s)]) b.apply(s);
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
      'The setup',
      'A password gets you in. What keeps you in?',
      'Follow one session ID through a fictional shop. Establish where identity is stored, then watch what happens when someone copies the reference.',
      'Find the browser, server and observer. The browser jar and server session store are different places.',
      [
        event(
          'Meet the system',
          'Alice’s browser and shop.example are separate participants. Inspect either one to see its role.',
          () => {},
          {
            phase: 'ORIENT',
            duration: 1800,
            done: 'The browser has no cookie. The server has no session. The observer sees traffic only if explicitly in the path.'
          }
        )
      ]
    );
    add(
      'Credentials',
      'First, prove who you are.',
      'Alice submits credentials. Nothing is verified until the request arrives. Over HTTP, a suitably positioned observer can read the password as well as cookies.',
      'What can the observer see before a session even exists?',
      loginRequest(s)
    );
    add(
      'Two stores',
      'One ID. Two very different places.',
      'After verifying the password, the server creates a session record. Set-Cookie carries its ID back; the browser stores the cookie, not the server record.',
      'Inspect the mint ticket in the response, browser jar and session record.',
      issue(s)
    );
    add(
      'The lookup',
      'The next request carries a reference.',
      'The browser selects an eligible cookie. The server looks up its ID, decides whether to accept the request, then returns a response. Follow both directions.',
      'Set-Cookie creates browser storage. Cookie sends back a name and value; attributes are not echoed.',
      account(s)
    );
    add(
      'The replay',
      captured(s) ? 'A copy can be enough.' : 'No captured copy. No replay.',
      captured(s)
        ? 'A different client sends the captured ID. This server can see a different address, but its authentication policy accepts any active bearer token.'
        : 'In this scenario the observer has no token. With HTTPS, or outside the traffic path, this observer cannot obtain a readable ID. Explore a fresh HTTP exchange to compare.',
      'A session ID is not proof that a request came from Alice’s browser.',
      account(s, { replay: true })
    );
    const tls = event(
      'Protect the connection',
      'Switch the next exchange to HTTPS. History does not change.',
      (x) => {
        x.opts.transport = 'HTTPS';
      },
      {
        phase: 'CONFIGURE',
        duration: 1500,
        done: 'New exchanges use TLS. IDs already captured over HTTP remain in the observer’s possession.'
      }
    );
    const secure = clone(s);
    tls.apply(secure);
    add(
      'TLS & limits',
      'Protect the journey. Remember the copies.',
      captured(s)
        ? 'HTTPS hides the next exchange from this network observer. It does not revoke a token already stolen. Replay the old copy over the protected connection.'
        : 'The protected exchange exposes no readable cookie to this observer. No captured token is available to replay. TLS protects transport; it would not revoke a copy stolen earlier.',
      'TLS protects transport. Secure keeps cookies off HTTP. Neither revokes an existing stolen ID.',
      [tls, ...account(secure), ...account(secure, { replay: true })]
    );
    const revoked = clone(s);
    invalidate().apply(revoked);
    add(
      'End a session',
      'Make the reference stop working.',
      'Server invalidation changes the answer to the lookup. The token can still be present in several places; its presence no longer means access.',
      'Predict which store an action changes. Explore or Test your thinking to check your explanation.',
      [invalidate(), ...account(revoked, { replay: true })]
    );
    return list;
  }
  const challenge = (short, question, context, hint, options, run) => ({
    short,
    question,
    context,
    hint,
    options: options.map(([text, reason]) => ({ text, reason })),
    correct: 0,
    setup: () => established(),
    run,
    evidence: (s) =>
      `Browser: ${s.jar ? 'cookie present' : 'no cookie'}; server: ${s.session?.status}; captured copies: ${s.captures.length}; replay: ${s.attackerResult || 'not sent'}; lookup: ${s.lookup?.reason || 'not performed'}`
  });
  const challenges = [
    challenge(
      'Delete a copy',
      'Alice deletes her cookie. Does the stolen copy still work?',
      'The observer already captured a valid ID. Alice clears browser storage without sending a logout request.',
      'Which machine changes when someone clears browser storage?',
      [
        [
          'Yes, the attacker still gets Alice’s account.',
          'Only the browser copy was deleted. The attacker supplies the same ID, and the server’s active record still maps it to Alice.'
        ],
        [
          'No, deleting a cookie ends the session everywhere.',
          'Browser deletion cannot reach another client or change a server record. Replay succeeds because the server has not invalidated the ID.'
        ],
        [
          'Only if the attacker knows Alice’s password.',
          'The password established identity at login. This request authenticates with the ID alone; no password check is repeated.'
        ]
      ],
      (s) => {
        const x = clone(s);
        deletion().apply(x);
        return [deletion(), ...account(x, { replay: true })];
      }
    ),
    challenge(
      'Add TLS',
      'Will HTTPS disable an already-stolen ID?',
      'The ID was copied during an earlier HTTP exchange. The attacker now sends its copy over HTTPS.',
      'Transport encryption changes visibility. Does it change the session record?',
      [
        [
          'No. The active token can still be replayed.',
          'TLS protects the new connection, including the attacker’s connection. The old copy remains valid until the server expires or invalidates it.'
        ],
        [
          'Yes. HTTPS encrypts all existing copies.',
          'TLS does not reach into another client’s storage or rewrite past captures. The server still accepts this active token.'
        ]
      ],
      (s) => {
        const x = clone(s);
        x.opts.transport = 'HTTPS';
        return [
          event(
            'Enable HTTPS',
            'Protect the next connection.',
            (z) => {
              z.opts.transport = 'HTTPS';
            },
            { done: 'HTTPS enabled; captured history retained.' }
          ),
          ...account(x, { replay: true })
        ];
      }
    ),
    challenge(
      'Alter the ID',
      'What if Alice changes one character of the cookie?',
      'Only Alice’s browser value changes. The server record and captured copy stay unchanged.',
      'Does the server decode identity from the token, or look up an exact key?',
      [
        [
          'The lookup fails; the altered ID is unknown.',
          'An ID is an opaque key, not an editable identity document. The altered value has no server record, so this request gets 401. The original stolen copy still works.'
        ],
        [
          'The server repairs the ID using Alice’s address.',
          'This policy does not infer the session from an address or repair near matches. It requires the exact active ID.'
        ]
      ],
      (s) => {
        const x = clone(s);
        x.jar.id = '0' + x.jar.id.slice(1);
        return [
          event(
            'Alter browser token',
            'Change one character in the browser’s ID.',
            (z) => {
              z.jar.id = x.jar.id;
            },
            { done: 'Only the browser value changed. The server key did not.' }
          ),
          ...account(x)
        ];
      }
    ),
    challenge(
      'Revoke access',
      'The server revokes the session. What happens to replay?',
      'The attacker still holds the original ID. The browser also still stores its cookie.',
      'Possession is necessary here. What else does the server check?',
      [
        [
          '401: the record is no longer active.',
          'Validity is checked as well as the key. Revocation stops every copy from authenticating without having to erase those copies.'
        ],
        [
          '200: a copied token always works.',
          'A bearer token works only while the server accepts it. The ID is present, but its session is revoked, so access is refused.'
        ]
      ],
      (s) => {
        const x = clone(s);
        invalidate().apply(x);
        return [invalidate(), ...account(x, { replay: true })];
      }
    ),
    challenge(
      'Choose a defence',
      'Which attribute stops this script from reading the cookie?',
      'Assume JavaScript is executing in shop.example through XSS. Test a document.cookie read.',
      'This is a script-access threat, not network interception.',
      [
        [
          'HttpOnly',
          'HttpOnly excludes this cookie from document.cookie. XSS can still send authenticated requests; fixing XSS remains essential.'
        ],
        [
          'Secure',
          'Secure restricts transport, not script reads. HttpOnly is the attribute for this read, though it does not make XSS harmless.'
        ],
        [
          'SameSite=Strict',
          'SameSite controls cross-site cookie attachment. Code already executing in the site is a different threat; HttpOnly blocks this read.'
        ]
      ],
      (s) => [
        event(
          'Apply HttpOnly',
          'Compare the same script read with HttpOnly enabled.',
          (x) => {
            x.jar.httpOnly = true;
            x.policyResult =
              'document.cookie excludes the session cookie. Authenticated requests remain possible.';
          },
          {
            done: 'HttpOnly blocks this cookie read through document.cookie. XSS can still issue requests.'
          }
        )
      ]
    )
  ];
  challenges.forEach((c, i) => {
    if (i % 2) {
      c.options.reverse();
      c.correct = c.options.length - 1;
    }
  });
  challenges[4].evidence = (s) => s.policyResult;
  challenges[2].evidence = (s) =>
    `${s.response?.line}; ${s.lookup?.reason} Server ID: ${s.session.id}; browser ID: ${s.jar.id}`;
  function board(s) {
    const status = {
      'signed-out': 'No authenticated request yet.',
      'local-cleared': 'Local cookie removed · no request sent.',
      waiting: 'Request in progress · waiting for a response.',
      'response-arrived': 'Response received · processing cookie.',
      'signed-in': 'Cookie stored · ready for the next request.',
      account: 'Received 200 · Alice’s account',
      denied: '401 · Please sign in',
      'cookie-rejected': 'Cookie policy rejected.'
    }[s.browser];
    const site = `<div class="browser-site"><div class="site-brand"><span>Fern & Field</span><span>shop.example</span></div><h3>${s.browser === 'account' ? 'Hello, Alice.' : 'Your account.'}</h3>${s.browser === 'account' ? '<p>Your orders and account details.</p>' : `<p>A fictional sign-in. Inspect the credentials.</p>${inspect('password', '<small>EMAIL + PASSWORD</small>alice@example.test<br>springtime42', 'credential')}`}<div class="site-result ${s.browser === 'denied' || s.browser === 'cookie-rejected' ? 'denied' : s.browser === 'waiting' ? 'pending' : ''}">${esc(status)}</div></div>`;
    const jar = `<div class="field-title">${inspect('jar', 'Browser cookie jar')}<span class="scope">shop.example</span></div>${s.jar ? ticket(s.jar.id, 'session', s.session && s.jar.id !== s.session.id ? 'altered' : '') + `<div class="attributes">${inspect('secure', s.jar.secure ? 'Secure ✓' : 'Secure —', `attribute ${s.jar.secure ? 'enabled' : ''}`)}${inspect('httpOnly', s.jar.httpOnly ? 'HttpOnly ✓' : 'HttpOnly —', `attribute ${s.jar.httpOnly ? 'enabled' : ''}`)}${inspect('sameSite', 'SameSite=' + s.jar.sameSite, 'attribute')}</div><p class="state-note">Path=/ · host-only · session cookie<br>No Max-Age or Expires. Browser lifetime ≠ server lifetime.</p>` : empty('No cookie stored.<small>Deleting this copy does not delete a server record.</small>')}`;
    const observer = `<p class="capture-status">${esc(s.observation)}</p>${captured(s) ? ticket(captured(s), 'SELECTED CAPTURED COPY') + `<label class="capture-choice">Replay this copy <select id="captured-choice">${[...new Set(s.captures.map((x) => x.id))].map((id) => `<option value="${id}" ${id === captured(s) ? 'selected' : ''}>${short(id)}</option>`).join('')}</select></label>` : empty('No session ID captured.')}<p class="capture-meta">${s.captures.length ? `${s.captures.length} readable observation${s.captures.length === 1 ? '' : 's'} · latest from ${esc(s.captures.at(-1).via)} over HTTP` : 'No token history yet.'}${s.credentials ? '<br>Earlier HTTP login exposed the password.' : ''}</p>${s.attackerResult ? `<div class="result-strip ${s.attackerResult.startsWith('401') ? 'fail' : ''}">${esc(s.attackerResult)}</div>` : ''}`;
    const channel = `<div class="channel"><div class="channel-heading">${inspect('transport', s.opts.transport === 'HTTPS' ? '▧ HTTPS / TLS' : 'HTTP / readable')}</div><span data-port="tap" style="position:absolute;left:50%;top:100px;width:1px;height:1px" aria-hidden="true"></span><div class="route"><span class="route-direction" aria-hidden="true">⇄</span><b>${s.opts.transport === 'HTTPS' ? 'Plaintext → ciphertext → plaintext' : 'Browser ⇄ shop.example'}</b><p>${s.opts.transport === 'HTTPS' ? 'Endpoints read the content. A network observer cannot.' : 'Follow the message. Then follow the copy.'}</p></div>${node('observer', 'Network observer', s.opts.inPath ? 'explicitly in the traffic path' : 'outside the traffic path', observer)}</div>`;
    const store = `<div class="field-title">${inspect('session', 'Server session store')}<span class="scope">clock +${s.clock}m</span></div>${s.session ? `<div class="record ${active(s) ? '' : 'revoked'}">${ticket(s.session.id, 'LOOKUP KEY')}<div class="record-row"><span>identity</span><b>Alice</b></div><div class="record-row"><span>validity</span>${pill(active(s) ? 'ACTIVE' : s.session.status.toUpperCase(), active(s) ? 'good' : 'bad')}</div><div class="record-row"><span>expires</span><b>server clock +${s.session.expires}m</b></div></div>` : empty('No session record.<small>Created only after password verification.</small>')}`;
    const server = `<div class="operation"><div class="op-label">SERVER’S CURRENT STATE</div>${inspect('lookup', esc(s.serverOp), 'op-value')}<p class="op-explain">${esc(s.serverDetail)}</p>${s.request ? `<div class="state-note">${inspect('request', `Last request: <strong>${esc(s.request.line)}</strong>`)}<br>${esc(s.request.client)} · ${s.request.transport}</div>` : ''}</div>${store}${s.response ? `<div class="state-note">${inspect('response', `Last response: <strong>${esc(s.response.line)}</strong>`)}</div>` : ''}${s.policyResult ? `<div class="result-strip">${esc(s.policyResult)}</div>` : ''}`;
    return (
      node('browser', 'Alice’s browser', 'client · 172.28.0.20', site + jar) +
      channel +
      node('server', 'shop.example', 'server · 172.28.0.10', server)
    );
  }
  function controls(settings, s) {
    return `<div class="control-row"><span class="control-label">Connection</span><label>Transport <select id="transport"><option ${s.opts.transport === 'HTTP' ? 'selected' : ''}>HTTP</option><option ${s.opts.transport === 'HTTPS' ? 'selected' : ''}>HTTPS</option></select></label><label><input type="checkbox" id="in-path" ${s.opts.inPath ? 'checked' : ''}> Observer in path</label><span class="control-divider"></span><button data-action="signin">Sign in / create session</button><button data-action="request">Request /account</button><button data-action="replay-token">Replay captured ID</button></div><div class="control-row"><span class="control-label">Change one store</span><button data-action="delete">Delete browser cookie</button><button data-action="alter">Alter browser ID</button><button data-action="logout">Server logout</button><button data-action="revoke">Invalidate on server</button><button data-action="expire">Advance server +31m</button></div><p class="bench-note">Connection changes keep captures. A new sign-in replaces this lab’s one active session. Restart lab explicitly clears history.</p><details><summary>Cookie-policy bench: Secure, HttpOnly & SameSite</summary><p>Choose attributes for a fresh cookie, then restart this experiment over HTTPS. The cookie is host-only for <code>shop.example</code>, <code>Path=/</code>, with explicit SameSite. Cross-site cases start at <code>https://outside.test</code>; no extra browser restrictions are simulated.</p><div class="control-row"><label><input type="checkbox" id="policy-secure" checked> Secure</label><label><input type="checkbox" id="policy-httponly" checked> HttpOnly</label><label>SameSite <select id="policy-samesite"><option>Strict</option><option selected>Lax</option><option>None</option></select></label><button data-action="policy-start">Restart with this policy (HTTPS)</button></div><div class="control-row"><label>Request context <select id="request-context"><option value="same">Same-site /account GET</option><option value="cross-get">Cross-site top-level GET</option><option value="cross-post">Cross-site top-level POST</option><option value="other-host">GET to other.test</option></select></label><button data-action="policy-request">Test attachment</button><button data-action="script-read">Test document.cookie</button></div><p class="bench-note">Issue a Secure cookie, then switch to HTTP to see it withheld. HttpOnly does not stop script-triggered requests. SameSite is defence in depth, not a complete CSRF defence.</p></details>`;
  }
  function action(name, app) {
    let s = clone(app.player.state);
    app.player.stop();
    const run = (beats, title) => app.run(beats, s, title),
      fail = (txt) =>
        run([event('Prerequisite', txt, () => {}, { duration: 1000 })], 'Prerequisite');
    if (name === 'signin') {
      const req = loginRequest(s),
        x = clone(s);
      req.forEach((b) => b.apply(x));
      return run([...req, ...issue(x)], 'Sign in');
    }
    if (name === 'request') return run(account(s), 'Authenticated request');
    if (name === 'replay-token') return run(account(s, { replay: true }), 'Replay a copy');
    if (name === 'delete') return run([deletion()], 'Delete browser copy');
    if (name === 'alter') {
      if (!s.jar) return fail('Sign in first: this browser has no cookie to alter.');
      return run(
        [
          event(
            'Alter the ID',
            'Change one character of the browser cookie; leave other copies alone.',
            (x) => {
              x.jar.id = (x.jar.id[0] === '0' ? '1' : '0') + x.jar.id.slice(1);
            },
            { done: 'Only the browser value changed. Request /account to test the lookup.' }
          )
        ],
        'Alter an ID'
      );
    }
    if (name === 'revoke')
      return s.session
        ? run([invalidate()], 'Server invalidation')
        : fail('No server session exists yet. Sign in first.');
    if (name === 'expire')
      return s.session
        ? run([expire()], 'Server expiry')
        : fail('No server session exists yet. Sign in first.');
    if (name === 'logout') {
      const token = eligible(s).token,
        ok = accepts(s, token);
      return run(
        [
          ...trip(s, {
            label: 'POST /logout',
            token,
            arrive: (x) => {
              x.serverOp = 'Logout request received';
            },
            done: 'Logout arrived. The server checks its ID.'
          }),
          event(
            'End server session',
            ok
              ? 'Invalidate the identified session.'
              : 'This request identifies no active session.',
            (x) => {
              if (ok) x.session.status = 'revoked';
              x.serverOp = ok ? 'Session revoked' : 'No session identified';
              x.serverDetail = ok
                ? 'Invalidated before the response.'
                : 'Without a valid ID this logout cannot identify the stolen session.';
            },
            {
              done: ok
                ? 'Server session invalidated. The browser awaits the response.'
                : 'No record invalidated: this request supplied no valid session ID.'
            }
          ),
          ...trip(s, {
            from: 'server',
            to: 'browser',
            label: '200 · clear cookie',
            detail: 'Set-Cookie: session=; Max-Age=0',
            arrive: (x) => {
              x.jar = null;
              x.browser = 'signed-out';
              x.response = {
                line: '200 OK',
                header: 'Set-Cookie: session=; Path=/; Max-Age=0',
                transport: x.opts.transport
              };
            },
            done: 'The browser receives the response and removes its cookie. Server validity depends on whether the logout identified an active session.'
          })
        ],
        'Server logout'
      );
    }
    if (name === 'policy-start') {
      const opts = {
        transport: 'HTTPS',
        inPath: true,
        secure: document.getElementById('policy-secure').checked,
        httpOnly: document.getElementById('policy-httponly').checked,
        sameSite: document.getElementById('policy-samesite').value
      };
      s = initial(opts);
      app.settings = clone(opts);
      app.journey = app.config.journey(opts);
      document.getElementById('transport').value = 'HTTPS';
      document.getElementById('in-path').checked = true;
      const req = loginRequest(s),
        x = clone(s);
      req.forEach((b) => b.apply(x));
      return run([...req, ...issue(x)], 'Fresh cookie policy');
    }
    if (name === 'policy-request') {
      const scenario = document.getElementById('request-context').value;
      if (scenario === 'other-host')
        return run(
          [
            event(
              'Host mismatch',
              'The shop.example cookie does not match other.test.',
              (x) => {
                x.policyResult =
                  'Cookie withheld from other.test: host mismatch. No shop.example lookup occurs.';
              },
              {
                done: 'An other.test request carries no shop.example cookie. It is not sent to the shop.example server in this model.'
              }
            )
          ],
          'Host matching'
        );
      return run(account(s, { scenario }), 'Cookie attachment');
    }
    if (name === 'script-read')
      return run(
        [
          event(
            'Script reads cookies',
            'JavaScript executing in shop.example reads document.cookie.',
            (x) => {
              x.policyResult = !x.jar
                ? 'No cookie exists.'
                : x.jar.httpOnly
                  ? 'Session cookie excluded by HttpOnly. XSS can still send authenticated requests.'
                  : 'Readable by script: session=' + x.jar.id;
            },
            {
              done: !s.jar
                ? 'No cookie exists to read.'
                : s.jar.httpOnly
                  ? 'HttpOnly hides this cookie from document.cookie. It does not make XSS harmless.'
                  : 'Without HttpOnly, this script can read the session cookie.'
            }
          )
        ],
        'Script access'
      );
  }
  const value = (label, text) =>
    `<div class="value-box"><strong>${label}</strong>${esc(text).replace(/\n/g, '<br>')}</div>`;
  function inspection(key, s, app) {
    const t = app.inspectorTrigger?.dataset.match || s.jar?.id || s.session?.id || captured(s),
      f = app.player.beat?.flight || s.lastPacket;
    return {
      browser: {
        title: 'The browser holds a reference.',
        body: `<p>Alice’s browser sends requests and renders responses. Its cookie jar holds a name, value and attachment rules. It does not hold the server’s session record.</p>${value('CURRENT COOKIE', s.jar ? 'session=' + s.jar.id : 'No cookie stored')}<p>Clearing this jar affects this browser. It sends no revocation message to the server.</p>`,
        detail:
          'Browsers may restore session cookies across restarts. Closing a tab is not reliable session termination.'
      },
      server: {
        title: 'Identity lives behind the lookup.',
        body: `<p>shop.example verifies the password, then keeps an ID → identity record. Later it checks the supplied ID and record validity.</p>${value('CURRENT STATE', s.serverOp + '\n' + s.serverDetail)}<p>The server can observe client properties such as IP addresses. This policy does not bind the session to them, so a valid copied token is accepted.</p>`
      },
      observer: {
        title: s.opts.inPath ? 'In the path, by assumption.' : 'Outside this traffic path.',
        body: `<p>Being on the same network does not automatically expose this exchange. “In path” models a position such as a controlled access point.</p>${value('LATEST OBSERVATION', s.observation)}${captured(s) ? value('CAPTURE HISTORY', s.captures.map((x) => short(x.id) + ' · ' + x.via + ' · ' + x.transport).join('\n')) : ''}<p>HTTPS protects new traffic. Saved copies from earlier HTTP exchanges remain.</p>`,
        detail:
          'Secure and SameSite constrain browser behaviour. An attacker who has a value can construct its own Cookie header.'
      },
      password: {
        title: 'HTTP exposes the password, too.',
        body:
          value('FICTIONAL LOGIN', 'alice@example.test\nspringtime42') +
          '<p>Alice supplies the password. It exists in the form and, after arrival, at the server endpoint. An in-path observer can read it over HTTP.</p><p>The password establishes identity. The session ID refers back to that identity. The companion lab explains password verification.</p>'
      },
      token: {
        title: 'Same ID. Multiple copies.',
        match: t,
        body:
          value('INSPECTED ID', t || 'No ID created yet') +
          `<p>The server creates an opaque bearer token after verification. It becomes a server key, a browser cookie value and possibly an attacker’s copy. It is not an encrypted password.</p><p>Server record: <b>${s.session?.status || 'absent'}</b>. Browser copy: <b>${s.jar ? 'present' : 'absent'}</b>. Captured copy: <b>${captured(s) ? 'present' : 'absent'}</b>.</p><p>${t && s.session && t !== s.session.id ? 'This inspected value does not match the server key.' : 'Matching visible representations are highlighted behind this inspector.'}</p>`,
        detail:
          'These fixed 128-bit IDs are teaching examples. Real applications must generate unpredictable tokens with a cryptographically secure random generator.'
      },
      jar: {
        title: 'Browser storage is not the session store.',
        body:
          value('BROWSER COOKIE', s.jar ? setCookie(s.jar.id, s.jar) : 'Empty') +
          '<p>The browser processes Set-Cookie, then uses host, path, transport and browser policy to select cookies. Cookie sends only name/value pairs.</p><p><code>shop.example</code> names the fictional website. This cookie jar is separate from JavaScript’s <code>localStorage</code> API; the hostname does not name a storage location.</p><p>This example has no Max-Age or Expires. Browser expiry and server expiry are distinct. Expiring or deleting the browser copy does not invalidate another copy.</p>'
      },
      session: {
        title: 'The record this ID selects.',
        match: s.session?.id,
        body:
          value(
            'SERVER RECORD',
            s.session
              ? `${s.session.id} → Alice\nstatus=${s.session.status}\nexpires at clock +${s.session.expires}m\ncurrent clock +${s.clock}m`
              : 'No record yet'
          ) +
          '<p>The server creates and owns this record. Invalidation here affects every copy. The browser cannot directly edit this table.</p>'
      },
      lookup: {
        title: 'An exact key, then a validity check.',
        match: s.lookup?.token,
        body:
          value(
            'LATEST LOOKUP',
            s.lookup ? `${s.lookup.token || '(no token)'}\n${s.lookup.reason}` : s.serverOp
          ) +
          '<p>Missing, altered, expired and revoked IDs cannot authenticate this request. A valid matching ID identifies Alice under this policy. Authorisation is a further decision about what Alice may do.</p>'
      },
      transport: {
        title:
          s.opts.transport === 'HTTPS'
            ? 'TLS hides content in transit.'
            : 'HTTP leaves content readable.',
        body: '<p>Endpoints handle plaintext HTTP messages. TLS encrypts bytes between them. Over HTTP an in-path observer can read the body and headers, including credentials, Set-Cookie and Cookie.</p><p>HTTPS does not revoke stolen tokens. Secure prevents browsers sending that cookie on a later HTTP request.</p>',
        detail:
          'Network endpoints, sizes and timing remain observable with TLS. Server names may be visible unless mechanisms such as ECH protect them. This lock animation is conceptual, not a TLS implementation.'
      },
      secure: {
        title: 'Secure: restrict the transport.',
        body: `<p>For shop.example, Secure permits browser attachment over HTTPS and withholds the cookie over HTTP. It does not encrypt saved copies.</p>${value('CURRENT COOKIE', s.jar ? `Secure=${s.jar.secure}` : 'No cookie')}<p>Set a Secure cookie over HTTPS in the bench, switch to HTTP, then request /account.</p>`,
        detail:
          'shop.example is not localhost. Browsers have special localhost treatment. This model rejects Secure cookies received over insecure transport.'
      },
      httpOnly: {
        title: 'HttpOnly: block this script read.',
        body: `<p>HttpOnly excludes the cookie from document.cookie. The browser still attaches it to eligible requests, including script-triggered requests.</p>${value('CURRENT COOKIE', s.jar ? `HttpOnly=${s.jar.httpOnly}` : 'No cookie')}<p>XSS can still send authenticated requests and read page content. HttpOnly does not make XSS harmless or hide HTTP traffic.</p>`
      },
      sameSite: {
        title: 'SameSite: request context matters.',
        body: `<p>The bench uses explicit values and top-level requests starting on a different site.</p><ul><li><b>Strict:</b> withhold on cross-site navigation.</li><li><b>Lax:</b> allow a top-level safe GET; withhold on cross-site POST.</li><li><b>None:</b> no SameSite exclusion; Secure is required.</li></ul>${value('CURRENT COOKIE', s.jar ? 'SameSite=' + s.jar.sameSite : 'No cookie')}<p>SameSite is not universal CSRF protection. Keep state changes off GET and use appropriate request validation and CSRF defences.</p>`,
        detail:
          'Site and origin differ. The bench excludes default-Lax grace periods, third-party restrictions, embedded contexts, redirects and same-site sibling-host attacks. Actual browsers may be more restrictive.'
      },
      request: {
        title: 'Cookie travels toward the server.',
        body:
          value(
            'LAST ARRIVED REQUEST',
            s.request
              ? `${s.request.line} HTTP/1.1\nHost: shop.example\n${s.request.header}\n${s.request.client} · ${s.request.transport}`
              : 'None yet'
          ) +
          '<p>Cookie carries selected name/value pairs. The attributes are browser metadata and are not echoed.</p>' +
          (s.issuedResponse ? value('COMPARE: SIGN-IN SET-COOKIE', s.issuedResponse.header) : '') +
          inspect('cookie-field', 'Inspect the Cookie field') +
          inspect('host-field', 'Inspect Host')
      },
      response: {
        title: 'Set-Cookie travels toward the browser.',
        body:
          value(
            'LAST ARRIVED RESPONSE',
            s.response
              ? `${s.response.line}\n${s.response.header}\ntransport: ${s.response.transport}`
              : 'None yet'
          ) +
          '<p>Set-Cookie asks the browser to store the cookie and attributes. A later Cookie header sends the selected name/value pair back.</p>' +
          (s.issuedResponse ? value('SIGN-IN SET-COOKIE', s.issuedResponse.header) : '') +
          (s.request ? value('COMPARE: LAST REQUEST', s.request.header) : '') +
          inspect('set-cookie-field', 'Inspect Set-Cookie') +
          inspect('status-field', 'Inspect the status code')
      },
      'cookie-field': {
        title: 'Cookie: a name and a value.',
        body:
          value('LAST ARRIVED REQUEST', s.request?.header || 'No request yet') +
          '<p>The browser selects eligible cookies and serialises their name/value pairs. It does not send their stored Secure, HttpOnly or SameSite attributes. This server extracts the session value for its lookup.</p>'
      },
      'set-cookie-field': {
        title: 'Set-Cookie: storage instructions.',
        body:
          value('SIGN-IN RESPONSE', s.issuedResponse?.header || 'No sign-in response yet') +
          '<p>The server supplies a name/value pair and attributes. The browser applies its acceptance rules before storing it. Each cookie is set by its own Set-Cookie field; this differs from the later Cookie request field.</p>'
      },
      'host-field': {
        title: 'Host: the request’s destination.',
        body: '<p>In these HTTP/1.1 examples, Host: shop.example identifies the requested host. The browser’s host-only cookie also belongs to shop.example, so a request to other.test does not receive it. HTTP/2 and HTTP/3 use authority metadata differently.</p>'
      },
      'status-field': {
        title: 'The result travels in the response.',
        body:
          value('LAST RESPONSE STATUS', s.response?.line || 'No response yet') +
          '<p>200 represents success in this lab; 401 means this request did not authenticate. The client learns that result when the response arrives, not when the server first makes the decision.</p>'
      },
      packet: {
        title: f ? `${f.from} → ${f.to}` : 'No message in flight.',
        body: f
          ? value(f.label, f.payload || f.detail) +
            `<p>${f.tls ? 'These are endpoint contents. An observer on the TLS connection sees ciphertext.' : 'This exchange uses readable HTTP.'}</p><p>Receivers react after arrival. Clients display results after responses return.</p>`
          : '<p>Start a sequence, pause a packet, then inspect it.</p>'
      }
    }[key];
  }
  new K.Exhibit({
    id: 'cookie',
    number: '01',
    title: 'The cookie <em>is the key.</em>',
    subtitle:
      'A password gets Alice in. A small piece of data keeps her there. Follow it, copy it, and discover what actually ends a session.',
    stageTitle: 'SESSION AUTHENTICATION',
    home: '../index.html',
    cookieURL: 'index.html',
    argonURL: '../argon2id/index.html',
    defaults,
    initial,
    journey,
    board,
    controls,
    action,
    inspect: inspection,
    challenges,
    readParams: (s, q) => {
      if (q.get('https') === '1') s.transport = 'HTTPS';
      if (q.get('attacker') === '0') s.inPath = false;
    },
    exploreIntro: {
      title: 'Change a condition. Watch the lookup.',
      text: 'Start with the current state. Sign in if you need a session, then change one store or connection. Old captures stay old captures.'
    },
    challengeIntro: {
      title: 'Make a claim the system can test.',
      text: 'Predict, run the exchange, then inspect the evidence. Every challenge starts from an explicitly prepared scenario.'
    },
    takeaway: (s) =>
      s.lookup
        ? s.lookup.reason
        : 'Which store changed: browser cookie, server record, or captured copy?',
    change: (el, app) => {
      if (el.id === 'captured-choice') {
        const base = clone(app.player.state),
          id = el.value;
        app.run(
          [
            event(
              'Select a captured copy',
              'Choose which saved token the attacker will replay.',
              (x) => {
                x.replayToken = id;
              },
              {
                duration: 600,
                done: 'Selected captured ID: ' + short(id) + '. History is retained.'
              }
            )
          ],
          base,
          'Select a copy'
        );
        return;
      }
      if (!['transport', 'in-path'].includes(el.id)) return;
      const s = clone(app.player.state),
        v = el.id === 'transport' ? el.value : el.checked;
      app.run(
        [
          event(
            'Change connection',
            el.id === 'transport'
              ? `Use ${v} for subsequent exchanges.`
              : `Observer ${v ? 'enters' : 'leaves'} the path.`,
            (x) => {
              if (el.id === 'transport') x.opts.transport = v;
              else x.opts.inPath = v;
            },
            {
              duration: 750,
              done: 'Connection changed. Existing cookies, session validity and captured history are preserved.'
            }
          )
        ],
        s,
        'Connection setting'
      );
    },
    outcomes: [
      'Trace a session ID through creation, Set-Cookie, storage, Cookie and lookup.',
      'Predict missing, altered, expired and revoked-token outcomes.',
      'Explain why browser deletion or TLS does not revoke a stolen copy.',
      'Choose Secure, HttpOnly, SameSite or invalidation for a specified threat.'
    ],
    recap:
      'The session token refers to authenticated state. The browser decides when to attach its cookie; the server decides whether the reference is still valid. Password verifiers support the earlier identity check.',
    sources: {
      title: 'Sources & model boundaries.',
      body: '<p>A deterministic simulation: no requests or cookies leave the page. IDs and accounts are fictional. The 30-minute lifetime is chosen policy; the server clock advances only through its control.</p><ul><li><a href="https://www.rfc-editor.org/rfc/rfc6265.html#section-4.1">RFC 6265 §§4–5, 8</a>: cookie headers, scope and storage.</li><li><a href="https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-5.6.7">HTTPbis cookie draft -22</a>: explicit SameSite contexts.</li><li><a href="https://www.rfc-editor.org/rfc/rfc8446.html#section-5">RFC 8446 §5</a>: TLS record protection.</li><li><a href="https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html">OWASP Session Management</a>: expiry and invalidation.</li><li><a href="https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html">OWASP CSRF Prevention</a>: SameSite limits.</li></ul><p>One active session and one attacker keep the lesson focused. New sign-ins replace the active record. This is not a browser conformance test. Packets and time are conceptual.</p>'
    }
  });
})();
