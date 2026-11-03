// Verify the public directory layout over file://, local HTTP, or the live Pages URL.
// NODE_PATH=/tmp/cssp-tools/node_modules node pages.cjs BASE_URL [--quick] [--output=report.json]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.argv[2]?.replace(/\/?$/, '/');
if (!base)
  throw new Error('Provide the public root URL, ending before cookie-theft/ or argon2id/.');
const quick = process.argv.includes('--quick');
const out = process.argv.find((x) => x.startsWith('--output='))?.slice(9);
const shots = process.argv.find((x) => x.startsWith('--screenshots='))?.slice(14);
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    offline: base.startsWith('file:')
  });
  const page = await context.newPage();
  const errors = [],
    missing = [],
    external = [],
    checks = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) missing.push(r.url());
  });
  page.on('request', (r) => {
    if (!r.url().startsWith(base) && /^https?:/.test(r.url())) external.push(r.url());
  });
  const finish = () => page.locator('#moments button').last().click();
  async function settle() {
    if (quick) await finish();
    else
      await page.waitForFunction(
        () => !lab.player.running && lab.player.index === lab.player.beats.length,
        {},
        { timeout: 60000 }
      );
  }
  async function chapter(i, animate = false) {
    await page.locator(`[data-chapter="${i}"]`).click();
    if (animate) {
      await page.locator('#play').click();
      await settle();
    } else await finish();
  }
  async function action(id, animate = false) {
    await page.locator(`[data-action="${id}"]`).click();
    if (animate) await settle();
    else await finish();
  }
  async function screenshot(name) {
    if (!shots) return;
    fs.mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: path.join(shots, name + '.png') });
  }
  try {
    await page.goto(base + 'index.html');
    assert.match(await page.title(), /Authentication under the surface/);
    await screenshot('published-overview');
    await page.locator('a.card[href^="cookie-theft/"]').click();
    await page.waitForFunction(() => window.lab?.config.id === 'cookie');
    await page.locator('#speed').selectOption('2');
    assert.match(await page.locator('#node-server').innerText(), /shop\.example/);
    assert.ok(!(await page.locator('#app').innerText()).includes('shop.local'));
    for (let i = 0; i < 7; i++) await chapter(i);
    await chapter(2, true);
    assert.equal(
      await page.evaluate(() => lab.player.state.jar.id === lab.player.state.session.id),
      true
    );
    await page.locator('[data-inspect="jar"]').first().click();
    assert.match(await page.locator('#inspector-body').innerText(), /localStorage/);
    assert.match(await page.locator('#inspector-body').innerText(), /shop\.example/);
    await page.keyboard.press('Escape');
    await page.locator('[data-mode="explore"]').click();
    await action('delete');
    await action('replay-token', true);
    assert.match(await page.evaluate(() => lab.player.state.attackerResult), /^200/);
    await action('revoke');
    await action('replay-token', true);
    assert.match(await page.evaluate(() => lab.player.state.attackerResult), /^401/);
    await page.locator('[data-mode="guided"]').click();
    await chapter(3);
    await page.locator('#node-server [data-inspect="request"]').click();
    assert.match(await page.locator('#inspector-body').innerText(), /Host: shop\.example/);
    await page.keyboard.press('Escape');
    await page.locator('#focus-view').click();
    await screenshot('published-cookie');
    await page.locator('#focus-view').click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    checks.push(
      'Cookie: seven chapters, cookie/session continuity, hostname/headers/inspector, replay after deletion, invalidation, narrow layout'
    );
    await page.locator('.lab-switch a').nth(1).click();
    await page.waitForFunction(() => window.lab?.config.id === 'argon');
    await page.locator('#speed').selectOption('2');
    assert.ok(!(await page.locator('#app').innerText()).includes('shop.local'));
    for (let i = 0; i < 7; i++) await chapter(i);
    await chapter(4, true);
    assert.equal(
      await page.evaluate(
        () =>
          lab.player.state.comparison.ok &&
          lab.player.state.comparison.checked === 32 &&
          lab.player.state.browser === 'verified'
      ),
      true
    );
    await chapter(5, true);
    assert.equal(
      await page.evaluate(
        () =>
          !lab.player.state.comparison.ok &&
          lab.player.state.comparison.checked === 32 &&
          lab.player.state.browser === 'denied'
      ),
      true
    );
    await page.locator('#focus-view').click();
    await screenshot('published-argon');
    await page.locator('#focus-view').click();
    await page.locator('[data-mode="challenges"]').click();
    const correct = await page.evaluate(() => lab.config.challenges[lab.challengeIndex].correct);
    await page.locator(`[data-answer="${correct}"]`).click();
    await page.locator('#challenge-run').click();
    await finish();
    assert.match(await page.locator('.feedback').innerText(), /fits the evidence/);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#reset').click();
    await page.locator('#play').click();
    await settle();
    checks.push(
      'Argon2id: seven chapters, genuine matching/nonmatching full-tag results, activity feedback, narrow layout, reduced motion'
    );
    await page.locator('.lab-switch a').first().click();
    await page.waitForFunction(() => window.lab?.config.id === 'cookie');
    await page.locator('.brand').click();
    assert.match(await page.title(), /Authentication under the surface/);
    checks.push('Landing page, both companion links and home links');
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
    assert.deepEqual(external, []);
    const report = {
      result: 'PASS',
      base,
      browser: await browser.version(),
      date: new Date().toISOString(),
      playback: quick
        ? 'Completed-state navigation'
        : 'Real-time playback for session creation, replay and both verification outcomes',
      checks,
      errors,
      missing,
      external
    };
    if (out) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})();
