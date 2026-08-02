(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Physiology explanation panel.
  //
  // After a ventilator adjustment settles, this compares the new state
  // against the previous one and explains what happened: the mechanism, the
  // benefits, the risks, and the supporting evidence.
  //
  // The whole design rule here is that nothing is canned. Every statement is
  // generated from a MEASURED delta between two engine runs, so the panel can
  // only claim a benefit that actually occurred and can only warn about a
  // risk the numbers actually show. The same adjustment in two different
  // scenarios produces different text, because it produces different
  // physiology — raising PEEP recruits an ARDS lung and merely overdistends a
  // fibrotic one, and the panel says whichever of those happened.
  // ---------------------------------------------------------------------

  // Controls the learner can move, with the framing and citations each one
  // brings. `dom` is the element whose hidden state decides whether the
  // control is even meaningful in the current mode.
  const CONTROLS = {
    peep:  { label: "PEEP", unit: " cmH₂O", dom: "peep", evidence: ["express", "art", "guidelines"] },
    fio2:  { label: "FiO₂", unit: "%", dom: "fio2", evidence: ["conservativeO2"] },
    vt:    { label: "Tidal volume", unit: " mL", dom: "vt", evidence: ["ardsnet", "amato"] },
    pc:    { label: "Inspiratory pressure", unit: " cmH₂O", dom: "pc", evidence: ["ardsnet", "amato"] },
    ps:    { label: "Pressure support", unit: " cmH₂O", dom: "ps", evidence: [] },
    rr:    { label: "Respiratory rate", unit: "/min", dom: "rr", evidence: [] },
    ratio: { label: "I:E ratio", unit: "", dom: "ie", evidence: [], fmt: (v) => (v >= 1 ? `1:${v.toFixed(1)}` : `${(1 / v).toFixed(1)}:1`) },
    norad: { label: "Noradrenaline", unit: " mcg/kg/min", dom: "norad", evidence: [], fmt: (v) => v.toFixed(2) },
    ipap:  { label: "IPAP", unit: " cmH₂O", dom: "ipap", evidence: [] },
    epap:  { label: "EPAP", unit: " cmH₂O", dom: "epap", evidence: [] },
    leak:  { label: "Mask leak", unit: "%", dom: "leak", evidence: [] },
    flow:  { label: "Gas flow", unit: " L/min", dom: "flow", evidence: ["roxIndex"] },
    pHigh: { label: "P_high", unit: " cmH₂O", dom: "phigh", evidence: ["aprvEvidence"] },
    pLow:  { label: "P_low", unit: " cmH₂O", dom: "plow", evidence: ["aprvEvidence"] },
    tHigh: { label: "T_high", unit: " s", dom: "thigh", evidence: ["aprvEvidence"], fmt: (v) => v.toFixed(1) },
    tLow:  { label: "T_low", unit: " s", dom: "tlow", evidence: ["aprvEvidence"], fmt: (v) => v.toFixed(2) },
    hco3:  { label: "Bicarbonate", unit: " mEq/L", dom: "hco3", evidence: [] },
  };

  let settled = null;      // { state, r, vitals, scenarioId }
  let timer = null;

  function fmt(key, value) {
    const c = CONTROLS[key];
    if (c && c.fmt) return c.fmt(value);
    return typeof value === "number" ? String(Math.round(value * 100) / 100) : String(value);
  }

  // A control only counts as "adjusted" if it is actually in play for the
  // current mode — the tidal-volume slider still holds a value in pressure
  // support, but moving it there would mean nothing.
  function controlIsLive(key) {
    const c = CONTROLS[key];
    if (!c) return false;
    const elm = document.getElementById(c.dom);
    if (!elm) return false;
    const block = elm.closest(".control-block") || elm.parentElement;
    if (block && block.hidden) return false;
    let p = block;
    while (p) {
      if (p.hidden) return false;
      p = p.parentElement;
    }
    return true;
  }

  function snapshot() {
    const live = window.MVSIM && window.MVSIM._lastRender;
    if (!live) return null;
    const M = window.MVSIM;
    const vitals = M.deriveVitals ? M.deriveVitals(live.scenario, live.r, live.state.norad) : null;
    return {
      state: Object.assign({}, live.state),
      r: live.r,
      vitals,
      scenarioId: live.scenarioId,
      scenario: live.scenario,
      pbw: live.pbw,
    };
  }

  function changedControls(a, b) {
    const out = [];
    Object.keys(CONTROLS).forEach((k) => {
      if (a.state[k] === undefined || b.state[k] === undefined) return;
      if (a.state[k] !== b.state[k] && controlIsLive(k)) {
        out.push({ key: k, from: a.state[k], to: b.state[k] });
      }
    });
    return out;
  }

  function delta(a, b, key) { return b.r[key] - a.r[key]; }

  function arrow(d) { return d > 0 ? "rose" : "fell"; }

  // ---- Mechanism ---------------------------------------------------------
  function buildMechanism(prev, cur, changes) {
    const lines = [];
    const dMap = delta(prev, cur, "meanAirwayPressure");
    const dRec = delta(prev, cur, "recruitedFraction");
    const dShunt = delta(prev, cur, "effectiveShunt");
    const dVd = delta(prev, cur, "effectiveDeadSpaceFrac");
    const dAlvMV = delta(prev, cur, "alveolarMinuteVentilation");
    const dAuto = delta(prev, cur, "autoPeep");
    const dDrive = delta(prev, cur, "drivingPressure");
    const dOver = delta(prev, cur, "overdistExcess");

    if (Math.abs(dMap) >= 0.4) {
      lines.push(`Mean airway pressure ${arrow(dMap)} ${prev.r.meanAirwayPressure.toFixed(1)} → ${cur.r.meanAirwayPressure.toFixed(1)} cmH₂O.`);
    }
    if (Math.abs(dRec) >= 0.01) {
      lines.push(`${dRec > 0 ? "Alveolar recruitment increased" : "The lung derecruited"}: ${(prev.r.recruitedFraction * 100).toFixed(0)}% → ${(cur.r.recruitedFraction * 100).toFixed(0)}% of the recruitable lung is open.`);
    }
    if (Math.abs(dShunt) >= 0.01) {
      lines.push(`Intrapulmonary shunt ${arrow(dShunt)} ${(prev.r.effectiveShunt * 100).toFixed(0)}% → ${(cur.r.effectiveShunt * 100).toFixed(0)}%.`);
    }
    if (dOver > 0.4) {
      lines.push(`Pressure is now ${cur.r.overdistExcess.toFixed(0)} cmH₂O above this lung's overdistension threshold, which creates high-V̇/Q̇ (wasted) units.`);
    }
    if (Math.abs(dVd) >= 0.01) {
      lines.push(`Dead-space fraction ${arrow(dVd)} ${(prev.r.effectiveDeadSpaceFrac * 100).toFixed(0)}% → ${(cur.r.effectiveDeadSpaceFrac * 100).toFixed(0)}%.`);
    }
    if (Math.abs(dAlvMV) >= 0.3) {
      lines.push(`Alveolar minute ventilation ${arrow(dAlvMV)} ${prev.r.alveolarMinuteVentilation.toFixed(1)} → ${cur.r.alveolarMinuteVentilation.toFixed(1)} L/min, which is what sets the PaCO₂.`);
    }
    if (Math.abs(dAuto) >= 0.5) {
      lines.push(`Auto-PEEP ${arrow(dAuto)} ${prev.r.autoPeep.toFixed(1)} → ${cur.r.autoPeep.toFixed(1)} cmH₂O — expiratory time ${cur.r.te.toFixed(2)} s against a time constant of ${cur.r.tau.toFixed(2)} s.`);
    }
    if (Math.abs(dDrive) >= 0.5) {
      lines.push(`Driving pressure ${arrow(dDrive)} ${prev.r.drivingPressure.toFixed(1)} → ${cur.r.drivingPressure.toFixed(1)} cmH₂O (compliance is unchanged at ${cur.scenario.crs} mL/cmH₂O, so this tracks the volume the lung is asked to accept).`);
    }
    if (changes.some((c) => c.key === "fio2")) {
      lines.push(`Inspired oxygen ${prev.state.fio2}% → ${cur.state.fio2}% shifts alveolar PO₂ directly, without altering lung mechanics, recruitment or dead space — which is why it moves PaO₂ but not plateau or driving pressure.`);
    }

    // Non-invasive specifics worth naming explicitly.
    if (changes.some((c) => c.key === "flow") && cur.r.detail && cur.r.detail.kind === "hfnc") {
      lines.push(`Delivered FiO₂ is now ≈${cur.r.deliveredFio2.toFixed(0)}% against a set ${cur.state.fio2}%, because flow ${cur.state.flow} L/min meets ${Math.min(100, (cur.state.flow / cur.r.detail.peakDemandLpm) * 100).toFixed(0)}% of peak inspiratory demand.`);
    }
    if (changes.some((c) => c.key === "leak") && cur.r.detail && cur.r.detail.kind === "niv") {
      lines.push(`Effective support is now ${cur.r.detail.effectiveSupport.toFixed(1)} cmH₂O of the ${cur.r.detail.setSupport.toFixed(0)} cmH₂O set, the remainder being lost to leak.`);
    }
    if (lines.length === 0) {
      lines.push("No meaningful physiological change — this adjustment was too small to move the model, or its effects cancelled out.");
    }
    return lines;
  }

  // ---- Benefits: only what actually improved -----------------------------
  function buildBenefits(prev, cur) {
    const out = [];
    const dPao2 = delta(prev, cur, "pao2");
    const dPf = delta(prev, cur, "pfRatio");
    const dDrive = delta(prev, cur, "drivingPressure");
    const dPlat = delta(prev, cur, "plateauPressure");
    const dAuto = delta(prev, cur, "autoPeep");

    if (dPao2 >= 3) out.push(`Oxygenation improved: PaO₂ ${prev.r.pao2.toFixed(0)} → ${cur.r.pao2.toFixed(0)} mmHg, P/F ${prev.r.pfRatio.toFixed(0)} → ${cur.r.pfRatio.toFixed(0)}.`);
    if (dPf >= 15 && dPao2 < 3) out.push(`P/F ratio improved ${prev.r.pfRatio.toFixed(0)} → ${cur.r.pfRatio.toFixed(0)} through a lower oxygen requirement.`);
    if (dDrive <= -0.8) out.push(`Driving pressure fell ${prev.r.drivingPressure.toFixed(1)} → ${cur.r.drivingPressure.toFixed(1)} cmH₂O — the ventilator variable most strongly associated with survival in ARDS.`);
    if (dPlat <= -1) out.push(`Plateau pressure fell ${prev.r.plateauPressure.toFixed(1)} → ${cur.r.plateauPressure.toFixed(1)} cmH₂O.`);
    if (dAuto <= -0.5) out.push(`Air trapping reduced: auto-PEEP ${prev.r.autoPeep.toFixed(1)} → ${cur.r.autoPeep.toFixed(1)} cmH₂O.`);

    // Acid-base: improvement means moving toward normal, in either direction.
    const prevOff = Math.abs(prev.r.ph - 7.4), curOff = Math.abs(cur.r.ph - 7.4);
    if (prevOff - curOff >= 0.02) out.push(`pH moved toward normal, ${prev.r.ph.toFixed(2)} → ${cur.r.ph.toFixed(2)} (PaCO₂ ${prev.r.paco2.toFixed(0)} → ${cur.r.paco2.toFixed(0)} mmHg).`);

    if (prev.vitals && cur.vitals) {
      const dMAP = cur.vitals.map - prev.vitals.map;
      if (dMAP >= 3) out.push(`MAP improved ${prev.vitals.map.toFixed(0)} → ${cur.vitals.map.toFixed(0)} mmHg, with urine output ${prev.vitals.urineOutput.toFixed(1)} → ${cur.vitals.urineOutput.toFixed(1)} mL/kg/h.`);
    }
    if (cur.state.fio2 < prev.state.fio2 && cur.r.spo2 >= 88) {
      out.push(`Oxygen exposure reduced to FiO₂ ${cur.state.fio2}% while still holding SpO₂ ${cur.r.spo2.toFixed(0)}%.`);
    }
    return out;
  }

  // ---- Risks: only what actually worsened or crossed a threshold ---------
  function buildRisks(prev, cur) {
    const out = [];
    const dPao2 = delta(prev, cur, "pao2");
    const dDrive = delta(prev, cur, "drivingPressure");
    const dPlat = delta(prev, cur, "plateauPressure");
    const dAuto = delta(prev, cur, "autoPeep");
    const dHemo = delta(prev, cur, "hemodynamicImpact");
    const dVd = delta(prev, cur, "effectiveDeadSpaceFrac");

    if (cur.r.plateauPressure > 30 && dPlat > 0) out.push(`Plateau pressure is now ${cur.r.plateauPressure.toFixed(1)} cmH₂O, above the 30 cmH₂O limit — barotrauma and volutrauma risk.`);
    else if (dPlat >= 1) out.push(`Plateau pressure rose ${prev.r.plateauPressure.toFixed(1)} → ${cur.r.plateauPressure.toFixed(1)} cmH₂O.`);

    if (cur.r.drivingPressure > 15 && dDrive > 0) out.push(`Driving pressure is now ${cur.r.drivingPressure.toFixed(1)} cmH₂O, above the 15 cmH₂O threshold associated with higher mortality.`);
    else if (dDrive >= 0.8) out.push(`Driving pressure rose ${prev.r.drivingPressure.toFixed(1)} → ${cur.r.drivingPressure.toFixed(1)} cmH₂O.`);

    if (cur.r.overdistExcess > 0 && delta(prev, cur, "overdistExcess") > 0.4) {
      out.push(`Alveolar overdistension increased — already-open units are being stretched, which raises dead space rather than improving gas exchange.`);
    }
    if (dAuto >= 0.5) out.push(`Air trapping worsened: auto-PEEP ${prev.r.autoPeep.toFixed(1)} → ${cur.r.autoPeep.toFixed(1)} cmH₂O, which raises intrathoracic pressure and can cause hypotension.`);
    if (dVd >= 0.01) out.push(`Dead-space fraction rose ${(prev.r.effectiveDeadSpaceFrac * 100).toFixed(0)}% → ${(cur.r.effectiveDeadSpaceFrac * 100).toFixed(0)}% — more of each breath is wasted.`);
    const weaningOxygen = cur.state.fio2 < prev.state.fio2;
    if (dPao2 <= -3 && !(weaningOxygen && cur.r.spo2 >= 92)) {
      out.push(`Oxygenation worsened: PaO₂ ${prev.r.pao2.toFixed(0)} → ${cur.r.pao2.toFixed(0)} mmHg${weaningOxygen ? " — the oxygen reduction has gone past what this patient tolerates." : "."}`);
    }

    if (dHemo >= 2 && prev.vitals && cur.vitals) {
      out.push(`Venous return fell a further ${dHemo.toFixed(0)}%: MAP ${prev.vitals.map.toFixed(0)} → ${cur.vitals.map.toFixed(0)} mmHg, heart rate ${prev.vitals.hr.toFixed(0)} → ${cur.vitals.hr.toFixed(0)} bpm, urine output ${prev.vitals.urineOutput.toFixed(1)} → ${cur.vitals.urineOutput.toFixed(1)} mL/kg/h.`);
    }
    if (cur.vitals && cur.vitals.map < 65) out.push(`MAP ${cur.vitals.map.toFixed(0)} mmHg is below the usual 65 mmHg resuscitation target.`);
    if (cur.r.ph < 7.2) out.push(`pH ${cur.r.ph.toFixed(2)} — severe acidemia.`);
    if (cur.r.spo2 < 88) out.push(`SpO₂ ${cur.r.spo2.toFixed(0)}% — severe hypoxemia.`);
    if (cur.state.fio2 > prev.state.fio2 && cur.state.fio2 >= 80) {
      out.push(`FiO₂ is now ${cur.state.fio2}% — prolonged high inspired oxygen risks absorption atelectasis and oxygen toxicity.`);
    }
    return out;
  }

  function buildEvidence(changes, cur) {
    const keys = new Set();
    changes.forEach((c) => (CONTROLS[c.key].evidence || []).forEach((k) => keys.add(k)));
    if (cur.r.drivingPressure > 15) keys.add("amato");
    if (cur.r.plateauPressure > 30) keys.add("ardsnet");
    if (cur.r.detail && cur.r.detail.kind === "niv") keys.add("florali");
    if (cur.r.detail && cur.r.detail.kind === "simv") keys.add("simvWeaning");
    return Array.from(keys);
  }

  function renderList(id, items, emptyText) {
    const ul = document.getElementById(id);
    ul.innerHTML = "";
    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "xp-empty";
      li.textContent = emptyText;
      ul.appendChild(li);
      return;
    }
    items.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });
  }

  function explain(prev, cur) {
    const changes = changedControls(prev, cur);
    if (changes.length === 0) return;

    const summary = changes
      .map((c) => `${CONTROLS[c.key].label} ${fmt(c.key, c.from)}${CONTROLS[c.key].unit} → ${fmt(c.key, c.to)}${CONTROLS[c.key].unit}`)
      .join(" · ");
    document.getElementById("xp-change").textContent = summary;
    document.getElementById("xp-body").hidden = false;
    document.getElementById("xp-idle").hidden = true;

    renderList("xp-mechanism", buildMechanism(prev, cur, changes), "");
    renderList("xp-benefits", buildBenefits(prev, cur), "No measurable benefit from this change.");
    renderList("xp-risks", buildRisks(prev, cur), "No new risk introduced by this change.");

    const ev = document.getElementById("xp-evidence");
    ev.innerHTML = "";
    const M = window.MVSIM;
    buildEvidence(changes, cur).forEach((k) => {
      const e = M.EVIDENCE[k];
      if (!e) return;
      const span = document.createElement("span");
      span.className = "evidence-tag";
      span.textContent = e.name;
      span.title = e.detail;
      ev.appendChild(span);
    });
  }

  // Settle before explaining, so dragging a slider produces one explanation
  // of the whole move rather than an explanation per pixel.
  function onRender() {
    if (!document.getElementById("explain-panel")) return;

    // The very first render (page load, before any user interaction) has to
    // establish the comparison baseline immediately rather than through the
    // debounce below. Without this, a user who starts dragging a slider
    // within 620ms of load keeps resetting the timer — the baseline never
    // gets captured until they finally pause, and that first pause only
    // silently records where they landed with nothing shown. They then need
    // a SECOND change-and-pause before anything ever explains itself, which
    // reads as "not working" and invites overshooting the control while
    // waiting for feedback that was never coming.
    if (!settled) {
      settled = snapshot();
      return;
    }

    clearTimeout(timer);
    timer = setTimeout(() => {
      const cur = snapshot();
      if (!cur) return;
      if (settled.scenarioId === cur.scenarioId) {
        explain(settled, cur);
      } else {
        // New patient: previous settings aren't a comparison worth making.
        document.getElementById("xp-body").hidden = true;
        document.getElementById("xp-idle").hidden = false;
        document.getElementById("xp-idle").textContent =
          "New scenario loaded at its default settings. Adjust a ventilator control to see the physiological consequences.";
      }
      settled = cur;
    }, 620);
  }

  window.onSimulatorRender = onRender;
})();
