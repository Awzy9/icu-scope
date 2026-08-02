(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // The living virtual patient.
  //
  // Turns the engine's numbers into a bedside picture: who this patient is,
  // what the monitor shows, what the last gas said, and what the labs look
  // like. Nothing here is a stored snapshot — the vitals come from
  // MVSIM.deriveVitals(), so changing a ventilator setting moves the monitor.
  //
  // The point of the panel is the coupling. Raise mean airway pressure and
  // the MAP falls, the heart rate climbs, urine output drops and lactate
  // rises. Turn up the noradrenaline and the MAP comes back — but the cause
  // is still there, which is the trap the pressor row is meant to expose.
  // ---------------------------------------------------------------------

  const RASS = {
    "0": "Alert and calm",
    "-1": "Drowsy — sustained waking to voice",
    "-2": "Light sedation — briefly wakes to voice",
    "-3": "Moderate sedation — movement to voice, no eye contact",
    "-4": "Deep sedation — responds to physical stimulus only",
    "-5": "Unrousable — no response (typically with neuromuscular blockade)",
  };

  function el(id) { return document.getElementById(id); }

  // Renders one monitor figure with a severity state, so abnormal values
  // read at a glance rather than having to be compared against a range.
  function setVital(id, value, unit, level, note) {
    const box = el(id);
    if (!box) return;
    box.querySelector(".vital-value").textContent = value;
    const u = box.querySelector(".vital-unit");
    if (u) u.textContent = unit || "";
    box.className = `vital vital-${level}`;
    const n = box.querySelector(".vital-note");
    if (n) n.textContent = note || "";
  }

  function band(value, warnAt, dangerAt, invert) {
    // invert = lower is worse
    if (invert) {
      if (value <= dangerAt) return "bad";
      if (value <= warnAt) return "warn";
      return "good";
    }
    if (value >= dangerAt) return "bad";
    if (value >= warnAt) return "warn";
    return "good";
  }

  function abgLine(label, value, unit, level) {
    return `<div class="abg-row abg-${level}"><span>${label}</span><strong>${value}</strong><small>${unit}</small></div>`;
  }

  function render(state, scenario, r, ibw) {
    if (!el("patient-panel")) return;
    const M = window.MVSIM;
    if (!M || !M.deriveVitals) return;

    const v = M.deriveVitals(scenario, r, state.norad);

    // ---- Identity strip -------------------------------------------------
    el("pt-diagnosis").textContent = v.diagnosis;
    el("pt-day").textContent = `ICU day ${v.icuDay}`;
    el("pt-ibw").textContent = `IBW ${ibw.toFixed(0)} kg`;
    el("pt-sedation").textContent = `RASS ${v.rass} — ${RASS[String(v.rass)] || ""}`;

    const airway = state.mode === "niv" ? "Non-invasive ventilation (mask)"
      : state.mode === "hfnc" ? "High-flow nasal oxygen — not intubated"
      : "Intubated and mechanically ventilated";
    el("pt-airway").textContent = airway;

    const pressor = el("pt-pressor");
    if (v.noradrenaline > 0) {
      pressor.textContent = `Noradrenaline ${v.noradrenaline.toFixed(2)} mcg/kg/min`;
      pressor.className = "pt-chip pt-chip-active";
    } else {
      pressor.textContent = "No vasopressor support";
      pressor.className = "pt-chip";
    }

    // ---- Monitor --------------------------------------------------------
    setVital("vital-spo2", r.spo2.toFixed(0), "%",
      band(r.spo2, 92, 88, true),
      r.spo2 < 88 ? "severe hypoxemia" : "");
    setVital("vital-map", v.map.toFixed(0), "mmHg",
      band(v.map, 70, 65, true),
      v.map < 65 ? "below the usual 65 mmHg target" : "");
    setVital("vital-hr", v.hr.toFixed(0), "bpm",
      band(v.hr, 110, 130),
      v.hr > 130 ? "marked tachycardia" : "");
    setVital("vital-rr", r.rr.toFixed(0), "/min",
      band(r.rr, 30, 35),
      state.mode === "psv" || state.mode === "niv" || state.mode === "hfnc"
        ? "patient's own rate" : "");
    setVital("vital-temp", v.temp.toFixed(1), "°C", band(v.temp, 38.0, 39.0), "");
    setVital("vital-uo", v.urineOutput.toFixed(1), "mL/kg/h",
      band(v.urineOutput, 0.5, 0.3, true),
      v.urineOutput < 0.5 ? "oliguric" : "");

    // ---- Arterial blood gas --------------------------------------------
    const phLevel = r.ph < 7.20 || r.ph > 7.55 ? "bad" : (r.ph < 7.32 || r.ph > 7.45) ? "warn" : "good";
    const pfLevel = r.pfRatio < 100 ? "bad" : r.pfRatio < 200 ? "warn" : "good";
    el("pt-abg").innerHTML = [
      abgLine("pH", r.ph.toFixed(2), "", phLevel),
      abgLine("PaCO₂", r.paco2.toFixed(0), "mmHg", band(r.paco2, 50, 60)),
      abgLine("PaO₂", r.pao2.toFixed(0), "mmHg", band(r.pao2, 70, 60, true)),
      abgLine("HCO₃⁻", r.hco3.toFixed(0), "mEq/L", "good"),
      abgLine("Base excess", (v.baseExcess >= 0 ? "+" : "") + v.baseExcess.toFixed(1), "mEq/L",
        Math.abs(v.baseExcess) > 6 ? "warn" : "good"),
      abgLine("Lactate", v.lactate.toFixed(1), "mmol/L", band(v.lactate, 2.0, 4.0)),
      abgLine("SaO₂", r.spo2.toFixed(0), "%", band(r.spo2, 92, 88, true)),
      abgLine("P/F ratio", r.pfRatio.toFixed(0), "", pfLevel),
      abgLine("FiO₂", r.deliveredFio2.toFixed(0), "%", band(r.deliveredFio2, 60, 80)),
    ].join("");

    // ---- Labs (stable over this timescale) ------------------------------
    el("pt-labs").innerHTML = [
      abgLine("Haemoglobin", v.hb.toFixed(1), "g/dL", band(v.hb, 9, 7.5, true)),
      abgLine("White cells", v.wbc.toFixed(1), "×10⁹/L", band(v.wbc, 15, 20)),
      abgLine("Platelets", v.platelets.toFixed(0), "×10⁹/L", band(v.platelets, 120, 80, true)),
      abgLine("Creatinine", v.creatinine.toFixed(1), "mg/dL", band(v.creatinine, 1.4, 2.0)),
    ].join("");

    // ---- The coupling note ---------------------------------------------
    const note = el("pt-hemo-note");
    const penalty = v.ventPenalty;
    if (penalty < 2) {
      note.className = "pt-hemo-note";
      note.textContent = `Mean airway pressure ${r.meanAirwayPressure.toFixed(0)} cmH₂O is carrying almost no hemodynamic cost at these settings.`;
    } else {
      const masked = v.pressorSupport > 0 && v.map >= 65 && (v.map - v.pressorSupport) < 65;
      note.className = masked ? "pt-hemo-note pt-hemo-warn" : "pt-hemo-note";
      note.textContent =
        `Mean airway pressure ${r.meanAirwayPressure.toFixed(0)} cmH₂O is reducing venous return by about ` +
        `${r.hemodynamicImpact.toFixed(0)}%, costing roughly ${penalty.toFixed(0)} mmHg of MAP` +
        (v.noradrenaline > 0
          ? `, of which noradrenaline is replacing ${v.pressorSupport.toFixed(0)} mmHg.`
          : ".") +
        (masked
          ? " The MAP looks acceptable only because of the vasopressor — without it this patient would be hypotensive. Treating a ventilator-induced problem with a pressor leaves the cause in place."
          : "");
    }
  }

  window.renderPatient = render;
})();
