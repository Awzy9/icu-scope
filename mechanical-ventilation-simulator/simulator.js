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
      teaching: "Lung-protective volumes (~6 mL/kg PBW) are good practice even here — there's no reason to use large tidal volumes just because the lungs are healthy.",
      crs: 50, raw: 8, shuntBase: 0.03, recruitableFrac: 0.3, deadSpaceFrac: 0.30,
      peepOpt: 5, overdistSensitivity: 0.010, paco2Ref: 40, hco3: 24, effortPressure: 12,
      defaults: { peep: 5, vtPerKg: 6, fio2: 30, ie: 2, rr: 14 },
    },
    ardsMild: {
      label: "ARDS — mild (P/F 200–300)",
      description: "Berlin mild ARDS: diffuse alveolar damage with recruitable shunt.",
      teaching: "Low tidal volume (6 mL/kg PBW) and moderate PEEP. Permissive hypercapnia is acceptable if pH is tolerable.",
      crs: 40, raw: 10, shuntBase: 0.20, recruitableFrac: 0.5, deadSpaceFrac: 0.40,
      peepOpt: 9, overdistSensitivity: 0.010, paco2Ref: 42, hco3: 24, effortPressure: 11,
      defaults: { peep: 8, vtPerKg: 6, fio2: 40, ie: 1.5, rr: 18 },
      evidence: ["ardsnet", "guidelines"],
    },
    ardsModerate: {
      label: "ARDS — moderate (P/F 100–200)",
      description: "Berlin moderate ARDS.",
      teaching: "Titrate PEEP for oxygenation (e.g. ARDSnet tables) but watch driving pressure — keep it ≤15 cmH2O where possible. Consider prone positioning if refractory.",
      crs: 30, raw: 10, shuntBase: 0.35, recruitableFrac: 0.6, deadSpaceFrac: 0.50,
      peepOpt: 12, overdistSensitivity: 0.009, paco2Ref: 45, hco3: 24, effortPressure: 9,
      defaults: { peep: 10, vtPerKg: 6, fio2: 50, ie: 1.5, rr: 22 },
      evidence: ["ardsnet", "express", "art", "guidelines"],
    },
    ardsSevere: {
      label: "ARDS — severe (P/F <100)",
      description: "Berlin severe ARDS.",
      teaching: "High recruitable shunt but also high overdistension risk — titrate PEEP carefully. Consider prone positioning, neuromuscular blockade, or ECMO referral if refractory. Keep plateau <30 and driving pressure <15 cmH2O.",
      crs: 20, raw: 11, shuntBase: 0.50, recruitableFrac: 0.65, deadSpaceFrac: 0.60,
      peepOpt: 16, overdistSensitivity: 0.008, paco2Ref: 50, hco3: 24, effortPressure: 7,
      defaults: { peep: 14, vtPerKg: 6, fio2: 70, ie: 1.5, rr: 26 },
      evidence: ["ardsnet", "amato", "proseva", "art", "guidelines"],
    },
    copd: {
      label: "COPD / asthma exacerbation",
      description: "Obstructive disease with airflow limitation and air-trapping risk.",
      teaching: "Prioritize a long expiratory time (lower RR, higher I:E ratio like 1:4) and accept permissive hypercapnia to avoid auto-PEEP / breath stacking, which can cause hypotension or barotrauma. Avoid over-oxygenating chronic CO₂ retainers.",
      crs: 60, raw: 28, shuntBase: 0.10, recruitableFrac: 0.10, deadSpaceFrac: 0.35,
      peepOpt: 5, overdistSensitivity: 0.020, paco2Ref: 55, hco3: 30, effortPressure: 8,
      defaults: { peep: 5, vtPerKg: 7, fio2: 28, ie: 4, rr: 12 },
    },
    edema: {
      label: "Cardiogenic pulmonary edema / CHF",
      description: "Fluid-filled, partly recruitable alveoli from elevated hydrostatic pressure.",
      teaching: "PEEP helps by recruiting fluid-filled alveoli and reducing preload/afterload. Watch for hemodynamic effects of high PEEP in preload-dependent patients.",
      crs: 35, raw: 9, shuntBase: 0.25, recruitableFrac: 0.5, deadSpaceFrac: 0.35,
      peepOpt: 9, overdistSensitivity: 0.011, paco2Ref: 42, hco3: 24, effortPressure: 10,
      defaults: { peep: 8, vtPerKg: 6, fio2: 40, ie: 2, rr: 18 },
    },
    pneumonia: {
      label: "Severe pneumonia / consolidation",
      description: "Lobar or multifocal consolidation.",
      teaching: "Consolidated lung is largely non-recruitable — expect a limited response to PEEP. Focus on treating the underlying infection rather than chasing PEEP for oxygenation.",
      crs: 30, raw: 10, shuntBase: 0.30, recruitableFrac: 0.20, deadSpaceFrac: 0.40,
      peepOpt: 8, overdistSensitivity: 0.010, paco2Ref: 44, hco3: 24, effortPressure: 9,
      defaults: { peep: 8, vtPerKg: 6, fio2: 50, ie: 2, rr: 20 },
    },
    fibrosis: {
      label: "Pulmonary fibrosis (restrictive)",
      description: "Very stiff, low-compliance lungs.",
      teaching: "Driving pressure rises quickly with even modest tidal volumes. Use lower tidal volumes; PEEP has limited recruitment benefit and raises plateau pressure fast.",
      crs: 20, raw: 8, shuntBase: 0.15, recruitableFrac: 0.20, deadSpaceFrac: 0.45,
      peepOpt: 6, overdistSensitivity: 0.016, paco2Ref: 38, hco3: 24, effortPressure: 10,
      defaults: { peep: 6, vtPerKg: 6, fio2: 40, ie: 1.5, rr: 22 },
    },
    neuromuscular: {
      label: "Neuromuscular weakness (e.g. GBS, myasthenic crisis)",
      description: "Normal lungs, failing respiratory pump.",
      teaching: "The lungs themselves are normal — the problem is the respiratory pump. Gas exchange settings can stay near-normal; focus is on adequate support/synchrony and monitoring for weaning readiness.",
      crs: 50, raw: 8, shuntBase: 0.03, recruitableFrac: 0.3, deadSpaceFrac: 0.30,
      peepOpt: 5, overdistSensitivity: 0.010, paco2Ref: 45, hco3: 24, effortPressure: 4,
      defaults: { peep: 5, vtPerKg: 7, fio2: 25, ie: 2, rr: 16 },
    },
    obesity: {
      label: "Obesity / elevated intra-abdominal pressure",
      description: "Reduced chest-wall/abdominal compliance causing basal atelectasis.",
      teaching: "Higher PEEP is often needed to counteract chest-wall/abdominal weight and recruit dependent lung. In practice, reverse Trendelenburg positioning helps too.",
      crs: 30, raw: 10, shuntBase: 0.15, recruitableFrac: 0.4, deadSpaceFrac: 0.35,
      peepOpt: 10, overdistSensitivity: 0.012, paco2Ref: 46, hco3: 25, cvSensitivity: 1.0, effortPressure: 9,
      defaults: { peep: 10, vtPerKg: 6, fio2: 40, ie: 2, rr: 18 },
    },
    covidArds: {
      label: "COVID-19 ARDS",
      description: "Viral ARDS — often a spectrum from relatively preserved compliance with severe hypoxemia ('L-type') to a more classic low-compliance picture ('H-type').",
      teaching: "Manage per the same ARDSnet low-Vt / PEEP-titration framework as other ARDS — phenotype doesn't change the lung-protective targets. \"Silent hypoxemia\" (low SpO₂ with limited dyspnea) can precede rapid deterioration; falling P/F or rising respiratory effort on HFNC/NIV are cues to consider intubation before a crash, since vigorous spontaneous effort at low lung volumes risks patient self-inflicted lung injury (P-SILI).",
      crs: 32, raw: 10, shuntBase: 0.32, recruitableFrac: 0.45, deadSpaceFrac: 0.48,
      peepOpt: 11, overdistSensitivity: 0.010, paco2Ref: 44, hco3: 24, cvSensitivity: 1.0, effortPressure: 9,
      defaults: { peep: 10, vtPerKg: 6, fio2: 60, ie: 1.5, rr: 24 },
      evidence: ["ardsnet", "guidelines"],
    },
    pe: {
      label: "Massive / submassive pulmonary embolism",
      description: "Acute right-ventricular strain with a large obstructed, non-perfused (dead space) region rather than a primarily shunt-type problem.",
      teaching: "Hypoxemia here is mostly V/Q mismatch and low mixed venous saturation from a falling cardiac output — not alveolar collapse — so PEEP does little for oxygenation and raises RV afterload further. Keep tidal volumes modest, avoid hyperinflation/high PEEP, and avoid hypercapnia/acidosis, both of which raise pulmonary vascular resistance and worsen RV strain. Definitive treatment is anticoagulation/thrombolysis/embolectomy, not the ventilator.",
      crs: 45, raw: 9, shuntBase: 0.08, recruitableFrac: 0.1, deadSpaceFrac: 0.55,
      peepOpt: 5, overdistSensitivity: 0.014, paco2Ref: 32, hco3: 22, cvSensitivity: 2.2, effortPressure: 11,
      defaults: { peep: 5, vtPerKg: 6, fio2: 50, ie: 2, rr: 20 },
    },
    traumaFlail: {
      label: "Chest trauma / flail chest",
      description: "Pain-limited splinting plus an unstable chest wall segment, often with underlying pulmonary contusion.",
      teaching: "The restrictive picture is often partly reversible with adequate analgesia (including regional techniques) that lets the patient breathe/cough effectively. Positive pressure can worsen an occult pneumothorax in trauma — have a low threshold for imaging and a chest tube ready. Contused lung behaves like a non-recruitable consolidation, similar to pneumonia.",
      crs: 25, raw: 10, shuntBase: 0.22, recruitableFrac: 0.25, deadSpaceFrac: 0.40,
      peepOpt: 7, overdistSensitivity: 0.014, paco2Ref: 44, hco3: 24, cvSensitivity: 1.0, effortPressure: 6,
      defaults: { peep: 6, vtPerKg: 6, fio2: 45, ie: 1.5, rr: 20 },
    },
    pneumothorax: {
      label: "Pneumothorax (undrained)",
      description: "Air in the pleural space collapsing the underlying lung — a mechanical problem, not a gas-exchange one.",
      teaching: "No ventilator setting fixes an undrained pneumothorax, and positive pressure can convert it to a tension pneumothorax with sudden hemodynamic collapse. This scenario exists to make the point: the numbers below describe the mechanics of the remaining aerated lung, but the actual fix is a chest tube or needle decompression, not PEEP or FiO₂.",
      crs: 22, raw: 9, shuntBase: 0.35, recruitableFrac: 0.05, deadSpaceFrac: 0.35,
      peepOpt: 5, overdistSensitivity: 0.020, paco2Ref: 46, hco3: 24, cvSensitivity: 2.0, effortPressure: 9,
      defaults: { peep: 5, vtPerKg: 6, fio2: 50, ie: 2, rr: 20 },
    },
    bpf: {
      label: "Bronchopleural fistula (large air leak)",
      description: "A communication between the airway and pleural space — a substantial fraction of every delivered breath escapes through a chest tube instead of ventilating the lung.",
      teaching: "Exhaled tidal volume at the ventilator is lower than delivered volume because of the leak — trust the chest-tube air-leak assessment over displayed volumes. Use the lowest pressures/PEEP and shortest inspiratory time tolerable to minimize flow across the fistula, and accept permissive hypercapnia; the \"effective\" dead space below already reflects volume lost to the leak rather than gas exchange.",
      crs: 28, raw: 11, shuntBase: 0.18, recruitableFrac: 0.15, deadSpaceFrac: 0.30,
      peepOpt: 6, overdistSensitivity: 0.012, paco2Ref: 42, hco3: 24, cvSensitivity: 1.0, leakFrac: 0.30, effortPressure: 10,
      defaults: { peep: 5, vtPerKg: 6, fio2: 40, ie: 2, rr: 18 },
    },
  };

  // Evidence citations attached to specific alerts/teaching points. Educational
  // pointers to primary literature and society guidance, not a full bibliography.
  const EVIDENCE = {
    ardsnet: { name: "ARDSnet ARMA trial", detail: "NEJM 2000 — low tidal volume (6 mL/kg PBW) reduced mortality in ARDS." },
    amato: { name: "Amato et al.", detail: "NEJM 2015 — driving pressure was the ventilator variable most associated with survival." },
    proseva: { name: "PROSEVA trial", detail: "NEJM 2013 — prone positioning ≥16 h/day reduced mortality in severe ARDS." },
    express: { name: "EXPRESS trial", detail: "JAMA 2008 — higher PEEP titrated to a plateau-pressure target vs. a minimal-PEEP strategy." },
    art: { name: "ART trial", detail: "JAMA 2017 — an aggressive lung-recruitment + high-PEEP titration strategy increased 28-day mortality vs. a lower-PEEP ARDSnet-style strategy." },
    conservativeO2: { name: "HOT-ICU / LOCO2 trials", detail: "NEJM 2021 / 2020 — targeting lower vs. higher SpO₂/PaO₂ in ICU patients; routine liberal oxygen offers no benefit and conservative targets are at least as safe." },
    guidelines: { name: "ATS/ESICM/SCCM clinical practice guideline", detail: "Mechanical ventilation in adult ARDS (2017) — the basis for low-Vt, plateau/driving-pressure limits, and PEEP/FiO₂ titration recommended here." },
  };

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function computePBW(sex, heightCm) {
    const base = sex === "female" ? 45.5 : 50;
    return Math.max(20, base + 0.905 * (heightCm - 152.4));
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

  // Shared with waveforms.js / weaning.js, which run as separate <script>
  // tags and read scenario data + helpers off this namespace rather than
  // duplicating it.
  window.MVSIM = { SCENARIOS, EVIDENCE, clamp, computePBW, co2Constant };

  // How much a spontaneous breath's volume is penalized by airway resistance
  // for a given inspiratory effort — shared by pressure-support mode and the
  // weaning simulated SBT.
  function resistancePenalty(raw) {
    return clamp(1 - (raw - 8) * 0.006, 0.5, 1);
  }

  // Derives the actual delivered {vt, rr, ratio} for the current ventilation
  // mode. In volume control these are simply the clinician's direct inputs.
  // In pressure control, vt is derived from the set inspiratory pressure via
  // the same compliance relationship used everywhere else (Vt = ΔP × Crs).
  // In pressure support / CPAP, both vt and rr emerge from the scenario's
  // respiratory muscle reserve plus the set pressure support level — the
  // same math as the weaning simulator's spontaneous breathing trial,
  // because a PSV breath *is* a spontaneous breath.
  function deriveBreath(state, scenario) {
    if (state.mode === "pc") {
      const vt = clamp(state.pc * scenario.crs, 50, 900);
      return { vt, rr: state.rr, ratio: state.ratio };
    }
    if (state.mode === "psv") {
      const driveP = scenario.effortPressure + state.ps;
      const vt = clamp(driveP * scenario.crs * resistancePenalty(scenario.raw), 80, 900);
      const deadSpaceFrac = clamp(scenario.deadSpaceFrac + (scenario.leakFrac || 0), 0, 0.9);
      const va = Math.max(vt * (1 - deadSpaceFrac), 20);
      const targetAlveolarMV = co2Constant(scenario) / scenario.paco2Ref; // L/min
      const rr = clamp((targetAlveolarMV * 1000) / va, 8, 45);
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
    const { peep, fio2, hco3 } = state;
    const { vt, rr, ratio } = deriveBreath(state, scenario);
    const fio2Frac = fio2 / 100;

    const ttot = 60 / rr;
    const ti = ttot / (1 + ratio);
    const te = ttot - ti;
    const flow = (vt / 1000) / ti; // L/s, square-wave approximation

    // Auto-PEEP from an incomplete passive exhalation (time-constant model).
    const tau = scenario.raw * (scenario.crs / 1000); // seconds
    const fractionExhaled = 1 - Math.exp(-te / tau);
    const trappedVolume = vt * (1 - fractionExhaled);
    const autoPeep = trappedVolume / scenario.crs;
    const totalPeep = peep + autoPeep;

    const drivingPressure = vt / scenario.crs;
    const resistivePressure = flow * scenario.raw;
    const plateauPressure = totalPeep + drivingPressure;
    const peakPressure = plateauPressure + resistivePressure;
    const meanAirwayPressure = totalPeep + drivingPressure * (ti / ttot);

    // Recruitment / overdistension shift oxygenation as a function of MAP.
    const recruitmentHalfPressure = Math.max(scenario.peepOpt - 3, 2);
    const recruitedFraction = scenario.recruitableFrac *
      (1 - Math.exp(-Math.max(meanAirwayPressure - 2, 0) / recruitmentHalfPressure));
    const overdistExcess = Math.max(meanAirwayPressure - (scenario.peepOpt + 6), 0);
    const overdistPenalty = scenario.overdistSensitivity * overdistExcess;
    const effectiveShunt = clamp(
      scenario.shuntBase * (1 - recruitedFraction) + overdistPenalty, 0, 0.9
    );
    const pvo2 = Math.max(40 - 0.5 * overdistExcess, 25);

    // Dead space grows a little with overdistension (West zone 1 creation),
    // and a bronchopleural fistula leak also behaves like added dead space —
    // volume that leaves the circuit without ever taking part in gas exchange.
    const leakFrac = scenario.leakFrac || 0;
    const effectiveDeadSpaceFrac = clamp(
      scenario.deadSpaceFrac + overdistExcess * 0.004 + leakFrac, 0, 0.9
    );
    const vd = effectiveDeadSpaceFrac * vt;
    const va = Math.max(vt - vd, 20); // mL/breath alveolar ventilation
    const minuteVentilation = (vt * rr) / 1000; // L/min
    const alveolarMinuteVentilation = (va * rr) / 1000; // L/min

    // CO2 tied inversely to alveolar minute ventilation via a scenario-derived
    // constant, calibrated at a reference "typical" setting for that scenario.
    const paco2 = clamp(co2Constant(scenario) / alveolarMinuteVentilation, 15, 130);

    const pao2Alveolar = fio2Frac * (760 - 47) - paco2 / 0.8;
    let pao2 = pao2Alveolar - effectiveShunt * (pao2Alveolar - pvo2);
    pao2 = clamp(pao2, 30, 650);
    const pfRatio = pao2 / fio2Frac;

    const satX = Math.pow(pao2, 3) + 150 * pao2;
    const spo2 = clamp((1 / ((23400 / satX) + 1)) * 100, 30, 100);

    const ph = 6.1 + Math.log10(hco3 / (0.03 * paco2));

    // Rough venous-return / cardiac-output impact from raised intrathoracic
    // pressure, scaled per scenario (PE and pneumothorax's RV strain, or
    // trapped-gas states, are more afterload/preload sensitive than normal
    // lungs). Purely illustrative — not a real hemodynamic model.
    const cvSensitivity = scenario.cvSensitivity || 1.0;
    const hemodynamicImpact = clamp((meanAirwayPressure - 10) * 2.2 * cvSensitivity, 0, 45);

    return {
      vt, rr, ratio, ttot, ti, te, flow, tau, autoPeep, totalPeep, drivingPressure, resistivePressure,
      plateauPressure, peakPressure, meanAirwayPressure, effectiveShunt, recruitedFraction,
      overdistExcess, minuteVentilation, alveolarMinuteVentilation, paco2, pao2, pfRatio, spo2, ph,
      hemodynamicImpact, leakFrac,
    };
  }

  function buildWarnings(state, results, pbw) {
    const warnings = [];
    const vtPerKg = results.vt / pbw;

    if (vtPerKg > 8) {
      warnings.push({ level: "danger", text: `Tidal volume is ${vtPerKg.toFixed(1)} mL/kg PBW — above the lung-protective target (~6, max 8 mL/kg).`, evidence: "ardsnet" });
    } else if (vtPerKg < 4) {
      warnings.push({ level: "warn", text: `Tidal volume is ${vtPerKg.toFixed(1)} mL/kg PBW — quite low; watch for atelectasis and CO₂ retention.`, evidence: "ardsnet" });
    }

    if (results.plateauPressure > 30) {
      warnings.push({ level: "danger", text: `Plateau pressure ${results.plateauPressure.toFixed(1)} cmH₂O exceeds 30 — risk of barotrauma/volutrauma.`, evidence: "ardsnet" });
    } else if (results.plateauPressure > 28) {
      warnings.push({ level: "warn", text: `Plateau pressure ${results.plateauPressure.toFixed(1)} cmH₂O is approaching the 30 cmH₂O limit.`, evidence: "ardsnet" });
    }

    if (results.drivingPressure > 15) {
      warnings.push({ level: "danger", text: `Driving pressure ${results.drivingPressure.toFixed(1)} cmH₂O exceeds 15 — associated with higher ARDS mortality.`, evidence: "amato" });
    }

    if (results.autoPeep > 2) {
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
  };

  // ---------------------------------------------------------------------
  // DOM wiring
  // ---------------------------------------------------------------------
  const els = {};
  ["scenario", "sex", "height", "height-out-unit", "pbw-out",
    "vent-mode", "mode-desc", "peep-cpap-tag",
    "peep", "peep-out", "vt-control", "vt", "vt-out", "vt-per-kg",
    "pc-control", "pc", "pc-out", "pc-vt-readout",
    "ps-control", "ps", "ps-out", "ps-breath-readout",
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
    const pbw = computePBW(els.sex.value, Number(els.height.value));
    els.peep.value = scenario.defaults.peep;
    els.vt.value = Math.round((scenario.defaults.vtPerKg * pbw) / 10) * 10;
    els.fio2.value = scenario.defaults.fio2;
    els.ie.value = scenario.defaults.ie;
    els.rr.value = scenario.defaults.rr;
    els.hco3.value = scenario.hco3;
    // Pressure-control default: whatever inspiratory pressure would deliver
    // the same protective Vt as the volume-control default, so switching
    // modes on the same scenario starts from a comparable breath.
    els.pc.value = Math.round(clamp((scenario.defaults.vtPerKg * pbw) / scenario.crs, 5, 40));
    els.ps.value = 10;
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
    els["vt-control"].hidden = mode !== "vc";
    els["pc-control"].hidden = mode !== "pc";
    els["ps-control"].hidden = mode !== "psv";
    els["ie-control"].hidden = mode === "psv";
    els["rr-control"].hidden = mode === "psv";
    els["mode-desc"].textContent = MODE_INFO[mode].desc;
    els["peep-cpap-tag"].textContent = mode === "psv" ? "(= CPAP level)" : "";
  }

  function render() {
    const scenario = SCENARIOS[els.scenario.value];
    const pbw = computePBW(els.sex.value, Number(els.height.value));

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
    };

    els["peep-out"].textContent = state.peep;
    els["pc-out"].textContent = state.pc;
    els["ps-out"].textContent = state.ps;
    els["fio2-out"].textContent = state.fio2;
    els["ie-out"].textContent = ieLabel(state.ratio);
    els["rr-out"].textContent = state.rr;
    els["hco3-out"].textContent = state.hco3;
    els["pbw-out"].textContent = `${pbw.toFixed(0)} kg`;
    els["height-out-unit"].textContent = `${els.height.value} cm`;
    els["scenario-desc"].textContent = scenario.description;
    els["scenario-teaching"].textContent = scenario.teaching;

    const r = compute(state, scenario);

    // Vt/RR readouts: the slider-driven value in VC, the physiology
    // engine's derived value in PC/PSV (shown in their own sub-notes).
    els["vt-out"].textContent = r.vt.toFixed(0);
    els["vt-per-kg"].textContent = `${(r.vt / pbw).toFixed(1)} mL/kg PBW (PBW ${pbw.toFixed(0)} kg)`;
    els["pc-vt-readout"].textContent = `Delivered tidal volume ≈ ${r.vt.toFixed(0)} mL (${(r.vt / pbw).toFixed(1)} mL/kg PBW) at current compliance.`;
    els["ps-breath-readout"].textContent = `Patient's own breathing (estimated): RR ≈ ${r.rr.toFixed(0)} /min, Vt ≈ ${r.vt.toFixed(0)} mL (${(r.vt / pbw).toFixed(1)} mL/kg PBW).`;

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

    const warnings = buildWarnings(state, r, pbw);
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
      window.renderWeaning(state, scenario, r, pbw);
    }
  }

  function initTheme() {
    const toggle = document.getElementById("theme-toggle");
    if (!toggle) return;
    const saved = localStorage.getItem("mvsim-theme");
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const effective = saved || (prefersDark ? "dark" : "light");
    toggle.textContent = effective === "dark" ? "☀️" : "🌙";
    toggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme")
        || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("mvsim-theme", next);
      toggle.textContent = next === "dark" ? "☀️" : "🌙";
    });
  }

  function init() {
    populateScenarios();
    initTheme();

    ["peep", "vt", "pc", "ps", "fio2", "ie", "rr", "hco3", "height", "sex"].forEach((id) => {
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
