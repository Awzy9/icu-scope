import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, getUnit, teamBeds, teamOfBed } from '../js/config.js';
import { newPatient, newIssue, vteGaps, incompleteItems, validatePatient, resolveIssue, reopenIssue, openIssues, resolvedIssues, needsUrgentReview } from '../js/logic.js';
import { SEED } from '../js/seed.js';
import { Repository } from '../js/repository.js';

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

test('all eight units present with correct bed totals', () => {
  assert.equal(UNITS.length, 8);
  const totals = Object.fromEntries(UNITS.map((u) => [u.id, u.beds]));
  assert.deepEqual(totals, { micu: 21, tco: 8, neuro: 8, resp: 14, general: 14, pru: 15, surgical: 9, kash: 22 });
});
test('MICU teams', () => {
  const u = getUnit('micu');
  assert.deepEqual(teamBeds(u, 'A'), [...range(1, 5), ...range(17, 21)]);
  assert.deepEqual(teamBeds(u, 'B'), range(6, 16));
  assert.equal(teamBeds(u, 'A').length + teamBeds(u, 'B').length, 21);
});
test('TCO teams', () => {
  const u = getUnit('tco');
  assert.deepEqual(teamBeds(u, 'A'), range(1, 4));
  assert.deepEqual(teamBeds(u, 'B'), range(5, 8));
});
test('no invented teams for other units', () => {
  for (const u of UNITS.filter((x) => !['micu', 'tco'].includes(x.id))) { assert.equal(u.teams, null); assert.equal(teamOfBed(u, 1), null); }
});
test('every bed belongs to exactly one team where teams exist', () => {
  for (const u of UNITS.filter((x) => x.teams)) for (let b = 1; b <= u.beds; b++) assert.ok(teamOfBed(u, b), `${u.id} bed ${b}`);
});

test('VTE: not assessed is flagged', () => {
  const g = vteGaps({ decision: 'not_assessed' });
  assert.equal(g.length, 1); assert.match(g[0].message, /NOT ASSESSED/);
});
test('VTE: no/withheld without reason triggers warning', () => {
  for (const decision of ['no', 'withheld']) {
    assert.ok(vteGaps({ decision, reasons: [], reassessPlan: 'x' }).some((g) => /Reason/.test(g.message)));
  }
});
test('VTE: unknown reason is flagged for clinician review, not invented', () => {
  const g = vteGaps({ decision: 'no', reasons: [], reasonUnknown: true, reassessPlan: 'x' });
  assert.ok(g.some((x) => /unknown/.test(x.message)));
});
test('VTE: Other requires details; reassessment required', () => {
  assert.ok(vteGaps({ decision: 'no', reasons: ['other'], reassessPlan: 'x' }).some((g) => g.field === 'vte.reasonDetails'));
  assert.ok(vteGaps({ decision: 'no', reasons: ['bleeding'] }).some((g) => g.field === 'vte.reassessPlan'));
  assert.equal(vteGaps({ decision: 'no', reasons: ['bleeding'], reviewAt: '2026-01-01T00:00:00Z' }).length, 0);
});
test('VTE: yes needs method, and agent/dose/frequency when pharmacological', () => {
  assert.ok(vteGaps({ decision: 'yes' }).length === 1);
  assert.equal(vteGaps({ decision: 'yes', method: 'pharmacological' }).length, 3);
  assert.equal(vteGaps({ decision: 'yes', method: 'mechanical' }).length, 0);
  assert.equal(vteGaps({ decision: 'yes', method: 'both', agent: 'a', dose: 'b', frequency: 'c' }).length, 0);
});
test('new patient is incomplete and VTE undocumented', () => {
  const p = newPatient('micu', 1);
  assert.ok(incompleteItems(p).some((g) => g.field === 'vte.decision'));
});

test('bed uniqueness within unit (not across units)', () => {
  const a = { ...newPatient('micu', 3), name: 'A' };
  const b = { ...newPatient('micu', 3), name: 'B' };
  assert.ok(validatePatient(b, [a]).some((e) => /already assigned/.test(e)));
  assert.equal(validatePatient({ ...b, unitId: 'tco' }, [a]).length, 0);
  assert.ok(validatePatient({ ...b, bed: 99 }, []).some((e) => /between 1 and 21/.test(e)));
});

test('issues: multiple independent, resolve preserves, reopen restores', () => {
  const p = newPatient('micu', 1);
  const i1 = newIssue({ title: 'one' }), i2 = newIssue({ title: 'two' });
  assert.notEqual(i1.id, i2.id);
  p.issues.push(i1, i2);
  resolveIssue(i1, '2026-01-01T00:00:00Z');
  assert.equal(openIssues(p).length, 1); assert.equal(resolvedIssues(p).length, 1);
  assert.equal(p.issues.length, 2); assert.equal(i1.resolvedAt, '2026-01-01T00:00:00Z'); assert.equal(i1.title, 'one');
  reopenIssue(i1);
  assert.equal(openIssues(p).length, 2); assert.equal(i1.resolvedAt, '');
  p.issues[1].severity = 'urgent';
  assert.ok(needsUrgentReview(p));
});

test('seed covers required demo scenarios', () => {
  const { patients } = SEED();
  assert.ok(patients.length >= 8);
  assert.ok(new Set(patients.map((p) => p.unitId)).size >= 4);
  assert.ok(patients.some((p) => p.issues.some((i) => i.status === 'resolved')));
  assert.ok(patients.some((p) => p.issues.some((i) => i.severity === 'urgent' && i.status !== 'resolved')));
  assert.ok(patients.some((p) => p.tasks.some((t) => t.done)));
  assert.ok(patients.some((p) => p.vte.decision === 'yes'));
  assert.ok(patients.some((p) => p.vte.decision === 'no' && p.vte.reasons.length));
  assert.ok(patients.some((p) => incompleteItems(p).length));
  assert.ok(patients.every((p) => /^DEMO-|^$/.test(p.mrn)));
  // no duplicate beds in seed
  const keys = patients.map((p) => `${p.unitId}:${p.bed}`);
  assert.equal(new Set(keys).size, keys.length);
});

test('repository: persistence round trip, duplicate bed rejected, history kept', async () => {
  let store = null;
  const adapter = { load: async () => store && JSON.parse(store), save: async (d) => { store = JSON.stringify(d); return true; }, clear: async () => { store = null; } };
  const r = new Repository(adapter, SEED);
  await r.init();
  const dup = { ...newPatient('micu', 3), name: 'Dup' };
  await assert.rejects(() => r.savePatient(dup), /already assigned/);
  const ok = await r.savePatient({ ...newPatient('micu', 4), name: 'Fresh' });
  const r2 = new Repository(adapter, SEED); await r2.init();
  assert.ok((await r2.listPatients({ unitId: 'micu' })).some((p) => p.id === ok.id));
  // discharge keeps record but frees bed
  const d = await r.getPatient(ok.id); d.status = 'discharged';
  await r.savePatient(d, { action: 'discharged' });
  assert.equal((await r.listPatients({ unitId: 'micu' })).some((p) => p.id === ok.id), false);
  assert.equal((await r.listPatients({ unitId: 'micu', includePast: true })).some((p) => p.id === ok.id), true);
  await r.savePatient({ ...newPatient('micu', 4), name: 'Reuse' });
  assert.ok((await r.listHistory({ patientId: ok.id })).length >= 2);
  await r.resetDemoData();
  assert.equal((await r.listPatients({ unitId: 'micu' })).some((p) => p.name === 'Reuse'), false);
});
