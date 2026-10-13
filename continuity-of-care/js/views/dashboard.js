import { repo } from '../repository.js';
import { UNITS, getUnit, teamBeds, bedNumbers } from '../config.js';
import { unitStats, needsUrgentReview, urgentReasons, isIncomplete, incompleteItems } from '../logic.js';
import { esc } from '../util.js';
import { getPrefs, setPrefs, tag } from '../ui.js';
import { bedListHtml, bedFilterBar, bindBedList } from './bedlist.js';

export async function renderDashboard(root) {
  const prefs = getPrefs();
  const unit = getUnit(prefs.unitId);
  const all = await repo.listPatients({ unitId: unit.id });
  const beds = prefs.team === 'all' ? bedNumbers(unit) : teamBeds(unit, prefs.team);
  const patients = all.filter((p) => beds.includes(Number(p.bed)));
  const s = unitStats(beds.length, patients);
  const team = unit.teams && prefs.team !== 'all' ? unit.teams.find((t) => t.id === prefs.team) : null;

  const attention = patients.filter((p) => needsUrgentReview(p) || isIncomplete(p));

  root.innerHTML = `
    <section class="page-head">
      <div>
        <h1>${esc(unit.name)}${team ? ` <span class="muted">· ${esc(team.label)}</span>` : ''}</h1>
        <p class="muted">${esc(unit.short)} · ${unit.teams ? 'Select a team to narrow the view' : 'No team allocation configured for this unit'}</p>
      </div>
      <a class="btn btn-primary btn-lg" href="#/patient/new?unit=${unit.id}" data-testid="add-patient">+ Add Patient / Handover</a>
    </section>

    <section class="selectors" aria-label="Unit and team">
      <label class="field inline"><span>Unit</span>
        <select id="unitSel" data-testid="unit-select">${unitOptions(unit.id)}</select></label>
      ${unit.teams ? `<div class="seg" role="group" aria-label="Team filter">
        ${['all', ...unit.teams.map((t) => t.id)].map((t) => `<button class="seg-btn${prefs.team === t ? ' on' : ''}" data-team="${t}" aria-pressed="${prefs.team === t}">${t === 'all' ? 'All teams' : 'Team ' + t}</button>`).join('')}
      </div>` : ''}
    </section>

    <section class="stats" aria-label="Unit summary" data-testid="stats">
      ${stat('Beds', `${s.occupied}/${s.totalBeds}`, `${s.available} available`, 'beds')}
      ${stat('Urgent review', s.urgent, 'patients', 'urgent', s.urgent ? 'danger' : '')}
      ${stat('Active issues', s.activeIssues, 'open', 'issues')}
      ${stat('Pending investigations', s.pendingInvestigations, 'labs / imaging / consults', 'investigations')}
      ${stat('Outstanding tasks', s.outstandingTasks, 'not completed', 'tasks')}
      ${stat('Incomplete handovers', s.incomplete, 'documentation gaps', 'incomplete', s.incomplete ? 'warn' : '')}
    </section>

    ${attention.length ? `<section class="block" aria-labelledby="att-h">
      <h2 id="att-h">Needs attention</h2>
      <ul class="attn-list">${attention.sort((a, b) => a.bed - b.bed).map(attnRow).join('')}</ul>
    </section>` : ''}

    <section class="block" aria-labelledby="beds-h">
      <h2 id="beds-h">Patients &amp; beds</h2>
      ${bedFilterBar()}
      <div id="bedList">${bedListHtml(unit, beds, patients)}</div>
    </section>`;

  root.querySelector('#unitSel').addEventListener('change', (e) => { setPrefs({ unitId: e.target.value, team: 'all' }); renderDashboard(root); window.dispatchEvent(new Event('coc:prefs')); });
  root.querySelectorAll('[data-team]').forEach((b) => b.addEventListener('click', () => { setPrefs({ team: b.dataset.team }); renderDashboard(root); window.dispatchEvent(new Event('coc:prefs')); }));
  bindBedList(root, unit, beds, patients);
}

function stat(label, value, sub, id, tone = '') {
  return `<div class="stat ${tone}" data-stat="${id}"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div><div class="stat-sub">${esc(sub)}</div></div>`;
}

function unitOptions(sel) {
  return UNITS.map((u) => `<option value="${u.id}"${u.id === sel ? ' selected' : ''}>${esc(u.name)} (${u.short})</option>`).join('');
}

function attnRow(p) {
  const unit = getUnit(p.unitId);
  const why = [];
  const ur = urgentReasons(p);
  if (ur.length) why.push(tag('Urgent: ' + ur.join(', '), 'danger'));
  const gaps = incompleteItems(p);
  if (gaps.length) why.push(tag(`${gaps.length} documentation gap${gaps.length > 1 ? 's' : ''}`, 'warn', gaps.map((g) => g.message).join('; ')));
  return `<li><a class="attn" href="#/patient/${p.id}">
    <span class="bed-badge">${p.bed}</span>
    <span class="attn-main"><strong>${esc(p.name)}</strong> <span class="muted">${esc(unit.short)} · ${esc(p.diagnosis || 'No diagnosis recorded')}</span>
    <span class="tags">${why.join('')}</span></span></a></li>`;
}
