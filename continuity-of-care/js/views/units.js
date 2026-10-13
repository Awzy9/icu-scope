import { repo } from '../repository.js';
import { UNITS, getUnit, bedNumbers, teamOfBed, formatRanges } from '../config.js';
import { unitStats, needsUrgentReview, isIncomplete } from '../logic.js';
import { esc } from '../util.js';
import { getPrefs, setPrefs, tag } from '../ui.js';

export async function renderUnits(root) {
  const prefs = getPrefs();
  const unit = getUnit(prefs.unitId);
  const all = await repo.listPatients();
  const mine = all.filter((p) => p.unitId === unit.id);
  const byBed = new Map(mine.map((p) => [Number(p.bed), p]));

  root.innerHTML = `
    <section class="page-head"><div><h1>Units &amp; Beds</h1><p class="muted">All ${UNITS.length} ICU units. Select a unit to see its bed map.</p></div></section>
    <ul class="unit-list" data-testid="unit-list">
      ${UNITS.map((u) => {
        const s = unitStats(u.beds, all.filter((p) => p.unitId === u.id));
        return `<li><button class="unit-tile${u.id === unit.id ? ' on' : ''}" data-unit="${u.id}" aria-pressed="${u.id === unit.id}">
          <strong>${esc(u.name)}</strong><span class="muted small">${esc(u.short)} · ${u.beds} beds</span>
          <span class="small">${s.occupied} occupied · ${s.available} free</span>
          ${s.urgent ? `<span class="tags">${tag(s.urgent + ' urgent', 'danger')}</span>` : ''}
        </button></li>`;
      }).join('')}
    </ul>

    <section class="block" aria-labelledby="map-h">
      <h2 id="map-h" data-testid="bedmap-title">${esc(unit.name)} — bed map</h2>
      ${unit.teams
        ? `<ul class="team-alloc" data-testid="team-alloc">${unit.teams.map((t) => `<li>${tag(t.label, 'team')} beds ${esc(formatRanges(t.ranges))}</li>`).join('')}</ul>`
        : '<p class="muted small">No team allocation is configured for this unit.</p>'}
      <p class="muted small">Total beds: <strong data-testid="total-beds">${unit.beds}</strong></p>
      <div class="bed-grid" data-testid="bed-grid">
        ${bedNumbers(unit).map((n) => {
          const p = byBed.get(n);
          const team = teamOfBed(unit, n);
          const cls = !p ? 'free' : p.transferPending ? 'transfer' : 'occ';
          const flags = p ? (needsUrgentReview(p) ? ' urgent' : '') + (isIncomplete(p) ? ' incomplete' : '') : '';
          const href = p ? `#/patient/${p.id}` : `#/patient/new?unit=${unit.id}&bed=${n}`;
          const status = !p ? 'Available' : p.transferPending ? 'Transfer Pending' : 'Occupied';
          return `<a class="bed-cell ${cls}${flags}" href="${href}" data-bed="${n}" aria-label="Bed ${n}, ${status}${p ? ', ' + esc(p.name) : ''}${team ? ', Team ' + team : ''}">
            <span class="bed-num">${n}</span>${team ? `<span class="bed-team">${team}</span>` : ''}
            <span class="bed-name">${p ? esc(p.name || 'Unnamed') : 'Available'}</span>
            <span class="bed-state">${status}</span>
            ${p && (flags) ? `<span class="flag-dots">${needsUrgentReview(p) ? '<i class="dot d-danger" title="Urgent review"></i>' : ''}${isIncomplete(p) ? '<i class="dot d-warn" title="Documentation incomplete"></i>' : ''}</span>` : ''}</a>`;
        }).join('')}
      </div>
      <p class="legend small muted"><i class="dot d-danger"></i> urgent review · <i class="dot d-warn"></i> documentation incomplete</p>
    </section>`;

  root.querySelectorAll('[data-unit]').forEach((b) => b.addEventListener('click', () => {
    setPrefs({ unitId: b.dataset.unit, team: 'all' });
    window.dispatchEvent(new Event('coc:prefs'));
    renderUnits(root);
  }));
}
