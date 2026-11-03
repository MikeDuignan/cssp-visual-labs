(() => {
  'use strict';
  const K = LabKit,
    M = ArgonModel,
    { esc, inspect, pill, empty, event, node, clone } = K,
    { V } = M;
  const value = (label, text) =>
    `<div class="value-box"><strong>${label}</strong>${esc(text).replace(/\n/g, '<br>')}</div>`;
  const tag = (t, key = 'tag') => inspect(key, t.hex, 'tag', t.hex);
  const params = (p) => `m=${p.m}, t=${p.t}, p=${p.p}`;
  function phcHTML(r) {
    return `<div class="phc" aria-label="PHC verifier components">${inspect('algorithm', '$argon2id')}${inspect('version', '$v=19')}${inspect('parameters', `$m=${r.params.m},t=${r.params.t},p=${r.params.p}`)}${inspect('salt', '$' + V.saltB64[r.salt], 'salt')}${inspect('stored-tag', '$' + r.tag.b64, 'hash', r.tag.hex)}</div>`;
  }
  const bytes = (t, cls = '') =>
    `<div class="bytes ${cls}" aria-label="32 byte tag">${t.hex
      .match(/../g)
      .map((b) => `<span>${b}</span>`)
      .join('')}</div>`;
  function memory(s) {
    const a = s.memory,
      p = s.params;
    if (a.phase === 'released')
      return `<div class="memory-released">${inspect('memory', `${p.m / 1024} MiB work buffer released`)}<span>Temporary password discarded · verifier retained</span></div>`;
    return `<div class="memory-box"><span data-port="engine" class="engine-port" aria-hidden="true"></span><div class="memory-header">${inspect('memory', `${p.m / 1024} MiB workspace`)}<span class="pass-label" id="memory-phase">${!a.allocated ? 'not allocated' : a.pass ? `pass ${a.pass} / ${p.t}` : 'allocated'}</span></div><div class="allocation-meter" role="img" aria-label="${a.allocated ? p.m / 1024 : 0} MiB currently allocated on a 256 MiB scale"><span style="width:${a.allocated ? (p.m / 262144) * 100 : 0}%">${Array.from({ length: p.p }, () => '<i></i>').join('')}</span></div><p class="allocation-caption">${a.allocated ? p.m / 1024 + ' MiB allocated' : 'Not yet allocated'} <span>scale: 256 MiB</span></p><div class="memory-grid" aria-hidden="true">${Array.from({ length: p.p }, (_, lane) => `<div class="memory-lane"><span class="lane-label">L${lane}</span>${Array.from({ length: 8 }, (_, col) => `<span class="memory-cell ${a.allocated ? 'allocated' : ''} ${a.allocated && (a.pass > 1 || col < Math.ceil(a.fraction * 8)) ? 'filled' : ''}" data-lane="${lane}" data-cell="${col}"></span>`).join('')}</div>`).join('')}<svg class="memory-links" aria-hidden="true"><path class="previous-read"></path><path class="reference-read"></path><circle class="previous-read" r="3"></circle><circle class="reference-read" r="3"></circle></svg></div><div class="memory-legend"><span><i></i>previous</span><span><i class="ref"></i>reference</span><span><i class="new"></i>new block</span></div><div class="dependency" id="dependency">${a.phase === 'released' ? '<span>Work buffer released</span>' : a.phase === 'final' ? '<span>Final lane blocks</span> → <span>32-byte tag</span>' : '<span>Previous block</span> + <span>Reference block</span> → <span>New block</span>'}</div><p class="memory-note">Conceptual grid · ${p.p} lane${p.p === 1 ? '' : 's'} share ${p.m / 1024} MiB total. Each real block is 1 KiB. Visible cells group many blocks; references are illustrative.</p></div>`;
  }
  function board(s, app) {
    const states = {
      form: 'Ready to register',
      waiting: 'Waiting for the server’s response',
      created: '201 · Account created',
      verified: '200 · Password verified',
      denied: '401 · Incorrect credentials',
      limited: '429 · Try later'
    };
    const browser = `<div class="browser-site"><div class="site-brand"><span>Fern & Field</span><span>HTTPS · shop.example</span></div><h3>${s.browser === 'verified' ? 'Welcome back.' : s.browser === 'created' ? 'You’re registered.' : 'Your account.'}</h3><p>Example credentials · not a password recommendation</p>${inspect('password', `<small>PASSWORD SUPPLIED BY ALICE</small>${esc(V.passwords[s.clientPassword])}`, 'credential')}<div class="site-result ${s.browser === 'denied' || s.browser === 'limited' ? 'denied' : s.browser === 'waiting' ? 'pending' : ''}">${states[s.browser]}</div></div><div class="field-title">${inspect('browser', 'What the browser keeps')}</div><p class="state-note">The browser supplies the password for each login. It does not choose a salt or the server’s parameters.</p>${s.browser === 'verified' ? `<div class="state-note">${inspect('bridge', 'Next: create a session →')}</div>` : ''}`;
    const capacity = s.stolen
      ? Math.floor(((s.budget || 24) * 1024) / (s.stolen.params.m / 1024))
      : null;
    const observer = s.stolen
      ? `<div class="field-title">${inspect('stolen', 'Stolen PHC verifier')}</div><p class="capture-status">Salt + parameters + tag.<br>No plaintext password.</p><div class="attacker-capacity">${capacity.toLocaleString()}</div><p class="capacity-unit">full-memory guesses can fit</p><p class="capture-meta">${s.budget || 24} GiB ÷ ${s.stolen.params.m / 1024} MiB per guess<br>Memory-only ceiling, not a rate.</p><div class="capacity-bar" aria-hidden="true">${Array.from({ length: 24 }, () => '<i></i>').join('')}</div>${s.offline?.guesses ? `<div class="result-strip">${s.offline.guesses} local test${s.offline.guesses === 1 ? '' : 's'} · ${s.offline.ok ? 'MATCH' : 'NO MATCH'}</div>` : ''}`
      : empty(
          'No stolen verifier.<small>The offline experiment appears after a database copy arrives.</small>'
        );
    const channel = `<div class="channel"><div class="channel-heading">${inspect('transport', '▧ HTTPS / TLS')}</div><div class="route"><span class="route-direction" aria-hidden="true">⇄</span><b>Only the endpoints read it.</b><p>Request arrives first.<br>Server works. Response returns.</p></div>${node('observer', 'Offline attacker', s.stolen ? 'holds a database copy' : 'no database copy yet', observer)}</div>`;
    const inputs = `<div class="engine-inputs"><div class="engine-input password"><div class="field-title">PASSWORD / TEMPORARY</div>${s.password !== null ? inspect('server-password', esc(V.passwords[s.password])) : '<span class="state-note">Not present in server memory.</span>'}</div><div class="engine-input"><div class="field-title">${inspect('salt', 'SALT / PUBLIC')}</div>${s.salt !== null ? inspect('salt', `${V.salts[s.salt]}<small>Example ${s.salt ? 'B' : 'A'} · 16 bytes</small>`) : '<span class="state-note">Not selected yet.</span>'}</div></div>`;
    const parameterHTML = `<div class="memory-parameters">${inspect('memory', `m = ${s.params.m / 1024} MiB`, 'parameter')}${inspect('passes', `t = ${s.params.t} passes`, 'parameter')}${inspect('lanes', `p = ${s.params.p} lanes`, 'parameter')}</div>`;
    const comparison =
      s.tag &&
      s.stored &&
      (['verified', 'denied'].includes(s.browser) ||
        s.comparison ||
        app.player.beat?.compareMotion ||
        app.player.beat?.label === 'Produce the tag')
        ? `<div class="compare">${inspect('comparison', 'Compare the full tags')}<div class="byte-label">STORED · ${s.stored.tag.hex.slice(0, 8)}…</div>${bytes(s.stored.tag)}<div class="byte-label">CANDIDATE · ${s.tag.hex.slice(0, 8)}…</div>${bytes(s.tag, s.comparison ? `revealed ${s.comparison.ok ? '' : 'mismatch'}` : '')}<p class="compare-result ${s.comparison && !s.comparison.ok ? 'fail' : ''}">${s.comparison ? `${s.comparison.checked}/32 bytes checked · ${s.comparison.ok ? 'MATCH' : 'MISMATCH'} · no early exit` : 'Full comparison has not finished. No verdict yet.'}</p></div>`
        : '';
    const db = `<div class="db-box" style="position:relative"><span data-port="database" class="database-port" aria-hidden="true"></span><div class="field-title">${inspect('database', 'Users database')}<span class="scope">alice@example.test</span></div>${s.stored ? phcHTML(s.stored) + `<p class="state-note">No password stored. ${inspect('phc', 'Inspect the complete PHC string')}</p>` : '<p class="state-note">No verifier stored yet.</p>'}</div>`;
    const server = `<div class="field-title">${inspect('server', s.serverOp)}</div>${inputs}${parameterHTML}${memory(s)}${s.tag && !comparison ? `<div class="field-title">${inspect('tag', 'DERIVED TAG / 32 BYTES')}</div>${tag(s.tag)}` : ''}${comparison}${db}`;
    return (
      node('browser', 'Alice’s browser', 'client · supplies the password', browser) +
      channel +
      node('server', 'Verification server', 'Argon2id engine + users database', server)
    );
  }
  function frame(s, b, progress, app) {
    let fraction = s.memory.fraction,
      pass = s.memory.pass,
      phase = s.memory.phase;
    const inMotion = (app.player.running || app.player.elapsed > 0) && b?.memoryMotion;
    if (inMotion) {
      fraction = b.memoryMotion.from + (b.memoryMotion.to - b.memoryMotion.from) * progress;
      pass = b.memoryMotion.pass;
      phase = b.memoryMotion.kind;
    }
    const dependency =
      ((app.player.running || app.player.elapsed > 0) && b?.phase === 'DEPENDENCY') ||
      phase === 'dependency';
    const cur = Math.max(2, Math.min(7, Math.floor(fraction * 8))),
      ref = Math.max(0, cur - 3);
    document.querySelectorAll('.memory-cell').forEach((cell) => {
      const col = +cell.dataset.cell,
        lane = +cell.dataset.lane;
      const fill = s.memory.allocated && (pass > 1 || col < Math.ceil(fraction * 8));
      cell.classList.toggle('filled', fill);
      cell.classList.toggle(
        'previous',
        !!(dependency || inMotion) && lane === 0 && col === cur - 1
      );
      cell.classList.toggle(
        'reference',
        !!(dependency || inMotion) && lane === (pass > 1 ? s.params.p - 1 : 0) && col === ref
      );
      cell.classList.toggle('current', !!(dependency || inMotion) && lane === 0 && col === cur);
    });
    const grid = document.querySelector('.memory-grid');
    const links = grid?.querySelector('.memory-links');
    if (links) {
      links.style.visibility = dependency || inMotion ? 'visible' : 'hidden';
      if (dependency || inMotion) {
        const box = grid.getBoundingClientRect();
        links.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
        const centre = (selector) => {
          const r = grid.querySelector(selector).getBoundingClientRect();
          return { x: r.left + r.width / 2 - box.left, y: r.top - box.top };
        };
        const target = centre('.current');
        const local = inMotion
          ? (fraction * 8) % 1
          : app.player.running || app.player.elapsed
            ? progress
            : 1;
        ['previous', 'reference'].forEach((source, i) => {
          const origin = centre('.' + source);
          const line = links.querySelector('path.' + source + '-read');
          const height = Math.min(origin.y, target.y) - (i ? 21 : 12);
          line.setAttribute(
            'd',
            `M${origin.x},${origin.y} C${origin.x},${height} ${target.x},${height} ${target.x},${target.y}`
          );
          const dot = links.querySelector('circle.' + source + '-read');
          const f = app.motion.matches ? 1 : Math.max(0, Math.min(1, (local - i * 0.35) / 0.45));
          const point = line.getPointAtLength(line.getTotalLength() * f);
          dot.setAttribute('cx', point.x);
          dot.setAttribute('cy', point.y);
        });
      }
    }
    const label = document.getElementById('memory-phase');
    if (label)
      label.textContent =
        phase === 'released'
          ? 'released'
          : s.memory.allocated
            ? pass
              ? `pass ${pass}/${s.params.t} · ${['dependency', 'seed'].includes(phase) ? 'dependency model' : phase === 'independent' ? 'independent' : 'dependent'}`
              : 'allocated'
            : 'not allocated';
    if (dependency) {
      const el = document.getElementById('dependency');
      if (el)
        el.innerHTML = `<span>Read previous</span> + <span>Read reference</span> → <span>${((app.player.running || app.player.elapsed > 0) && b?.phase === 'DEPENDENCY' ? progress : 1) < 0.6 ? 'Mix contents' : 'Write new block'}</span>`;
    }
  }
  function controls(settings, s) {
    return `<div class="control-row"><span class="control-label">Server-selected parameters · for a new example record</span><label>Memory <select id="param-m">${[19456, 65536, 131072, 262144].map((x) => `<option value="${x}" ${x === s.params.m ? 'selected' : ''}>${x / 1024} MiB</option>`).join('')}</select></label><label>Passes <select id="param-t">${[2, 3, 4].map((x) => `<option ${x === s.params.t ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label>Lanes <select id="param-p">${[1, 2, 4].map((x) => `<option ${x === s.params.p ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label>Example salt <select id="example-salt"><option value="0">A · original record</option><option value="1">B · independent random salt</option></select></label><button data-action="register">Apply & register new example</button></div><p id="parameter-status" class="bench-note">Edits apply only when you register a new example. Existing login uses its stored salt and parameters. All outputs are verified precomputed values.</p><div class="control-row"><span class="control-label">Test the stored record</span><button data-action="verify-good">Verify original password</button><button data-action="verify-bad">Change e → 3 & verify</button><button data-action="steal">Copy database verifier</button><button data-action="online">Test 6th online attempt</button><button data-action="offline-bad">Offline guess: …stapl3</button><button data-action="offline-good">Offline guess: …staple</button></div><details><summary>Compare salts & investigate memory per guess</summary><p>Two fictional accounts, the same displayed password and parameters. Choose independent salts or deliberately reuse one salt. This controlled comparison uses genuine outputs, not arbitrary text.</p><div class="control-row"><button data-action="different-salts">Compare different salts</button><button data-action="same-salt">Deliberately reuse salt A</button><label>Attacker memory budget <select id="budget">${[4, 8, 24, 48].map((x) => `<option ${x === (s.budget || 24) ? 'selected' : ''}>${x}</option>`).join('')}</select> GiB</label></div><div id="salt-comparison"></div><div class="bench-result" id="capacity-explanation"></div><p class="bench-note">Only two published example passwords are offered. The well-known phrase is not a secure password recommendation. No hashing runs in the UI; the animation is teaching time, not a benchmark.</p></details>`;
  }
  function afterRender(app) {
    const s = app.player.state,
      el = document.getElementById('salt-comparison');
    if (el && s.compareSalts) {
      const c = s.compareSalts;
      el.innerHTML = `<div class="salt-compare"><div><h4>Alice · salt A</h4><code>${V.salts[0]}</code><p>Derived tag</p><code>${c.a.hex}</code></div><div><h4>Ben · salt ${c.reuse ? 'A (reused)' : 'B (independent)'}</h4><code>${V.salts[c.reuse ? 0 : 1]}</code><p>Derived tag</p><code>${c.b.hex}</code></div></div><p class="bench-note"><strong>${c.reuse ? 'Identical inputs → identical tags.' : 'Same password + different salts → different tags.'}</strong> Parameters: ${params(s.params)}. Both rows use “${V.passwords[0]}”.</p>`;
    }
    const cap = document.getElementById('capacity-explanation');
    if (cap) {
      const p = s.stolen?.params || s.stored?.params || s.params,
        b = s.budget || 24;
      cap.innerHTML = `<strong>${b} GiB × 1,024 ÷ ${p.m / 1024} MiB = ${Math.floor((b * 1024) / (p.m / 1024)).toLocaleString()} full-memory guesses.</strong><br>Each guess shares ${p.m / 1024} MiB across ${p.p} lanes and revisits it ${p.t} times. More passes do not allocate more memory. This capacity excludes overhead, bandwidth limits and time–memory tradeoffs; it is not measured throughput.`;
    }
  }
  function action(name, app) {
    let s = clone(app.player.state);
    app.player.stop();
    const run = (beats, title) => app.run(beats, s, title);
    if (name === 'register') {
      const p = {
        m: +document.getElementById('param-m').value,
        t: +document.getElementById('param-t').value,
        p: +document.getElementById('param-p').value,
        salt: +document.getElementById('example-salt').value,
        budget: s.budget || 24
      };
      app.settings = clone(p);
      app.journey = M.journey(p);
      s = M.initial(p);
      const beats = [
        ...M.receive(s),
        M.saltEvent(p.salt),
        ...M.derive(s, { salt: p.salt }),
        ...M.store({ ...s, salt: p.salt })
      ];
      document.getElementById('parameter-status').textContent =
        `New example: ${params(p)}, salt ${p.salt ? 'B' : 'A'}. The old record is replaced by this registration.`;
      return run(beats, 'Register an example');
    }
    if (name === 'verify-good') return run(M.verify(s, 0), 'Verify original password');
    if (name === 'verify-bad') return run(M.verify(s, 1), 'Verify changed password');
    if (name === 'steal') return run(M.steal(s), 'Copy database verifier');
    if (name === 'offline-bad') return run(M.offlineGuess(s, 1), 'Offline guess');
    if (name === 'offline-good') return run(M.offlineGuess(s, 0), 'Offline guess');
    if (name === 'online') return run(M.limited(s), 'Online limit');
    if (name === 'different-salts') return run(M.saltComparison(s, false), 'Different salts');
    if (name === 'same-salt') return run(M.saltComparison(s, true), 'Reused salt');
  }
  function inspection(key, s, app) {
    const record = s.stored || {
      params: s.params,
      salt: s.salt ?? 0,
      tag: s.tag || M.get(s.params, s.salt ?? 0, 0)
    };
    const f = app.player.beat?.flight;
    const map = {
      browser: {
        title: 'The client supplies credentials.',
        body: `${value('CURRENT FORM', V.passwords[s.clientPassword])}<p>The browser sends the email and password over TLS. Salt and cost parameters belong to the server. The browser result changes only after the response arrives.</p>`
      },
      password: {
        title: 'An input, not a stored verifier.',
        body:
          value('PASSWORD SUPPLIED', V.passwords[s.clientPassword]) +
          '<p>These two fixed examples differ in their last character: e versus 3. The browser offers only independently verified examples. No arbitrary input is attached to a fabricated result.</p><p>The famous phrase is public and predictable. Password strength depends on generation and guess order, not word count alone.</p>'
      },
      'server-password': {
        title: 'Temporarily available at the endpoint.',
        body:
          value('SERVER MEMORY', s.password === null ? 'Not present' : V.passwords[s.password]) +
          '<p>The server receives the plaintext only when the TLS-protected request arrives. It needs the password to derive the candidate tag. The model discards this temporary input after use.</p>',
        detail:
          'This is an educational state model, not a secure memory-erasure implementation. Real runtimes can retain copies; use appropriate maintained password libraries and secure handling practices.'
      },
      server: {
        title: 'Derive, store, then recompute.',
        body:
          value('CURRENT OPERATION', s.serverOp) +
          '<p>Registration chooses salt and parameters and stores a verifier. Login reads the record and reruns Argon2id with its stored salt and parameters. Successful verification can then establish a session.</p>'
      },
      salt: {
        title: 'Public. Random. Different per record.',
        body:
          value(
            'CURRENT SALT',
            s.salt === null
              ? 'Not selected yet'
              : `Example ${s.salt ? 'B' : 'A'}\nhex: ${V.salts[s.salt]}\nbase64: ${V.saltB64[s.salt]}`
          ) +
          '<p>The server chooses a fresh random salt for a new password record. It is stored openly with the tag. Two users choosing the same password should get different verifiers.</p><p>Verification reuses the stored salt. This page replays two frozen, independently generated examples; it does not claim a new runtime random value on every replay.</p>',
        detail:
          'The examples use 16-byte salts. Salt prevents shared precomputation and identical-password equality across records with different salts. It does not prevent a targeted attacker from testing guesses against one stolen verifier.'
      },
      memory: {
        title: 'Workspace belongs to one guess.',
        body:
          value(
            'CURRENT EVALUATION',
            `${s.params.m.toLocaleString()} KiB = ${s.params.m / 1024} MiB total\n${s.params.p} lanes × ${s.params.m / 1024 / s.params.p} MiB per lane\n${s.params.t} passes over that space`
          ) +
          `<p>Computing new blocks depends on existing memory. Keeping it uses space; discarding it can require recomputation. Many concurrent full-memory guesses need many workspaces.</p><p>The grid groups memory into eight illustrative regions per lane. It shows allocation, reads, writes and revisits; it is not the actual block-address trace or a scale model.</p>`,
        detail:
          'Argon2 uses 1 KiB blocks. The real reference selection and segment restrictions are more detailed than this display. Later passes also mix prior contents of the destination block. Time–memory tradeoff attacks exist, so the capacity estimate assumes full-memory evaluations rather than claiming an absolute attacker limit.'
      },
      passes: {
        title: 't: revisit the same space.',
        body:
          value('TIME COST', `${s.params.t} passes · ${s.params.m / 1024} MiB allocation`) +
          `<p>Passes increase computational work and memory traffic. They do not multiply the configured memory allocation. Argon2id uses data-independent addressing for the first half of its first pass and data-dependent addressing thereafter.</p>`
      },
      lanes: {
        title: 'p: divide the work into lanes.',
        body:
          value(
            'PARALLELISM',
            `${s.params.p} lanes share ${s.params.m / 1024} MiB\n${s.params.m / 1024 / s.params.p} MiB per lane`
          ) +
          `<p>Lanes are synchronising computation chains within one derivation. They are not independent guesses. Changing p can change the tag and runtime; it does not multiply m by p.</p>`,
        detail:
          'Reference blocks can be in the same or another lane, subject to the algorithm’s segment restrictions. A lane is not a promise that a particular browser or CPU uses one hardware thread for it.'
      },
      parameters: {
        title: 'A recipe stored with the result.',
        body:
          value('RECORD PARAMETERS', params(record.params)) +
          '<p>m is total memory in KiB; t is passes; p is lanes. These are different quantities. Login must reuse the stored values even if the server’s preferred policy later changes.</p><p>Explore edits are for a new example record and apply only when its registration is run.</p>',
        detail:
          '19 MiB, t=2, p=1 is one OWASP minimum configuration. RFC 9106’s second recommended option is 64 MiB, t=3, p=4; its first uses 2 GiB, t=1, p=4. Heavier or independently adjusted profiles here are demonstrations, not universal deployment recommendations.'
      },
      algorithm: {
        title: 'argon2id: the algorithm identifier.',
        body: '<p>This field selects Argon2id. Its hybrid addressing uses data-independent references in the first half of pass 1 and data-dependent references afterwards.</p><p>The verifier tells the library which algorithm to run. Base64 encoding the result does not encrypt it.</p>'
      },
      version: {
        title: 'v=19 means version 0x13.',
        body: '<p>The decimal version field is 19 (hexadecimal 0x13), corresponding to Argon2 version 1.3. It lets a verifier specify algorithm behaviour unambiguously.</p>'
      },
      tag: {
        title: 'A 32-byte derived result.',
        match: s.tag?.hex,
        body:
          value('CURRENT DERIVED TAG', s.tag ? s.tag.hex : 'Not derived yet') +
          '<p>Argon2id derives this tag from the password, salt and parameters. The displayed hex and PHC base64 encode the same bytes. The tag is not an encrypted copy of the password.</p>',
        detail:
          'All fixtures are genuine Argon2id v=19 outputs independently computed using argon2-cffi. The page does no cryptographic computation or benchmarking. The eight original tags are preserved exactly.'
      },
      'stored-tag': {
        title: 'The reference result.',
        match: record.tag.hex,
        body:
          value('STORED TAG', record.tag.hex) +
          '<p>The candidate derived at login is compared with this entire value. A match means that this password satisfies the stored verifier; the server never decrypts it.</p>'
      },
      phc: {
        title: 'The verifier is self-describing.',
        body:
          value('COMPLETE PHC STRING', s.stored ? M.phc(s.stored) : 'No record stored yet') +
          '<p>Algorithm → version → parameters → salt → derived tag. Click each component in the database panel to inspect it.</p><p>Salt and tag use unpadded base64. Encoding makes bytes representable as text; it adds no secrecy.</p>'
      },
      database: {
        title: 'A verifier, not a password.',
        body:
          value(
            'CURRENT USERS ROW',
            s.stored ? 'alice@example.test\n' + M.phc(s.stored) : 'No record stored yet'
          ) +
          '<p>This row includes the public salt and parameters. No plaintext password is stored. A database thief can nevertheless test guesses against this verifier offline.</p>'
      },
      comparison: {
        title: 'Check the whole result.',
        body: s.comparison
          ? value(
              'COMPARISON',
              `${s.comparison.checked} / 32 bytes checked\n${s.comparison.ok ? 'MATCH' : 'MISMATCH'}`
            ) +
            '<p>The comparison does not exit at the first mismatch. The visual reveals the verdict for both tags together. A tag mismatch gives no location of an incorrect password character.</p>'
          : '<p>The full-tag comparison has not completed. No verdict has been produced.</p>',
        detail:
          'Equal-length tags should be compared with a constant-time comparison provided by a suitable library. The teaching animation uses the same duration for success and failure; it is not a timing benchmark or a claim that this JavaScript UI is constant-time.'
      },
      observer: {
        title: 'The guess runs on another machine.',
        body: s.stolen
          ? value('STOLEN VERIFIER', M.phc(s.stolen)) +
            '<p>The attacker has enough public input to derive and compare guesses locally. The server does not receive those guesses and cannot rate-limit them.</p>'
          : '<p>No database copy has arrived yet. The network connection uses TLS, so this observer has not obtained the password from the connection.</p>',
        detail:
          'The capacity estimate divides a stated memory budget by m. It excludes overhead, bandwidth and time–memory tradeoffs; it does not predict throughput, hardware performance or guaranteed cracking time.'
      },
      stolen: {
        title: 'Enough to test guesses.',
        body:
          value('DATABASE COPY', s.stolen ? M.phc(s.stolen) : 'No copy') +
          '<p>A stolen verifier is not an immediately usable session token. It enables offline guesses. A valid stolen session token can instead be replayed under the session policy shown in the companion lab.</p>'
      },
      transport: {
        title: 'Encrypted in transit, readable at endpoints.',
        body: '<p>TLS protects the password on the connection. The browser has the password in the form, and the server receives plaintext after TLS termination. The lock represents this boundary, not encryption of server memory or the database.</p>'
      },
      packet: {
        title: f ? `${f.from} → ${f.to}` : 'No message in flight.',
        body: f
          ? value(f.label, f.payload || f.detail) +
            `<p>${f.tls ? 'Endpoint view: the network carries protected TLS records.' : 'This internal or database-copy transfer is conceptual; it is not a TLS claim.'}</p><p>The recipient changes only when this transfer arrives.</p>`
          : '<p>Play a sequence and inspect the moving message.</p>'
      }
    };
    return map[key];
  }
  const c = (short, question, context, hint, options, setup, run, evidence) => ({
    short,
    question,
    context,
    hint,
    options: options.map(([text, reason]) => ({ text, reason })),
    correct: 0,
    setup,
    run,
    evidence
  });
  const challenges = [
    c(
      'Same password',
      'Same password, different salts. Same derived tag?',
      'Alice and Ben use the same shown password and parameters. Each has an independent salt.',
      'Which inputs does the derivation use?',
      [
        [
          'Different tags. The salt changes an input.',
          'The verified examples differ because salt is part of the derivation input. It need not be secret to make the records distinct.'
        ],
        [
          'Same tag. Only the password matters.',
          'Argon2id takes salt and parameters as well as password. Different salts produce different tags in these verified examples.'
        ]
      ],
      () => M.registered(),
      (s) => M.saltComparison(s, false),
      (s) => `Alice: ${s.compareSalts.a.hex}; Ben: ${s.compareSalts.b.hex}`
    ),
    c(
      'One wrong character',
      'Can the server identify the wrong password character?',
      'Alice sends …stapl3 instead of …staple. Watch derivation and comparison.',
      'What does a mismatch of two derived tags actually tell the server?',
      [
        [
          'No. It learns that the complete tags do not match.',
          'The entire candidate tag changes. The server checks all bytes and returns failure; it does not discover an incorrect character position.'
        ],
        [
          'Yes. It stops comparing when it finds the wrong character.',
          'Tag bytes are not password characters. The full comparison has no early exit, and a mismatch does not locate the changed password character.'
        ]
      ],
      () => M.registered(),
      (s) => M.verify(s, 1),
      (s) => `${s.browser}; ${s.comparison.checked}/32 tag bytes checked; match=${s.comparison.ok}`
    ),
    c(
      'Four lanes',
      'm=64 MiB, p=4. How much memory per full evaluation?',
      'Memory cost and lane count are selected independently. Inspect allocation before looking at the answer.',
      'Are lanes separate guesses, or parts of one derivation?',
      [
        [
          '64 MiB total, split among four lanes.',
          'm specifies total memory. Here each of four lanes has 16 MiB. Lanes do not multiply the per-guess allocation.'
        ],
        [
          '256 MiB: 64 MiB for each lane.',
          'That multiplies m twice. Four lanes divide the configured 64 MiB; they are parts of one derivation, not four full-memory guesses.'
        ]
      ],
      () => {
        const s = M.initial(M.defaults());
        s.password = 0;
        s.salt = 0;
        return s;
      },
      (s) => M.derive(s),
      (s) =>
        `${s.params.m / 1024} MiB total; ${s.params.p} lanes; ${s.params.m / 1024 / s.params.p} MiB per lane.`
    ),
    c(
      'Reuse the recipe',
      'At login, should the server draw another fresh salt?',
      'The account already has a stored PHC verifier. Alice supplies the original password.',
      'Registration and verification have different jobs.',
      [
        [
          'No. Use the salt and parameters in the stored record.',
          'Recomputation needs the same recipe. A fresh salt belongs to a new password record, not each check of an existing one.'
        ],
        [
          'Yes. A new salt makes every login safer.',
          'A new salt changes the result, so it would not match this stored tag. Verification parses and reuses the record’s existing salt and parameters.'
        ]
      ],
      () => M.registered(),
      (s) => M.verify(s, 0),
      (s) => `Salt ${s.salt ? 'B' : 'A'} reused; ${params(s.params)}; ${s.browser}.`
    ),
    c(
      'A stolen database',
      'Can a login rate limit stop these offline guesses?',
      'Assume five online failures have used the server’s minute allowance. The attacker also obtains the verifier.',
      'Does the attacker have to send an offline guess to the login server?',
      [
        [
          'No. Offline tests run on the attacker’s machine.',
          'The server can limit requests it receives. A stolen verifier lets the attacker recompute and compare locally, paying the memory and computation cost for each guess.'
        ],
        [
          'Yes. Every password guess goes through the server.',
          'That is true for online attempts, not a copied verifier. The local guess and comparison never reach this server, so its request limit cannot stop them.'
        ]
      ],
      () => M.registered(),
      (s) => {
        const x = clone(s);
        x.stolen = clone(s.stored);
        x.offline = { guesses: 0, ok: null };
        return [...M.limited(s), ...M.steal(s), ...M.offlineGuess(x, 1)];
      },
      (s) =>
        `Online: ${s.browser} after attempt ${s.onlineAttempts}. Offline: ${s.offline.guesses} local test completed.`
    )
  ];
  challenges.forEach((x, i) => {
    if (i % 2) {
      x.options.reverse();
      x.correct = x.options.length - 1;
    }
  });
  new K.Exhibit({
    id: 'argon',
    number: '02',
    title: 'A password. <em>Never a record.</em>',
    subtitle:
      'How can a server check a secret it does not keep? Take a password through Argon2id, then see what a stolen verifier makes possible.',
    stageTitle: 'PASSWORD VERIFICATION',
    home: '../index.html',
    cookieURL: '../cookie-theft/index.html',
    argonURL: 'index.html',
    defaults: M.defaults,
    initial: M.initial,
    journey: M.journey,
    board,
    frame,
    controls,
    afterRender,
    action,
    inspect: inspection,
    challenges,
    readParams: (s, q) => {
      const profiles = {
        light: { m: 19456, t: 2, p: 1 },
        balanced: { m: 65536, t: 3, p: 4 },
        high: { m: 131072, t: 3, p: 4 },
        heavy: { m: 262144, t: 4, p: 4 }
      };
      if (profiles[q.get('profile')]) Object.assign(s, profiles[q.get('profile')]);
    },
    change: (el, app) => {
      if (['param-m', 'param-t', 'param-p', 'example-salt'].includes(el.id)) {
        app.cancelAuto();
        app.player.pause();
        const p = app.player.state.stored?.params;
        document.getElementById('parameter-status').textContent =
          `Draft settings changed. Apply & register to replace the example. ${p ? 'Existing verifier still uses ' + params(p) + '.' : 'No record is stored yet.'}`;
      }
      if (el.id === 'budget') {
        const s = clone(app.player.state),
          budget = +el.value;
        app.run(
          [
            event(
              'Change memory budget',
              `Use a stated ${budget} GiB budget for the capacity illustration.`,
              (x) => {
                x.budget = budget;
              },
              {
                duration: 800,
                done: `Budget changed to ${budget} GiB. This changes capacity arithmetic, not the verifier or a measured guess rate.`
              }
            )
          ],
          s,
          'Memory budget'
        );
      }
    },
    exploreIntro: {
      title: 'Change the recipe. Test the record.',
      text: 'Registration applies the draft server parameters to a new example. Login always reads the stored recipe. Compare salts, change one password character, or take the verifier offline.'
    },
    challengeIntro: {
      title: 'Predict what the server can know.',
      text: 'Make a prediction, watch the operation and use its evidence to explain your answer. Each challenge provides the state it needs.'
    },
    takeaway: (s) =>
      s.comparison
        ? `Compared all 32 bytes: ${s.comparison.ok ? 'match' : 'mismatch'}. Verification recomputes; it does not decrypt.`
        : 'Which inputs must stay the same to reproduce a stored tag?',
    outcomes: [
      'Reconstruct registration, storage and password verification in causal order.',
      'Explain the algorithm, version, parameters, salt and tag in a PHC string.',
      'Distinguish total memory, passes and lanes, and predict their effect on a stated capacity budget.',
      'Explain what an offline attacker can do with a verifier and why online limits do not stop it.'
    ],
    recap:
      'The server stores a verifier with its recipe. It verifies by deriving a new tag using the stored salt and parameters, then comparing the complete results. Successful verification establishes identity; a separate session token carries that state into later requests.',
    sources: {
      title: 'Real outputs. Conceptual motion.',
      body: '<p>All 144 displayed input combinations have genuine Argon2id v=19 outputs, independently computed with argon2-cffi. The eight original tags are unchanged. Two passwords, two frozen salts, four memory settings, three pass counts and three lane counts are available. There is no runtime hashing or benchmarking.</p><ul><li><a href="https://www.rfc-editor.org/rfc/rfc9106.html">RFC 9106 §§3–4, 7</a>: algorithm, parameters, addressing and time–memory tradeoffs.</li><li><a href="https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html">OWASP Password Storage</a>: salts, work factors and Argon2id.</li><li><a href="https://github.com/P-H-C/phc-string-format/blob/master/phc-sf-spec.md">PHC string format specification</a>: encoded verifier fields.</li><li><a href="https://argon2-cffi.readthedocs.io/en/stable/api.html">argon2-cffi API</a>: reproducible derivation and verification.</li><li><a href="https://docs.python.org/3/library/hmac.html#hmac.compare_digest">Constant-time digest comparison</a>: no content-dependent early exit.</li></ul><p>The memory grid groups work, rather than tracing real blocks. Playback time is deliberately slowed. Memory capacity is an idealised full-memory allocation calculation, not measured speed or guaranteed cracking time. Five online attempts per minute is an illustrative policy.</p>'
    }
  });
})();
