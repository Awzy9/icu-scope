// DATA-ACCESS LAYER.
// The UI only talks to `repo` (async methods). The prototype backs it with
// browser localStorage via `LocalStorageAdapter`. To move to a real database,
// implement the same adapter interface (load/save/clear) — or replace this
// repository with API calls — without touching the views.
//
// PROTOTYPE ONLY: data lives in this browser. It is NOT a secure store, is not
// shared between devices/users, and has no access control, audit log or backup.

import { SEED } from './seed.js';
import { validatePatient } from './logic.js';
import { clone, nowIso, uid } from './util.js';

const STORAGE_KEY = 'coc.prototype.v1';
const SCHEMA_VERSION = 1;

export class LocalStorageAdapter {
  constructor(key = STORAGE_KEY) { this.key = key; this.memory = null; }
  async load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return d && d.version === SCHEMA_VERSION ? d : null;
    } catch { return this.memory; }
  }
  async save(data) {
    this.memory = data;
    try { localStorage.setItem(this.key, JSON.stringify(data)); return true; } catch { return false; }
  }
  async clear() { this.memory = null; try { localStorage.removeItem(this.key); } catch { /* ignore */ } }
}

export class Repository {
  constructor(adapter, seedFn) { this.adapter = adapter; this.seedFn = seedFn; this.data = null; }

  async init() {
    if (this.data) return;
    this.data = (await this.adapter.load()) || (await this._seed());
  }
  async _seed() {
    const d = this.seedFn();
    d.version = SCHEMA_VERSION;
    await this.adapter.save(d);
    return d;
  }
  async _persist() { return this.adapter.save(this.data); }

  async resetDemoData() { await this.adapter.clear(); this.data = await this._seed(); }

  async listPatients({ unitId, includePast = false } = {}) {
    await this.init();
    return clone(this.data.patients.filter((p) =>
      (!unitId || p.unitId === unitId) && (includePast || p.status === 'active')));
  }
  async getPatient(id) {
    await this.init();
    const p = this.data.patients.find((x) => x.id === id);
    return p ? clone(p) : null;
  }

  /** Create or update a patient. Throws Error with `.errors` on validation failure. */
  async savePatient(patient, { action = 'saved' } = {}) {
    await this.init();
    const others = this.data.patients.filter((p) => p.status === 'active');
    const errors = patient.status === 'active' ? validatePatient(patient, others) : [];
    if (errors.length) { const e = new Error(errors.join(' ')); e.errors = errors; throw e; }
    const p = clone(patient);
    p.bed = Number(p.bed);
    p.updatedAt = nowIso();
    const i = this.data.patients.findIndex((x) => x.id === p.id);
    if (i >= 0) this.data.patients[i] = p; else this.data.patients.push(p);
    this.data.history.unshift(this._snapshot(p, action));
    await this._persist();
    return clone(p);
  }

  _snapshot(p, action) {
    return { id: uid('ho'), patientId: p.id, unitId: p.unitId, bed: p.bed, patientName: p.name,
      action, at: nowIso(), handoverStatus: p.handover.status, snapshot: clone(p) };
  }

  async listHistory({ unitId, patientId } = {}) {
    await this.init();
    return clone(this.data.history.filter((h) => (!unitId || h.unitId === unitId) && (!patientId || h.patientId === patientId)));
  }
  async getHistoryEntry(id) {
    await this.init();
    const h = this.data.history.find((x) => x.id === id);
    return h ? clone(h) : null;
  }
}

export const repo = new Repository(new LocalStorageAdapter(), SEED);
