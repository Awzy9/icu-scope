// Read-only handover summary, used on the patient screen (review section)
// and for historical snapshots.
import { VTE_DECISIONS, VTE_METHODS, VTE_REASONS, STABILITY, TASK_TYPES, getUnit } from '../config.js';
import { openIssues, resolvedIssues, outstandingTasks, pendingInvestigations, incompleteItems, urgentReasons } from '../logic.js';
import { esc, fmtDateTime, fmtDate } from '../util.js';
import { tag, severityTag, issueStatusTag } from '../ui.js';

const label = (list, id) => list.find((x) => x.id === id)?.label || id || '—';
const para = (t) => (t && t.trim() ? `<p class="pre">${esc(t)}</p>` : '<p class="muted">Not documented</p>');

export function vteSummary(v) {
  const d = label(VTE_DECISIONS, v.decision);
  if (v.decision === 'yes') {
    const drug = [v.agent, v.dose, v.frequency].filter((x) => x && x.trim()).join(' · ');
    return `${d} — ${v.method ? label(VTE_METHODS, v.method) : 'method not recorded'}${drug ? ': ' + drug : ''}`;
  }
  if (v.decision === 'no' || v.decision === 'withheld') {
    if (v.reasonUnknown) return `${d} — reason UNKNOWN (clinician review required)`;
    const r = (v.reasons || []).map((x) => label(VTE_REASONS, x)).join('; ');
    return `${d} — ${r || 'reason NOT documented'}`;
  }
  return d;
}

export function renderSummaryHtml(p, { full = false } = {}) {
  const gaps = incompleteItems(p);
  const issues = openIssues(p);
  const tasks = outstandingTasks(p).filter((t) => !['lab', 'imaging', 'consult'].includes(t.type));
  const inv = pendingInvestigations(p);
  const ur = urgentReasons(p);
  const vteBad = gaps.some((g) => g.field.startsWith('vte.'));
  const h = p.handover || {};

  return `<div class="summary" data-testid="handover-summary">
    ${gaps.length
      ? `<div class="notice notice-warn" role="alert" data-testid="incomplete-warning"><strong>Incomplete documentation (${gaps.length})</strong>
          <ul>${gaps.map((g) => `<li>${esc(g.message)}</li>`).join('')}</ul></div>`
      : '<div class="notice notice-ok" data-testid="complete-note">All mandatory documentation fields are complete.</div>'}
    ${h.status === 'reviewed' ? `<div class="notice notice-ok" data-testid="reviewed-note">Reviewed by incoming senior — <strong>${esc(h.reviewerLabel || 'Demo reviewer')}</strong> · ${fmtDateTime(h.reviewedAt)}${h.reviewedWithGaps ? ' · <strong>with outstanding documentation</strong>' : ''}</div>` : ''}

    <div class="sum-grid">
      <section><h3>Current clinical status</h3>
        <p>${tag(label(STABILITY, p.clinical?.stability), p.clinical?.stability === 'unstable' ? 'danger' : p.clinical?.stability === 'watch' ? 'warn' : 'ok')}
          ${ur.length ? tag('Urgent review: ' + ur.join(', '), 'danger') : ''}</p>
        ${para(p.clinical?.summary)}
        ${p.clinical?.concerns ? `<p><strong>Major concerns:</strong> ${esc(p.clinical.concerns)}</p>` : ''}</section>

      <section><h3>Active issues (${issues.length})</h3>
        ${issues.length ? `<ul class="plain">${issues.map((i) => `<li class="sum-issue sev-${esc(i.severity)}"><strong>${esc(i.title || 'Untitled issue')}</strong> ${severityTag(i.severity)} ${issueStatusTag(i.status)}
          ${i.plan ? `<div class="small">Plan: ${esc(i.plan)}</div>` : ''}${i.pending ? `<div class="small">Pending: ${esc(i.pending)}</div>` : ''}</li>`).join('')}</ul>` : '<p class="muted">No active issues.</p>'}</section>

      <section><h3>Outstanding tasks (${tasks.length})</h3>
        ${tasks.length ? `<ul class="plain">${tasks.map((t) => `<li>${esc(t.text || '(blank)')} ${tag(label(TASK_TYPES, t.type))}${t.due ? ` <span class="small muted">due ${fmtDateTime(t.due)}</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted">None.</p>'}</section>

      <section><h3>Pending investigations (${inv.length})</h3>
        ${inv.length ? `<ul class="plain">${inv.map((t) => `<li>${esc(t.text || '(blank)')} ${tag(label(TASK_TYPES, t.type))}${t.due ? ` <span class="small muted">due ${fmtDateTime(t.due)}</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted">None.</p>'}</section>

      <section class="${vteBad ? 'sum-flag' : ''}"><h3>VTE / DVT prophylaxis</h3>
        <p data-testid="vte-summary">${vteBad ? tag('Needs review', 'warn') : tag('Documented', 'ok')} ${esc(vteSummary(p.vte))}</p></section>
    </div>

    ${full ? `
      <h3>Patient</h3>
      <dl class="kv">
        <dt>Unit / bed</dt><dd>${esc(getUnit(p.unitId)?.name)} · Bed ${esc(p.bed)}</dd>
        <dt>MRN</dt><dd>${esc(p.mrn || '—')}</dd>
        <dt>Age / sex</dt><dd>${esc(p.age || '—')} / ${esc(p.sex || '—')}</dd>
        <dt>Admitted</dt><dd>${fmtDate(p.admissionDate)}</dd>
        <dt>Diagnosis</dt><dd>${esc(p.diagnosis || '—')}</dd>
        <dt>Comorbidities</dt><dd>${esc(p.comorbidities || '—')}</dd>
        <dt>Code status</dt><dd>${esc(p.codeStatus || '—')}</dd>
      </dl>
      <h3>Systems</h3>
      <dl class="kv">
        <dt>Airway / respiratory</dt><dd>${esc(p.clinical?.airway || '—')}</dd>
        <dt>Hemodynamics</dt><dd>${esc(p.clinical?.hemodynamics || '—')}</dd>
        <dt>Neurological</dt><dd>${esc(p.clinical?.neuro || '—')}</dd>
        <dt>Renal / RRT</dt><dd>${esc(p.clinical?.renal || '—')}</dd>
        <dt>Labs / imaging</dt><dd>${esc(p.clinical?.labsImaging || '—')}</dd>
        <dt>Lines / drains / devices</dt><dd>${esc(p.clinical?.devices || '—')}</dd>
      </dl>
      <h3>Plan for incoming senior</h3>
      ${para(p.plan?.priorities)}
      ${p.plan?.nextShift ? `<p><strong>Review next shift:</strong> ${esc(p.plan.nextShift)}</p>` : ''}
      <h3>Resolved issues (${resolvedIssues(p).length})</h3>
      ${resolvedIssues(p).length ? `<ul class="plain">${resolvedIssues(p).map((i) => `<li><strong>${esc(i.title)}</strong> <span class="muted small">resolved ${fmtDateTime(i.resolvedAt)}</span></li>`).join('')}</ul>` : '<p class="muted">None.</p>'}
      <h3>Completed tasks</h3>
      ${p.tasks.filter((t) => t.done).length ? `<ul class="plain">${p.tasks.filter((t) => t.done).map((t) => `<li>${esc(t.text)} <span class="muted small">done ${fmtDateTime(t.doneAt)}</span></li>`).join('')}</ul>` : '<p class="muted">None.</p>'}
    ` : ''}
  </div>`;
}
