(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Disease scenario presets. Values are simplified teaching approximations,
  // not patient-specific measurements. Crs = respiratory system compliance
  // (mL/cmH2O), Raw = airway resistance (cmH2O/L/s), shuntBase/recruitableFrac
  // describe how much venous admixture exists and how much of it PEEP can
  // recruit, deadSpaceFrac is Vd/Vt, peepOpt is roughly where recruitment
  // benefit plateaus and overdistension risk begins.
  // ---------------------------------------------------------------------
  const SCENARIOS = {
    normal: {
      label: "Normal lungs",
      description: "Healthy lungs, e.g. elective post-op ventilation.",
      teaching: "Lung-protective volumes (~6 mL/kg IBW) are good practice even here — there's no reason to use large tidal volumes just because the lungs are healthy.",
      crs: 50, raw: 8, shuntBase: 0.03, recruitableFrac: 0.3, deadSpaceFrac: 0.30,
      peepOpt: 5, overdistSensitivity: 0.010, paco2Ref: 40, hco3: 24, effortPressure: 12,
      defaults: { peep: 5, vtPerKg: 6, fio2: 30, ie: 2, rr: 14 },
      // Bedside clinical picture. baseMAP is the UNSUPPORTED map: no
      // vasopressor and no ventilator hemodynamic burden. The displayed
      // MAP is derived from it, so a patient who only looks stable because
      // of their noradrenaline reads as exactly that once you turn it down.
      clinical: {
        diagnosis: "Elective post-operative ventilation after major abdominal surgery",
        icuDay: 1, rass: -2,
        baseMAP: 84, baseHR: 78, noradrenaline: 0.0,
        temp: 36.8, lactate: 1.1, urineOutput: 1.2,
        hb: 12.5, wbc: 9.2, creatinine: 0.9, platelets: 240,
      },
    },
    ardsMild: {
      label: "ARDS — mild (P/F 200–300)",
      description: "Berlin mild ARDS: diffuse alveolar damage with recruitable shunt.",
      teaching: "Low tidal volume (6 mL/kg IBW) and moderate PEEP. Permissive hypercapnia is acceptable if pH is tolerable.",
      crs: 40, raw: 10, shuntBase: 0.20, recruitableFrac: 0.5, deadSpaceFrac: 0.40,
      peepOpt: 9, overdistSensitivity: 0.010, paco2Ref: 42, hco3: 24, effortPressure: 11,
      defaults: { peep: 8, vtPerKg: 6, fio2: 40, ie: 1.5, rr: 18 },
      // Bedside clinical picture. baseMAP is the UNSUPPORTED map: no
      // vasopressor and no ventilator hemodynamic burden. The displayed
      // MAP is derived from it, so a patient who only looks stable because
      // of their noradrenaline reads as exactly that once you turn it down.
      clinical: {
        diagnosis: "Community-acquired pneumonia with mild ARDS",
        icuDay: 2, rass: -3,
        baseMAP: 81, baseHR: 92, noradrenaline: 0.0,
        temp: 38.1, lactate: 1.6, urineOutput: 0.9,
        hb: 10.8, wbc: 14.5, creatinine: 1.1, platelets: 190,
      },
      evidence: ["ardsnet", "guidelines"],
    },
    ardsModerate: {
      label: "ARDS — moderate (P/F 100–200)",
      description: "Berlin moderate ARDS.",
      teaching: "Titrate PEEP for oxygenation (e.g. ARDSnet tables) but watch driving pressure — keep it ≤15 cmH2O where possible. Consider prone positioning if refractory.",
      crs: 30, raw: 10, shuntBase: 0.35, recruitableFrac: 0.6, deadSpaceFrac: 0.50,
      peepOpt: 12, overdistSensitivity: 0.009, paco2Ref: 45, hco3: 24, effortPressure: 9,
      defaults: { peep: 10, vtPerKg: 6, fio2: 50, ie: 1.5, rr: 22 },
      // Bedside clinical picture. baseMAP is the UNSUPPORTED map: no
      // vasopressor and no ventilator hemodynamic burden. The displayed
      // MAP is derived from it, so a patient who only looks stable because
      // of their noradrenaline reads as exactly that once you turn it down.
      clinical: {
        diagnosis: "Septic shock from pneumonia with moderate ARDS",
        icuDay: 3, rass: -4,
        baseMAP: 73, baseHR: 104, noradrenaline: 0.06,
        temp: 38.4, lactate: 2.1, urineOutput: 0.7,
        hb: 9.8, wbc: 17.2, creatinine: 1.5, platelets: 155,
      },
      evidence: ["ardsnet", "express", "art", "guidelines"],
    },
    ardsSevere: {
      label: "ARDS — severe (P/F <100)",
      description: "Berlin severe ARDS.",
      teaching: "High recruitable shunt but also high overdistension risk — titrate PEEP carefully. Consider prone positioning, neuromuscular blockade, or ECMO referral if refractory. Keep plateau <30 and driving pressure <15 cmH2O.",
      crs: 20, raw: 11, shuntBase: 0.67, recruitableFrac: 0.65, deadSpaceFrac: 0.60,
      peepOpt: 16, overdistSensitivity: 0.008, paco2Ref: 50, hco3: 24, effortPressure: 7,
      defaults: { peep: 14, vtPerKg: 6, fio2: 70, ie: 1.5, rr: 26 },
      // Bedside clinical picture. baseMAP is the UNSUPPORTED map: no
      // vasopressor and no ventilator hemodynamic burden. The displayed
      // MAP is derived from it, so a patient who only looks stable because
      // of their noradrenaline reads as exactly that once you turn it down.
      clinical: {
        diagnosis: "Severe ARDS, deep sedation and neuromuscular blockade",
        icuDay: 2, rass: -5,
        baseMAP: 60, baseHR: 112, noradrenaline: 0.18,
        temp: 38.7, lactate: 3.4, urineOutput: 0.4,
        hb: 9.1, wbc: 19.8, creatinine: 2.1, platelets: 110,
      },
      evidence: ["ardsnet", "amato", "proseva", "art", "guidelines"],
    },
    copd: {
      label: "COPD / asthma exacerbation",
      description: "Obstructive disease with airflow limitation and air-trapping risk.",
      teaching: "Prioritize a long expiratory time (lower RR, higher I:E ratio like 1:4) and accept permissive hypercapnia to avoid auto-PEEP / breath stacking, which can cause hypotension or barotrauma. Avoid over-oxygenating chronic CO₂ retainers.",
      crs: 60, raw: 28, shuntBase: 0.10, recruitableFrac: 0.10, deadSpaceFrac: 0.35,
      peepOpt: 5, overdistSensitivity: 0.020, paco2Ref: 55, hco3: 30, effortPressure: 8,
      defaults: { peep: 5, vtPerKg: 7, fio2: 28, ie: 4, rr: 12 },
      // Bedside clinical picture. baseMAP is the UNSUPPORTED map: no
      // vasopressor and no ventilator hemodynamic burden. The displayed
      // MAP is derived from it, so a patient who only looks stable because
      // of their noradrenaline reads as exactly that once you turn it down.
      clinical: {
        diagnosis: "Acute hypercapnic COPD exacerbation",
        icuDay: 1, rass: -2,
        baseMAP: 78, baseHR: 98, noradrenaline: 0.0,
        temp: 37.2, lactate: 1.4, urineOutput: 0.9,
        hb: 14.2, wbc: 11.8, creatinine: 1.0, platelets: 210,
      },
    },
    edema: {
      label: "Cardiogenic pulmonary edema / CHF",
      description: "Fluid-filled, partly recruitable alveoli from elevated hydrostatic pressure.",
      teaching: "PEEP helps by recruiting fluid-filled alveoli and reducing preload/afterload. Watch for hemodynamic effects of high PEEP in preload-dependent patients.",
      crs: 35, raw: 9, shuntBase: 0.25, recruitableFrac: 0.5, deadSpaceFrac: 0.35,
      peepOpt: 9, overdistSensitivity: 0.011, paco2Ref: 42, hco3: 24, effortPressure: 10,
      defaults: { peep: 8, vtPerKg: 6, fio2: 40, ie: 2, rr: 18 },
      // Bedside clinical picture. baseMAP is the UNSUPPORTED map: no
      // vasopressor and no ventilator hemodynamic burden. The displayed
      // MAP is derived from it, so a patient who only looks stable because
      // of their noradrenaline reads as exactly that once you turn it down.
      clinical: {
        diagnosis: "Acute cardiogenic pulmonary edema on a background of heart failure",
        icuDay: 1, rass: -3,
        baseMAP: 76, baseHR: 96, noradrenaline: 0.0,
        temp: 36.5, lactate: 2.2, urineOutput: 0.5,
        hb: 11.5, wbc: 9.8, creatinine: 1.7, platelets: 195,
      },
    },
    pneumonia: {
      label: "Severe pneumonia / consolidation",
      description: "Lobar or multifocal consolidation.",
      teaching: "Consolidated lung is largely non-recruitable — expect a limited response to PEEP. Focus on treating the underlying infection rather than chasing PEEP for oxygenation.",
      crs: 30, raw: 10, shuntBase: 0.30, recruitableFrac: 0.20, deadSpaceFrac: 0.40,
      peepOpt: 8, overdistSensitivity: 0.010, paco2Ref: 44, hco3: 24, effortPressure: 9,
      defaults: { peep: 8, vtPerKg: 6, fio2: 50, ie: 2, rr: 20 },
      // Bedside clinical picture. baseMAP is the UNSUPPORTED map: no
      // vasopressor and no ventilator hemodynamic burden. The displayed
      // MAP is derived from it, so a patient who only looks stable because
      // of their noradrenaline reads as exactly that once you turn it down.
      clinical: {
        diagnosis: "Severe multilobar pneumonia",
        icuDay: 2, rass: -3,
        baseMAP: 73, baseHR: 102, noradrenaline: 0.04,
        temp: 38.9, lactate: 2.0, urineOutput: 0.8,
        hb: 10.2, wbc: 21.4, creatinine: 1.3, platelets: 175,
      },
    },
    fibrosis: {
      label: "Pulmonary fibrosis (restrictive)",
      description: "Very stiff, low-compliance lungs.",
      teaching: "Driving pressure rises quickly with even modest tidal volumes. Use lower tidal volumes; PEEP has limited recruitment benefit and raises plateau pressure fast.",
      crs: 20, raw: 8, shuntBase: 0.15, recruitableFrac: 0.20, deadSpaceFrac: 0.45,
      peepOpt: 6, overdistSensitivity: 0.016, paco2Ref: 38, hco3: 24, effortPressure: 10,
      defaults: { peep: 6, vtPerKg: 6, fio2: 40, ie: 1.5, rr: 22 },
      // Bedside clinical picture. baseMAP is the UNSUPPORTED map: no
      // vasopressor and no ventilator hemodynamic burden. The displayed
      // MAP is derived from it, so a patient who only looks stable because
      // of their noradrenaline reads as exactly that once you turn it down.
      clinical: {
        diagnosis: "Acute exacerbation of pulmonary fibrosis",
        icuDay: 4, rass: -3,
        baseMAP: 84, baseHR: 94, noradrenaline: 0.0,
        temp: 37.0, lactate: 1.3, urineOutput: 1.0,
        hb: 11.0, wbc: 8.6, creatinine: 1.0, platelets: 230,
      },
    },
    neuromuscular: {
      label: "Neuromuscular weakness (e.g. GBS, myasthenic crisis)",
      description: "Normal lungs, failing respiratory pump.",
      teaching: "The lungs themselves are normal — the problem is the respiratory pump. Gas exchange settings can stay near-normal; focus is on adequate support/synchrony and monitoring for weaning readiness.",
      crs: 50, raw: 8, shuntBase: 0.03, recruitableFrac: 0.3, deadSpaceFrac: 0.30,
      peepOpt: 5, overdistSensitivity: 0.010, paco2Ref: 45, hco3: 24, effortPressure: 4,
      defaults: { peep: 5, vtPerKg: 7, fio2: 25, ie: 2, rr: 16 },
      // Bedside clinical picture. baseMAP is the UNSUPPORTED map: no
      // vasopressor and no ventilator hemodynamic burden. The displayed
      // MAP is derived from it, so a patient who only looks stable because
      // of their noradrenaline reads as exactly that once you turn it down.
      clinical: {
        diagnosis: "Guillain-Barre syndrome with respiratory pump failure",
        icuDay: 5, rass: -1,
        baseMAP: 84, baseHR: 82, noradrenaline: 0.0,
        temp: 36.9, lactate: 1.0, urineOutput: 1.3,
        hb: 12.0, wbc: 7.4, creatinine: 0.7, platelets: 250,
      },
    },
    obesity: {
      label: "Obesity / elevated intra-abdominal pressure",
      description: "Reduced chest-wall/abdominal compliance causing basal atelectasis.",
      teaching: "Higher PEEP is often needed to counteract chest-wall/abdominal weight and recruit dependent lung. In practice, reverse Trendelenburg positioning helps too.",
      crs: 30, raw: 10, shuntBase: 0.15, recruitableFrac: 0.4, deadSpaceFrac: 0.35,
      peepOpt: 10, overdistSensitivity: 0.012, paco2Ref: 46, hco3: 25, cvSensitivity: 1.0, effortPressure: 9,
      defaults: { peep: 10, vtPerKg: 6, fio2: 40, ie: 2, rr: 18 },
      // Bedside clinical picture. baseMAP is the UNSUPPORTED map: no
      // vasopressor and no ventilator hemodynamic burden. The displayed
      // MAP is derived from it, so a patient who only looks stable because
      // of their noradrenaline reads as exactly that once you turn it down.
      clinical: {
        diagnosis: "Post-operative respiratory failure with raised intra-abdominal pressure",
        icuDay: 2, rass: -3,
        baseMAP: 86, baseHR: 88, noradrenaline: 0.0,
        temp: 37.3, lactate: 1.5, urineOutput: 0.9,
        hb: 13.0, wbc: 10.2, creatinine: 1.1, platelets: 220,
      },
    },
    covidArds: {
      label: "COVID-19 ARDS",
      description: "Viral ARDS — often a spectrum from relatively preserved compliance with severe hypoxemia ('L-type') to a more classic low-compliance picture ('H-type').",
      teaching: "Manage per the same ARDSnet low-Vt / PEEP-titration framework as other ARDS — phenotype doesn't change the lung-protective targets. \"Silent hypoxemia\" (low SpO₂ with limited dyspnea) can precede rapid deterioration; falling P/F or rising respiratory effort on HFNC/NIV are cues to consider intubation before a crash, since vigorous spontaneous effort at low lung volumes risks patient self-inflicted lung injury (P-SILI).",
      crs: 32, raw: 10, shuntBase: 0.32, recruitableFrac: 0.45, deadSpaceFrac: 0.48,
      peepOpt: 11, overdistSensitivity: 0.010, paco2Ref: 44, hco3: 24, cvSensitivity: 1.0, effortPressure: 9,
      defaults: { peep: 10, vtPerKg: 6, fio2: 60, ie: 1.5, rr: 24 },
      // Bedside clinical picture. baseMAP is the UNSUPPORTED map: no
      // vasopressor and no ventilator hemodynamic burden. The displayed
      // MAP is derived from it, so a patient who only looks stable because
      // of their noradrenaline reads as exactly that once you turn it down.
      clinical: {
        diagnosis: "COVID-19 pneumonitis with ARDS",
        icuDay: 6, rass: -4,
        baseMAP: 69, baseHR: 98, noradrenaline: 0.08,
        temp: 38.2, lactate: 2.3, urineOutput: 0.6,
        hb: 10.5, wbc: 12.6, creatinine: 1.4, platelets: 165,
      },
      evidence: ["ardsnet", "guidelines"],
    },
    pe: {
      label: "Massive / submassive pulmonary embolism",
      description: "Acute right-ventricular strain with a large obstructed, non-perfused (dead space) region rather than a primarily shunt-type problem.",
      teaching: "Hypoxemia here is mostly V/Q mismatch and low mixed venous saturation from a falling cardiac output — not alveolar collapse — so PEEP does little for oxygenation and raises RV afterload further. Keep tidal volumes modest, avoid hyperinflation/high PEEP, and avoid hypercapnia/acidosis, both of which raise pulmonary vascular resistance and worsen RV strain. Definitive treatment is anticoagulation/thrombolysis/embolectomy, not the ventilator.",
      crs: 45, raw: 9, shuntBase: 0.17, recruitableFrac: 0.1, deadSpaceFrac: 0.55,
      peepOpt: 5, overdistSensitivity: 0.014, paco2Ref: 32, hco3: 22, cvSensitivity: 2.2, effortPressure: 11,
      // Low cardiac output from RV failure means high tissue extraction and a
      // markedly desaturated mixed venous return — the dominant mechanism of
      // hypoxemia here, and the reason PEEP does not fix it.
      pvo2Base: 31,
      defaults: { peep: 5, vtPerKg: 6, fio2: 50, ie: 2, rr: 20 },
      // Bedside clinical picture. baseMAP is the UNSUPPORTED map: no
      // vasopressor and no ventilator hemodynamic burden. The displayed
      // MAP is derived from it, so a patient who only looks stable because
      // of their noradrenaline reads as exactly that once you turn it down.
      clinical: {
        diagnosis: "Massive pulmonary embolism with right-ventricular strain",
        icuDay: 1, rass: -3,
        baseMAP: 42, baseHR: 124, noradrenaline: 0.22,
        temp: 37.1, lactate: 3.8, urineOutput: 0.4,
        hb: 12.8, wbc: 12.0, creatinine: 1.4, platelets: 185,
      },
    },
    traumaFlail: {
      label: "Chest trauma / flail chest",
      description: "Pain-limited splinting plus an unstable chest wall segment, often with underlying pulmonary contusion.",
      teaching: "The restrictive picture is often partly reversible with adequate analgesia (including regional techniques) that lets the patient breathe/cough effectively. Positive pressure can worsen an occult pneumothorax in trauma — have a low threshold for imaging and a chest tube ready. Contused lung behaves like a non-recruitable consolidation, similar to pneumonia.",
      crs: 25, raw: 10, shuntBase: 0.22, recruitableFrac: 0.25, deadSpaceFrac: 0.40,
      peepOpt: 7, overdistSensitivity: 0.014, paco2Ref: 44, hco3: 24, cvSensitivity: 1.0, effortPressure: 6,
      defaults: { peep: 6, vtPerKg: 6, fio2: 45, ie: 1.5, rr: 20 },
      // Bedside clinical picture. baseMAP is the UNSUPPORTED map: no
      // vasopressor and no ventilator hemodynamic burden. The displayed
      // MAP is derived from it, so a patient who only looks stable because
      // of their noradrenaline reads as exactly that once you turn it down.
      clinical: {
        diagnosis: "Blunt chest trauma with flail segment and pulmonary contusion",
        icuDay: 1, rass: -4,
        baseMAP: 74, baseHR: 108, noradrenaline: 0.06,
        temp: 37.4, lactate: 2.6, urineOutput: 0.8,
        hb: 8.9, wbc: 15.8, creatinine: 1.0, platelets: 145,
      },
    },
    pneumothorax: {
      label: "Pneumothorax (undrained)",
      description: "Air in the pleural space collapsing the underlying lung — a mechanical problem, not a gas-exchange one.",
      teaching: "No ventilator setting fixes an undrained pneumothorax, and positive pressure can convert it to a tension pneumothorax with sudden hemodynamic collapse. This scenario exists to make the point: the numbers below describe the mechanics of the remaining aerated lung, but the actual fix is a chest tube or needle decompression, not PEEP or FiO₂.",
      crs: 22, raw: 9, shuntBase: 0.35, recruitableFrac: 0.05, deadSpaceFrac: 0.35,
      peepOpt: 5, overdistSensitivity: 0.020, paco2Ref: 46, hco3: 24, cvSensitivity: 2.0, effortPressure: 9,
      defaults: { peep: 5, vtPerKg: 6, fio2: 50, ie: 2, rr: 20 },
      // Bedside clinical picture. baseMAP is the UNSUPPORTED map: no
      // vasopressor and no ventilator hemodynamic burden. The displayed
      // MAP is derived from it, so a patient who only looks stable because
      // of their noradrenaline reads as exactly that once you turn it down.
      clinical: {
        diagnosis: "Undrained pneumothorax with developing tension physiology",
        icuDay: 1, rass: -3,
        baseMAP: 48, baseHR: 128, noradrenaline: 0.15,
        temp: 37.0, lactate: 3.2, urineOutput: 0.3,
        hb: 11.2, wbc: 13.4, creatinine: 1.1, platelets: 200,
      },
    },
    bpf: {
      label: "Bronchopleural fistula (large air leak)",
      description: "A communication between the airway and pleural space — a substantial fraction of every delivered breath escapes through a chest tube instead of ventilating the lung.",
      teaching: "Exhaled tidal volume at the ventilator is lower than delivered volume because of the leak — trust the chest-tube air-leak assessment over displayed volumes. Use the lowest pressures/PEEP and shortest inspiratory time tolerable to minimize flow across the fistula, and accept permissive hypercapnia; the \"effective\" dead space below already reflects volume lost to the leak rather than gas exchange.",
      crs: 28, raw: 11, shuntBase: 0.18, recruitableFrac: 0.15, deadSpaceFrac: 0.30,
      peepOpt: 6, overdistSensitivity: 0.012, paco2Ref: 42, hco3: 24, cvSensitivity: 1.0, leakFrac: 0.30, effortPressure: 10,
      defaults: { peep: 5, vtPerKg: 6, fio2: 40, ie: 2, rr: 18 },
      // Bedside clinical picture. baseMAP is the UNSUPPORTED map: no
      // vasopressor and no ventilator hemodynamic burden. The displayed
      // MAP is derived from it, so a patient who only looks stable because
      // of their noradrenaline reads as exactly that once you turn it down.
      clinical: {
        diagnosis: "Bronchopleural fistula with persistent large air leak",
        icuDay: 8, rass: -3,
        baseMAP: 71, baseHR: 100, noradrenaline: 0.05,
        temp: 37.8, lactate: 1.8, urineOutput: 0.8,
        hb: 9.6, wbc: 13.0, creatinine: 1.2, platelets: 180,
      },
    },
  };

  // Evidence citations attached to specific alerts/teaching points. Educational
  // pointers to primary literature and society guidance, not a full bibliography.
  const EVIDENCE = {
    ardsnet: { name: "ARDSnet ARMA trial", detail: "NEJM 2000 — low tidal volume (6 mL/kg IBW) reduced mortality in ARDS." },
    amato: { name: "Amato et al.", detail: "NEJM 2015 — driving pressure was the ventilator variable most associated with survival." },
    proseva: { name: "PROSEVA trial", detail: "NEJM 2013 — prone positioning ≥16 h/day reduced mortality in severe ARDS." },
    express: { name: "EXPRESS trial", detail: "JAMA 2008 — higher PEEP titrated to a plateau-pressure target vs. a minimal-PEEP strategy." },
    art: { name: "ART trial", detail: "JAMA 2017 — an aggressive lung-recruitment + high-PEEP titration strategy increased 28-day mortality vs. a lower-PEEP ARDSnet-style strategy." },
    conservativeO2: { name: "HOT-ICU / LOCO2 trials", detail: "NEJM 2021 / 2020 — targeting lower vs. higher SpO₂/PaO₂ in ICU patients; routine liberal oxygen offers no benefit and conservative targets are at least as safe." },
    guidelines: { name: "ATS/ESICM/SCCM clinical practice guideline", detail: "Mechanical ventilation in adult ARDS (2017) — the basis for low-Vt, plateau/driving-pressure limits, and PEEP/FiO₂ titration recommended here." },
    simvWeaning: { name: "Brochard 1994 / Esteban 1995", detail: "AJRCCM 1994 and NEJM 1995 — weaning by progressively lowering the SIMV rate was SLOWER than pressure support or once-daily spontaneous breathing trials. SIMV is not a recommended weaning mode." },
    aprvEvidence: { name: "Zhou 2017 (and ATS/ESICM/SCCM guideline)", detail: "Intensive Care Med 2017 — a single-centre RCT found more ventilator-free days with early APRV in ARDS, but there is no demonstrated mortality benefit and larger trials are lacking. Major guidelines do not recommend APRV as routine first-line ARDS ventilation." },
    nivCopd: { name: "Brochard 1995 / Lightowler 2003", detail: "NEJM 1995 and BMJ 2003 meta-analysis — NIV in acute hypercapnic COPD exacerbation reduces intubation rate, complications, length of stay and mortality. One of the strongest indications for NIV; ERS/ATS guidelines recommend it." },
    nivEdema: { name: "3CPO trial / Vital 2013", detail: "NEJM 2008 and Cochrane 2013 — NIV (CPAP or bilevel) in acute cardiogenic pulmonary edema improves dyspnea and reduces intubation rate. 3CPO found no mortality difference vs. standard oxygen therapy, but intubation and physiological benefit are consistent." },
    florali: { name: "FLORALI trial", detail: "NEJM 2015 (Frat et al.) — in de novo acute hypoxemic respiratory failure, high-flow nasal oxygen gave lower 90-day mortality than standard oxygen or NIV. The NIV arm did worse, and larger tidal volumes on NIV were associated with failure." },
    nivFailure: { name: "LUNG SAFE (Bellani 2017)", detail: "AJRCCM 2017 — in an observational ARDS cohort, NIV use in moderate–severe ARDS (P/F <150) was associated with higher ICU mortality. NIV failure requiring delayed intubation is associated with worse outcomes." },
    roxIndex: { name: "ROX index (Roca 2016 / 2019)", detail: "J Crit Care 2016 and AJRCCM 2019 — ROX = (SpO₂/FiO₂)/respiratory rate. A value ≥4.88 at 2–12 h of high-flow therapy predicts success; persistently low or falling values predict the need for intubation." },
    blueProtocol: { name: "BLUE protocol (Lichtenstein 2008)", detail: "Chest 2008 — a bedside lung ultrasound algorithm that reached ~90% accuracy in diagnosing the cause of acute respiratory failure, using profiles built from lung sliding, A-lines, B-lines, consolidation and venous compression." },
    lusConsensus: { name: "International LUS consensus (Volpicelli 2012)", detail: "Intensive Care Med 2012 — evidence-based recommendations for point-of-care lung ultrasound, including the criteria for interstitial syndrome, the signs of pneumothorax (absent sliding, absent B-lines, lung point), and consolidation." },
  };

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function computeIBW(sex, heightCm) {
    const base = sex === "female" ? 45.5 : 50;
    return Math.max(20, base + 0.905 * (heightCm - 152.4));
  }

  // ---------------------------------------------------------------------
  // Oxygen carriage. Shunt has to be applied to oxygen CONTENT, not to
  // partial pressure: end-capillary blood is essentially fully saturated, so
  // adding shunted venous blood lowers content, and PaO2 then falls off the
  // steep part of the dissociation curve. Interpolating PaO2 linearly across
  // the shunt (the obvious-looking shortcut) drastically understates how
  // badly a shunt oxygenates — which is exactly why ARDS is hard to fix with
  // FiO2 alone, and why a high FiO2 buys much less than a naive model shows.
  // ---------------------------------------------------------------------
  const HB_GDL = 14;          // assumed haemoglobin, g/dL
  const HUFNER = 1.34;        // mL O2 carried per g of fully saturated Hb
  const DISSOLVED = 0.003;    // mL O2 dissolved per dL per mmHg

  // Severinghaus oxyhaemoglobin dissociation approximation.
  function o2Saturation(po2) {
    const x = Math.pow(po2, 3) + 150 * po2;
    return clamp(1 / (23400 / x + 1), 0, 1);
  }

  function o2Content(po2) {
    return HUFNER * HB_GDL * o2Saturation(po2) + DISSOLVED * po2;
  }

  // Invert the content relationship by bisection — content is monotonic in
  // PO2, so this is stable and needs no closed-form inverse of Severinghaus.
  function po2FromContent(content) {
    let lo = 1, hi = 700;
    for (let i = 0; i < 45; i++) {
      const mid = (lo + hi) / 2;
      if (o2Content(mid) < content) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // CO2-production constant for a scenario, calibrated against a reference
  // "typical" ventilation setting. PaCO2 = co2Constant(scenario) / current
  // alveolar minute ventilation (L/min). Shared by the main engine and the
  // spontaneous-breathing-trial estimate in weaning.js.
  function co2Constant(scenario) {
    const refVt = 420, refRr = 16;
    const refVa = refVt * (1 - scenario.deadSpaceFrac);
    const refAlveolarMV = (refVa * refRr) / 1000;
    return scenario.paco2Ref * refAlveolarMV;
  }

  // ---------------------------------------------------------------------
  // Session performance stats, persisted to localStorage (same pattern as
  // the theme preference) so the dashboard survives a page reload. Every
  // module records into this shared bucket rather than keeping its own
  // silo, so dashboard.js has one place to read from.
  // ---------------------------------------------------------------------
  const STATS_KEY = "mvsim-stats";
  function loadStats() {
    try {
      const saved = JSON.parse(storageGet(STATS_KEY));
      if (saved && typeof saved === "object") return Object.assign(defaultStats(), saved);
    } catch (e) { /* corrupt or absent — fall through to defaults */ }
    return defaultStats();
  }
  function defaultStats() {
    return {
      settingsChecked: 0, settingsSafe: 0,
      weaningDecisions: 0, weaningReasonable: 0,
      alarmCorrect: 0, alarmTotal: 0,
      caseStepsCorrect: 0, caseStepsTotal: 0,
    };
  }
  const stats = loadStats();
  function saveStats() {
    storageSet(STATS_KEY, JSON.stringify(stats));
    if (typeof window.renderDashboard === "function") window.renderDashboard();
  }
  function recordSettingsCheck(hasDangerAlert) {
    stats.settingsChecked += 1;
    if (!hasDangerAlert) stats.settingsSafe += 1;
    saveStats();
  }
  function recordWeaningDecision(reasonable) {
    stats.weaningDecisions += 1;
    if (reasonable) stats.weaningReasonable += 1;
    saveStats();
  }
  function recordAlarmAttempt(correct) {
    stats.alarmTotal += 1;
    if (correct) stats.alarmCorrect += 1;
    saveStats();
  }
  function recordCaseStep(correct) {
    stats.caseStepsTotal += 1;
    if (correct) stats.caseStepsCorrect += 1;
    saveStats();
  }
  function resetStats() {
    Object.assign(stats, defaultStats());
    saveStats();
  }
  let settingsCheckTimer = null;

  // Shared with waveforms.js / weaning.js / alarms.js / dashboard.js, which
  // run as separate <script> tags and read scenario data + helpers off this
  // namespace rather than duplicating it.
  window.MVSIM = {
    SCENARIOS, EVIDENCE, clamp, computeIBW, co2Constant, stats,
    resistancePenalty, spontaneousVt, deriveVitals,
    recordSettingsCheck, recordWeaningDecision, recordAlarmAttempt, recordCaseStep, resetStats,
  };

  // How much a spontaneous breath's volume is penalized by airway resistance
  // for a given inspiratory effort — shared by pressure-support mode and the
  // weaning simulated SBT.
  // How much a spontaneous breath's volume is limited in obstructive disease.
  // This is not just airway resistance: a flow-limited, dynamically
  // hyperinflated patient is already breathing near total lung capacity, on
  // the flat top of the pressure-volume curve, so the effective compliance
  // available for the next spontaneous breath is far below the passive
  // compliance the ventilator measures. It is why severe obstruction produces
  // a rapid, shallow pattern rather than the slow deep breaths a naive
  // effort x compliance model predicts.
  function resistancePenalty(raw) {
    return clamp(1 - (raw - 8) * 0.029, 0.35, 1);
  }

  // Derives the actual delivered {vt, rr, ratio} for the current ventilation
  // mode. In volume control these are simply the clinician's direct inputs.
  // In pressure control, vt is derived from the set inspiratory pressure via
  // the same compliance relationship used everywhere else (Vt = ΔP × Crs).
  // In pressure support / CPAP, both vt and rr emerge from the scenario's
  // respiratory muscle reserve plus the set pressure support level — the
  // same math as the weaning simulator's spontaneous breathing trial,
  // because a PSV breath *is* a spontaneous breath.
  // Total dead-space fraction a spontaneous/mandatory breath sees, including
  // any circuit leak (bronchopleural fistula) that never reaches alveoli.
  function breathDeadSpaceFrac(scenario) {
    return clamp(scenario.deadSpaceFrac + (scenario.leakFrac || 0), 0, 0.9);
  }

  // Alveolar minute ventilation (L/min) the patient's chemoreceptors are
  // driving toward for this scenario — the same target the PSV, SIMV and
  // APRV spontaneous models all back-solve their respiratory rate from.
  function targetAlveolarMV(scenario) {
    return co2Constant(scenario) / scenario.paco2Ref;
  }

  // Volume of one unsupported (or PS-supported) spontaneous breath.
  function spontaneousVt(scenario, support) {
    const driveP = scenario.effortPressure + (support || 0);
    return clamp(driveP * scenario.crs * resistancePenalty(scenario.raw), 40, 900);
  }

  function deriveBreath(state, scenario) {
    if (state.mode === "pc") {
      const vt = clamp(state.pc * scenario.crs, 50, 900);
      return { vt, rr: state.rr, ratio: state.ratio };
    }
    if (state.mode === "simv") {
      // Mandatory volume-targeted breaths at the set SIMV rate, with the
      // patient free to take pressure-supported breaths in between. The
      // spontaneous rate is whatever is needed to make up the alveolar
      // ventilation the mandatory breaths don't already supply — so lowering
      // the SIMV rate visibly shifts work onto the patient.
      const dsf = breathDeadSpaceFrac(scenario);
      const mandVt = state.vt;
      const mandRr = state.rr;
      const mandAlvMV = (Math.max(mandVt * (1 - dsf), 20) * mandRr) / 1000;

      const spontVt = spontaneousVt(scenario, state.ps);
      const spontVa = Math.max(spontVt * (1 - dsf), 20);
      const deficit = Math.max(targetAlveolarMV(scenario) - mandAlvMV, 0);
      const spontRr = clamp((deficit * 1000) / spontVa, 0, 35);

      const rr = clamp(mandRr + spontRr, 1, 60);
      // The engine downstream needs one representative breath: use the
      // rate-weighted mean volume, which reproduces the correct total minute
      // and alveolar ventilation. Mechanics are overridden separately in
      // compute() to use the mandatory breath, which is the pressure-limiting
      // one — a blended Vt would understate the real plateau.
      const vt = (mandVt * mandRr + spontVt * spontRr) / rr;
      return {
        vt, rr, ratio: state.ratio,
        detail: { kind: "simv", mandVt, mandRr, spontVt, spontRr },
      };
    }
    if (state.mode === "aprv") {
      // APRV: the patient sits at P_high for a long T_high and is briefly
      // "released" to P_low for T_low. T_low is deliberately kept short so
      // exhalation is cut off before the lung empties — the resulting
      // intentional gas trapping is what maintains recruitment.
      const dsf = breathDeadSpaceFrac(scenario);
      const tau = scenario.raw * (scenario.crs / 1000);
      const ttot = state.tHigh + state.tLow;
      const releaseRr = 60 / ttot;

      // Only the fraction of the potential release volume that has time to
      // leave during T_low actually counts as ventilation.
      const exhaledFrac = 1 - Math.exp(-state.tLow / tau);
      const releaseVt = clamp(Math.max(state.pHigh - state.pLow, 0) * scenario.crs * exhaledFrac, 0, 900);
      const releaseAlvMV = (Math.max(releaseVt * (1 - dsf), 5) * releaseRr) / 1000;

      // Spontaneous breathing on top of P_high is unsupported (APRV's chief
      // selling point — the patient can breathe throughout the T_high phase).
      const spontVt = spontaneousVt(scenario, 0);
      const spontVa = Math.max(spontVt * (1 - dsf), 20);
      const deficit = Math.max(targetAlveolarMV(scenario) - releaseAlvMV, 0);
      const spontRr = clamp((deficit * 1000) / spontVa, 0, 35);

      const rr = clamp(releaseRr + spontRr, 1, 60);
      const vt = (releaseVt * releaseRr + spontVt * spontRr) / rr;
      // Ratio is reported as T_high : T_low so the rest of the UI has
      // something meaningful to show; mechanics are fully overridden below.
      const ratio = clamp(state.tLow / state.tHigh, 0.02, 8);
      return {
        vt, rr, ratio,
        detail: { kind: "aprv", releaseVt, releaseRr, spontVt, spontRr, exhaledFrac, tau },
      };
    }
    if (state.mode === "niv") {
      // Bilevel NIV: the patient breathes spontaneously, supported by
      // (IPAP - EPAP). Mask leak is the defining practical problem — leaked
      // volume never reaches the lung, so it directly erodes the support the
      // patient actually receives.
      const setSupport = Math.max(state.ipap - state.epap, 0);
      const effectiveSupport = setSupport * (1 - state.leak / 100);
      const vt = clamp(spontaneousVt(scenario, effectiveSupport), 60, 900);
      const va = Math.max(vt * (1 - breathDeadSpaceFrac(scenario)), 20);
      const rr = clamp((targetAlveolarMV(scenario) * 1000) / va, 8, 45);
      const ttot = 60 / rr;
      const ratio = clamp((ttot - 0.9) / 0.9, 0.3, 8);
      return {
        vt, rr, ratio,
        detail: {
          kind: "niv", setSupport, effectiveSupport, effectivePeep: state.epap,
        },
      };
    }
    if (state.mode === "hfnc") {
      // High-flow nasal oxygen provides no inspiratory support at all — the
      // tidal volume is entirely the patient's own effort. Its benefits come
      // from three other places, all modeled below: reliable FiO2 delivery
      // (only when flow meets inspiratory demand), nasopharyngeal dead-space
      // washout, and a small flow-dependent positive pressure.
      const vt = clamp(spontaneousVt(scenario, 0), 60, 900);

      // Anatomical dead space is flushed by the high flow between breaths.
      const deadSpaceMultiplier = 1 - 0.20 * clamp(state.flow / 60, 0, 1);
      const dsf = clamp(breathDeadSpaceFrac(scenario) * deadSpaceMultiplier, 0, 0.9);
      const va = Math.max(vt * (1 - dsf), 20);
      const rr = clamp((targetAlveolarMV(scenario) * 1000) / va, 8, 45);

      // If the delivered flow is below the patient's peak inspiratory demand,
      // they entrain room air around the cannula and the FiO2 that actually
      // reaches the alveoli is diluted — the single most common reason
      // high-flow "isn't working" at a low flow setting.
      const ttot = 60 / rr;
      // Inspiratory time shortens as the patient's rate climbs, and PEAK
      // inspiratory flow exceeds the mean by roughly pi/2 for a sinusoidal
      // profile — it is the peak, not the average, that the device has to
      // match to avoid room-air entrainment.
      const ti = Math.min(0.9, ttot * 0.4);
      const peakDemandLpm = (vt / 1000 / ti) * 60 * 1.57;
      const deliveredFraction = clamp(state.flow / Math.max(peakDemandLpm, 1), 0, 1);
      const effectiveFio2 = 21 + (state.fio2 - 21) * deliveredFraction;

      // Modest, flow-dependent positive airway pressure (roughly 0.5 cmH2O
      // per 10 L/min with the mouth closed; much less with it open).
      const generatedPeep = state.flow * 0.05;
      const ratio = clamp((ttot - ti) / ti, 0.3, 8);
      return {
        vt, rr, ratio,
        detail: {
          kind: "hfnc", effectiveFio2, deliveredFraction, peakDemandLpm,
          generatedPeep, deadSpaceMultiplier, effectivePeep: generatedPeep,
        },
      };
    }
    if (state.mode === "psv") {
      const vt = clamp(spontaneousVt(scenario, state.ps), 80, 900);
      const va = Math.max(vt * (1 - breathDeadSpaceFrac(scenario)), 20);
      const rr = clamp((targetAlveolarMV(scenario) * 1000) / va, 8, 45);
      // Spontaneous breaths have a roughly fixed neural inspiratory time
      // rather than a clinician-set I:E ratio; back-solve the ratio that
      // reproduces a ~0.9 s Ti so the rest of the engine needs no branching.
      const spontaneousTi = 0.9;
      const ttot = 60 / rr;
      const ratio = clamp((ttot - spontaneousTi) / spontaneousTi, 0.3, 8);
      return { vt, rr, ratio };
    }
    return { vt: state.vt, rr: state.rr, ratio: state.ratio }; // vc
  }

  // Core physiology model. All pressures in cmH2O, volumes in mL, flows in L/s,
  // gas partial pressures in mmHg. Simplified for teaching, not clinical use.
  function compute(state, scenario) {
    const { fio2, hco3 } = state;
    const { vt, rr, ratio, detail } = deriveBreath(state, scenario);

    // Non-invasive modes set their baseline pressure by another name (EPAP)
    // or generate it from gas flow rather than from a PEEP dial, and high-flow
    // oxygen only delivers its set FiO2 when flow meets inspiratory demand.
    const peep = detail && detail.effectivePeep != null ? detail.effectivePeep : state.peep;
    const deliveredFio2 = detail && detail.effectiveFio2 != null ? detail.effectiveFio2 : fio2;
    const fio2Frac = deliveredFio2 / 100;

    const ttot = 60 / rr;
    const ti = ttot / (1 + ratio);
    const te = ttot - ti;
    const flow = (vt / 1000) / ti; // L/s, square-wave approximation

    // Auto-PEEP from an incomplete passive exhalation (time-constant model).
    const tau = scenario.raw * (scenario.crs / 1000); // seconds
    const fractionExhaled = 1 - Math.exp(-te / tau);
    const trappedVolume = vt * (1 - fractionExhaled);
    let autoPeep = trappedVolume / scenario.crs;
    let totalPeep = peep + autoPeep;

    let drivingPressure = vt / scenario.crs;
    let resistivePressure = flow * scenario.raw;
    let plateauPressure = totalPeep + drivingPressure;
    let peakPressure = plateauPressure + resistivePressure;
    let meanAirwayPressure = totalPeep + drivingPressure * (ti / ttot);

    // Mode-specific mechanics. Gas exchange above is driven by the blended
    // breath (which carries the right minute ventilation), but the pressures
    // a clinician must actually limit are not the blend's — so override them
    // here, before recruitment/overdistension read mean airway pressure.
    if (detail && detail.kind === "simv") {
      // The mandatory breath is the pressure-limiting one; a blend of small
      // supported breaths and full mandatory breaths would hide the real
      // plateau the lung sees on every mandatory cycle.
      drivingPressure = detail.mandVt / scenario.crs;
      const mandTtot = 60 / Math.max(detail.mandRr, 1);
      const mandTi = mandTtot / (1 + ratio);
      resistivePressure = ((detail.mandVt / 1000) / mandTi) * scenario.raw;
      plateauPressure = totalPeep + drivingPressure;
      peakPressure = plateauPressure + resistivePressure;
      // Mean airway pressure still reflects the whole cycle mix, so keep it
      // weighted by how much of each minute is spent on mandatory breaths.
      const mandFraction = clamp(detail.mandRr / rr, 0, 1);
      meanAirwayPressure = totalPeep + drivingPressure * (mandTi / mandTtot) * mandFraction;
    } else if (detail && detail.kind === "aprv") {
      // In APRV the release is deliberately truncated: the pressure never
      // falls all the way to P_low, and the residual above P_low IS the
      // intentional auto-PEEP that holds the lung open.
      const residual = Math.max(state.pHigh - state.pLow, 0) * Math.exp(-state.tLow / detail.tau);
      autoPeep = residual;
      totalPeep = state.pLow + residual;
      plateauPressure = state.pHigh;          // pressure-limited: P_high IS the plateau
      drivingPressure = Math.max(state.pHigh - totalPeep, 0);
      resistivePressure = 0;                  // no flow at end of the T_high hold
      peakPressure = state.pHigh;
      // Time-weighted: nearly the whole cycle is spent at P_high, which is
      // exactly how APRV recruits at a lower plateau than a conventional
      // mode delivering the same mean pressure.
      meanAirwayPressure =
        (state.pHigh * state.tHigh + ((state.pHigh + totalPeep) / 2) * state.tLow) /
        (state.tHigh + state.tLow);
    }

    // Recruitment / overdistension shift oxygenation as a function of MAP.
    const recruitmentHalfPressure = Math.max(scenario.peepOpt - 3, 2);
    let recruitedFraction = scenario.recruitableFrac *
      (1 - Math.exp(-Math.max(meanAirwayPressure - 2, 0) / recruitmentHalfPressure));

    // Keeping a lung open needs more than a high *mean* pressure: alveoli
    // that fall below their closing pressure at end-expiration have to be
    // re-recruited every cycle. In conventional modes mean and end-expiratory
    // pressure rise and fall together, so MAP alone tracks this well enough.
    // APRV deliberately breaks that coupling — a long T_low can leave a very
    // high MAP sitting on top of an almost-zero end-expiratory pressure — so
    // the stability of recruitment is scored against end-expiratory pressure
    // there. This is why a too-long T_low derecruits the lung even though the
    // released volume (and therefore CO2 clearance) improves.
    if (detail && detail.kind === "aprv") {
      const stability = clamp(0.55 + 0.45 * (totalPeep / Math.max(scenario.peepOpt, 1)), 0, 1);
      recruitedFraction *= stability;
    }
    const overdistExcess = Math.max(meanAirwayPressure - (scenario.peepOpt + 6), 0);
    const overdistPenalty = scenario.overdistSensitivity * overdistExcess;
    const effectiveShunt = clamp(
      scenario.shuntBase * (1 - recruitedFraction) + overdistPenalty, 0, 0.9
    );
    // Rough venous-return / cardiac-output impact from raised intrathoracic
    // pressure, scaled per scenario (PE and pneumothorax's RV strain, or
    // trapped-gas states, are more afterload/preload sensitive than normal
    // lungs). Purely illustrative — not a real hemodynamic model.
    const cvSensitivity = scenario.cvSensitivity || 1.0;
    const hemodynamicImpact = clamp((meanAirwayPressure - 10) * 2.2 * cvSensitivity, 0, 45);

    // Mixed venous PO2 falls when cardiac output falls, because the tissues
    // extract more oxygen from each unit of blood. That matters for arterial
    // oxygenation: any shunt then mixes in *more desaturated* blood. It's the
    // reason cranking PEEP can worsen PaO2 in a preload-dependent patient
    // even while it recruits lung, and why hypoxemia in massive PE tracks the
    // failing right ventricle rather than alveolar collapse.
    const pvo2 = clamp(
      (scenario.pvo2Base || 40) - 0.5 * overdistExcess - hemodynamicImpact * 0.12,
      20, 50
    );

    // Dead space grows a little with overdistension (West zone 1 creation),
    // and a bronchopleural fistula leak also behaves like added dead space —
    // volume that leaves the circuit without ever taking part in gas exchange.
    // High-flow nasal oxygen flushes the nasopharynx between breaths, so a
    // smaller share of each breath is wasted re-breathing dead-space gas.
    const leakFrac = scenario.leakFrac || 0;
    const dsWashout = detail && detail.deadSpaceMultiplier != null ? detail.deadSpaceMultiplier : 1;
    const effectiveDeadSpaceFrac = clamp(
      scenario.deadSpaceFrac * dsWashout + overdistExcess * 0.004 + leakFrac, 0, 0.9
    );
    const vd = effectiveDeadSpaceFrac * vt;
    const va = Math.max(vt - vd, 20); // mL/breath alveolar ventilation
    const minuteVentilation = (vt * rr) / 1000; // L/min
    const alveolarMinuteVentilation = (va * rr) / 1000; // L/min

    // CO2 tied inversely to alveolar minute ventilation via a scenario-derived
    // constant, calibrated at a reference "typical" setting for that scenario.
    const paco2 = clamp(co2Constant(scenario) / alveolarMinuteVentilation, 15, 130);

    // Alveolar gas equation, then a content-based venous-admixture mix:
    // arterial content is the flow-weighted blend of end-capillary blood
    // (equilibrated with alveolar gas) and shunted mixed-venous blood.
    const pao2Alveolar = fio2Frac * (760 - 47) - paco2 / 0.8;
    const endCapillaryContent = o2Content(pao2Alveolar);
    const venousContent = o2Content(pvo2);
    const arterialContent =
      effectiveShunt * venousContent + (1 - effectiveShunt) * endCapillaryContent;

    const pao2 = clamp(po2FromContent(arterialContent), 25, 650);
    const pfRatio = pao2 / fio2Frac;
    const spo2 = clamp(o2Saturation(pao2) * 100, 30, 100);

    const ph = 6.1 + Math.log10(hco3 / (0.03 * paco2));

    return {
      vt, rr, ratio, ttot, ti, te, flow, tau, autoPeep, totalPeep, drivingPressure, resistivePressure,
      plateauPressure, peakPressure, meanAirwayPressure, effectiveShunt, recruitedFraction,
      overdistExcess, minuteVentilation, alveolarMinuteVentilation, paco2, pao2, pfRatio, spo2, ph,
      hemodynamicImpact, leakFrac, detail, setPeep: peep, deliveredFio2, hco3,
      effectiveDeadSpaceFrac,
    };
  }

  // ---------------------------------------------------------------------
  // Bedside vitals, derived from the engine rather than stored per scenario,
  // so the monitor responds to what the ventilator is doing. The chain is:
  // raised mean airway pressure cuts venous return -> MAP falls -> the heart
  // rate rises, urine output falls and lactate climbs. Vasopressor support
  // props the MAP back up WITHOUT removing the cause, which is exactly the
  // trap this panel is meant to make visible.
  // ---------------------------------------------------------------------
  function deriveVitals(scenario, results, noradrenaline) {
    const c = scenario.clinical;
    const dose = noradrenaline != null ? noradrenaline : c.noradrenaline;

    // Each 1% fall in venous return costs roughly 0.45 mmHg of MAP here.
    const ventPenalty = results.hemodynamicImpact * 0.45;
    // Noradrenaline response saturates — you cannot dose your way out.
    const pressorSupport = Math.min(dose * 105, 26);
    const map = clamp(c.baseMAP - ventPenalty + pressorSupport, 25, 130);

    // Tachycardia from hypoxemia, acidemia and hypotension.
    const hr = clamp(
      c.baseHR
        + Math.max(0, 92 - results.spo2) * 1.6
        + Math.max(0, 7.30 - results.ph) * 90
        + Math.max(0, 70 - map) * 1.3
        - Math.max(0, map - 85) * 0.25,
      45, 175
    );

    // Renal perfusion falls off steeply below a MAP of about 65.
    const urineOutput = Math.max(0, c.urineOutput * clamp((map - 45) / 25, 0, 1.25));

    // Anaerobic metabolism from hypoperfusion and/or severe hypoxemia.
    const lactate = clamp(
      c.lactate + Math.max(0, 65 - map) * 0.13 + Math.max(0, 88 - results.spo2) * 0.09,
      0.4, 20
    );

    // Standard base excess (approximation of the Siggaard-Andersen relation).
    const baseExcess = 0.93 * (results.hco3 - 24.4 + 14.8 * (results.ph - 7.4));

    return {
      map, hr, urineOutput, lactate, baseExcess, noradrenaline: dose,
      ventPenalty, pressorSupport,
      temp: c.temp, hb: c.hb, wbc: c.wbc, creatinine: c.creatinine, platelets: c.platelets,
      icuDay: c.icuDay, rass: c.rass, diagnosis: c.diagnosis,
    };
  }

  function buildWarnings(state, results, ibw, scenario) {
    const warnings = [];
    const d = results.detail;
    // The volume that matters for lung protection isn't always the reported
    // (blended) one: in SIMV it's the mandatory breath, in APRV the release.
    const protectiveVt = d
      ? (d.kind === "simv" ? d.mandVt : d.kind === "aprv" ? d.releaseVt : results.vt)
      : results.vt;
    const vtLabel = d && d.kind === "simv" ? "Mandatory tidal volume"
      : d && d.kind === "aprv" ? "Release volume"
      : "Tidal volume";
    const vtPerKg = protectiveVt / ibw;

    // The ARDSnet volume target describes a breath the clinician sets. In
    // fully spontaneous modes nobody is setting a volume, so citing ARDSnet
    // against the patient's own breath is a category error — a large one is a
    // P-SILI concern (flagged per-mode below) and a small one is a clinical
    // sign that RSBI/ROX already capture, not a ventilator misconfiguration.
    const spontaneousMode = state.mode === "psv" || state.mode === "niv" || state.mode === "hfnc";
    if (!spontaneousMode) {
      if (vtPerKg > 8) {
        warnings.push({ level: "danger", text: `${vtLabel} is ${vtPerKg.toFixed(1)} mL/kg IBW — above the lung-protective target (~6, max 8 mL/kg).`, evidence: "ardsnet" });
      } else if (vtPerKg < 4) {
        warnings.push({ level: "warn", text: `${vtLabel} is ${vtPerKg.toFixed(1)} mL/kg IBW — quite low; watch for atelectasis and CO₂ retention.`, evidence: "ardsnet" });
      }
    } else if (vtPerKg > 9.5) {
      warnings.push({ level: "danger", text: `The patient's own tidal volume is ${vtPerKg.toFixed(1)} mL/kg IBW. Large spontaneous breaths generate high transpulmonary pressure that no ventilator display shows, and big tidal volumes on non-invasive support are associated with failure — this is the P-SILI mechanism, not a setting you can simply dial down.`, evidence: "florali" });
    }

    if (results.plateauPressure > 30) {
      warnings.push({ level: "danger", text: `Plateau pressure ${results.plateauPressure.toFixed(1)} cmH₂O exceeds 30 — risk of barotrauma/volutrauma.`, evidence: "ardsnet" });
    } else if (results.plateauPressure > 28) {
      warnings.push({ level: "warn", text: `Plateau pressure ${results.plateauPressure.toFixed(1)} cmH₂O is approaching the 30 cmH₂O limit.`, evidence: "ardsnet" });
    }

    if (results.drivingPressure > 15) {
      warnings.push({ level: "danger", text: `Driving pressure ${results.drivingPressure.toFixed(1)} cmH₂O exceeds 15 — associated with higher ARDS mortality.`, evidence: "amato" });
    }

    if (results.autoPeep > 2 && !(d && d.kind === "aprv")) {
      warnings.push({ level: "danger", text: `Auto-PEEP ≈ ${results.autoPeep.toFixed(1)} cmH₂O suggests dynamic hyperinflation / breath stacking — shorten inspiratory time, lower RR, or treat bronchospasm.` });
    }

    if (results.ph < 7.2) {
      warnings.push({ level: "danger", text: `pH ${results.ph.toFixed(2)} — severe acidemia. If not intentional permissive hypercapnia, consider increasing alveolar ventilation.` });
    } else if (results.ph > 7.5) {
      warnings.push({ level: "warn", text: `pH ${results.ph.toFixed(2)} — alkalemia from relative hyperventilation.` });
    }

    if (results.spo2 < 88 || results.pao2 < 55) {
      warnings.push({ level: "danger", text: `SpO₂ ${results.spo2.toFixed(0)}% / PaO₂ ${results.pao2.toFixed(0)} mmHg — severe hypoxemia.` });
    }

    if (state.fio2 >= 80) {
      warnings.push({ level: "info", text: "FiO₂ ≥80% sustained for long periods carries a theoretical risk of absorption atelectasis / oxygen toxicity — wean as tolerated once the target SpO₂/PaO₂ allows it.", evidence: "conservativeO2" });
    }

    if (results.hemodynamicImpact > 15) {
      warnings.push({ level: "warn", text: `Mean airway pressure is high enough to meaningfully reduce venous return (est. ${results.hemodynamicImpact.toFixed(0)}% fall) — watch blood pressure, especially if preload-dependent.` });
    }

    if (d && d.kind === "simv") {
      const spontShare = d.spontRr / Math.max(d.mandRr + d.spontRr, 0.1);
      if (d.spontRr > 0.5) {
        warnings.push({ level: "info", text: `The patient is taking ≈${d.spontRr.toFixed(0)} spontaneous breaths/min on top of ${d.mandRr} mandatory breaths — about ${(spontShare * 100).toFixed(0)}% of total ventilation is their own work. Lowering the SIMV rate shifts more load onto them.` });
      }
      warnings.push({ level: "warn", text: "SIMV is often used as a weaning mode, but weaning by stepping the SIMV rate down was slower than pressure support or once-daily spontaneous breathing trials — it is not the recommended way to liberate a patient from the ventilator.", evidence: "simvWeaning" });
    }

    if (d && d.kind === "aprv") {
      warnings.push({ level: "info", text: `Intentional gas trapping: expiration is cut off after T_low ${state.tLow.toFixed(1)} s (≈${(d.exhaledFrac * 100).toFixed(0)}% of the release volume escapes), leaving ${results.autoPeep.toFixed(1)} cmH₂O above P_low. That residual pressure is the point of the mode — it is what prevents derecruitment between releases.` });

      if (state.pHigh > 30) {
        warnings.push({ level: "danger", text: `P_high ${state.pHigh} cmH₂O is the plateau pressure in this mode — above 30 cmH₂O it carries the same barotrauma risk as any other mode.`, evidence: "ardsnet" });
      }
      if (d.exhaledFrac > 0.75) {
        warnings.push({ level: "warn", text: `T_low is long enough for ${(d.exhaledFrac * 100).toFixed(0)}% of the release volume to escape — the lung is emptying too far toward P_low and will derecruit. T_low is conventionally set to terminate expiratory flow at ~75% of its peak, i.e. well before the lung empties.` });
      }
      if (scenario.raw >= 18) {
        warnings.push({ level: "danger", text: "APRV in obstructive disease is hazardous: this scenario's long expiratory time constant means the short T_low traps a large volume with every release, and gas trapping compounds breath to breath." });
      }
      warnings.push({ level: "info", text: "APRV's evidence base is thin — one single-centre RCT found more ventilator-free days in ARDS, but no mortality benefit has been shown and major guidelines do not recommend it as routine first-line ventilation.", evidence: "aprvEvidence" });
    }

    if (d && d.kind === "niv") {
      const hypercapnicObstructive = scenario.paco2Ref >= 50 && scenario.raw >= 18;
      if (hypercapnicObstructive) {
        warnings.push({ level: "good", text: "Acute hypercapnic COPD exacerbation is one of the strongest indications for NIV — it reduces intubation rate, complications and mortality. Bilevel support (not CPAP alone) is what unloads the respiratory muscles here.", evidence: "nivCopd" });
      }
      if (scenario.label && /edema|CHF/i.test(scenario.label)) {
        warnings.push({ level: "good", text: "Acute cardiogenic pulmonary edema is a well-supported NIV indication — it improves dyspnea and reduces intubation rate, on top of the preload/afterload benefit of the positive pressure itself.", evidence: "nivEdema" });
      }
      // De novo hypoxemic failure is where NIV is most often over-used.
      if (results.pfRatio < 200 && !hypercapnicObstructive) {
        warnings.push({ level: "danger", text: `P/F ${results.pfRatio.toFixed(0)} on NIV in de novo hypoxemic failure — this is the setting where NIV performs worst. NIV use in moderate–severe ARDS was associated with higher mortality, and failure requiring delayed intubation carries a worse outcome than early intubation. Set an explicit time limit and intubation trigger rather than persisting.`, evidence: "nivFailure" });
        warnings.push({ level: "info", text: "In de novo acute hypoxemic respiratory failure specifically, high-flow nasal oxygen gave lower 90-day mortality than either standard oxygen or NIV — consider it rather than escalating NIV pressures.", evidence: "florali" });
      }
      if (state.leak > 25) {
        warnings.push({ level: "warn", text: `Mask leak ${state.leak}% means the patient is receiving an effective ${d.effectiveSupport.toFixed(1)} cmH₂O of support instead of the set ${d.setSupport.toFixed(0)} cmH₂O. Refit the mask before dialing the pressure up — raising IPAP against a big leak mostly increases the leak.` });
      }
      if (results.drivingPressure > 15) {
        warnings.push({ level: "danger", text: `Estimated transpulmonary driving pressure ${results.drivingPressure.toFixed(0)} cmH₂O. On NIV the ventilator cannot show you this — it is the patient's own vigorous effort plus the set support. Large tidal volumes on NIV are associated with failure, and this is the P-SILI mechanism.`, evidence: "florali" });
      }
      warnings.push({ level: "info", text: "NIV assumes an awake, cooperative patient who can protect their airway. Depressed consciousness, vomiting, haemodynamic instability, facial trauma or copious secretions all argue for intubation instead." });
    }

    if (d && d.kind === "hfnc") {
      const roxIndex = (results.spo2 / (results.deliveredFio2 / 100)) / results.rr;
      if (d.deliveredFraction < 0.95) {
        warnings.push({ level: "warn", text: `Flow ${state.flow} L/min is below this patient's estimated peak inspiratory demand of ≈${d.peakDemandLpm.toFixed(0)} L/min, so they entrain room air around the cannula: set FiO₂ ${state.fio2}% is really delivering ≈${results.deliveredFio2.toFixed(0)}%. Raise the flow before raising the FiO₂.` });
      }
      if (roxIndex < 4.88) {
        warnings.push({ level: "danger", text: `ROX index ${roxIndex.toFixed(2)} (SpO₂/FiO₂ ÷ RR) is below 4.88 — the threshold below which high-flow therapy is likely to fail. A persistently low or falling ROX should prompt intubation rather than further escalation.`, evidence: "roxIndex" });
      } else {
        warnings.push({ level: "good", text: `ROX index ${roxIndex.toFixed(2)} — at or above the 4.88 threshold associated with high-flow success. Recheck it serially; the trend matters more than a single value.`, evidence: "roxIndex" });
      }
      warnings.push({ level: "info", text: `High-flow gives no inspiratory support — the ${results.vt.toFixed(0)} mL tidal volume here is entirely the patient's own effort. Its benefits are dead-space washout (${((1 - d.deadSpaceMultiplier) * 100).toFixed(0)}% less wasted ventilation at this flow), reliable FiO₂, warmed humidified gas, and about ${d.generatedPeep.toFixed(1)} cmH₂O of flow-generated pressure — which is not a substitute for PEEP and disappears if the patient's mouth is open.` });
      if (scenario.paco2Ref >= 50 && scenario.raw >= 18) {
        warnings.push({ level: "warn", text: "This is a hypercapnic obstructive patient. High-flow can help, but bilevel NIV is the better-evidenced first-line choice for acute hypercapnic COPD exacerbation.", evidence: "nivCopd" });
      }
    }

    if (state.mode === "psv" && results.drivingPressure > 15) {
      warnings.push({ level: "warn", text: `In pressure support, the set pressure (PS ${state.ps} cmH₂O) alone doesn't reveal this — the ${results.drivingPressure.toFixed(0)} cmH₂O reflects PS plus the patient's own inspiratory effort, which the ventilator can't display. Vigorous spontaneous effort can injure the lung even when the dialed-in numbers look safe (patient self-inflicted lung injury, P-SILI).` });
    }

    return warnings;
  }

  function bandClass(value, thresholds) {
    // thresholds: [goodMax, warnMax] ascending-risk value
    if (value <= thresholds[0]) return "good";
    if (value <= thresholds[1]) return "warn";
    return "bad";
  }

  const MODE_INFO = {
    vc: { desc: "Clinician sets tidal volume directly; pressure is the dependent variable. The safest default for most patients." },
    pc: { desc: "Clinician sets the inspiratory pressure; tidal volume is the dependent variable and will change if compliance/resistance change — watch delivered Vt, not just the set pressure." },
    psv: { desc: "Patient-triggered and patient-cycled: only PEEP/CPAP and pressure support are set. Rate and tidal volume emerge from the patient's own effort and lung mechanics — there is no backup rate." },
    simv: { desc: "A set number of mandatory volume-targeted breaths per minute, with the patient free to take pressure-supported breaths in between. Lower the SIMV rate and the patient picks up more of the work — but note SIMV is not a recommended weaning mode." },
    aprv: { desc: "Continuous high pressure (P_high) held for a long T_high, with brief timed releases to P_low. Oxygenation comes from the high mean airway pressure; T_low is kept deliberately short so the lung never fully empties, and the patient can breathe spontaneously throughout." },
    niv: { desc: "Non-invasive bilevel support through a mask: the patient breathes spontaneously with IPAP on inspiration and EPAP as the baseline, so the support delivered is IPAP − EPAP. Mask leak directly erodes that support — no tube means no guaranteed delivery." },
    hfnc: { desc: "High-flow nasal oxygen — heated, humidified gas at a set flow and FiO₂. It provides no inspiratory support at all: benefits come from dead-space washout, reliable FiO₂ delivery when flow meets inspiratory demand, and a small flow-generated pressure." },
  };

  // ---------------------------------------------------------------------
  // DOM wiring
  // ---------------------------------------------------------------------
  const els = {};
  ["scenario", "sex", "height", "height-out-unit", "ibw-out",
    "vent-mode", "mode-desc", "peep-cpap-tag",
    "peep", "peep-out", "vt-control", "vt", "vt-out", "vt-per-kg",
    "pc-control", "pc", "pc-out", "pc-vt-readout",
    "ps-control", "ps", "ps-out", "ps-breath-readout",
    "aprv-controls", "phigh", "phigh-out", "plow", "plow-out",
    "thigh", "thigh-out", "tlow", "tlow-out", "aprv-readout",
    "simv-readout",
    "niv-controls", "ipap", "ipap-out", "epap", "epap-out", "leak", "leak-out", "niv-readout",
    "hfnc-controls", "flow", "flow-out", "hfnc-readout",
    "norad", "norad-out",
    "fio2", "fio2-out", "ie-control", "ie", "ie-out", "rr-control", "rr", "rr-out",
    "hco3", "hco3-out", "reset-btn",
    "scenario-desc", "scenario-teaching", "scenario-evidence",
    "res-pao2", "res-spo2", "res-pf", "res-pf-bar",
    "res-paco2", "res-ph", "res-mv", "res-vamv",
    "res-plateau", "res-plateau-bar", "res-driving", "res-driving-bar",
    "res-peak", "res-map", "res-autopeep", "res-totalpeep",
    "warnings-list",
  ].forEach((id) => { els[id] = document.getElementById(id); });

  function populateScenarios() {
    Object.keys(SCENARIOS).forEach((id) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = SCENARIOS[id].label;
      els.scenario.appendChild(opt);
    });
  }

  function applyScenarioDefaults(id) {
    const scenario = SCENARIOS[id];
    const ibw = computeIBW(els.sex.value, Number(els.height.value));
    els.peep.value = scenario.defaults.peep;
    els.vt.value = Math.round((scenario.defaults.vtPerKg * ibw) / 10) * 10;
    els.fio2.value = scenario.defaults.fio2;
    els.ie.value = scenario.defaults.ie;
    els.rr.value = scenario.defaults.rr;
    els.hco3.value = scenario.hco3;
    // Pressure-control default: whatever inspiratory pressure would deliver
    // the same protective Vt as the volume-control default, so switching
    // modes on the same scenario starts from a comparable breath.
    els.pc.value = Math.round(clamp((scenario.defaults.vtPerKg * ibw) / scenario.crs, 5, 40));
    els.ps.value = 10;
    els.norad.value = scenario.clinical.noradrenaline;

    // APRV defaults: P_low 0 (conventional), a long T_high, and a T_low set
    // to ~0.75 expiratory time constants — short enough to terminate flow
    // well before the lung empties, which is the whole basis of the mode.
    // P_high is then whatever delivers this scenario's protective release
    // volume through that deliberately truncated exhalation.
    const tau = scenario.raw * (scenario.crs / 1000);
    const tLow = clamp(Math.round(0.75 * tau * 100) / 100, 0.2, 0.8);
    els.plow.value = 0;
    els.thigh.value = 4.5;
    els.tlow.value = tLow;
    const exhaledFrac = 1 - Math.exp(-tLow / tau);
    els.phigh.value = Math.round(
      clamp((scenario.defaults.vtPerKg * ibw) / (scenario.crs * exhaledFrac), 10, 40)
    );
    render();
  }

  function ieLabel(ratio) {
    return ratio >= 1 ? `1 : ${ratio.toFixed(1)}` : `${(1 / ratio).toFixed(1)} : 1`;
  }

  function setGauge(el, pct, cls) {
    el.style.width = `${clamp(pct, 0, 100)}%`;
    el.className = `gauge-fill gauge-${cls}`;
  }

  function applyModeVisibility() {
    const mode = els["vent-mode"].value;
    const aprv = mode === "aprv";
    const niv = mode === "niv";
    const hfnc = mode === "hfnc";
    const nonInvasive = niv || hfnc;

    els["niv-controls"].hidden = !niv;
    els["hfnc-controls"].hidden = !hfnc;
    els["niv-readout"].hidden = !niv;
    els["hfnc-readout"].hidden = !hfnc;
    // SIMV borrows the volume-control Vt slider (mandatory breath), the rate
    // slider (mandatory rate) and the PS slider (for spontaneous breaths).
    els["vt-control"].hidden = !(mode === "vc" || mode === "simv");
    els["pc-control"].hidden = mode !== "pc";
    els["ps-control"].hidden = !(mode === "psv" || mode === "simv");
    // Rate and I:E are patient-determined in every spontaneous mode.
    els["ie-control"].hidden = mode === "psv" || aprv || nonInvasive;
    els["rr-control"].hidden = mode === "psv" || aprv || nonInvasive;
    els["aprv-controls"].hidden = !aprv;
    els["simv-readout"].hidden = mode !== "simv";
    els["aprv-readout"].hidden = !aprv;
    // PEEP is meaningless in APRV (P_low plays that role), in NIV (EPAP does)
    // and on high-flow (the small pressure is generated by the flow itself).
    els.peep.closest(".control-block").hidden = aprv || nonInvasive;
    // High-flow sets its own oxygen; NIV uses the shared FiO2 slider.
    els.fio2.closest(".control-block").hidden = false;
    els["mode-desc"].textContent = MODE_INFO[mode].desc;
    els["peep-cpap-tag"].textContent = mode === "psv" ? "(= CPAP level)" : "";

    // Relabel the shared sliders so SIMV's borrowed controls read correctly.
    const vtLabel = document.querySelector('#vt-control label[for="vt"]');
    if (vtLabel) {
      vtLabel.childNodes[0].nodeValue = mode === "simv" ? "Mandatory tidal volume " : "Tidal volume ";
    }
    const rrLabel = document.querySelector('#rr-control label[for="rr"]');
    if (rrLabel) {
      rrLabel.childNodes[0].nodeValue = mode === "simv" ? "Mandatory (SIMV) rate " : "Respiratory rate ";
    }
  }

  function render() {
    const scenario = SCENARIOS[els.scenario.value];
    const ibw = computeIBW(els.sex.value, Number(els.height.value));

    const state = {
      mode: els["vent-mode"].value,
      peep: Number(els.peep.value),
      vt: Number(els.vt.value),
      pc: Number(els.pc.value),
      ps: Number(els.ps.value),
      fio2: Number(els.fio2.value),
      ratio: Number(els.ie.value),
      rr: Number(els.rr.value),
      hco3: Number(els.hco3.value),
      pHigh: Number(els.phigh.value),
      pLow: Number(els.plow.value),
      tHigh: Number(els.thigh.value),
      tLow: Number(els.tlow.value),
      ipap: Number(els.ipap.value),
      epap: Number(els.epap.value),
      leak: Number(els.leak.value),
      flow: Number(els.flow.value),
      norad: Number(els.norad.value),
    };

    els["peep-out"].textContent = state.peep;
    els["pc-out"].textContent = state.pc;
    els["ps-out"].textContent = state.ps;
    els["fio2-out"].textContent = state.fio2;
    els["ie-out"].textContent = ieLabel(state.ratio);
    els["rr-out"].textContent = state.rr;
    els["hco3-out"].textContent = state.hco3;
    els["phigh-out"].textContent = state.pHigh;
    els["plow-out"].textContent = state.pLow;
    els["thigh-out"].textContent = state.tHigh.toFixed(1);
    els["tlow-out"].textContent = state.tLow.toFixed(2);
    els["ipap-out"].textContent = state.ipap;
    els["epap-out"].textContent = state.epap;
    els["leak-out"].textContent = state.leak;
    els["flow-out"].textContent = state.flow;
    els["norad-out"].textContent = state.norad.toFixed(2);
    els["ibw-out"].textContent = `${ibw.toFixed(0)} kg`;
    els["height-out-unit"].textContent = `${els.height.value} cm`;
    els["scenario-desc"].textContent = scenario.description;
    els["scenario-teaching"].textContent = scenario.teaching;

    const r = compute(state, scenario);

    // Vt/RR readouts: the slider-driven value in VC, the physiology
    // engine's derived value in PC/PSV (shown in their own sub-notes).
    els["vt-out"].textContent = r.vt.toFixed(0);
    els["vt-per-kg"].textContent = `${(r.vt / ibw).toFixed(1)} mL/kg IBW (IBW ${ibw.toFixed(0)} kg)`;
    els["pc-vt-readout"].textContent = `Delivered tidal volume ≈ ${r.vt.toFixed(0)} mL (${(r.vt / ibw).toFixed(1)} mL/kg IBW) at current compliance.`;
    els["ps-breath-readout"].textContent = `Patient's own breathing (estimated): RR ≈ ${r.rr.toFixed(0)} /min, Vt ≈ ${r.vt.toFixed(0)} mL (${(r.vt / ibw).toFixed(1)} mL/kg IBW).`;

    if (r.detail && r.detail.kind === "simv") {
      const d = r.detail;
      els["vt-per-kg"].textContent = `${(d.mandVt / ibw).toFixed(1)} mL/kg IBW per mandatory breath (IBW ${ibw.toFixed(0)} kg)`;
      els["simv-readout"].textContent =
        `Mandatory: ${d.mandRr}/min × ${d.mandVt.toFixed(0)} mL. ` +
        `Spontaneous (PS ${state.ps}): ≈${d.spontRr.toFixed(0)}/min × ${d.spontVt.toFixed(0)} mL. ` +
        `Total RR ≈ ${r.rr.toFixed(0)}/min, total minute ventilation ${r.minuteVentilation.toFixed(1)} L/min.`;
    }
    if (r.detail && r.detail.kind === "niv") {
      const d = r.detail;
      els["niv-readout"].textContent =
        `Set support ${d.setSupport.toFixed(0)} cmH₂O (IPAP ${state.ipap} − EPAP ${state.epap}); after ${state.leak}% leak the patient effectively receives ${d.effectiveSupport.toFixed(1)} cmH₂O. ` +
        `Resulting breathing: ≈${r.rr.toFixed(0)}/min × ${r.vt.toFixed(0)} mL (${(r.vt / ibw).toFixed(1)} mL/kg IBW), minute ventilation ${r.minuteVentilation.toFixed(1)} L/min.`;
    }
    if (r.detail && r.detail.kind === "hfnc") {
      const d = r.detail;
      const rox = (r.spo2 / (r.deliveredFio2 / 100)) / r.rr;
      els["hfnc-readout"].textContent =
        `Flow ${state.flow} L/min vs. estimated peak inspiratory demand ≈${d.peakDemandLpm.toFixed(0)} L/min → delivered FiO₂ ≈${r.deliveredFio2.toFixed(0)}% (set ${state.fio2}%). ` +
        `Dead-space washout ${((1 - d.deadSpaceMultiplier) * 100).toFixed(0)}%, flow-generated pressure ≈${d.generatedPeep.toFixed(1)} cmH₂O. ` +
        `Patient's own breathing: ≈${r.rr.toFixed(0)}/min × ${r.vt.toFixed(0)} mL. ROX index ${rox.toFixed(2)}.`;
    }
    if (r.detail && r.detail.kind === "aprv") {
      const d = r.detail;
      els["aprv-readout"].textContent =
        `Release volume ≈ ${d.releaseVt.toFixed(0)} mL (${(d.releaseVt / ibw).toFixed(1)} mL/kg IBW) at ${d.releaseRr.toFixed(1)} releases/min. ` +
        `Spontaneous breathing on top: ≈${d.spontRr.toFixed(0)}/min × ${d.spontVt.toFixed(0)} mL. ` +
        `End-expiratory pressure ${r.totalPeep.toFixed(1)} cmH₂O (P_low ${state.pLow} + ${r.autoPeep.toFixed(1)} intentional).`;
    }

    els["res-pao2"].textContent = `${r.pao2.toFixed(0)} mmHg`;
    els["res-spo2"].textContent = `${r.spo2.toFixed(0)}%`;
    els["res-pf"].textContent = r.pfRatio.toFixed(0);
    setGauge(els["res-pf-bar"], (r.pfRatio / 500) * 100, bandClass(300 - r.pfRatio, [0, 100]));

    els["res-paco2"].textContent = `${r.paco2.toFixed(0)} mmHg`;
    els["res-ph"].textContent = r.ph.toFixed(2);
    els["res-mv"].textContent = `${r.minuteVentilation.toFixed(1)} L/min`;
    els["res-vamv"].textContent = `${r.alveolarMinuteVentilation.toFixed(1)} L/min`;

    els["res-plateau"].textContent = `${r.plateauPressure.toFixed(1)} cmH₂O`;
    setGauge(els["res-plateau-bar"], (r.plateauPressure / 40) * 100, bandClass(r.plateauPressure - 25, [3, 5]));
    els["res-driving"].textContent = `${r.drivingPressure.toFixed(1)} cmH₂O`;
    setGauge(els["res-driving-bar"], (r.drivingPressure / 25) * 100, bandClass(r.drivingPressure - 12, [3, 3]));

    els["res-peak"].textContent = `${r.peakPressure.toFixed(1)} cmH₂O`;
    els["res-map"].textContent = `${r.meanAirwayPressure.toFixed(1)} cmH₂O`;
    els["res-autopeep"].textContent = `${r.autoPeep.toFixed(1)} cmH₂O`;
    els["res-totalpeep"].textContent = `${r.totalPeep.toFixed(1)} cmH₂O`;

    const warnings = buildWarnings(state, r, ibw, scenario);
    els["warnings-list"].innerHTML = "";
    if (warnings.length === 0) {
      const li = document.createElement("li");
      li.className = "warning-item warning-good";
      li.textContent = "No lung-protective ventilation alerts at these settings.";
      els["warnings-list"].appendChild(li);
    } else {
      warnings.forEach((w) => {
        const li = document.createElement("li");
        li.className = `warning-item warning-${w.level}`;
        li.textContent = w.text;
        if (w.evidence && EVIDENCE[w.evidence]) {
          const cite = document.createElement("span");
          cite.className = "evidence-tag";
          cite.textContent = EVIDENCE[w.evidence].name;
          cite.title = EVIDENCE[w.evidence].detail;
          li.appendChild(document.createTextNode(" "));
          li.appendChild(cite);
        }
        els["warnings-list"].appendChild(li);
      });
    }

    els["scenario-evidence"].innerHTML = "";
    (scenario.evidence || []).forEach((key) => {
      if (!EVIDENCE[key]) return;
      const span = document.createElement("span");
      span.className = "evidence-tag";
      span.textContent = EVIDENCE[key].name;
      span.title = EVIDENCE[key].detail;
      els["scenario-evidence"].appendChild(span);
    });

    renderWaveforms(state, scenario, r);
    renderLung(scenario, r);
    if (typeof window.renderWeaning === "function") {
      window.renderWeaning(state, scenario, r, ibw);
    }
    if (typeof window.renderPatient === "function") {
      window.renderPatient(state, scenario, r, ibw);
    }
    if (typeof window.renderCXR === "function") {
      window.renderCXR(els.scenario.value, scenario, r, state);
    }
    if (typeof window.renderUltrasound === "function") {
      window.renderUltrasound(els.scenario.value, scenario, r);
    }

    // Live snapshot for other modules (e.g. cases.js "check my settings"
    // steps) that need to read the main panel's current configuration
    // without simulator.js knowing anything about them.
    window.MVSIM._lastRender = { state, scenario, r, ibw, scenarioId: els.scenario.value };
    if (typeof window.onSimulatorRender === "function") window.onSimulatorRender();

    // Debounced: only tally once the user settles on a configuration,
    // rather than once per pixel of slider drag.
    clearTimeout(settingsCheckTimer);
    const hasDangerAlert = warnings.some((w) => w.level === "danger");
    settingsCheckTimer = setTimeout(() => recordSettingsCheck(hasDangerAlert), 700);
  }

  // localStorage throws outright (not just returns null) when storage is
  // blocked — Safari private browsing, sandboxed frames, cookies disabled.
  // An unguarded read here would abort init() and take the whole page down,
  // so every access goes through these.
  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  function initTheme() {
    const toggle = document.getElementById("theme-toggle");
    if (!toggle) return;
    const saved = storageGet("mvsim-theme");
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const effective = saved || (prefersDark ? "dark" : "light");
    toggle.textContent = effective === "dark" ? "☀️" : "🌙";
    toggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme")
        || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      storageSet("mvsim-theme", next);
      toggle.textContent = next === "dark" ? "☀️" : "🌙";
    });
  }

  function init() {
    populateScenarios();
    initTheme();

    ["peep", "vt", "pc", "ps", "fio2", "ie", "rr", "hco3", "height", "sex",
      "phigh", "plow", "thigh", "tlow",
      "ipap", "epap", "leak", "flow", "norad"].forEach((id) => {
      els[id].addEventListener("input", render);
    });
    els.scenario.addEventListener("change", () => applyScenarioDefaults(els.scenario.value));
    els["reset-btn"].addEventListener("click", () => applyScenarioDefaults(els.scenario.value));
    els["vent-mode"].addEventListener("change", () => {
      applyModeVisibility();
      render();
    });

    els.scenario.value = "ardsModerate";
    applyModeVisibility();
    applyScenarioDefaults("ardsModerate");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
