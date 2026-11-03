/* Shared, dependency-free exhibit runtime. No animation promises or async mutations. */
(() => {
  'use strict';
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const esc = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const inspect = (key, label, cls = '', match = '') =>
    `<button type="button" class="inspect ${cls}" data-inspect="${esc(key)}"${match ? ` data-match="${esc(match)}"` : ''}>${label}<span class="inspect-mark" aria-hidden="true">↗</span></button>`;
  const pill = (label, cls = '') => `<span class="pill ${cls}">${label}</span>`;
  const empty = (text) => `<div class="empty">${text}</div>`;
  const event = (label, caption, effect = () => {}, options = {}) => ({
    label,
    caption,
    done: options.done || caption,
    duration: options.duration || 1600,
    ...options,
    apply(s) {
      effect(s);
      s.events.push({ label, text: options.done || caption });
    }
  });
  const node = (id, title, subtitle, content, cls = '') =>
    `<section class="node ${cls}" id="node-${id}" aria-label="${esc(title)}"><header class="node-head">${inspect(id, `<span class="node-symbol" aria-hidden="true">${{ browser: '▣', server: '▤', observer: '◉', database: '▱' }[id] || '◇'}</span><span><strong>${title}</strong><small>${subtitle}</small></span>`)}<span class="port" data-port="${id}" aria-hidden="true"></span></header><div class="node-body">${content}</div></section>`;

  class Player {
    constructor(update, frame, complete) {
      this.update = update;
      this.frame = frame;
      this.complete = complete;
      this.speed = 1;
      this.running = false;
      this.timer = null;
      this.index = 0;
      this.elapsed = 0;
    }
    load(beats, base) {
      this.stop();
      this.beats = beats;
      this.snapshots = [clone(base)];
      for (const beat of beats) {
        const s = clone(this.snapshots.at(-1));
        beat.apply(s);
        this.snapshots.push(s);
      }
      this.index = 0;
      this.elapsed = 0;
      this.reason = '';
      this.update();
    }
    get state() {
      return this.snapshots[this.index];
    }
    get beat() {
      return this.beats[this.index];
    }
    get progress() {
      return this.beat ? Math.min(1, this.elapsed / this.beat.duration) : 0;
    }
    stop() {
      this.running = false;
      clearInterval(this.timer);
      this.timer = null;
    }
    pause(reason = '') {
      this.stop();
      this.reason = reason;
      this.update();
    }
    play() {
      if (!this.beats.length) return;
      if (this.index >= this.beats.length) {
        this.index = 0;
        this.elapsed = 0;
      }
      this.reason = '';
      this.running = true;
      this.last = performance.now();
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 25);
      this.update();
    }
    tick() {
      if (!this.running) return;
      const now = performance.now();
      // Consume only this beat: a delayed paint must not race through later ideas.
      this.elapsed += Math.min(now - this.last, 250) * this.speed;
      this.last = now;
      if (this.elapsed >= this.beat.duration) {
        this.index++;
        this.elapsed = 0;
        if (this.index === this.beats.length) {
          this.stop();
          this.update();
          this.complete();
          return;
        }
        this.update();
      }
      this.frame();
    }
    seek(index) {
      this.stop();
      this.reason = '';
      this.index = Math.max(0, Math.min(this.beats.length, index));
      this.elapsed = 0;
      this.update();
      if (this.index === this.beats.length) this.complete(false);
    }
  }

  class Exhibit {
    constructor(config) {
      this.config = config;
      this.settings = config.defaults();
      this.mode = 'guided';
      this.chapter = 0;
      this.answer = null;
      this.challengeIndex = 0;
      this.challengeFinished = false;
      this.records = [];
      this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.player = new Player(
        () => this.render(),
        () => this.draw(),
        (auto) => this.completed(auto)
      );
      this.autoTimer = null;
      this.buildShell();
      this.bind();
      const q = new URLSearchParams(location.search);
      config.readParams?.(this.settings, q);
      this.journey = config.journey(this.settings);
      const step = Number.parseInt(q.get('step'), 10);
      this.gotoChapter(
        Number.isFinite(step) ? Math.max(0, Math.min(this.journey.length - 1, step - 1)) : 0
      );
      window.lab = this; // Read-only snapshots are useful to the reproducible browser harness.
    }
    buildShell() {
      const c = this.config;
      document.getElementById('app').innerHTML = `
        <a class="skip" href="#lesson">Skip to the experiment</a>
        <header class="masthead"><a class="brand" href="${c.home}"><span class="brand-icon" aria-hidden="true">a<span>↔</span></span><span>AUTHENTICATION<br><b>UNDER THE SURFACE</b></span></a>
          <nav class="lab-switch" aria-label="Companion labs"><a href="${c.cookieURL}" ${c.id === 'cookie' ? 'aria-current="page"' : ''}>01 <span>Cookie theft</span></a><a href="${c.argonURL}" ${c.id === 'argon' ? 'aria-current="page"' : ''}>02 <span>Password check</span></a></nav>
          <button class="quiet" id="focus-view" aria-pressed="false">⛶ Focus view</button></header>
        <main>
          <section class="hero"><div><p class="eyebrow">THE AUTHENTICATION SERIES / LAB ${c.number}</p><h1>${c.title}</h1><p class="hero-copy">${c.subtitle}</p></div>
            <button class="story-bridge inspect" data-inspect="bridge"><span class="eyebrow">ONE LOGIN. TWO DIFFERENT SECRETS.</span><span class="bridge-flow"><span class="${c.id === 'argon' ? 'bridge-active' : ''}">Password<br><b>verify identity</b></span><i>→</i><span class="${c.id === 'cookie' ? 'bridge-active' : ''}">Session token<br><b>remember identity</b></span></span><span class="bridge-note">Explore the complete story <span aria-hidden="true">↗</span></span></button></section>
          <div class="study-bar"><nav class="mode-nav" aria-label="Ways to learn"><button data-mode="guided" aria-pressed="true">Guided journey</button><button data-mode="explore" aria-pressed="false">Explore the system</button><button data-mode="challenges" aria-pressed="false">Test your thinking <span>${c.challenges.length}</span></button></nav><label class="inspect-toggle"><input type="checkbox" id="show-inspect"> Show inspection points</label></div>
          <nav id="chapters" class="chapters" aria-label="Chapters"></nav>
          <section id="lesson" class="lesson" tabindex="-1"></section>
          <section id="workbench" class="workbench" aria-label="Experiment controls" hidden></section>
          <section id="challenge" class="challenge" aria-label="Prediction challenge" hidden></section>
          <section class="experiment" aria-label="Live simulation"><div class="stage-meta"><span><i class="status-dot"></i> <b>${c.stageTitle}</b> <span class="meta-separator">/</span> FICTIONAL SYSTEM</span><span><span id="sequence-title"></span><span class="meta-separator">/</span><span id="motion-label">Teaching time · not a benchmark</span></span></div>
            <div id="stage" class="stage ${c.id}"><div id="board" class="board"></div><svg id="wire" class="wire" aria-hidden="true"><path></path><circle r="4"></circle><circle r="4"></circle></svg><button id="held-packet" class="packet held" data-inspect="token" hidden></button><button id="packet" class="packet" data-inspect="packet" hidden></button></div>
          </section>
          <div class="playback-bar"><div class="live-caption"><span id="phase" class="phase">READY</span><p id="caption" role="status" aria-live="polite"></p><span id="counter"></span></div>
          <section class="transport" aria-label="Playback controls"><div class="play-controls"><button id="previous" title="Previous moment (Left arrow)" aria-label="Previous moment">←</button><button id="play" class="primary">▶ Play sequence</button><button id="next" title="Next moment (Right arrow)" aria-label="Next moment">→</button><button id="replay">↺ Replay</button><button id="reset" class="quiet">Restart lab</button></div><div class="play-options"><label>Speed <select id="speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><label class="auto-label"><input id="auto" type="checkbox"> Continue chapters</label><button id="advance" class="next-chapter">Next chapter ↗</button></div></section>
          </div>
          <nav id="moments" class="moments" aria-label="Revisit a moment"></nav>
          <div class="below-stage"><section class="evidence-panel"><div class="section-label"><h2>Follow the evidence</h2><span>Completed events only</span></div><ol id="events" class="events"></ol></section><section class="notebook"><div class="section-label"><h2>Your field notes</h2><span>Private to this tab</span></div><p id="takeaway"></p><label for="notes">What changed, and what explains it?</label><textarea id="notes" rows="3" placeholder="I predicted… I observed… because…"></textarea><button id="download">↓ Download observations</button><span id="saved" role="status"></span></section></div>
          <details class="recap"><summary>What you should be able to explain</summary><ul>${c.outcomes.map((s) => `<li>${s}</li>`).join('')}</ul><p>${c.recap}</p></details>
          <footer><span>CSSP · ATU Galway <span class="meta-separator">/</span> Built for curiosity.</span><span>Offline · no accounts · no data sent</span><button data-inspect="sources" class="text-button">Sources & model limits ↗</button><button data-inspect="help" class="text-button">Keyboard & help ↗</button></footer>
        </main>
        <dialog id="inspector" aria-labelledby="inspector-title"><div class="inspector-top"><span class="eyebrow">UNDER THE SURFACE / INSPECTOR</span><button id="close-inspector" aria-label="Close inspector">✕</button></div><div id="inspector-body"></div><div class="inspector-bottom"><span>Playback is paused. Close, then resume when ready.</span><button id="enlarge-inspector" aria-pressed="false">⛶ Enlarge detail</button></div></dialog>`;
    }
    bind() {
      document.addEventListener('click', (e) => {
        const target = e.target.closest('button, a');
        if (!target) return;
        if (target.dataset.inspect) {
          this.inspect(target.dataset.inspect, target);
          return;
        }
        if (target.dataset.mode) {
          this.setMode(target.dataset.mode);
          return;
        }
        if (target.dataset.chapter !== undefined) {
          this.gotoChapter(+target.dataset.chapter);
          return;
        }
        if (target.dataset.moment !== undefined) {
          this.cancelAuto();
          this.player.seek(+target.dataset.moment);
          return;
        }
        if (target.dataset.challenge !== undefined) {
          this.selectChallenge(+target.dataset.challenge);
          return;
        }
        if (target.dataset.answer !== undefined) {
          this.player.pause();
          this.answer = +target.dataset.answer;
          this.challengeFinished = false;
          this.renderChallenge();
          return;
        }
        if (target.dataset.action) {
          this.cancelAuto();
          this.config.action(target.dataset.action, this);
          return;
        }
        switch (target.id) {
          case 'play':
            this.cancelAuto();
            this.player.running ? this.player.pause() : this.player.play();
            break;
          case 'previous':
            this.cancelAuto();
            this.player.seek(this.player.index - 1);
            break;
          case 'next':
            this.cancelAuto();
            this.player.seek(this.player.index + 1);
            break;
          case 'replay':
            this.cancelAuto();
            this.player.seek(0);
            this.player.play();
            break;
          case 'reset':
            this.restart();
            break;
          case 'advance':
            this.gotoChapter(this.chapter + 1);
            break;
          case 'close-inspector':
            this.closeInspector();
            break;
          case 'enlarge-inspector': {
            const d = document.getElementById('inspector');
            d.classList.toggle('expanded');
            target.setAttribute('aria-pressed', d.classList.contains('expanded'));
            break;
          }
          case 'focus-view':
            document.body.classList.toggle('focus-view');
            target.setAttribute('aria-pressed', document.body.classList.contains('focus-view'));
            target.textContent = document.body.classList.contains('focus-view')
              ? '← Overview'
              : '⛶ Focus view';
            this.draw();
            break;
          case 'challenge-run':
            this.runChallenge();
            break;
          case 'challenge-retry':
            this.selectChallenge(this.challengeIndex);
            break;
          case 'challenge-hint':
            this.player.pause();
            document.getElementById('hint').hidden = false;
            break;
          case 'download':
            this.download();
            break;
        }
      });
      document.addEventListener('change', (e) => {
        if (e.target.id === 'speed') this.player.speed = +e.target.value;
        else if (e.target.id === 'show-inspect')
          document.body.classList.toggle('show-inspect', e.target.checked);
        else if (e.target.id === 'auto' && !e.target.checked) this.cancelAuto();
        else this.config.change?.(e.target, this);
      });
      document.addEventListener(
        'toggle',
        (e) => {
          if (e.target.tagName === 'DETAILS' && e.target.open) {
            this.cancelAuto();
            this.player.pause();
          }
        },
        true
      );
      document.addEventListener('keydown', (e) => {
        const d = document.getElementById('inspector');
        if (d.open) {
          if (e.key === 'Escape') {
            e.preventDefault();
            this.closeInspector();
          }
          if (e.key === 'Tab') {
            const f = [...d.querySelectorAll('button,a,input,select,textarea,summary')].filter(
              (x) => x.getClientRects().length
            );
            if (e.shiftKey && document.activeElement === f[0]) {
              e.preventDefault();
              f.at(-1).focus();
            } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
              e.preventDefault();
              f[0].focus();
            }
          }
          return;
        }
        if (
          e.target.closest('button,a,input,select,textarea,summary,[contenteditable]') ||
          e.altKey ||
          e.ctrlKey ||
          e.metaKey
        )
          return;
        if (e.key === ' ') {
          e.preventDefault();
          document.getElementById('play').click();
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          document.getElementById('next').click();
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          document.getElementById('previous').click();
        }
        if (e.key.toLowerCase() === 'r') this.restart();
        if (e.key.toLowerCase() === 'f') document.getElementById('focus-view').click();
      });
      document.getElementById('inspector').addEventListener('cancel', (e) => {
        e.preventDefault();
        this.closeInspector();
      });
      document.getElementById('inspector').addEventListener('click', (e) => {
        if (e.target.id === 'inspector') {
          const r = e.target.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            this.closeInspector();
        }
      });
      window.addEventListener('resize', () => this.draw());
      if (window.ResizeObserver) this.resizeObserver = new ResizeObserver(() => this.draw());
      this.resizeObserver?.observe(document.getElementById('stage'));
      const motionChange = () => {
        this.draw();
        this.renderMotionLabel();
      };
      if (this.motion.addEventListener) this.motion.addEventListener('change', motionChange);
      else this.motion.addListener?.(motionChange);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.cancelAuto();
          if (this.player.running)
            this.player.pause('Paused when this tab became hidden. Resume from this exact moment.');
        } else this.draw();
      });
    }
    cancelAuto() {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
    defaultsBase() {
      return this.config.initial(this.settings);
    }
    gotoChapter(i, play = false) {
      this.cancelAuto();
      this.chapter = Math.max(0, Math.min(this.journey.length - 1, i));
      let base = this.defaultsBase();
      for (let n = 0; n < this.chapter; n++) for (const b of this.journey[n].beats) b.apply(base);
      this.sequenceTitle = this.journey[this.chapter].title;
      this.player.load(this.journey[this.chapter].beats, base);
      if (play) this.player.play();
    }
    run(beats, base = this.player.state, title = 'Experiment') {
      this.cancelAuto();
      this.sequenceTitle = title;
      this.player.load(beats, clone(base));
      this.player.play();
    }
    restart() {
      this.cancelAuto();
      this.settings = this.config.defaults();
      this.journey = this.config.journey(this.settings);
      this.mode = 'guided';
      this.answer = null;
      this.challengeFinished = false;
      this.gotoChapter(0);
    }
    setMode(mode) {
      this.cancelAuto();
      this.player.pause();
      this.mode = mode;
      if (mode === 'guided') this.gotoChapter(this.chapter);
      else if (mode === 'challenges') this.selectChallenge(this.challengeIndex);
      else {
        this.sequenceTitle = 'Your experiment';
        this.render();
      }
    }
    completed(auto = true) {
      if (this.mode === 'challenges') {
        if (this.answer !== null) {
          this.challengeFinished = true;
          const c = this.config.challenges[this.challengeIndex];
          const record = `${c.question}\nPrediction: ${c.options[this.answer].text}\nEvidence: ${c.evidence(this.player.state)}\nExplanation: ${c.options[this.answer].reason}`;
          if (!this.records.includes(record)) this.records.push(record);
          this.renderChallenge();
        }
      } else if (
        auto &&
        this.mode === 'guided' &&
        document.getElementById('auto').checked &&
        this.chapter < this.journey.length - 1
      ) {
        document.getElementById('caption').textContent +=
          ' Reading pause · next chapter in 5 seconds.';
        this.autoTimer = setTimeout(() => {
          this.autoTimer = null;
          if (!document.hidden && !document.getElementById('inspector').open)
            this.gotoChapter(this.chapter + 1, true);
        }, 5000);
      }
    }
    replaceHTML(el, html) {
      // Stable semantic focus survives model-driven DOM replacement.
      const a = document.activeElement;
      const key = el.contains(a) ? a.dataset.inspect || a.dataset.action || a.id : null;
      el.innerHTML = html;
      if (key)
        [...el.querySelectorAll('button,input,select')]
          .find((x) => (x.dataset.inspect || x.dataset.action || x.id) === key)
          ?.focus({ preventScroll: true });
    }
    render() {
      if (!this.player.snapshots) return;
      const s = this.player.state,
        p = this.player,
        c = this.config;
      document
        .querySelectorAll('[data-mode]')
        .forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === this.mode));
      document.getElementById('chapters').hidden = this.mode !== 'guided';
      document.getElementById('chapters').innerHTML = this.journey
        .map(
          (ch, i) =>
            `<button data-chapter="${i}" ${i === this.chapter ? 'aria-current="step"' : ''}><span>${String(i + 1).padStart(2, '0')}</span>${ch.short}</button>`
        )
        .join('');
      const lesson =
        this.mode === 'guided'
          ? this.journey[this.chapter]
          : this.mode === 'explore'
            ? c.exploreIntro
            : c.challengeIntro;
      document.getElementById('lesson').innerHTML =
        `<div class="lesson-heading"><span class="eyebrow">${this.mode === 'guided' ? `CHAPTER ${String(this.chapter + 1).padStart(2, '0')} / ${String(this.journey.length).padStart(2, '0')}` : this.mode === 'explore' ? 'CHANGE ONE THING. FOLLOW THE CONSEQUENCE.' : 'PREDICT → EXPERIMENT → EXPLAIN'}</span><h2>${lesson.title}</h2></div><p>${lesson.text}</p>`;
      const bench = document.getElementById('workbench');
      bench.hidden = this.mode !== 'explore';
      if (!bench.hidden && !bench.innerHTML) bench.innerHTML = c.controls(this.settings, s);
      if (bench.hidden) bench.innerHTML = '';
      document.getElementById('challenge').hidden = this.mode !== 'challenges';
      if (this.mode === 'challenges') this.renderChallenge();
      this.replaceHTML(document.getElementById('board'), c.board(s, this));
      const current = p.beat,
        last = p.beats[p.index - 1];
      const moving = p.running || p.elapsed > 0;
      document.getElementById('phase').textContent = p.reason
        ? 'PAUSED'
        : p.running
          ? current?.phase || 'PROCESS'
          : p.index === p.beats.length
            ? 'COMPLETE'
            : p.elapsed
              ? 'PAUSED'
              : 'READY';
      document.getElementById('caption').textContent =
        p.reason ||
        (moving
          ? current?.caption
          : p.index === 0
            ? `Ready. ${current?.caption || 'Choose an experiment.'}`
            : last.done);
      document.getElementById('counter').textContent = `${p.index} / ${p.beats.length}`;
      document.getElementById('play').textContent = p.running
        ? 'Ⅱ Pause'
        : p.elapsed
          ? '▶ Resume'
          : p.index === p.beats.length
            ? '↺ Play again'
            : '▶ Play sequence';
      document.getElementById('play').disabled = this.mode === 'challenges' && this.answer === null;
      document.getElementById('previous').disabled = p.index === 0 && !p.elapsed;
      document.getElementById('next').disabled = p.index === p.beats.length;
      document.getElementById('advance').hidden =
        this.mode !== 'guided' || this.chapter === this.journey.length - 1;
      document.querySelector('.auto-label').hidden = this.mode !== 'guided';
      const currentMoment = p.running || p.elapsed ? p.index + 1 : p.index;
      document.getElementById('moments').innerHTML =
        `<button data-moment="0" class="moment-start" ${currentMoment === 0 ? 'aria-current="step"' : ''}>Start</button>` +
        p.beats
          .map(
            (b, i) =>
              `<button data-moment="${i + 1}" class="${i < p.index ? 'done' : ''} ${(p.running || p.elapsed) && i === p.index ? 'active-moment' : ''}" ${currentMoment === i + 1 ? 'aria-current="step"' : ''}><span>${i < p.index ? '✓' : i + 1}</span>${b.label}</button>`
          )
          .join('');
      document.getElementById('events').innerHTML = s.events.length
        ? s.events
            .slice(-5)
            .map(
              (e, i) =>
                `<li><span class="event-number">${String(Math.max(0, s.events.length - 5) + i + 1).padStart(2, '0')}</span><div><b>${esc(e.label)}</b><p>${esc(e.text)}</p></div></li>`
            )
            .join('')
        : '<li class="empty">Nothing has been sent yet. Play the sequence or step through its moments.</li>';
      document.getElementById('takeaway').textContent =
        this.mode === 'guided' ? this.journey[this.chapter].takeaway : c.takeaway(s);
      c.afterRender?.(this);
      document.getElementById('sequence-title').textContent = this.sequenceTitle;
      this.renderMotionLabel();
      this.draw();
    }
    renderMotionLabel() {
      document.getElementById('motion-label').textContent = this.motion.matches
        ? 'Reduced motion · same causal sequence'
        : 'Teaching time · deliberately slowed';
    }
    draw() {
      if (!this.player.snapshots) return;
      const stage = document.getElementById('stage'),
        svg = document.getElementById('wire'),
        packet = document.getElementById('packet');
      const r = stage.getBoundingClientRect(),
        narrow = window.innerWidth <= 1050;
      const point = (id) => {
        const el = document.querySelector(`[data-port="${id}"]`);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.left + b.width / 2 - r.left, y: b.top + b.height / 2 - r.top };
      };
      const b = this.player.beat,
        flight = (this.player.running || this.player.elapsed > 0) && b?.flight;
      document
        .querySelector('.active-moment')
        ?.style.setProperty('--moment-progress', `${this.player.progress * 100}%`);
      const start = point(flight?.from || 'browser'),
        end = point(flight?.to || 'server');
      packet.hidden = !flight;
      const held = document.getElementById('held-packet'),
        tap = point('tap');
      held.hidden = !(flight?.from === 'tap' && flight?.to === 'observer' && tap);
      if (!held.hidden) {
        held.style.left = tap.x + 'px';
        held.style.top = tap.y + 'px';
        held.dataset.match = flight.token;
        held.innerHTML = `<span>◈ Original<small>${esc(flight.token.slice(0, 6))}…${esc(flight.token.slice(-4))}</small></span>`;
      }
      document
        .querySelectorAll('.node.active-source,.node.active-target')
        .forEach((n) => n.classList.remove('active-source', 'active-target'));
      if (!start || !end || !r.width || !r.height) return;
      let path;
      if (narrow) path = `M${start.x},${start.y} C22,${start.y} 22,${end.y} ${end.x},${end.y}`;
      else {
        const mx = (start.x + end.x) / 2;
        path = `M${start.x},${start.y} C${mx},${start.y} ${mx},${end.y} ${end.x},${end.y}`;
      }
      svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
      svg.setAttribute('width', r.width);
      svg.setAttribute('height', r.height);
      const line = svg.querySelector('path');
      line.setAttribute('d', path);
      [...svg.querySelectorAll('circle')].forEach((dot, i) => {
        dot.setAttribute('cx', i ? end.x : start.x);
        dot.setAttribute('cy', i ? end.y : start.y);
      });
      svg.classList.toggle('tls', !!flight?.tls);
      if (flight) {
        const t = this.player.progress;
        // Endpoint dwell makes departure and arrival visible, including at 2×.
        const travel = Math.max(0, Math.min(1, (t - 0.12) / 0.76));
        const q = this.motion.matches
          ? t < 0.5
            ? start
            : end
          : line.getPointAtLength(line.getTotalLength() * travel);
        packet.style.left = q.x + 'px';
        packet.style.top = q.y + 'px';
        packet.className = `packet ${flight.tls ? 'encrypted' : ''} ${flight.kind || ''} ${narrow ? 'compact' : ''}`;
        const inTransit = flight.tls && t > 0.12 && t < 0.88;
        packet.innerHTML = `<span class="packet-icon" aria-hidden="true">${inTransit ? '▧' : flight.kind === 'token' ? '◈' : '↗'}</span><span>${esc(inTransit ? 'TLS · encrypted' : flight.label)}<small>${esc(inTransit ? 'payload hidden in transit' : flight.detail || 'inspect this message')}</small></span>`;
        packet.setAttribute(
          'aria-label',
          `Inspect ${flight.label}, ${flight.from} to ${flight.to}${inTransit ? ', encrypted in transit' : ''}`
        );
        document.getElementById('node-' + flight.from)?.classList.add('active-source');
        if (t > 0.88 || (this.motion.matches && t > 0.5))
          document.getElementById('node-' + flight.to)?.classList.add('active-target');
      }
      this.config.frame?.(this.player.state, b, this.player.progress, this);
    }
    selectChallenge(index) {
      this.cancelAuto();
      this.challengeIndex = index;
      this.answer = null;
      this.challengeFinished = false;
      const oldHint = document.getElementById('hint');
      if (oldHint) oldHint.hidden = true;
      const c = this.config.challenges[index];
      this.sequenceTitle = c.short;
      const base = c.setup(this.settings);
      this.player.load(c.run(base, this.settings), base);
    }
    renderChallenge() {
      const c = this.config.challenges[this.challengeIndex];
      const el = document.getElementById('challenge');
      if (this.mode !== 'challenges') return;
      const hadHint = document.getElementById('hint') && !document.getElementById('hint').hidden;
      const focus = document.activeElement;
      const answerFocus = focus?.dataset.answer;
      el.innerHTML = `<div class="challenge-picker">${this.config.challenges.map((x, i) => `<button data-challenge="${i}" aria-pressed="${i === this.challengeIndex}">${i + 1}. ${x.short}</button>`).join('')}</div><div class="challenge-body"><div><span class="eyebrow">MAKE A PREDICTION</span><h3>${c.question}</h3><p>${c.context}</p><button class="text-button" id="challenge-hint">A useful hint ↗</button><p id="hint" class="hint" ${hadHint ? '' : 'hidden'}>${c.hint}</p></div><div class="answers" role="group" aria-label="Your prediction">${c.options.map((o, i) => `<button data-answer="${i}" aria-pressed="${this.answer === i}" ${this.player.running ? 'disabled' : ''}><span>${String.fromCharCode(65 + i)}</span>${o.text}</button>`).join('')}<div class="challenge-actions"><button id="challenge-run" class="primary" ${this.answer === null || this.player.running ? 'disabled' : ''}>${this.challengeFinished ? 'Run again' : 'Run the experiment'} →</button><button id="challenge-retry" class="quiet">Retry</button></div></div></div>${this.challengeFinished ? `<div class="feedback" role="status"><b>${this.answer === c.correct ? 'Your prediction fits the evidence.' : 'The evidence changes this prediction.'}</b><p>${c.options[this.answer].reason}</p><p class="evidence-line"><strong>Observed:</strong> ${esc(c.evidence(this.player.state))}</p></div>` : ''}`;
      if (answerFocus !== undefined)
        el.querySelector(`[data-answer="${answerFocus}"]`)?.focus({ preventScroll: true });
    }
    runChallenge() {
      if (this.answer === null) return;
      this.challengeFinished = false;
      const c = this.config.challenges[this.challengeIndex];
      const base = c.setup(this.settings);
      this.run(c.run(base, this.settings), base, c.short);
    }
    inspect(key, trigger) {
      this.cancelAuto();
      const region = trigger.closest('.node')?.id;
      const match = trigger.dataset.match;
      this.player.pause();
      const scope = region ? document.getElementById(region) : document;
      this.inspectorTrigger =
        [...scope.querySelectorAll('[data-inspect]')].find(
          (x) => x.dataset.inspect === key && (!match || x.dataset.match === match)
        ) || trigger;
      let data;
      if (key === 'bridge')
        data = {
          title: 'Prove once. Refer back later.',
          label: 'THE COMPLETE AUTHENTICATION STORY',
          body: `<p>A password verifier helps the server check a login. A session token then refers to the authenticated state for later requests.</p><div class="inspector-flow"><span>Password</span>→<span>Derive & compare</span>→<span>Create session</span>→<span>Set-Cookie</span>→<span>Cookie + lookup</span></div><h3>If it is stolen</h3><p>A <b>verifier</b> lets an attacker test password guesses offline. A valid <b>session token</b> can be replayed immediately under this lab’s bearer-token policy.</p><a class="primary link-button" href="${this.config.id === 'cookie' ? this.config.argonURL : this.config.cookieURL}">Open the companion lab →</a>`,
          detail:
            'These are two parts of authentication. Authorisation is a further decision: what an authenticated identity is allowed to do.'
        };
      else if (key === 'help')
        data = {
          title: 'Make the system wait for you.',
          body: '<p><b>Play</b> runs a complete sequence. <b>Pause</b> freezes the current moment, including a travelling packet. <b>Previous / next</b> reconstruct completed moments; the labelled timeline does the same. Chapter buttons include the prerequisites for that chapter.</p><p>Space plays or pauses; left/right arrows move through moments when focus is outside a control. R restarts. F toggles Focus view. Focused controls retain their normal keyboard behaviour. Escape closes this inspector.</p><p>Focus view hides the surrounding reading material. Enlarge detail expands the inspector. Reduced motion follows your system setting and keeps the same sequence and captions. A hidden tab pauses deliberately; press Resume on return.</p><p>Explore retains the visible system state. Returning to Guided reconstructs the selected chapter. Restart clears the scenario, including captured tokens. Notes survive restarts until this tab closes; download them to keep them.</p>'
        };
      else if (key === 'sources') data = this.config.sources;
      else data = this.config.inspect(key, this.player.state, this);
      if (!data) return;
      document.getElementById('inspector-body').innerHTML =
        `<p class="eyebrow">${data.label || 'INSPECT THE CURRENT SYSTEM'}</p><h2 id="inspector-title">${data.title}</h2>${data.body}${data.detail ? `<details><summary>Go one level deeper</summary>${data.detail.startsWith('<') ? data.detail : `<p>${data.detail}</p>`}</details>` : ''}`;
      if (data.match)
        document
          .querySelectorAll('[data-match]')
          .forEach((x) => x.classList.toggle('matching', x.dataset.match === data.match));
      const d = document.getElementById('inspector');
      if (d.showModal) d.showModal();
      else {
        d.setAttribute('open', '');
        document.getElementById('app').classList.add('fallback-dialog');
      }
      document.getElementById('close-inspector').focus();
    }
    closeInspector() {
      const d = document.getElementById('inspector');
      if (d.close) d.close();
      else d.removeAttribute('open');
      document.querySelectorAll('.matching').forEach((x) => x.classList.remove('matching'));
      document.getElementById('app').classList.remove('fallback-dialog');
      if (this.inspectorTrigger?.isConnected) this.inspectorTrigger.focus();
      else document.getElementById('play').focus();
    }
    download() {
      const text = `${this.config.title.replace(/<[^>]*>/g, '')} — observations\n\n${this.records.join('\n\n')}\n\nCurrent evidence\n${this.player.state.events.map((e) => `${e.label}: ${e.text}`).join('\n')}\n\nMy explanation\n${document.getElementById('notes').value}\n\nModel: fictional network, teaching animation; Argon2id values are verified precomputed examples.\n`;
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.config.id}-observations.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      document.getElementById('saved').textContent = 'Observation file prepared.';
    }
  }
  window.LabKit = { clone, esc, inspect, pill, empty, event, node, Player, Exhibit };
})();
