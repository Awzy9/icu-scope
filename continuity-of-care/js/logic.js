// Pure clinical-documentation logic. No DOM, no storage — unit-testable.
// Nothing here prescribes prophylaxis or decides contraindications: it only
// reports what has / has not been documented by the treating team.
import { INVESTIGATION_TYPES, getUnit } from './config.js';

export const isOpenIssue = (i) => i.status !== 'resolved';
export const openIssues = (p) => p.issues.filter(isOpenIssue);
export const resolvedIssues = (p) => p.issues.filter((i) => !isOpenIssue(i));
export const outstandingTasks = (p) => p.tasks.filter((t) => !t.done);
export const pendingInvestigations = (p) =>
  p.tasks.filter((t) => !t.done && INVESTIGATION_TYPES.includes(t.type));

/** Documentation gaps in the VTE section. Returns [{field,message,level}] */
export function vteGaps(vte) {
  const gaps = [];
  const v = vte || {};
  switch (v.decision) {
    case 'yes':
      if (!v.method) gaps.push({ field: 'vte.method', message: 'VTE prophylaxis method not recorded' });
      if (v.method === 'pharmacological' || v.method === 'both') {
        if (!v.agent?.trim()) gaps.push({ field: 'vte.agent', message: 'VTE prophylaxis agent not recorded' });
        if (!v.dose?.trim()) gaps.push({ field: 'vte.dose', message: 'VTE prophylaxis dose not recorded' });
        if (!v.frequency?.trim()) gaps.push({ field: 'vte.frequency', message: 'VTE prophylaxis frequency not recorded' });
      }
      break;
    case 'no':
    case 'withheld': {
      const reasons = v.reasons || [];
      if (v.reasonUnknown) {
        gaps.push({ field: 'vte.reasonUnknown', message: 'VTE prophylaxis reason unknown — clinician review required' });
      } else if (reasons.length === 0) {
        gaps.push({ field: 'vte.reasons', message: 'Reason for no / withheld VTE prophylaxis not documented' });
      } else if (reasons.includes('other') && !v.reasonDetails?.trim()) {
        gaps.push({ field: 'vte.reasonDetails', message: 'VTE "Other" reason needs clinical details' });
      }
      if (!v.reassessPlan?.trim() && !v.reviewAt) {
        gaps.push({ field: 'vte.reassessPlan', message: 'VTE prophylaxis reassessment plan / review time not recorded' });
      }
      break;
    }
    case 'not_assessed':
      gaps.push({ field: 'vte.decision', message: 'VTE prophylaxis NOT ASSESSED — review required' });
      break;
    default:
      gaps.push({ field: 'vte.decision', message: 'VTE prophylaxis decision not documented' });
  }
  return gaps;
}

/** All incomplete mandatory documentation for a patient. */
export function incompleteItems(p) {
  const gaps = [];
  if (!p.name?.trim()) gaps.push({ field: 'name', message: 'Patient name missing' });
  if (!p.mrn?.trim()) gaps.push({ field: 'mrn', message: 'Medical record number missing' });
  if (!p.diagnosis?.trim()) gaps.push({ field: 'diagnosis', message: 'Primary diagnosis missing' });
  if (!p.clinical?.summary?.trim()) gaps.push({ field: 'clinical.summary', message: 'Clinical summary missing' });
  if (!p.plan?.priorities?.trim()) gaps.push({ field: 'plan.priorities', message: 'Prioritized management plan missing' });
  gaps.push(...vteGaps(p.vte));
  return gaps;
}
export const isIncomplete = (p) => incompleteItems(p).length > 0;

export const needsUrgentReview = (p) =>
  openIssues(p).some((i) => i.severity === 'urgent') || p.clinical?.stability === 'unstable';

/** Why urgent review is flagged (for display). */
export function urgentReasons(p) {
  const r = [];
  const n = openIssues(p).filter((i) => i.severity === 'urgent').length;
  if (n) r.push(`${n} urgent issue${n > 1 ? 's' : ''}`);
  if (p.clinical?.stability === 'unstable') r.push('marked unstable');
  return r;
}

/** Bed status for a patient record: occupied | transfer. */
export function bedStatus(p) {
  return p.transferPending ? 'transfer' : 'occupied';
}

/** Validate a patient before saving. `others` = other ACTIVE patients in all units. */
export function validatePatient(p, others) {
  const errors = [];
  const unit = getUnit(p.unitId);
  if (!unit) errors.push('Choose a valid unit.');
  const bed = Number(p.bed);
  if (unit) {
    if (!Number.isInteger(bed) || bed < 1 || bed > unit.beds) errors.push(`Bed must be between 1 and ${unit.beds} for ${unit.short}.`);
    else if (others.some((o) => o.id !== p.id && o.status === 'active' && o.unitId === p.unitId && Number(o.bed) === bed)) {
      errors.push(`Bed ${bed} in ${unit.short} is already assigned to another patient.`);
    }
  }
  if (!p.name?.trim()) errors.push('Enter a display name for the patient.');
  return errors;
}

/** Aggregate stats for a list of active patients in a given set of beds. */
export function unitStats(totalBeds, patients) {
  const occupied = patients.length;
  return {
    totalBeds,
    occupied,
    available: totalBeds - occupied,
    transferPending: patients.filter((p) => p.transferPending).length,
    urgent: patients.filter(needsUrgentReview).length,
    activeIssues: patients.reduce((n, p) => n + openIssues(p).length, 0),
    pendingInvestigations: patients.reduce((n, p) => n + pendingInvestigations(p).length, 0),
    outstandingTasks: patients.reduce((n, p) => n + outstandingTasks(p).length, 0),
    incomplete: patients.filter(isIncomplete).length,
  };
}

export function newIssue(overrides = {}) {
  return {
    id: `iss_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title: '', category: 'Other', severity: 'important', status: 'active',
    summary: '', plan: '', pending: '', owner: '', reviewAt: '',
    createdAt: new Date().toISOString(), resolvedAt: '', reopenedAt: '', ...overrides,
  };
}
export function newTask(overrides = {}) {
  return {
    id: `tsk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    text: '', type: 'task', due: '', done: false, doneAt: '',
    createdAt: new Date().toISOString(), ...overrides,
  };
}
export function resolveIssue(issue, at = new Date().toISOString()) {
  issue.prevStatus = issue.status;
  issue.status = 'resolved';
  issue.resolvedAt = at;
  return issue;
}
export function reopenIssue(issue, at = new Date().toISOString()) {
  issue.status = 'active';
  issue.reopenedAt = at;
  issue.resolvedAt = '';
  return issue;
}
export function newPatient(unitId, bed) {
  return {
    id: `pt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    unitId, bed: bed ? Number(bed) : '', status: 'active', transferPending: false,
    name: '', mrn: '', age: '', sex: '', admissionDate: new Date().toISOString().slice(0, 10),
    diagnosis: '', comorbidities: '', codeStatus: '',
    clinical: { summary: '', stability: 'stable', concerns: '', airway: '', hemodynamics: '', neuro: '', renal: '', labsImaging: '', devices: '' },
    issues: [], tasks: [],
    plan: { priorities: '', nextShift: '' },
    vte: { decision: 'not_assessed', method: '', agent: '', dose: '', frequency: '', details: '', reasons: [], reasonUnknown: false, reasonDetails: '', reassessPlan: '', reviewAt: '' },
    handover: { status: 'draft', savedAt: '', readyAt: '', readyWithGaps: 0, reviewedAt: '', reviewerLabel: '' },
    outcome: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}
