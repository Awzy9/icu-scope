import { repo } from '../repository.js';
import { UNITS, getUnit } from '../config.js';
import { needsUrgentReview, isIncomplete } from '../logic.js';
import { esc, fmtDateTime } from '../util.js';
import { tag, handoverTag } from '../ui.js';

export async function renderPatients(root) {
  const all = await repo.listPatients({ includePast: true });
  const state = { q: '', unit: 'all', scope: 'current' };

  root.innerHTML = `
    <section class="page-head"><div><h1>Patients</h1><p class="muted">All units. Discharged and transferred patients are kept for reference.</p></div>
      <a class="btn btn-primary" href="#/patient/new">+ Add Patient</a></section>
    <div class="filters">
      <label class="field grow"><span class="sr-only">Search patients</span>
        <input type="search" id="pSearch" placeholder="Search name, MRN, diagnosis, bed…" autocomplete="off" data-testid="patient-search" /></label>
      <label class="field inline"><span>Unit</span><select id="pUnit" data-testid="patient-unit-filter"><option value="all">All units</option>${UNITS.map((u) => `<option value="${u.id}">${esc(u.short)}</option>`).join('')}</select></label>
      <div class="chips" id="pScope" role="group" aria-label="Patient status">
        ${[['current', 'Current'], ['urgent', 'Urgent'], ['incomplete', 'Incomplete'], ['past', 'Discharged / transferred']].map(([id, l], i) => `<button class="chip${i === 0 ? ' on' : ''}" data-scope="${id}" aria-pressed="${i === 0}">${l}</button>`).join('')}
      </div>
    </div>
    <div id="pList"></div>`;

  const draw = () => {
    const n = state.q.trim().toLowerCase();
    const rows = all.filter((p) => {
      if (state.unit !== 'all' && p.unitId !== state.unit) return false;
      const active = p.status === 'active';
      if (state.scope === 'past' ? active : !active) return false;
      if (state.scope === 'urgent' && !needsUrgentReview(p)) return false;
      if (state.scope === 'incomplete' && !isIncomplete(p)) return false;
      if (n && !`${p.name} ${p.mrn} ${p.diagnosis} bed ${p.bed} ${getUnit(p.unitId)?.short}`.toLowerCase().includes(n)) return false;
      return true;
    }).sort((a, b) => a.unitId.localeCompare(b.unitId) || a.bed - b.bed);
    root.querySelector('#pList').innerHTML = rows.length ? `<ul class="bed-list" data-testid="patient-list">${rows.map((p) => {
      const u = getUnit(p.unitId);
      return `<li class="bed-row ${p.status !== 'active' ? 'past' : ''}"><a href="#/patient/${p.id}">
        <span class="bed-badge small-badge">${p.bed}</span>
        <span class="bed-main"><strong>${esc(p.name)}</strong>
          <span class="muted small">${esc(u.short)} · ${esc(p.mrn || 'No MRN')} · ${esc(p.age || '?')}${esc((p.sex || '')[0] || '')}</span>
          <span class="muted small clamp">${esc(p.diagnosis || 'No diagnosis recorded')}</span></span>
        <span class="bed-tags">${p.status === 'active' ? handoverTag(p) : tag(p.outcome ? (p.status === 'discharged' ? 'Discharged' : 'Transferred') + ' · ' + fmtDateTime(p.outcome.at) : p.status, 'neutral')}
          ${p.status === 'active' && needsUrgentReview(p) ? tag('Urgent review', 'danger') : ''}${p.status === 'active' && isIncomplete(p) ? tag('Docs incomplete', 'warn') : ''}</span></a></li>`;
    }).join('')}</ul>` : '<p class="empty">No patients match.</p>';
  };
  root.querySelector('#pSearch').addEventListener('input', (e) => { state.q = e.target.value; draw(); });
  root.querySelector('#pUnit').addEventListener('change', (e) => { state.unit = e.target.value; draw(); });
  root.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => {
    state.scope = b.dataset.scope;
    root.querySelectorAll('[data-scope]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    draw();
  }));
  draw();
}
