// CENTRAL UNIT / BED CONFIGURATION — the single source of truth for units,
// bed counts and team allocations. Edit this file to change them.
//
// `teams` is only defined where team allocations were explicitly confirmed
// (MICU, TCO). Units with `teams: null` have no team rules imposed.
// Bed ranges are inclusive: [from, to].

export const UNITS = [
  {
    id: 'micu', name: 'Medical ICU', short: 'MICU', beds: 21,
    teams: [
      { id: 'A', label: 'Team A', ranges: [[1, 5], [17, 21]] },
      { id: 'B', label: 'Team B', ranges: [[6, 16]] },
    ],
  },
  {
    id: 'tco', name: 'Trauma ICU', short: 'TCO', beds: 8,
    teams: [
      { id: 'A', label: 'Team A', ranges: [[1, 4]] },
      { id: 'B', label: 'Team B', ranges: [[5, 8]] },
    ],
  },
  { id: 'neuro', name: 'Neuro ICU', short: 'Neuro ICU', beds: 8, teams: null },
  { id: 'resp', name: 'Respiratory ICU', short: 'Resp ICU', beds: 14, teams: null },
  { id: 'general', name: 'General ICU', short: 'General ICU', beds: 14, teams: null },
  { id: 'pru', name: 'PRU', short: 'PRU', beds: 15, teams: null },
  { id: 'surgical', name: 'Surgical ICU', short: 'SICU', beds: 9, teams: null },
  { id: 'kash', name: 'KASH ICU', short: 'KASH ICU', beds: 22, teams: null },
];

export function getUnit(id) {
  return UNITS.find((u) => u.id === id) || null;
}

export function bedNumbers(unit) {
  return Array.from({ length: unit.beds }, (_, i) => i + 1);
}

/** Beds belonging to a team ([] for unknown team). */
export function teamBeds(unit, teamId) {
  const t = unit.teams && unit.teams.find((x) => x.id === teamId);
  if (!t) return [];
  const out = [];
  for (const [a, b] of t.ranges) for (let n = a; n <= b; n++) out.push(n);
  return out;
}

/** Team id for a bed, or null when the unit has no team rules. */
export function teamOfBed(unit, bed) {
  if (!unit.teams) return null;
  const t = unit.teams.find((x) => x.ranges.some(([a, b]) => bed >= a && bed <= b));
  return t ? t.id : null;
}

export function formatRanges(ranges) {
  return ranges.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ');
}

// Controlled vocabularies used by forms.
export const ISSUE_CATEGORIES = ['Respiratory', 'Cardiovascular', 'Neurological', 'Renal', 'Infection / Sepsis', 'GI / Nutrition', 'Endocrine / Metabolic', 'Hematology', 'Surgical / Trauma', 'Lines / Devices', 'Social / Family', 'Other'];
export const ISSUE_SEVERITIES = [
  { id: 'urgent', label: 'Urgent' },
  { id: 'important', label: 'Important' },
  { id: 'routine', label: 'Routine' },
];
export const ISSUE_STATUSES = [
  { id: 'active', label: 'Active' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'pending', label: 'Pending Action' },
  { id: 'resolved', label: 'Resolved' },
];
export const TASK_TYPES = [
  { id: 'task', label: 'Task' },
  { id: 'lab', label: 'Lab test' },
  { id: 'imaging', label: 'Imaging' },
  { id: 'consult', label: 'Consultation' },
  { id: 'deadline', label: 'Deadline' },
  { id: 'review', label: 'Review next shift' },
];
// Task types that count as "pending investigations".
export const INVESTIGATION_TYPES = ['lab', 'imaging', 'consult'];
export const CODE_STATUSES = ['Full code', 'DNAR', 'Limited escalation', 'Not discussed / unknown'];
export const STABILITY = [
  { id: 'stable', label: 'Stable' },
  { id: 'watch', label: 'Watcher' },
  { id: 'unstable', label: 'Unstable' },
];
export const VTE_DECISIONS = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
  { id: 'withheld', label: 'Contraindicated / Temporarily Withheld' },
  { id: 'not_assessed', label: 'Not Assessed — Review Required' },
];
export const VTE_METHODS = [
  { id: 'pharmacological', label: 'Pharmacological' },
  { id: 'mechanical', label: 'Mechanical' },
  { id: 'both', label: 'Both' },
];
export const VTE_REASONS = [
  { id: 'bleeding', label: 'Active bleeding / high bleeding risk' },
  { id: 'hematologic', label: 'Thrombocytopenia or other hematologic concern' },
  { id: 'procedure', label: 'Procedure-related hold' },
  { id: 'therapeutic', label: 'Therapeutic anticoagulation' },
  { id: 'other', label: 'Other' },
];
