import { teamOfBed } from '../config.js';
import { openIssues, pendingInvestigations, needsUrgentReview, isIncomplete, incompleteItems } from '../logic.js';
import { esc } from '../util.js';
import { tag, handoverTag } from '../ui.js';

export function bedFilterBar() {
  return `<div class="filters">
    <label class="field grow"><span class="sr-only">Search patients and beds</span>
      <input type="search" id="bedSearch" placeholder="Search bed, name, MRN, diagnosis…" autocomplete="off" data-testid="bed-search" /></label>
    <div class="chips" role="group" aria-label="Filters" id="bedFilters">
      ${[['all', 'All'], ['occupied', 'Occupied'], ['available', 'Available'], ['transfer', 'Transfer pending'], ['urgent', 'Urgent'], ['incomplete', 'Incomplete']]
        .map(([id, l]) => `<button class="chip${id === 'all' ? ' on' : ''}" data-filter="${id}" aria-pressed="${id === 'all'}">${l}</button>`).join('')}
    </div></div>`;
}

export function bedListHtml(unit, beds, patients, { q = '', filter = 'all' } = {}) {
  const byBed = new Map(patients.map((p) => [Number(p.bed), p]));
  const rows = [];
  const needle = q.trim().toLowerCase();
  for (const bed of beds) {
    const p = byBed.get(bed);
    const team = teamOfBed(unit, bed);
    const status = !p ? 'available' : p.transferPending ? 'transfer' : 'occupied';
    if (filter === 'occupied' && !p) continue;
    if (filter === 'available' && p) continue;
    if (filter === 'transfer' && status !== 'transfer') continue;
    if (filter === 'urgent' && !(p && needsUrgentReview(p))) continue;
    if (filter === 'incomplete' && !(p && isIncomplete(p))) continue;
    if (needle) {
      const hay = `bed ${bed} ${p ? [p.name, p.mrn, p.diagnosis, p.id].join(' ') : 'available'}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    rows.push(p ? occupiedRow(unit, p, team, status) : availableRow(unit, bed, team));
  }
  return rows.length ? `<ul class="bed-list" data-testid="bed-list">${rows.join('')}</ul>` : '<p class="empty">No beds match your search or filter.</p>';
}

function teamTag(team) { return team ? tag('Team ' + team, 'team') : ''; }

function availableRow(unit, bed, team) {
  return `<li class="bed-row available"><a href="#/patient/new?unit=${unit.id}&bed=${bed}" aria-label="Bed ${bed} available — add patient">
    <span class="bed-badge">${bed}</span>
    <span class="bed-main"><span class="muted">Available</span></span>
    <span class="bed-tags">${teamTag(team)}${tag('Available', 'free')}<span class="add-hint">+ Add patient</span></span></a></li>`;
}

function occupiedRow(unit, p, team, status) {
  const urgent = needsUrgentReview(p);
  const gaps = incompleteItems(p);
  const ni = openIssues(p).length;
  const np = pendingInvestigations(p).length;
  return `<li class="bed-row ${status}${urgent ? ' urgent' : ''}"><a href="#/patient/${p.id}">
    <span class="bed-badge">${p.bed}</span>
    <span class="bed-main"><strong>${esc(p.name || 'Unnamed patient')}</strong>
      <span class="muted small">${esc(p.mrn || 'No MRN')} · ${esc(p.age || '?')}${esc((p.sex || '')[0] || '')}</span>
      <span class="muted small clamp">${esc(p.diagnosis || 'No diagnosis recorded')}</span>
      ${ni || np ? `<span class="muted small">${ni} open issue${ni === 1 ? '' : 's'} · ${np} pending investigation${np === 1 ? '' : 's'}</span>` : ''}
    </span>
    <span class="bed-tags">${teamTag(team)}${status === 'transfer' ? tag('Transfer Pending', 'info') : tag('Occupied', 'occ')}${handoverTag(p)}
      ${urgent ? tag('Urgent review', 'danger') : ''}${gaps.length ? tag('Docs incomplete', 'warn', gaps.map((g) => g.message).join('; ')) : ''}</span></a></li>`;
}

export function bindBedList(root, unit, beds, patients) {
  const state = { q: '', filter: 'all' };
  const target = root.querySelector('#bedList');
  const redraw = () => { target.innerHTML = bedListHtml(unit, beds, patients, state); };
  root.querySelector('#bedSearch').addEventListener('input', (e) => { state.q = e.target.value; redraw(); });
  root.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    state.filter = b.dataset.filter;
    root.querySelectorAll('[data-filter]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
    redraw();
  }));
}
