// End-to-end checks against the running prototype (Playwright).
// Usage: node tests/e2e.mjs        (starts its own server on port 4199)
// Needs Playwright resolvable from the global install or PLAYWRIGHT_DIR.
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const globalRoot = execSync('npm root -g').toString().trim();
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [process.env.PLAYWRIGHT_DIR || globalRoot, here] }));

const PORT = 4199, URL = `http://localhost:${PORT}/`;
const server = spawn('node', [join(here, '..', 'serve.mjs'), String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));

let passed = 0, failed = 0;
const errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function fresh(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  await page.goto(URL);
  await page.waitForSelector('[data-testid="stats"]');
  return { ctx, page };
}
async function t(name, fn, viewport) {
  const { ctx, page } = await fresh(viewport);
  try { await fn(page); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`); await page.screenshot({ path: join(here, `fail-${passed + failed}.png`) }).catch(() => {}); }
  await ctx.close();
}
const stat = (page, id) => page.locator(`[data-stat="${id}"] .stat-value`).innerText();
const openPatient = async (page, name) => { await page.goto(URL + '#/patients'); await page.fill('[data-testid="patient-search"]', name); await page.locator('[data-testid="patient-list"] a').first().click(); await page.waitForSelector('[data-testid="save-handover"]'); };
const addPatientForm = async (page, name, bed) => {
  await page.goto(URL + `#/patient/new?unit=micu&bed=${bed}`);
  await page.waitForSelector('[data-testid="f-name"]');
  await page.fill('[data-testid="f-name"]', name);
};

console.log('Continuity of Care — e2e');

await t('dashboard opens without login, shows prototype banner', async (page) => {
  assert.match(await page.locator('h1').innerText(), /Medical ICU/);
  assert.ok(await page.locator('.proto-banner').isVisible());
  assert.equal(await page.locator('input[type=password]').count(), 0);
  assert.ok(await page.locator('[data-testid="add-patient"]').isVisible());
  assert.match(await page.locator('.brand').innerText(), /Continuity of Care/);
});

await t('all eight units selectable with correct totals', async (page) => {
  const expect = { 'Medical ICU': 21, 'Trauma ICU': 8, 'Neuro ICU': 8, 'Respiratory ICU': 14, 'General ICU': 14, PRU: 15, 'Surgical ICU': 9, 'KASH ICU': 22 };
  const opts = await page.locator('[data-testid="unit-select"] option').allInnerTexts();
  assert.equal(opts.length, 8);
  for (const [name, n] of Object.entries(expect)) {
    await page.selectOption('[data-testid="unit-select"]', { label: opts.find((o) => o.startsWith(name + ' (')) });
    const beds = await stat(page, 'beds');
    assert.equal(Number(beds.split('/')[1]), n, name);
    assert.equal(await page.locator('[data-testid="bed-list"] > li').count(), n, name + ' bed rows');
  }
});

await t('MICU & TCO team allocations on bed map and team filter', async (page) => {
  await page.goto(URL + '#/units');
  await page.waitForSelector('[data-testid="bed-grid"]');
  const alloc = await page.locator('[data-testid="team-alloc"]').innerText();
  assert.match(alloc, /Team A\s+beds 1–5, 17–21/); assert.match(alloc, /Team B\s+beds 6–16/);
  const teamOf = async (n) => page.locator(`.bed-cell[data-bed="${n}"] .bed-team`).innerText();
  for (const n of [1, 5, 17, 21]) assert.equal(await teamOf(n), 'A');
  for (const n of [6, 16]) assert.equal(await teamOf(n), 'B');
  assert.equal(await page.locator('.bed-cell').count(), 21);
  await page.locator('[data-unit="tco"]').click();
  await page.waitForSelector('[data-testid="total-beds"]:has-text("8")');
  const a2 = await page.locator('[data-testid="team-alloc"]').innerText();
  assert.match(a2, /Team A\s+beds 1–4/); assert.match(a2, /Team B\s+beds 5–8/);
  await page.locator('[data-unit="neuro"]').click();
  assert.match(await page.locator('.block').innerText(), /No team allocation is configured/);
  // team filter on the dashboard
  await page.goto(URL + '#/'); await page.selectOption('[data-testid="unit-select"]', 'micu');
  await page.click('[data-team="B"]');
  assert.equal(await stat(page, 'beds').then((s) => s.split('/')[1]), '11');
  assert.equal(await page.locator('[data-testid="bed-list"] > li').count(), 11);
  await page.click('[data-team="A"]');
  assert.equal(await stat(page, 'beds').then((s) => s.split('/')[1]), '10');
});

await t('bed list search, filters and unit switching', async (page) => {
  await page.fill('[data-testid="bed-search"]', 'Demo Patient 01');
  assert.equal(await page.locator('[data-testid="bed-list"] > li').count(), 1);
  await page.fill('[data-testid="bed-search"]', '');
  await page.click('[data-filter="available"]');
  const avail = await page.locator('[data-testid="bed-list"] > li').count();
  const occ = Number((await stat(page, 'beds')).split('/')[0]);
  assert.equal(avail + occ, 21);
  await page.click('[data-filter="urgent"]');
  assert.ok((await page.locator('[data-testid="bed-list"] > li').count()) >= 1);
  await page.click('[data-filter="incomplete"]');
  assert.ok((await page.locator('[data-testid="bed-list"] > li').count()) >= 1);
  await page.selectOption('[data-testid="unit-select"]', 'tco');
  assert.match(await page.locator('h1').innerText(), /Trauma ICU/);
  // patients page filters
  await page.goto(URL + '#/patients');
  await page.selectOption('[data-testid="patient-unit-filter"]', 'tco');
  assert.equal(await page.locator('[data-testid="patient-list"] > li').count(), 2);
});

await t('add patient: new issues are independent; resolve moves, reopen restores', async (page) => {
  await addPatientForm(page, 'Test Patient Z', 2);
  await page.click('[data-testid="add-issue"]');
  await page.click('[data-testid="add-issue"]');
  await page.click('[data-testid="add-issue"]');
  assert.equal(await page.locator('[data-testid="issue-card"]').count(), 3);
  const titles = page.locator('[data-testid="issue-title"]');
  await titles.nth(0).fill('Issue alpha'); await titles.nth(1).fill('Issue beta'); await titles.nth(2).fill('Issue gamma');
  assert.equal(await titles.nth(0).inputValue(), 'Issue alpha'); assert.equal(await titles.nth(1).inputValue(), 'Issue beta');
  await page.locator('[data-testid="issue-card"]').nth(1).locator('[data-testid="resolve-issue"]').click();
  assert.equal(await page.locator('[data-testid="issue-card"]').count(), 2);
  assert.equal(await page.locator('[data-testid="resolved-count"]').innerText(), '1');
  await page.locator('[data-testid="resolved-section"] summary').click();
  assert.match(await page.locator('[data-testid="resolved-card"]').innerText(), /Issue beta/);
  assert.match(await page.locator('[data-testid="resolved-card"]').innerText(), /\d/); // timestamp
  // save, reload: resolved issue persists
  await page.click('[data-testid="save-handover"]');
  await page.waitForSelector('.toast-success');
  await page.reload(); await page.waitForSelector('[data-testid="save-handover"]');
  assert.equal(await page.locator('[data-testid="resolved-count"]').innerText(), '1');
  assert.equal(await page.locator('[data-testid="issue-card"]').count(), 2);
  await page.locator('[data-testid="resolved-section"] summary').click();
  await page.click('[data-testid="reopen-issue"]');
  assert.equal(await page.locator('[data-testid="issue-card"]').count(), 3);
  assert.equal(await page.locator('[data-testid="resolved-count"]').innerText(), '0');
});

await t('duplicate bed assignment is prevented', async (page) => {
  await addPatientForm(page, 'Dup Bed', 3); // bed 3 is occupied in MICU seed
  // bed 3 is not offered in the selector and is not preselected...
  assert.equal(await page.locator('#bedField option[value="3"]').count(), 0);
  assert.equal(await page.locator('#bedField').inputValue(), '');
  // ...and saving without a bed is rejected
  await page.click('[data-testid="save-handover"]');
  await page.waitForSelector('.toast-error');
  assert.match(await page.locator('[data-testid="form-errors"]').innerText(), /Bed must be between/);
});

await t('edit patient details + tasks (add, complete with time)', async (page) => {
  await openPatient(page, 'Demo Patient 03');
  await page.fill('[data-testid="f-diagnosis"]', 'COPD exacerbation — edited');
  await page.click('[data-testid="add-task"]');
  await page.locator('[data-testid="task-row"]').last().locator('input[type=text]').fill('Call respiratory physio');
  const row = page.locator('[data-testid="task-list"] [data-testid="task-row"]').last();
  await row.locator('input[type=checkbox]').click(); // re-renders into Completed
  await page.waitForSelector('[data-testid="done-tasks"]');
  await page.locator('[data-testid="done-tasks"] summary').click();
  assert.match(await page.locator('[data-testid="done-tasks"]').innerText(), /Completed \(1\)[\s\S]*Completed \w{3} \d/); // completion time shown
  await page.click('[data-testid="save-handover"]');
  await page.waitForSelector('.toast-success');
  await page.reload(); await page.waitForSelector('[data-testid="save-handover"]');
  assert.equal(await page.locator('[data-testid="f-diagnosis"]').inputValue(), 'COPD exacerbation — edited');
  await page.locator('[data-testid="done-tasks"] summary').click();
  assert.equal(await page.locator('[data-testid="done-tasks"] input[value="Call respiratory physio"]').count(), 1);
});

await t('VTE: not assessed flagged; no/withheld need reason; unknown flagged; yes needs agent', async (page) => {
  await openPatient(page, 'Demo Patient 03'); // seeded Not Assessed
  assert.match(await page.locator('[data-testid="vte-warning"]').innerText(), /Not assessed — review required/);
  assert.match(await page.locator('[data-testid="incomplete-warning"]').innerText(), /NOT ASSESSED/);
  await page.check('input[name="vteDecision"][value="no"]');
  assert.match(await page.locator('[data-testid="vte-warning"]').innerText(), /Reason for no \/ withheld/);
  await page.check('[data-vte-reason="bleeding"]');
  assert.match(await page.locator('[data-testid="vte-warning"]').innerText(), /reassessment/i);
  await page.fill('[data-bind="vte.reassessPlan"]', 'Daily');
  assert.match(await page.locator('[data-testid="vte-warning"]').innerText(), /documented/);
  await page.check('[data-bind="vte.reasonUnknown"]');
  assert.match(await page.locator('[data-testid="vte-warning"]').innerText(), /unknown/i);
  await page.uncheck('[data-bind="vte.reasonUnknown"]');
  await page.check('input[name="vteDecision"][value="withheld"]');
  await page.check('input[name="vteDecision"][value="yes"]');
  await page.check('input[name="vteMethod"][value="both"]');
  assert.match(await page.locator('[data-testid="vte-warning"]').innerText(), /agent/i);
  await page.fill('[data-bind="vte.agent"]', 'Enoxaparin'); await page.fill('[data-bind="vte.dose"]', '40 mg'); await page.fill('[data-bind="vte.frequency"]', 'daily');
  assert.match(await page.locator('[data-testid="vte-warning"]').innerText(), /documented/);
});

await t('handover save → ready (confirm with gaps) → review → history', async (page) => {
  await openPatient(page, 'Demo Patient 03');
  await page.fill('[data-testid="f-mrn"]', 'DEMO-000103');
  await page.click('[data-testid="mark-ready"]');
  // gaps exist (VTE not assessed) → confirmation lists them, nothing silent
  const dlg = page.locator('dialog');
  await dlg.waitFor();
  assert.match(await dlg.innerText(), /NOT ASSESSED/);
  await dlg.getByRole('button', { name: 'Mark ready anyway' }).click();
  await page.waitForSelector('.toast-success');
  assert.match(await page.locator('#phTags').innerText(), /Ready — gaps/);
  await page.click('[data-testid="review-handover"]');
  assert.ok(await page.locator('#reviewPanel').isVisible());
  await page.click('[data-testid="mark-reviewed"]');
  await page.locator('dialog').getByRole('button', { name: 'Mark reviewed' }).click();
  await page.waitForSelector('[data-testid="reviewed-note"]');
  assert.match(await page.locator('[data-testid="reviewed-note"]').first().innerText(), /Demo reviewer \(unauthenticated\)/);
  assert.match(await page.locator('[data-testid="reviewed-note"]').first().innerText(), /outstanding documentation/);
  // editing after review reverts to Draft
  await page.fill('[data-testid="f-diagnosis"]', 'Changed after review');
  await page.click('[data-testid="save-handover"]');
  await page.waitForSelector('.toast-warn');
  assert.match(await page.locator('#phTags').innerText(), /Draft/);
  await page.goto(URL + '#/history');
  await page.fill('[data-testid="history-search"]', 'Demo Patient 03');
  const n = await page.locator('[data-testid="history-list"] li').count();
  assert.ok(n >= 3, 'history entries ' + n);
  await page.locator('[data-testid="history-list"] a').first().click();
  await page.waitForSelector('[data-testid="handover-summary"]');
  assert.match(await page.locator('body').innerText(), /Read-only snapshot/);
});

await t('discharge keeps record, frees bed', async (page) => {
  await openPatient(page, 'Demo Patient 05'); // MICU 19
  await page.click('[data-testid="mark-discharged"]');
  await page.locator('dialog').getByRole('button', { name: 'Mark discharged' }).click();
  await page.waitForURL(/#\/patients/);
  await page.goto(URL + '#/'); await page.selectOption('[data-testid="unit-select"]', 'micu');
  await page.fill('[data-testid="bed-search"]', 'Demo Patient 05');
  assert.equal(await page.locator('[data-testid="bed-list"] > li').count(), 0);
  await page.goto(URL + '#/patients'); await page.click('[data-scope="past"]');
  await page.fill('[data-testid="patient-search"]', 'Demo Patient 05');
  assert.equal(await page.locator('[data-testid="patient-list"] > li').count(), 1);
  await page.locator('[data-testid="patient-list"] a').click();
  assert.match(await page.locator('.notice-info').first().innerText(), /discharged/);
  assert.equal(await page.locator('[data-testid="save-handover"]').count(), 0);
});

await t('persistence across reload and reset demo data', async (page) => {
  await addPatientForm(page, 'Persist Me', 5);
  await page.click('[data-testid="save-handover"]'); // bed missing -> error
  await page.selectOption('#bedField', '5');
  await page.click('[data-testid="save-handover"]');
  await page.waitForURL(/#\/patient\/pt_/);
  await page.reload(); await page.waitForSelector('[data-testid="f-name"]');
  assert.equal(await page.locator('[data-testid="f-name"]').inputValue(), 'Persist Me');
  await page.locator('summary[aria-label]').click();
  await page.click('[data-testid="reset-demo"]');
  await page.locator('dialog').getByRole('button', { name: 'Reset' }).click();
  await page.waitForSelector('.toast-success');
  await page.goto(URL + '#/patients'); await page.fill('[data-testid="patient-search"]', 'Persist Me');
  assert.equal(await page.locator('[data-testid="patient-list"] > li').count(), 0);
});

await t('unsaved-changes guard on navigation', async (page) => {
  await openPatient(page, 'Demo Patient 01');
  await page.fill('[data-testid="f-diagnosis"]', 'x');
  await page.locator('.nav-desktop a', { hasText: 'Units' }).click();
  await page.locator('dialog').getByRole('button', { name: 'Cancel' }).click();
  assert.match(page.url(), /#\/patient\//);
  await page.locator('.nav-desktop a', { hasText: 'Units' }).click();
  await page.locator('dialog').getByRole('button', { name: /Discard/ }).click();
  await page.waitForURL(/#\/units/);
});

await t('unknown route shows friendly message', async (page) => {
  await page.goto(URL + '#/nope'); assert.match(await page.locator('#app').innerText(), /Page not found/);
  await page.goto(URL + '#/patient/pt_missing'); assert.match(await page.locator('#app').innerText(), /Patient not found/);
});

// ---- responsive layout ----
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const widths = [{ n: 'iPhone SE', w: 320, h: 640 }, { n: 'iPhone', w: 390, h: 844 }, { n: 'tablet', w: 768, h: 1024 }, { n: 'desktop', w: 1440, h: 900 }];
for (const v of widths) {
  await t(`no horizontal overflow / clipping at ${v.n} (${v.w}px)`, async (page) => {
    for (const route of ['#/', '#/units', '#/patients', '#/history']) {
      await page.goto(URL + route); await page.waitForTimeout(150);
      assert.ok((await overflow(page)) <= 0, `${route} overflows by ${await overflow(page)}px`);
    }
    await openPatient(page, 'Demo Patient 01');
    assert.ok((await overflow(page)) <= 0, `patient overflows by ${await overflow(page)}px`);
    // every button/input at least 36px high & inside viewport width
    const bad = await page.evaluate((vw) => [...document.querySelectorAll('button:not([hidden]), input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea')]
      .filter((e) => e.offsetParent && !e.closest('[hidden]'))
      .filter((e) => { const r = e.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1 || (r.height < 34); })
      .map((e) => `${e.tagName}.${e.className}:${Math.round(e.getBoundingClientRect().height)}h`).slice(0, 5), v.w);
    assert.deepEqual(bad, [], 'clipped/small controls');
    if (v.w < 900) assert.ok(await page.locator('.nav-mobile').isVisible() === false, 'bottom nav hidden on form'); // keyboard-friendly form
    await page.goto(URL + '#/');
    assert.equal(await page.locator('.nav-mobile').isVisible(), v.w < 900);
    assert.equal(await page.locator('.nav-desktop').isVisible(), v.w >= 900);
  }, { width: v.w, height: v.h });
}

await browser.close(); server.kill();
const uniq = [...new Set(errors)];
if (uniq.length) { failed++; console.log('  FAIL browser errors:\n    ' + uniq.join('\n    ')); }
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
