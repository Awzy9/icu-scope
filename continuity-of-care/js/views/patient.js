import { repo } from '../repository.js';
import { UNITS, getUnit, bedNumbers, teamOfBed, ISSUE_CATEGORIES, ISSUE_SEVERITIES, ISSUE_STATUSES, TASK_TYPES, INVESTIGATION_TYPES, CODE_STATUSES, STABILITY, VTE_DECISIONS, VTE_METHODS, VTE_REASONS } from '../config.js';
import { newPatient, newIssue, newTask, openIssues, resolvedIssues, resolveIssue, reopenIssue, incompleteItems, vteGaps, needsUrgentReview } from '../logic.js';
import { esc, clone, getPath, setPath, fmtDateTime, toLocalInput, fromLocalInput, nowIso } from '../util.js';
import { getPrefs, tag, toast, confirmDialog, severityTag, issueStatusTag, handoverTag } from '../ui.js';
import { renderSummaryHtml } from './summary.js';

const DEMO_REVIEWER = 'Demo reviewer (unauthenticated)';

export async function renderPatient(root, idOrNew, query = {}) {
  const isNew = idOrNew === 'new';
  let draft;
  if (isNew) {
    const unitId = getUnit(query.unit) ? query.unit : getPrefs().unitId;
    draft = newPatient(unitId, query.bed);
    const clash = (await repo.listPatients({ unitId })).some((o) => Number(o.bed) === Number(query.bed));
    if (query.bed && clash) { draft.bed = ''; toast(`Bed ${query.bed} is already occupied — choose an available bed.`, 'warn'); }
  } else {
    draft = await repo.getPatient(idOrNew);
    if (!draft) { root.innerHTML = '<p class="empty">Patient not found. <a href="#/patients">Back to patients</a></p>'; return; }
  }

  const S = { draft, isNew, dirty: false, savedIssueIds: new Set(draft.issues.map((i) => i.id)), reviewOpen: false, others: await repo.listPatients() };
  const readOnly = draft.status !== 'active';
  const $ = (sel) => root.querySelector(sel);
  const setDirty = (v) => { S.dirty = v; window.__cocDirty = v; const el = $('#dirtyFlag'); if (el) el.hidden = !v; refreshActions(); };

  // ---------- field helpers ----------
  const val = (path) => getPath(S.draft, path) ?? '';
  const input = (path, lbl, { type = 'text', ph = '', req = false, extra = '', hint = '' } = {}) =>
    `<label class="field"><span>${esc(lbl)}${req ? ' <em class="req">required</em>' : ''}</span>
      <input type="${type}" data-bind="${path}" value="${esc(val(path))}" placeholder="${esc(ph)}" ${extra} />${hint ? `<small class="muted">${esc(hint)}</small>` : ''}</label>`;
  const area = (path, lbl, { rows = 3, ph = '', req = false } = {}) =>
    `<label class="field"><span>${esc(lbl)}${req ? ' <em class="req">required</em>' : ''}</span>
      <textarea data-bind="${path}" rows="${rows}" placeholder="${esc(ph)}">${esc(val(path))}</textarea></label>`;
  const select = (path, lbl, options, { blank = '' } = {}) =>
    `<label class="field"><span>${esc(lbl)}</span><select data-bind="${path}">
      ${blank !== null ? `<option value="">${esc(blank || 'Select…')}</option>` : ''}
      ${options.map((o) => { const id = o.id ?? o; const l = o.label ?? o; return `<option value="${esc(id)}"${String(val(path)) === String(id) ? ' selected' : ''}>${esc(l)}</option>`; }).join('')}</select></label>`;

  function bedOptions() {
    const taken = new Set(S.others.filter((o) => o.id !== S.draft.id && o.unitId === S.draft.unitId).map((o) => Number(o.bed)));
    const unit = getUnit(S.draft.unitId);
    return `<option value="">Select bed…</option>` + bedNumbers(unit).filter((n) => !taken.has(n) || n === Number(S.draft.bed))
      .map((n) => { const t = teamOfBed(unit, n); return `<option value="${n}"${n === Number(S.draft.bed) ? ' selected' : ''}>Bed ${n}${t ? ' · Team ' + t : ''}</option>`; }).join('');
  }

  // ---------- section renderers ----------
  function issueCard(i, idx) {
    const p = `issues.${i.id}`;
    return `<article class="issue sev-${esc(i.severity)}" data-issue="${i.id}" data-testid="issue-card">
      <header class="issue-head"><span class="issue-no">Issue ${idx + 1}</span>${severityTag(i.severity)}${issueStatusTag(i.status)}</header>
      ${input(`${p}.title`, 'Issue title', { ph: 'e.g. Septic shock — vasopressor wean', req: true, extra: 'data-testid="issue-title"' })}
      <div class="grid3">
        ${select(`${p}.category`, 'Category', ISSUE_CATEGORIES, { blank: null })}
        ${select(`${p}.severity`, 'Severity / priority', ISSUE_SEVERITIES, { blank: null })}
        <label class="field"><span>Status</span><select data-bind="${p}.status" data-issue-status="${i.id}">
          ${ISSUE_STATUSES.map((s) => `<option value="${s.id}"${i.status === s.id ? ' selected' : ''}>${s.label}</option>`).join('')}</select></label>
      </div>
      ${area(`${p}.summary`, 'Clinical summary', { rows: 2 })}
      ${area(`${p}.plan`, 'Management plan', { rows: 2 })}
      <div class="grid2">
        ${input(`${p}.pending`, 'Pending action / investigation')}
        ${input(`${p}.owner`, 'Responsible person / team')}
      </div>
      <label class="field"><span>Review date / time</span><input type="datetime-local" data-bind="${p}.reviewAt" data-kind="datetime" value="${esc(toLocalInput(i.reviewAt))}" /></label>
      <footer class="issue-actions">
        <button type="button" class="btn btn-ok" data-action="resolve-issue" data-id="${i.id}" data-testid="resolve-issue">✓ Mark Resolved</button>
        ${!S.savedIssueIds.has(i.id) ? `<button type="button" class="btn btn-quiet" data-action="remove-issue" data-id="${i.id}">Remove (added in error)</button>` : ''}
      </footer></article>`;
  }
  function resolvedCard(i) {
    return `<article class="issue resolved" data-issue="${i.id}" data-testid="resolved-card">
      <header class="issue-head"><strong>${esc(i.title || 'Untitled issue')}</strong>${tag('Resolved', 'ok')}<span class="muted small">${fmtDateTime(i.resolvedAt)}</span></header>
      <dl class="kv compact"><dt>Category</dt><dd>${esc(i.category)}</dd>
        <dt>Summary</dt><dd>${esc(i.summary || '—')}</dd><dt>Plan</dt><dd>${esc(i.plan || '—')}</dd>
        ${i.owner ? `<dt>Responsible</dt><dd>${esc(i.owner)}</dd>` : ''}${i.reopenedAt ? `<dt>Previously reopened</dt><dd>${fmtDateTime(i.reopenedAt)}</dd>` : ''}</dl>
      <footer class="issue-actions"><button type="button" class="btn" data-action="reopen-issue" data-id="${i.id}" data-testid="reopen-issue">↺ Reopen issue</button></footer></article>`;
  }
  function renderIssues() {
    const open = openIssues(S.draft), done = resolvedIssues(S.draft);
    const wasOpen = $('#resolvedDetails')?.open;
    $('#issuesBody').innerHTML = `
      <div class="sec-head"><h2 id="issues-h">Active Issues <span class="count" data-testid="open-count">${open.length}</span></h2>
        <button type="button" class="btn btn-primary" data-action="add-issue" data-testid="add-issue">+ Add Active Issue</button></div>
      ${open.length ? open.map((i, n) => issueCard(i, n)).join('') : '<p class="empty small">No active issues. Use “+ Add Active Issue” to record one.</p>'}
      ${open.length > 1 ? '<button type="button" class="btn btn-primary btn-block" data-action="add-issue">+ Add Active Issue</button>' : ''}
      <details id="resolvedDetails" class="resolved-box" data-testid="resolved-section" ${wasOpen ? 'open' : ''}><summary>Resolved Issues (<span data-testid="resolved-count">${done.length}</span>)</summary>
        ${done.length ? done.map(resolvedCard).join('') : '<p class="muted small">No resolved issues yet. Resolved issues are kept here for review.</p>'}</details>`;
    refreshAll();
  }
  function taskRow(t) {
    const p = `tasks.${t.id}`;
    return `<li class="task${t.done ? ' done' : ''}" data-task="${t.id}" data-testid="task-row">
      <label class="check"><input type="checkbox" data-task-toggle="${t.id}" ${t.done ? 'checked' : ''} aria-label="Completed: ${esc(t.text || 'task')}" /></label>
      <div class="task-main">
        <input type="text" data-bind="${p}.text" value="${esc(t.text)}" placeholder="Describe the task or investigation" aria-label="Task text" ${t.done ? '' : ''} />
        <div class="task-meta">
          <select data-bind="${p}.type" aria-label="Type">${TASK_TYPES.map((x) => `<option value="${x.id}"${t.type === x.id ? ' selected' : ''}>${x.label}</option>`).join('')}</select>
          <input type="datetime-local" data-bind="${p}.due" data-kind="datetime" value="${esc(toLocalInput(t.due))}" aria-label="Due" />
          ${t.done ? `<span class="small ok-text">Completed ${fmtDateTime(t.doneAt)}</span>` : ''}
          <button type="button" class="btn btn-quiet btn-sm" data-action="remove-task" data-id="${t.id}" aria-label="Remove task">Remove</button>
        </div></div></li>`;
  }
  function renderTasks() {
    const t = S.draft.tasks;
    const inv = t.filter((x) => !x.done && INVESTIGATION_TYPES.includes(x.type));
    const oth = t.filter((x) => !x.done && !INVESTIGATION_TYPES.includes(x.type));
    const done = t.filter((x) => x.done);
    const grp = (title, list, tid) => `<h3>${title} <span class="count">${list.length}</span></h3>${list.length ? `<ul class="tasks" data-testid="${tid}">${list.map(taskRow).join('')}</ul>` : '<p class="muted small">None.</p>'}`;
    $('#tasksBody').innerHTML = `
      <div class="add-task"><label class="field inline"><span class="sr-only">New item type</span><select id="newTaskType" aria-label="New item type">${TASK_TYPES.map((x) => `<option value="${x.id}">${x.label}</option>`).join('')}</select></label>
        <button type="button" class="btn" data-action="add-task" data-testid="add-task">+ Add item</button></div>
      ${grp('Pending investigations (labs, imaging, consults)', inv, 'inv-list')}
      ${grp('Outstanding tasks &amp; deadlines', oth, 'task-list')}
      <details class="resolved-box" data-testid="done-tasks" ${done.length && $('#tasksBody details')?.open ? 'open' : ''}><summary>Completed (${done.length})</summary>
        ${done.length ? `<ul class="tasks">${done.map(taskRow).join('')}</ul>` : '<p class="muted small">Nothing completed yet.</p>'}</details>`;
    refreshAll();
  }

  function vteHtml() {
    const v = S.draft.vte;
    return `<fieldset class="vte-decision"><legend>Is the patient receiving DVT prophylaxis?</legend>
      ${VTE_DECISIONS.map((d) => `<label class="radio${d.id === 'not_assessed' ? ' warn' : ''}"><input type="radio" name="vteDecision" value="${d.id}" data-vte-decision ${v.decision === d.id ? 'checked' : ''} /><span>${esc(d.label)}</span></label>`).join('')}
    </fieldset>
    <div id="vteWarn" role="status" data-testid="vte-warning"></div>

    <div data-vte-panel="yes" hidden>
      <fieldset class="vte-decision"><legend>Method</legend>
        ${VTE_METHODS.map((m) => `<label class="radio"><input type="radio" name="vteMethod" value="${m.id}" data-bind="vte.method" ${v.method === m.id ? 'checked' : ''} /><span>${m.label}</span></label>`).join('')}</fieldset>
      <div data-vte-pharm hidden class="grid3">
        ${input('vte.agent', 'Agent', { ph: 'e.g. Enoxaparin' })}${input('vte.dose', 'Dose', { ph: 'e.g. 40 mg SC' })}${input('vte.frequency', 'Frequency', { ph: 'e.g. Once daily' })}
      </div>
      ${area('vte.details', 'Clinical details (optional)', { rows: 2, ph: 'e.g. mechanical device type, renal dosing, monitoring' })}
    </div>

    <div data-vte-panel="reasons" hidden>
      <fieldset><legend>Reason (required)</legend>
        ${VTE_REASONS.map((r) => `<label class="check-line"><input type="checkbox" data-vte-reason="${r.id}" ${(v.reasons || []).includes(r.id) ? 'checked' : ''} /><span>${esc(r.label)}</span></label>`).join('')}
        <label class="check-line unknown"><input type="checkbox" data-bind="vte.reasonUnknown" ${v.reasonUnknown ? 'checked' : ''} /><span>Reason unknown — flag for clinician review</span></label>
      </fieldset>
      ${area('vte.reasonDetails', 'Clinical details', { rows: 2, ph: 'Required if “Other” is selected' })}
      ${area('vte.reassessPlan', 'Reassessment plan', { rows: 2, ph: 'When and how will prophylaxis be reconsidered?' })}
      <label class="field"><span>Reassessment review time</span><input type="datetime-local" data-bind="vte.reviewAt" data-kind="datetime" value="${esc(toLocalInput(v.reviewAt))}" /></label>
    </div>
    <p class="muted small">This section records the treating team’s decision. It does not recommend or prescribe prophylaxis.</p>`;
  }

  function applyVte() {
    const v = S.draft.vte;
    const show = (sel, on) => root.querySelectorAll(sel).forEach((e) => { e.hidden = !on; });
    show('[data-vte-panel="yes"]', v.decision === 'yes');
    show('[data-vte-panel="reasons"]', v.decision === 'no' || v.decision === 'withheld');
    show('[data-vte-pharm]', v.decision === 'yes' && (v.method === 'pharmacological' || v.method === 'both'));
    const gaps = vteGaps(v);
    const w = $('#vteWarn');
    if (!w) return;
    if (v.decision === 'not_assessed') w.innerHTML = '<div class="notice notice-warn"><strong>Not assessed — review required.</strong> This item stays outstanding until a decision is documented.</div>';
    else if (gaps.length) w.innerHTML = `<div class="notice notice-warn"><strong>Documentation incomplete</strong><ul>${gaps.map((g) => `<li>${esc(g.message)}</li>`).join('')}</ul></div>`;
    else w.innerHTML = '<div class="notice notice-ok">VTE prophylaxis decision documented.</div>';
    const sec = $('#sec-vte'); if (sec) sec.classList.toggle('flagged', gaps.length > 0);
  }

  function refreshSummary() {
    $('#summaryBody').innerHTML = renderSummaryHtml(S.draft);
    if (S.reviewOpen) $('#reviewBody').innerHTML = renderSummaryHtml(S.draft, { full: true });
  }
  function refreshHeader() {
    const d = S.draft, u = getUnit(d.unitId);
    const gaps = incompleteItems(d).length;
    $('#phTitle').textContent = d.name?.trim() || (S.isNew ? 'New patient' : 'Unnamed patient');
    $('#phSub').textContent = `${u.short}${d.bed ? ' · Bed ' + d.bed : ''}${d.mrn ? ' · ' + d.mrn : ''}`;
    $('#phTags').innerHTML = (S.isNew ? tag('New', 'info') : handoverTag(d)) + (needsUrgentReview(d) ? tag('Urgent review', 'danger') : '') + (gaps ? tag(`${gaps} gap${gaps > 1 ? 's' : ''}`, 'warn') : '') + (d.status !== 'active' ? tag(d.status, 'neutral') : '');
    $('#jmpIssues').textContent = `Issues (${openIssues(d).length})`;
    $('#jmpReview').textContent = gaps ? `Review (${gaps} ⚠)` : 'Review';
  }
  function refreshActions() {
    const rb = $('#btnReviewed'), rd = $('#btnReady'), hint = $('#reviewHint');
    if (!rb) return;
    const st = S.draft.handover.status;
    rb.disabled = S.dirty || S.isNew || st !== 'ready';
    rd.disabled = readOnly || (st === 'ready' && !S.dirty) || (st === 'reviewed' && !S.dirty);
    hint.textContent = S.isNew ? 'Save the handover first.' : S.dirty ? 'Unsaved changes — save the handover before marking it reviewed.' : st === 'draft' ? 'Mark the handover Ready before the incoming senior can review it.' : st === 'reviewed' ? 'Already reviewed.' : '';
  }
  function refreshAll() { refreshHeader(); applyVte(); refreshSummary(); refreshActions(); }

  // ---------- page shell ----------
  const bannerPast = readOnly ? `<div class="notice notice-info">This patient was <strong>${esc(S.draft.status)}</strong>${S.draft.outcome ? ' on ' + fmtDateTime(S.draft.outcome.at) : ''}${S.draft.outcome?.note ? ' — ' + esc(S.draft.outcome.note) : ''}. The record is kept for reference and is read-only.</div>` : '';
  root.innerHTML = `
    <p class="back-row"><a href="#/" class="back">← Dashboard</a></p>
    <div class="patient-head" data-testid="patient-head">
      <div class="ph-main"><h1 id="phTitle"></h1><p class="muted" id="phSub"></p><div class="tags" id="phTags"></div></div>
      <div class="ph-actions">
        <span id="dirtyFlag" class="dirty" hidden>● Unsaved changes</span>
        ${readOnly ? '' : '<button type="button" class="btn btn-primary" data-action="save" data-testid="save-handover">Save Handover</button>'}
      </div>
      <nav class="jump" aria-label="Sections">
        <button type="button" class="chip" data-jump="sec-id">Patient</button>
        <button type="button" class="chip" data-jump="sec-status">Status</button>
        <button type="button" class="chip" data-jump="sec-issues" id="jmpIssues">Issues</button>
        <button type="button" class="chip" data-jump="sec-plan">Plan</button>
        <button type="button" class="chip" data-jump="sec-vte">VTE</button>
        <button type="button" class="chip" data-jump="sec-review" id="jmpReview">Review</button>
      </nav>
    </div>
    ${bannerPast}
    <div id="formErrors" role="alert" data-testid="form-errors"></div>
    <fieldset class="form-fs" ${readOnly ? 'disabled' : ''}>
      <section class="panel" id="sec-id"><h2>A · Patient identification</h2>
        <p class="muted small">Demonstration uses synthetic names and fictional MRNs only.</p>
        <div class="grid2">
          ${input('name', 'Display name', { req: true, ph: 'Synthetic name', extra: 'data-testid="f-name" autocomplete="off"' })}
          ${input('mrn', 'Medical record number', { ph: 'Fictional, e.g. DEMO-000123', extra: 'data-testid="f-mrn" autocomplete="off"' })}
        </div>
        <div class="grid3">
          ${input('age', 'Age', { type: 'number', extra: 'inputmode="numeric" min="0" max="120" data-testid="f-age"' })}
          ${select('sex', 'Sex', ['Male', 'Female', 'Other', 'Unknown'])}
          <label class="field"><span>Admission date</span><input type="date" data-bind="admissionDate" value="${esc(S.draft.admissionDate)}" /></label>
        </div>
        <div class="grid3">
          <label class="field"><span>Unit</span><select data-bind="unitId" id="unitField" ${S.isNew ? '' : 'disabled'} data-testid="f-unit">${UNITS.map((u) => `<option value="${u.id}"${u.id === S.draft.unitId ? ' selected' : ''}>${esc(u.short)}</option>`).join('')}</select></label>
          <label class="field"><span>Bed</span><select data-bind="bed" id="bedField" data-testid="f-bed">${bedOptions()}</select></label>
          ${select('codeStatus', 'Code status', CODE_STATUSES)}
        </div>
        ${input('diagnosis', 'Primary diagnosis', { extra: 'data-testid="f-diagnosis"' })}
        ${area('comorbidities', 'Relevant comorbidities', { rows: 2 })}
      </section>

      <section class="panel" id="sec-status"><h2>B · Current clinical status</h2>
        <fieldset class="vte-decision"><legend>Current stability</legend>
          ${STABILITY.map((s) => `<label class="radio"><input type="radio" name="stab" value="${s.id}" data-bind="clinical.stability" ${S.draft.clinical.stability === s.id ? 'checked' : ''} /><span>${s.label}</span></label>`).join('')}</fieldset>
        ${area('clinical.summary', 'Brief clinical summary', { rows: 3, req: true, ph: 'One or two lines for the incoming senior' })}
        ${area('clinical.concerns', 'Major concerns', { rows: 2 })}
        <details class="more" open><summary>Systems &amp; devices <span class="muted small">(optional — fill what is relevant)</span></summary>
          ${area('clinical.airway', 'Airway & respiratory support', { rows: 2 })}
          ${area('clinical.hemodynamics', 'Hemodynamic status & vasopressors', { rows: 2 })}
          ${area('clinical.neuro', 'Neurological status', { rows: 2 })}
          ${area('clinical.renal', 'Renal function & renal replacement therapy', { rows: 2 })}
          ${area('clinical.labsImaging', 'Important laboratory / imaging findings', { rows: 2 })}
          ${area('clinical.devices', 'Lines, drains & devices', { rows: 2 })}
        </details>
      </section>

      <section class="panel panel-issues" id="sec-issues" aria-labelledby="issues-h"><div id="issuesBody"></div></section>

      <section class="panel" id="sec-plan"><h2>D · Plan for the incoming senior</h2>
        ${area('plan.priorities', 'Prioritized management plan', { rows: 4, req: true, ph: '1. …\n2. …' })}
        ${area('plan.nextShift', 'Items to review on the next shift', { rows: 2 })}
        <div id="tasksBody"></div>
      </section>

      <section class="panel panel-vte" id="sec-vte"><h2>E · VTE / DVT Prophylaxis</h2>${vteHtml()}</section>
    </fieldset>

    <section class="panel" id="sec-review"><h2>Handover summary &amp; review</h2>
      <div id="summaryBody"></div>
      ${readOnly ? '' : `
      <div class="action-bar">
        <button type="button" class="btn btn-primary" data-action="save">Save Handover</button>
        <button type="button" class="btn" id="btnReady" data-action="ready" data-testid="mark-ready">Mark Ready for Handover</button>
        <button type="button" class="btn" id="btnReview" data-action="review" data-testid="review-handover" ${S.isNew ? 'disabled' : ''}>Review Handover</button>
        <button type="button" class="btn btn-ok" id="btnReviewed" data-action="reviewed" data-testid="mark-reviewed" disabled>Mark Reviewed by Incoming Senior</button>
      </div>
      <p class="muted small" id="reviewHint"></p>
      <div id="reviewPanel" hidden><h3>Full handover (read-only)</h3><div id="reviewBody"></div></div>
      <p class="muted small">Prototype: the reviewer is a demonstration label (“${esc(DEMO_REVIEWER)}”), not an authenticated person.</p>`}
    </section>

    ${!S.isNew && !readOnly ? `<section class="panel" id="sec-lifecycle"><h2>Bed &amp; patient status</h2>
      <label class="check-line"><input type="checkbox" data-bind="transferPending" ${S.draft.transferPending ? 'checked' : ''} /><span>Transfer pending (bed shows “Transfer Pending”)</span></label>
      <label class="field"><span>Note for transfer / discharge (optional)</span><input type="text" id="outcomeNote" placeholder="e.g. to ward 4B / home" /></label>
      <div class="action-bar">
        <button type="button" class="btn btn-danger-outline" data-action="transferred" data-testid="mark-transferred">Mark Transferred</button>
        <button type="button" class="btn btn-danger-outline" data-action="discharged" data-testid="mark-discharged">Mark Discharged</button>
      </div>
      <p class="muted small">The record is kept in Patients and Handover History; the bed becomes available.</p></section>` : ''}
  `;

  renderIssues();
  renderTasks();

  // ---------- events ----------
  function showErrors(errs) {
    $('#formErrors').innerHTML = errs.length ? `<div class="notice notice-error"><strong>Could not save</strong><ul>${errs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : '';
    if (errs.length) $('#formErrors').scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function onBind(e) {
    const el = e.target;
    const path = el.dataset.bind;
    if (!path) return;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.kind === 'datetime') v = fromLocalInput(v);
    if (path === 'bed') v = v === '' ? '' : Number(v);
    if (path === 'unitId') { setPath(S.draft, 'bed', ''); }
    if (path.endsWith('.status') && path.startsWith('issues.')) {
      const id = path.split('.')[1];
      const issue = S.draft.issues.find((x) => x.id === id);
      if (v === 'resolved') { resolveIssue(issue); setDirty(true); renderIssues(); toast('Issue marked resolved and moved to Resolved Issues.'); return; }
    }
    setPath(S.draft, path, v);
    setDirty(true);
    if (path === 'unitId') $('#bedField').innerHTML = bedOptions();
    if (path.startsWith('issues.') && (path.endsWith('.severity') || path.endsWith('.status'))) renderIssues();
    else if (path.startsWith('tasks.') && path.endsWith('.type')) renderTasks();
    else { refreshHeader(); applyVte(); scheduleSummary(); }
  }
  let sumTimer;
  const scheduleSummary = () => { clearTimeout(sumTimer); sumTimer = setTimeout(refreshSummary, 150); };

  root.addEventListener('input', (e) => { if (e.target.dataset.bind && e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT' && e.target.type !== 'radio') onBind(e); });
  root.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.dataset.vteDecision !== undefined) { S.draft.vte.decision = el.value; setDirty(true); applyVte(); scheduleSummary(); refreshHeader(); return; }
    if (el.dataset.vteReason) {
      const set = new Set(S.draft.vte.reasons || []);
      el.checked ? set.add(el.dataset.vteReason) : set.delete(el.dataset.vteReason);
      S.draft.vte.reasons = [...set]; setDirty(true); applyVte(); scheduleSummary(); return;
    }
    if (el.dataset.taskToggle) {
      const t = S.draft.tasks.find((x) => x.id === el.dataset.taskToggle);
      t.done = el.checked; t.doneAt = el.checked ? nowIso() : '';
      setDirty(true); renderTasks(); return;
    }
    if (el.dataset.bind && (el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'radio' || el.dataset.kind === 'datetime' || el.type === 'date')) onBind(e);
  });

  root.addEventListener('click', async (e) => {
    const jump = e.target.closest('[data-jump]');
    if (jump) { document.getElementById(jump.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    switch (action) {
      case 'add-issue': {
        const i = newIssue(); S.draft.issues.push(i); setDirty(true); renderIssues();
        const card = $(`[data-issue="${i.id}"]`);
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card?.querySelector('[data-testid="issue-title"]')?.focus({ preventScroll: true });
        break;
      }
      case 'resolve-issue': {
        const i = S.draft.issues.find((x) => x.id === id);
        if (!i.title.trim()) { toast('Give the issue a title before resolving it.', 'error'); $(`[data-issue="${id}"] [data-testid="issue-title"]`)?.focus(); break; }
        resolveIssue(i); setDirty(true); renderIssues(); toast(`“${i.title}” resolved. It is kept under Resolved Issues.`);
        break;
      }
      case 'reopen-issue': {
        const i = S.draft.issues.find((x) => x.id === id);
        reopenIssue(i); setDirty(true); renderIssues(); toast(`“${i.title}” reopened.`, 'warn');
        break;
      }
      case 'remove-issue':
        if (await confirmDialog({ title: 'Remove this issue?', message: 'This issue has not been saved yet, so removing it deletes it. Saved issues can only be resolved, never deleted.', confirmLabel: 'Remove', danger: true })) {
          S.draft.issues = S.draft.issues.filter((x) => x.id !== id); setDirty(true); renderIssues();
        }
        break;
      case 'add-task': {
        const t = newTask({ type: $('#newTaskType').value }); S.draft.tasks.push(t); setDirty(true); renderTasks();
        $(`[data-task="${t.id}"] input[type="text"]`)?.focus();
        break;
      }
      case 'remove-task':
        if (await confirmDialog({ title: 'Remove this item?', message: 'The task or investigation will be removed from the handover.', confirmLabel: 'Remove', danger: true })) {
          S.draft.tasks = S.draft.tasks.filter((x) => x.id !== id); setDirty(true); renderTasks();
        }
        break;
      case 'save': await doSave(); break;
      case 'ready': await doReady(); break;
      case 'review':
        S.reviewOpen = !S.reviewOpen; $('#reviewPanel').hidden = !S.reviewOpen;
        btn.textContent = S.reviewOpen ? 'Hide full review' : 'Review Handover';
        if (S.reviewOpen) { refreshSummary(); $('#reviewPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        break;
      case 'reviewed': await doReviewed(); break;
      case 'transferred': case 'discharged': await doOutcome(action); break;
    }
  });

  // ---------- persistence actions ----------
  function prepareForSave() {
    const errs = [];
    S.draft.tasks = S.draft.tasks.filter((t) => t.text.trim());
    S.draft.issues.forEach((i, n) => { if (!i.title.trim()) errs.push(`Issue ${n + 1} needs a title (or remove it).`); });
    return errs;
  }
  async function persist(action, mutate) {
    const errs = prepareForSave();
    if (errs.length) { showErrors(errs); toast('Please fix the highlighted problems.', 'error'); return false; }
    const wasRevertable = !S.isNew && S.dirty && ['ready', 'reviewed'].includes(S.draft.handover.status);
    if (wasRevertable && !mutate) {
      S.draft.handover.status = 'draft'; S.draft.handover.reviewedAt = ''; S.draft.handover.reviewerLabel = ''; S.draft.handover.reviewedWithGaps = false;
    }
    if (mutate) mutate(S.draft);
    S.draft.handover.savedAt = nowIso();
    try {
      const saved = await repo.savePatient(S.draft, { action });
      S.draft = saved; S.savedIssueIds = new Set(saved.issues.map((i) => i.id)); S.others = await repo.listPatients();
      showErrors([]);
      const wasNew = S.isNew; S.isNew = false; setDirty(false);
      if (wasNew) { history.replaceState(null, '', `#/patient/${saved.id}`); window.dispatchEvent(new Event('hashchange')); return true; }
      renderIssues(); renderTasks();
      if (wasRevertable && !mutate) toast('Saved. The handover was edited after being marked ready/reviewed, so it is a Draft again.', 'warn');
      return true;
    } catch (err) {
      showErrors(err.errors || [err.message]); toast(err.errors?.[0] || err.message, 'error'); return false;
    }
  }
  async function doSave() { if (await persist('saved')) toast('Handover saved (stored in this browser only).'); }
  async function doReady() {
    const gaps = incompleteItems(S.draft);
    if (gaps.length && !(await confirmDialog({ title: 'Mark ready with incomplete documentation?', message: 'These items are still outstanding. The handover will be flagged “Ready — gaps” and the gaps stay visible to the incoming senior.', list: gaps.map((g) => g.message), confirmLabel: 'Mark ready anyway' }))) return;
    if (await persist('ready', (d) => { d.handover.status = 'ready'; d.handover.readyAt = nowIso(); d.handover.readyWithGaps = gaps.length; d.handover.reviewedAt = ''; d.handover.reviewerLabel = ''; d.handover.reviewedWithGaps = false; })) toast('Handover marked ready.');
  }
  async function doReviewed() {
    const gaps = incompleteItems(S.draft);
    if (gaps.length && !(await confirmDialog({ title: 'Mark reviewed with outstanding documentation?', message: 'Reviewing does not complete missing documentation. It will be recorded as reviewed WITH outstanding items.', list: gaps.map((g) => g.message), confirmLabel: 'Mark reviewed' }))) return;
    if (await persist('reviewed', (d) => { d.handover.status = 'reviewed'; d.handover.reviewedAt = nowIso(); d.handover.reviewerLabel = DEMO_REVIEWER; d.handover.reviewedWithGaps = gaps.length > 0; })) toast('Handover marked reviewed.');
  }
  async function doOutcome(kind) {
    const word = kind === 'transferred' ? 'transferred' : 'discharged';
    if (!(await confirmDialog({ title: `Mark patient ${word}?`, message: `${S.draft.name || 'This patient'} will be marked ${word} and Bed ${S.draft.bed} will become available. The record and handover history are kept.`, confirmLabel: `Mark ${word}`, danger: true }))) return;
    const note = $('#outcomeNote')?.value.trim() || '';
    const ok = await persist(kind, (d) => { d.status = kind; d.transferPending = false; d.outcome = { type: kind, at: nowIso(), note }; });
    if (ok) { toast(`Patient marked ${word}. Record kept.`); location.hash = '#/patients'; }
  }

  setDirty(false);
}
