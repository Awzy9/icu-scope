// SYNTHETIC DEMONSTRATION DATA ONLY. No real patients, no real MRNs.
import { newPatient, newIssue, newTask } from './logic.js';
import { hoursAgo, hoursAhead } from './util.js';

function mk(unitId, bed, base, extra = {}) {
  const p = newPatient(unitId, bed);
  Object.assign(p, base);
  p.clinical = { ...p.clinical, ...(extra.clinical || {}) };
  p.plan = { ...p.plan, ...(extra.plan || {}) };
  p.vte = { ...p.vte, ...(extra.vte || {}) };
  p.issues = (extra.issues || []).map((i) => newIssue(i));
  p.tasks = (extra.tasks || []).map((t) => newTask(t));
  p.handover = { ...p.handover, ...(extra.handover || {}) };
  p.createdAt = p.updatedAt = hoursAgo(30);
  return p;
}

export function SEED() {
  const patients = [
    mk('micu', 3, { name: 'Demo Patient 01', mrn: 'DEMO-000101', age: 67, sex: 'Male', admissionDate: dayOffset(-3), diagnosis: 'Septic shock, pneumonia source', comorbidities: 'Type 2 diabetes, hypertension', codeStatus: 'Full code' }, {
      clinical: { summary: '67M day 3 of septic shock secondary to community-acquired pneumonia. Improving vasopressor requirement overnight.', stability: 'watch', concerns: 'Rising lactate at 04:00, repeat pending.', airway: 'Intubated, SIMV/PS, FiO2 0.45, PEEP 8', hemodynamics: 'Norepinephrine 0.08 mcg/kg/min (weaning), MAP target ≥65', neuro: 'Sedated, RASS -2', renal: 'Creatinine 1.6 (baseline 1.0), no RRT', labsImaging: 'CXR: bilateral lower zone consolidation, unchanged.', devices: 'R IJ CVC (day 3), arterial line L radial, ETT, urinary catheter' },
      plan: { priorities: '1. Wean norepinephrine to off if MAP ≥65.\n2. Repeat lactate; escalate if rising.\n3. Sedation hold trial this morning.', nextShift: 'Review culture results and de-escalation of antibiotics.' },
      vte: { decision: 'yes', method: 'both', agent: 'Enoxaparin', dose: '40 mg SC', frequency: 'Once daily', details: 'Intermittent pneumatic compression on both legs. Renal function being monitored.' },
      issues: [
        { title: 'Septic shock — vasopressor wean', category: 'Cardiovascular', severity: 'urgent', status: 'active', summary: 'Lactate rising at 04:00 despite falling pressor dose.', plan: 'Repeat lactate at 08:00; reassess fluid responsiveness; discuss with microbiology.', pending: 'Repeat lactate', owner: 'Incoming senior', reviewAt: hoursAhead(3) },
        { title: 'AKI stage 1', category: 'Renal', severity: 'important', status: 'monitoring', summary: 'Creatinine 1.6 from 1.0; urine output borderline.', plan: 'Avoid nephrotoxins, strict I/O, daily creatinine.', pending: '', owner: 'ICU team', reviewAt: hoursAhead(12) },
        { title: 'Hyperkalemia (K 5.9)', category: 'Endocrine / Metabolic', severity: 'important', status: 'resolved', summary: 'Potassium 5.9 on admission.', plan: 'Treated per protocol; repeat K 4.6.', pending: '', owner: 'ICU team', reviewAt: '', resolvedAt: hoursAgo(20) },
      ],
      tasks: [
        { text: 'Repeat lactate', type: 'lab', due: hoursAhead(3) },
        { text: 'Blood cultures — follow up final result', type: 'lab', due: hoursAhead(10) },
        { text: 'Chest X-ray AM', type: 'imaging', due: hoursAhead(8) },
        { text: 'Family update completed', type: 'task', done: true, doneAt: hoursAgo(5) },
      ],
      handover: { status: 'ready', savedAt: hoursAgo(2), readyAt: hoursAgo(2) },
    }),
    mk('micu', 8, { name: 'Demo Patient 02', mrn: 'DEMO-000102', age: 54, sex: 'Female', admissionDate: dayOffset(-2), diagnosis: 'Upper GI bleed, hemorrhagic shock (resolved)', comorbidities: 'Cirrhosis, alcohol use disorder', codeStatus: 'Full code' }, {
      clinical: { summary: '54F with variceal bleed, banded 36h ago. Hemodynamically stable, Hb stable x 24h.', stability: 'stable', concerns: 'Risk of re-bleeding.', airway: 'Room air', hemodynamics: 'Off vasopressors, HR 88, MAP 78', neuro: 'GCS 15, no encephalopathy', renal: 'Creatinine 0.9', labsImaging: 'Hb 9.1 stable, platelets 62, INR 1.7.', devices: 'Peripheral IV x2, urinary catheter' },
      plan: { priorities: '1. Continue octreotide and PPI.\n2. Repeat Hb q6h.\n3. Early mobilization once Hb stable.', nextShift: 'Plan for repeat endoscopy review in 48h.' },
      vte: { decision: 'no', method: '', reasons: ['bleeding', 'hematologic'], reasonDetails: 'Recent variceal bleeding, platelets 62 and INR 1.7.', reassessPlan: 'Reassess daily; consider mechanical prophylaxis (SCDs) while pharmacological is withheld — treating team to decide.', reviewAt: hoursAhead(18) },
      issues: [{ title: 'Re-bleeding risk', category: 'GI / Nutrition', severity: 'important', status: 'monitoring', summary: 'Variceal bleed, banded.', plan: 'Hb q6h, keep two units crossmatched.', pending: 'Hb 12:00', owner: 'ICU team', reviewAt: hoursAhead(4) }],
      tasks: [{ text: 'Hb at 12:00', type: 'lab', due: hoursAhead(4) }, { text: 'GI team review', type: 'consult', due: hoursAhead(20) }],
      handover: { status: 'reviewed', savedAt: hoursAgo(9), readyAt: hoursAgo(9), reviewedAt: hoursAgo(8), reviewerLabel: 'Demo reviewer (unauthenticated)' },
    }),
    mk('micu', 18, { name: 'Demo Patient 03', mrn: 'DEMO-000103', age: 72, sex: 'Male', admissionDate: dayOffset(-1), diagnosis: 'COPD exacerbation, type 2 respiratory failure', comorbidities: 'COPD (home O2), ischemic heart disease', codeStatus: 'Limited escalation' }, {
      clinical: { summary: '72M on NIV for hypercapnic respiratory failure, improving gases.', stability: 'watch', concerns: 'NIV tolerance overnight.', airway: 'BiPAP IPAP 16 / EPAP 6, FiO2 0.35', hemodynamics: 'Stable, no pressors', neuro: 'Alert, GCS 15', renal: 'Normal', labsImaging: 'ABG 7.33 / pCO2 58.', devices: 'Peripheral IV' },
      plan: { priorities: '1. Continue NIV with trial off this afternoon.\n2. Nebulizers and steroids per protocol.', nextShift: '' },
      vte: { decision: 'not_assessed' },
      issues: [{ title: 'Hypercapnic respiratory failure', category: 'Respiratory', severity: 'important', status: 'active', summary: 'On NIV, ABG improving.', plan: 'Repeat ABG 2h after NIV change.', pending: 'Repeat ABG', owner: 'ICU team', reviewAt: hoursAhead(2) }],
      tasks: [{ text: 'Repeat ABG', type: 'lab', due: hoursAhead(2) }],
      handover: { status: 'draft' },
    }),
    mk('micu', 12, { name: 'Demo Patient 04', mrn: 'DEMO-000104', age: 45, sex: 'Female', admissionDate: dayOffset(-5), diagnosis: 'Diabetic ketoacidosis (resolved), recovering', comorbidities: 'Type 1 diabetes', codeStatus: 'Full code' }, {
      clinical: { summary: '45F, DKA resolved, awaiting step-down bed.', stability: 'stable', concerns: '', airway: 'Room air', hemodynamics: 'Stable', neuro: 'Normal', renal: 'Normal', labsImaging: '', devices: 'Peripheral IV' },
      plan: { priorities: '1. Transfer to ward when bed available.\n2. Diabetes team follow-up.', nextShift: '' },
      vte: { decision: 'withheld', reasons: [], reasonUnknown: true, reasonDetails: '', reassessPlan: '' },
      tasks: [{ text: 'Confirm ward bed', type: 'task' }],
      handover: { status: 'draft' },
    }),
    mk('micu', 19, { name: 'Demo Patient 05', mrn: 'DEMO-000105', age: 38, sex: 'Male', admissionDate: dayOffset(-6), diagnosis: 'Severe pancreatitis', comorbidities: 'None known', codeStatus: 'Full code' }, {
      clinical: { summary: '38M improving; accepted by surgical ward.', stability: 'stable', concerns: '', airway: 'Room air', hemodynamics: 'Stable', neuro: 'Normal', renal: 'Normal', labsImaging: '', devices: 'Peripheral IV, NJ tube' },
      plan: { priorities: '1. Transfer to surgical ward this shift.', nextShift: '' },
      vte: { decision: 'yes', method: 'pharmacological', agent: 'Enoxaparin', dose: '40 mg SC', frequency: 'Once daily' },
      tasks: [{ text: 'Complete transfer summary', type: 'task' }],
      handover: { status: 'ready', savedAt: hoursAgo(1), readyAt: hoursAgo(1) },
    }),
    mk('tco', 2, { name: 'Demo Patient 06', mrn: 'DEMO-000201', age: 29, sex: 'Male', admissionDate: dayOffset(-1), diagnosis: 'Polytrauma — pelvic fracture, splenic laceration', comorbidities: 'None known', codeStatus: 'Full code' }, {
      clinical: { summary: '29M MVC, damage control surgery yesterday. Pelvic binder in situ.', stability: 'unstable', concerns: 'Falling Hb, possible ongoing bleed.', airway: 'Intubated, volume control, FiO2 0.4', hemodynamics: 'Norepinephrine 0.12 mcg/kg/min, massive transfusion protocol completed', neuro: 'Sedated', renal: 'Creatinine 1.2', labsImaging: 'Hb 7.8 (from 9.0), FAST negative.', devices: 'R femoral CVC, arterial line, ETT, pelvic binder, drain x2' },
      plan: { priorities: '1. Urgent Hb recheck and CT angiogram if falling.\n2. Keep MAP ≥65.\n3. Discuss with trauma surgeon re: return to theatre.', nextShift: 'Review IR availability.' },
      vte: { decision: 'withheld', reasons: ['bleeding', 'procedure'], reasonDetails: 'Active bleeding concern; possible return to theatre.', reassessPlan: 'Reassess within 24h with surgical team.', reviewAt: hoursAhead(20) },
      issues: [{ title: 'Possible ongoing hemorrhage', category: 'Surgical / Trauma', severity: 'urgent', status: 'pending', summary: 'Hb 9.0 → 7.8 over 6h on pressors.', plan: 'Repeat Hb now; CT angiography if <7.', pending: 'Hb recheck, surgical review', owner: 'Trauma surgery', reviewAt: hoursAhead(1) }],
      tasks: [{ text: 'Hb recheck', type: 'lab', due: hoursAhead(1) }, { text: 'CT angiogram if Hb < 7', type: 'imaging' }, { text: 'Blood products crossmatched', type: 'task', done: true, doneAt: hoursAgo(2) }],
      handover: { status: 'ready', savedAt: hoursAgo(1), readyAt: hoursAgo(1) },
    }),
    mk('tco', 6, { name: 'Demo Patient 07', mrn: 'DEMO-000202', age: 61, sex: 'Female', admissionDate: dayOffset(-2), diagnosis: 'Multiple rib fractures (R 4–9)', comorbidities: 'Osteoporosis', codeStatus: 'Full code' }, {
      clinical: { summary: '61F, rib fractures, epidural analgesia, incentive spirometry.', stability: 'stable', concerns: 'Pain control, pulmonary toilet.', airway: 'Nasal cannula 3 L/min', hemodynamics: 'Stable', neuro: 'Alert', renal: 'Normal', labsImaging: 'CXR: small R hemothorax stable.', devices: 'Thoracic epidural, peripheral IV' },
      plan: { priorities: '1. Continue epidural; daily review by pain team.\n2. Chest physio.', nextShift: '' },
      vte: { decision: 'yes', method: 'mechanical', details: 'Intermittent pneumatic compression; pharmacological held while epidural in situ — treating team reviewing.' },
      tasks: [{ text: 'Pain team review', type: 'consult', due: hoursAhead(6) }],
      handover: { status: 'draft', savedAt: hoursAgo(4) },
    }),
    mk('neuro', 4, { name: 'Demo Patient 08', mrn: 'DEMO-000301', age: 58, sex: 'Female', admissionDate: dayOffset(-4), diagnosis: 'Subarachnoid hemorrhage (Fisher 3), coiled', comorbidities: 'Hypertension', codeStatus: 'Full code' }, {
      clinical: { summary: '58F day 4 post-SAH, within vasospasm window.', stability: 'watch', concerns: 'Vasospasm risk; daily TCDs.', airway: 'Self-ventilating, room air', hemodynamics: 'Nimodipine, SBP 120–160, euvolemia', neuro: 'GCS 14, no focal deficit', renal: 'Normal', labsImaging: 'TCD this morning: velocities rising on L MCA.', devices: 'EVD in situ, arterial line' },
      plan: { priorities: '1. Hourly neuro obs.\n2. Repeat TCD this afternoon.\n3. Maintain euvolemia.', nextShift: 'Review EVD output trend.' },
      vte: { decision: 'withheld', reasons: ['procedure'], reasonDetails: 'EVD in situ; neurosurgery to advise on timing.', reassessPlan: 'Neurosurgery to advise at next review.', reviewAt: hoursAhead(24) },
      issues: [{ title: 'Vasospasm risk', category: 'Neurological', severity: 'urgent', status: 'active', summary: 'TCD velocities rising.', plan: 'Repeat TCD this afternoon; low threshold for CT perfusion.', pending: 'Repeat TCD', owner: 'Neuro team', reviewAt: hoursAhead(5) }],
      tasks: [{ text: 'Repeat TCD', type: 'imaging', due: hoursAhead(5) }],
      handover: { status: 'ready', savedAt: hoursAgo(3), readyAt: hoursAgo(3) },
    }),
    mk('resp', 7, { name: 'Demo Patient 09', mrn: 'DEMO-000401', age: 49, sex: 'Male', admissionDate: dayOffset(-7), diagnosis: 'ARDS secondary to influenza', comorbidities: 'Obesity (BMI 38)', codeStatus: 'Full code' }, {
      clinical: { summary: '49M severe ARDS, proning day 2, improving P/F ratio.', stability: 'watch', concerns: 'Prone positioning schedule.', airway: 'Intubated, lung-protective ventilation, FiO2 0.6, PEEP 12', hemodynamics: 'Stable, no pressors', neuro: 'Sedated, paralysed', renal: 'Creatinine 1.1', labsImaging: 'P/F 150 prone.', devices: 'ETT, R IJ CVC, arterial line' },
      plan: { priorities: '1. Continue prone 16h/day; supinate at 14:00.\n2. Daily neuromuscular blockade review.', nextShift: '' },
      vte: { decision: 'yes', method: 'both', agent: 'Enoxaparin', dose: '60 mg SC', frequency: 'Once daily', details: 'Weight-adjusted dose.' },
      issues: [{ title: 'ARDS — prone positioning', category: 'Respiratory', severity: 'important', status: 'monitoring', summary: 'P/F improving prone.', plan: 'Supinate 14:00 and reassess.', pending: '', owner: 'ICU team', reviewAt: hoursAhead(6) }],
      tasks: [{ text: 'Supinate and reassess P/F', type: 'task', due: hoursAhead(6) }],
      handover: { status: 'reviewed', savedAt: hoursAgo(10), readyAt: hoursAgo(10), reviewedAt: hoursAgo(9), reviewerLabel: 'Demo reviewer (unauthenticated)' },
    }),
    mk('surgical', 2, { name: 'Demo Patient 10', mrn: '', age: 70, sex: 'Female', admissionDate: dayOffset(0), diagnosis: 'Post-op day 0 emergency laparotomy', comorbidities: '', codeStatus: '' }, {
      clinical: { summary: '', stability: 'stable' },
      plan: { priorities: '' },
      vte: { decision: 'not_assessed' },
      handover: { status: 'draft' },
    }),
  ];
  return { version: 1, patients, history: patients.filter((p) => p.handover.savedAt).map((p) => ({
    id: `ho_seed_${p.id}`, patientId: p.id, unitId: p.unitId, bed: p.bed, patientName: p.name,
    action: p.handover.status === 'reviewed' ? 'reviewed' : p.handover.status === 'ready' ? 'ready' : 'saved',
    at: p.handover.reviewedAt || p.handover.savedAt, handoverStatus: p.handover.status,
    snapshot: JSON.parse(JSON.stringify(p)),
  })) };
}

function dayOffset(d) {
  const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10);
}
