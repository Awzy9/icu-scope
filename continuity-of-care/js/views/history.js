import { repo } from '../repository.js';
import { UNITS, getUnit } from '../config.js';
import { esc, fmtDateTime } from '../util.js';
import { tag } from '../ui.js';
import { renderSummaryHtml } from './summary.js';

const ACTION_LABEL = { saved: 'Saved', ready: 'Marked ready', reviewed: 'Reviewed by incoming senior', transferred: 'Transferred', discharged: 'Discharged', reopened: 'Edited after review' };

export async function renderHistory(root) {
  const all = await repo.listHistory();
  const state = { q: '', unit: 'all' };
  root.innerHTML = `
    <section class="page-head"><div><h1>Handover History</h1><p class="muted">Each save, ready and review action is kept as a read-only snapshot (stored in this browser only).</p></div></section>
    <div class="filters">
      <label class="field grow"><span class="sr-only">Search history</span><input type="search" id="hSearch" placeholder="Search patient name…" data-testid="history-search" /></label>
      <label class="field inline"><span>Unit</span><select id="hUnit"><option value="all">All units</option>${UNITS.map((u) => `<option value="${u.id}">${esc(u.short)}</option>`).join('')}</select></label>
    </div><div id="hList"></div>`;
  const draw = () => {
    const rows = all.filter((h) => (state.unit === 'all' || h.unitId === state.unit) && (!state.q || h.patientName.toLowerCase().includes(state.q.toLowerCase())));
    root.querySelector('#hList').innerHTML = rows.length ? `<ul class="hist-list" data-testid="history-list">${rows.map((h) => `
      <li><a class="hist-row" href="#/history/${h.id}"><span><strong>${esc(h.patientName)}</strong> <span class="muted small">${esc(getUnit(h.unitId)?.short)} · Bed ${esc(h.bed)}</span></span>
        <span class="muted small">${fmtDateTime(h.at)}</span>
        <span>${tag(ACTION_LABEL[h.action] || h.action, h.action === 'reviewed' ? 'ok' : h.action === 'ready' ? 'info' : 'neutral')}</span></a></li>`).join('')}</ul>` : '<p class="empty">No handover history yet.</p>';
  };
  root.querySelector('#hSearch').addEventListener('input', (e) => { state.q = e.target.value; draw(); });
  root.querySelector('#hUnit').addEventListener('change', (e) => { state.unit = e.target.value; draw(); });
  draw();
}

export async function renderHistoryEntry(root, id) {
  const h = await repo.getHistoryEntry(id);
  if (!h) { root.innerHTML = '<p class="empty">That history entry was not found. <a href="#/history">Back to history</a></p>'; return; }
  const p = h.snapshot;
  root.innerHTML = `
    <p><a href="#/history" class="back">← Handover History</a></p>
    <section class="page-head"><div><h1>${esc(p.name)} <span class="muted">· ${esc(getUnit(p.unitId)?.short)} Bed ${esc(p.bed)}</span></h1>
      <p class="muted">Read-only snapshot · ${esc(ACTION_LABEL[h.action] || h.action)} · ${fmtDateTime(h.at)}</p></div>
      <a class="btn" href="#/patient/${p.id}">Open current record</a></section>
    <div class="notice notice-info">This is a historical snapshot and cannot be edited.</div>
    ${renderSummaryHtml(p, { full: true })}`;
}
