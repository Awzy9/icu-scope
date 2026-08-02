(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Unexpected ICU events: complications that become part of the LIVE
  // simulation, not a framed quiz vignette (that's alarms.js — deliberately
  // decoupled, hand-specified waveforms). Triggering one here perturbs the
  // actual physiology engine through simulator.js's computeEffectiveScenario
  // (the same injection point clinical-course drift uses), so the monitor,
  // waveforms, CXR, ultrasound and labs all reflect it live until the
  // correct management action clears it.
  //
  // Each entry supplies:
  //   engine  — deltas applied to the effective scenario (shuntAdd/crsMult/
  //             rawMult/deadSpaceAdd/leakFracAdd/cvSensitivityMult/pvo2BaseSub)
  //   vitals  — a direct hemodynamic/temperature shock (mapSub/hrAdd/tempAdd)
  //             for complications the pulmonary mechanics alone don't explain
  //   differentials — "what's going on" recognition step (like alarms.js)
  //   actions — "what do you do" management step; only the correct action
  //             clears the event from the live physiology. An incorrect pick
  //             leaves the derangement in place — the honest consequence of
  //             a wrong call at the bedside, not a puzzle to keep guessing at
  //             blind. Triggering a different event (or Reset course) clears
  //             a stuck one.
  // ---------------------------------------------------------------------

  const CATALOG = [
    {
      id: "tensionPtx",
      label: "Tension pneumothorax",
      category: "Barotrauma + hemodynamic collapse",
      vignette: "Moments ago this patient was stable. Now the high-pressure alarm is sounding continuously, SpO₂ is falling fast, and blood pressure is dropping with it. On exam: breath sounds are absent on one side, the trachea is deviated away from that side, and the neck veins look distended.",
      engine: { shuntAdd: 0.35, crsMult: 0.45, deadSpaceAdd: 0.08 },
      vitals: { hrAdd: 28, mapSub: 22 },
      differentials: [
        { text: "Tension pneumothorax", correct: true },
        { text: "Right mainstem intubation", correct: false },
        { text: "Massive pulmonary embolism", correct: false },
        { text: "Anaphylaxis", correct: false },
      ],
      actions: [
        { text: "Needle decompression / chest tube now — don't wait for imaging", correct: true, feedback: "Tension pneumothorax is a clinical diagnosis. Immediate decompression relieves the intrathoracic pressure driving both the hypoxemia and the hemodynamic collapse — imaging would only delay a time-critical intervention." },
        { text: "Order a stat chest X-ray and wait for the result", correct: false, feedback: "Waiting for imaging in a hemodynamically unstable, clinically obvious tension pneumothorax risks arrest. Decompress first." },
        { text: "Increase PEEP to support oxygenation", correct: false, feedback: "Raising intrathoracic pressure further worsens tension physiology — the opposite of what this patient needs." },
        { text: "Give a fluid bolus only and reassess", correct: false, feedback: "Fluid may transiently support pressure but does nothing for the mechanical problem, which keeps worsening underneath it." },
      ],
    },
    {
      id: "pe",
      label: "Acute pulmonary embolism",
      category: "Pulmonary vascular",
      vignette: "Over the last several minutes SpO₂ has drifted down and heart rate has climbed despite no ventilator changes. CO₂ clearance looks worse than the minute ventilation would suggest, and blood pressure is starting to slip. There is no new airway sound, and breath sounds remain equal.",
      engine: { deadSpaceAdd: 0.22, pvo2BaseSub: 10, cvSensitivityMult: 1.8 },
      vitals: { hrAdd: 20, mapSub: 14 },
      differentials: [
        { text: "Acute pulmonary embolism", correct: true },
        { text: "Mucus plug", correct: false },
        { text: "Endotracheal tube cuff leak", correct: false },
        { text: "Worsening pneumonia", correct: false },
      ],
      actions: [
        { text: "Pursue CT pulmonary angiogram or bedside echo; start anticoagulation if no contraindication (consider thrombolysis if massive with shock)", correct: true, feedback: "A sudden rise in dead space (ventilation without matching perfusion) plus new hemodynamic strain with equal breath sounds and no compliance change is the classic pattern of acute PE, not an airway or pleural problem." },
        { text: "Increase PEEP to recruit more lung", correct: false, feedback: "There's no collapsed alveolus to recruit here — the problem is perfusion, not aeration — and more PEEP can worsen right-heart strain." },
        { text: "Fluid-restrict and simply observe", correct: false, feedback: "A hemodynamically significant PE needs active workup and treatment, not observation alone." },
        { text: "Start empiric antibiotics for presumed pneumonia", correct: false, feedback: "There's no new infiltrate or fever here — the pattern points to a vascular, not infectious, process." },
      ],
    },
    {
      id: "bronchospasm",
      label: "Acute bronchospasm",
      category: "Airway obstruction",
      vignette: "Peak airway pressure has climbed sharply while plateau pressure has barely moved. The patient looks tachypneic and is fighting the ventilator, and you can hear wheeze without a stethoscope.",
      engine: { rawMult: 2.6, deadSpaceAdd: 0.03 },
      vitals: { hrAdd: 14, mapSub: 3 },
      differentials: [
        { text: "Bronchospasm", correct: true },
        { text: "Kinked endotracheal tube", correct: false },
        { text: "Tension pneumothorax", correct: false },
        { text: "Circuit disconnection", correct: false },
      ],
      actions: [
        { text: "Give inhaled bronchodilators; consider systemic steroids/magnesium for a severe flare", correct: true, feedback: "A wide peak-minus-plateau gap (resistance pattern) with audible wheeze is bronchospasm — treat the airway directly." },
        { text: "Increase respiratory rate to compensate for rising CO₂", correct: false, feedback: "Shortening the time available to exhale worsens air trapping in an obstructive process — auto-PEEP and hyperinflation get worse, not better." },
        { text: "Needle-decompress the chest", correct: false, feedback: "There's no exam finding here suggesting pneumothorax — breath sounds are present, just wheezy." },
        { text: "Increase PEEP substantially", correct: false, feedback: "This doesn't treat bronchospasm and can worsen dynamic hyperinflation in an already air-trapping lung." },
      ],
    },
    {
      id: "effusion",
      label: "New large pleural effusion",
      category: "Restrictive / extrapulmonary",
      vignette: "Plateau pressure has been creeping up at an unchanged tidal volume — a pure compliance problem, not a resistance one. On exam there's dullness to percussion at one base with reduced breath sounds there, and no wheeze or air leak.",
      engine: { crsMult: 0.55, shuntAdd: 0.1, deadSpaceAdd: 0.02 },
      vitals: { hrAdd: 6, mapSub: 3 },
      differentials: [
        { text: "New large pleural effusion", correct: true },
        { text: "Bronchospasm", correct: false },
        { text: "Right mainstem intubation", correct: false },
        { text: "Auto-PEEP / breath stacking", correct: false },
      ],
      actions: [
        { text: "Get a chest X-ray / bedside ultrasound; prepare for thoracentesis if large and compromising ventilation or oxygenation", correct: true, feedback: "A rising plateau at a fixed tidal volume with dullness and reduced breath sounds at one base is a compliance-pattern, extrapulmonary restrictive process — a large effusion is the classic cause. Confirm with imaging and drain if it's contributing meaningfully to respiratory compromise." },
        { text: "Increase tidal volume to compensate", correct: false, feedback: "Pushing more volume into an already less-compliant lung raises plateau pressure further and adds injury risk without treating the cause." },
        { text: "Increase PEEP substantially", correct: false, feedback: "PEEP recruits collapsed alveoli — it doesn't drain a pleural effusion, and won't fix a purely extrapulmonary restrictive process." },
        { text: "No action needed; reassess tomorrow", correct: false, feedback: "A new, respiratory-significant effusion during active mechanical ventilation warrants same-day evaluation, not a 24-hour wait." },
      ],
    },
    {
      id: "vap",
      label: "Ventilator-associated pneumonia",
      category: "Infectious",
      vignette: "The patient has spiked a fever, secretions have become purulent, and the FiO₂ needed to maintain saturation has crept up over several hours without any ventilator misconfiguration.",
      engine: { shuntAdd: 0.14, crsMult: 0.85 },
      vitals: { hrAdd: 10, tempAdd: 1.6 },
      differentials: [
        { text: "Ventilator-associated pneumonia", correct: true },
        { text: "Acute pulmonary embolism", correct: false },
        { text: "Endotracheal tube cuff leak", correct: false },
        { text: "Bronchospasm", correct: false },
      ],
      actions: [
        { text: "Send respiratory cultures, start empiric antibiotics per unit protocol, and reassess", correct: true, feedback: "New fever, purulent secretions, and a rising oxygen requirement after prolonged ventilation is the classic VAP triad. Culture, treat empirically pending results, and reassess de-escalation once they're back." },
        { text: "Increase FiO₂ only and wait", correct: false, feedback: "Raising FiO₂ buys time on oxygenation but doesn't treat the underlying infection driving the shunt." },
        { text: "No action — fever is expected after any prolonged ICU stay", correct: false, feedback: "A new fever with a new oxygenation requirement and purulent secretions is a meaningful clinical change, not background noise." },
        { text: "Extubate immediately to reduce infection risk", correct: false, feedback: "Extubating a patient with a new, active pulmonary infection and worsening oxygenation is unsafe — this isn't a weaning-readiness picture." },
      ],
    },
    {
      id: "septic",
      label: "Septic shock",
      category: "Hemodynamic + infectious",
      vignette: "Blood pressure has been trending down over the last while despite unchanged ventilator settings, with fever and a rising heart rate. Extremities feel warm and pulse pressure looks wide — this doesn't look like a purely respiratory problem.",
      engine: { shuntAdd: 0.08 },
      vitals: { mapSub: 26, hrAdd: 30, tempAdd: 1.5 },
      differentials: [
        { text: "Septic shock", correct: true },
        { text: "Tension pneumothorax", correct: false },
        { text: "Acute pulmonary embolism", correct: false },
        { text: "Cardiogenic shock", correct: false },
      ],
      actions: [
        { text: "Start prompt fluid resuscitation and early antibiotics; add norepinephrine if MAP stays below 65 despite fluids", correct: true, feedback: "Warm shock with fever and a wide pulse pressure is distributive/septic physiology. The Surviving Sepsis approach — early fluids, early antibiotics, vasopressor if MAP stays under 65 — is the evidence-based first move." },
        { text: "Give an inhaled bronchodilator", correct: false, feedback: "There's no airway/resistance problem here — this is a hemodynamic and infectious process, not bronchospasm." },
        { text: "Increase PEEP to raise blood pressure", correct: false, feedback: "Raising intrathoracic pressure in a hypotensive patient worsens venous return and blood pressure further — the opposite of the mechanism this patient needs addressed." },
        { text: "No action — likely just agitation, reassess in an hour", correct: false, feedback: "A falling MAP with fever and tachycardia is shock until proven otherwise, and warrants immediate action, not an hour's delay." },
      ],
    },
    {
      id: "extubation",
      label: "Accidental extubation / major cuff rupture",
      category: "Airway catastrophe",
      applies: (state) => ["vc", "pc", "psv", "simv", "aprv"].indexOf(state.mode) !== -1,
      vignette: "Exhaled tidal volume has suddenly collapsed even though the driving pressures look unchanged, there's a loud air leak audible at the mouth, and SpO₂ is falling. The tube markings at the teeth look different from the last documented depth.",
      engine: { leakFracAdd: 0.55, deadSpaceAdd: 0.05 },
      vitals: { hrAdd: 18, mapSub: 6 },
      differentials: [
        { text: "Accidental (partial or complete) extubation / major cuff rupture", correct: true },
        { text: "Bronchospasm", correct: false },
        { text: "Tension pneumothorax", correct: false },
        { text: "New pleural effusion", correct: false },
      ],
      actions: [
        { text: "Assess the airway directly, bag-mask ventilate as needed, and prepare to reintubate", correct: true, feedback: "A sudden massive leak with a changed tube position at the teeth is airway loss until proven otherwise. Direct visualization and readiness to reintubate takes priority over any ventilator adjustment." },
        { text: "Increase PEEP to compensate for the leak", correct: false, feedback: "You cannot pressurize your way past an airway that isn't sealed — this only delays the actual fix." },
        { text: "Pass a suction catheter only", correct: false, feedback: "Suctioning doesn't address a tube that has come out of position or a ruptured cuff." },
        { text: "Give an inhaled bronchodilator", correct: false, feedback: "There's no bronchospasm pattern here — this is an airway/equipment catastrophe, not obstruction." },
      ],
    },
    {
      id: "hypotension",
      label: "Sudden hemodynamic collapse",
      category: "Hemodynamic",
      vignette: "Blood pressure has suddenly dropped with no change to any ventilator setting and no new airway or breath-sound finding. Heart rate is climbing to compensate.",
      engine: {},
      vitals: { mapSub: 30, hrAdd: 16 },
      differentials: [
        { text: "Acute hemodynamic collapse (arrhythmia, vasoplegia, or another non-respiratory cause)", correct: true },
        { text: "Tension pneumothorax", correct: false },
        { text: "Mucus plug", correct: false },
        { text: "Auto-PEEP / breath stacking", correct: false },
      ],
      actions: [
        { text: "Assess ABCs and rhythm/pulse now; start ACLS if pulseless, otherwise fluids/vasopressors while actively hunting for a reversible cause (the H's and T's)", correct: true, feedback: "With no ventilator or airway explanation, a sudden hemodynamic collapse needs an immediate primary survey and rhythm check — everything else follows from that, and a reversible cause should be actively sought in parallel." },
        { text: "Increase ventilator rate only and reassess later", correct: false, feedback: "There's no respiratory driver here to correct — this delays the hemodynamic assessment this patient needs right now." },
        { text: "No action — reassess in an hour", correct: false, feedback: "A sudden, unexplained hypotensive drop needs an immediate response, not a delayed reassessment." },
        { text: "Give a sedative bolus", correct: false, feedback: "Sedation will only worsen hypotension here and does nothing to identify or treat the cause." },
      ],
    },
  ];

  let activeEntry = null;
  let diagnosisChosen = null;
  let actionChosen = null;
  let lastRenderedId = null;

  function shuffled(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function applicablePool(state) {
    return CATALOG.filter((c) => !c.applies || c.applies(state));
  }

  function renderOptions(containerId, options, onPick) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    shuffled(options).forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toolbar-btn alarm-option-btn";
      btn.textContent = opt.text;
      btn.addEventListener("click", () => onPick(opt, btn, container));
      container.appendChild(btn);
    });
  }

  function lockOptions(container) {
    Array.from(container.children).forEach((btn) => { btn.disabled = true; });
  }

  function showFeedback() {
    const box = document.getElementById("event-feedback");
    if (!box || !diagnosisChosen || !actionChosen) return;
    const M = window.MVSIM;
    const bothCorrect = diagnosisChosen.correct && actionChosen.correct;
    if (M && M.recordEventAttempt) M.recordEventAttempt(bothCorrect);
    updateScoreLine();

    box.className = `alarm-feedback ${bothCorrect ? "alarm-feedback-good" : "alarm-feedback-bad"}`;
    const verdict = bothCorrect
      ? "<p><strong>✅ Correctly recognized and managed.</strong> The complication has been resolved.</p>"
      : `<p><strong>${diagnosisChosen.correct ? "✅" : "❌"} Recognition</strong> — ${diagnosisChosen.correct ? "correct." : "not the best fit here."}
         &nbsp; <strong>${actionChosen.correct ? "✅" : "❌"} Management</strong> — ${actionChosen.correct ? "correct." : "not the right next step here — the complication is still active."}</p>`;
    box.innerHTML = `${verdict}<p>${actionChosen.feedback}</p>`;

    if (actionChosen.correct && M && M.clearActiveEvent) {
      M.clearActiveEvent();
    }
  }

  function updateScoreLine() {
    const el = document.getElementById("event-score");
    if (!el || !window.MVSIM) return;
    const s = window.MVSIM.stats;
    el.textContent = `${s.eventCorrect} / ${s.eventTotal} correct this session`;
  }

  function populatePicker() {
    const picker = document.getElementById("event-picker");
    if (!picker || picker.dataset.populated) return;
    CATALOG.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.label;
      picker.appendChild(opt);
    });
    picker.dataset.populated = "1";
  }

  function buildActiveUI(entry) {
    document.getElementById("event-category").textContent = entry.category;
    document.getElementById("event-label").textContent = entry.label;
    document.getElementById("event-vignette").textContent = entry.vignette;
    document.getElementById("event-feedback").className = "alarm-feedback";
    document.getElementById("event-feedback").innerHTML = "";
    diagnosisChosen = null;
    actionChosen = null;

    renderOptions("event-differentials", entry.differentials, (opt, btn, container) => {
      diagnosisChosen = opt;
      lockOptions(container);
      Array.from(container.children).forEach((b) => {
        if (b === btn) b.classList.add(opt.correct ? "alarm-option-correct" : "alarm-option-wrong");
      });
      showFeedback();
    });
    renderOptions("event-actions", entry.actions, (opt, btn, container) => {
      actionChosen = opt;
      lockOptions(container);
      Array.from(container.children).forEach((b) => {
        if (b === btn) b.classList.add(opt.correct ? "alarm-option-correct" : "alarm-option-wrong");
      });
      showFeedback();
    });

    document.getElementById("event-active").hidden = false;
    document.getElementById("event-idle-note").hidden = true;
  }

  function showIdle() {
    const active = document.getElementById("event-active");
    const idle = document.getElementById("event-idle-note");
    if (active) active.hidden = true;
    if (idle) idle.hidden = false;
  }

  function trigger(id, state) {
    const M = window.MVSIM;
    if (!M || !M.setActiveEvent) return;
    // A specific pick always respects the user's choice, even one that would
    // be filtered out of the "random" pool for this mode (e.g. explicitly
    // drilling accidental extubation on a non-invasive patient is the
    // learner's call to make). Only "random" draws from the applicable pool.
    const entry = id === "random"
      ? applicablePool(state)[Math.floor(Math.random() * applicablePool(state).length)]
      : CATALOG.find((c) => c.id === id);
    if (!entry) return;
    activeEntry = entry;
    lastRenderedId = entry.id;
    buildActiveUI(entry);
    M.setActiveEvent({ id: entry.id, engine: entry.engine, vitals: entry.vitals });
  }

  function initTrigger() {
    const btn = document.getElementById("event-trigger-btn");
    const picker = document.getElementById("event-picker");
    if (!btn || !picker) return;
    btn.addEventListener("click", () => {
      const live = window.MVSIM && window.MVSIM._lastRender;
      const state = live ? live.state : { mode: "vc" };
      trigger(picker.value, state);
    });
  }

  // Called from simulator.js's main render() loop on every recompute, so the
  // live monitor line tracks whatever the event is currently doing to the
  // physiology — but the actions/differentials DOM is only rebuilt when the
  // active event actually changes, so in-progress button states survive a
  // slider tweak made while a case is still open.
  function render(state, scenario, r, ibw) {
    if (!document.getElementById("events-panel")) return;
    populatePicker();
    const M = window.MVSIM;
    const ev = M && M.getActiveEvent ? M.getActiveEvent() : null;

    if (!ev) {
      if (lastRenderedId !== null) {
        lastRenderedId = null;
        activeEntry = null;
        showIdle();
      }
      updateScoreLine();
      return;
    }

    if (ev.id !== lastRenderedId) {
      const entry = CATALOG.find((c) => c.id === ev.id);
      if (entry) {
        activeEntry = entry;
        lastRenderedId = ev.id;
        buildActiveUI(entry);
      }
    }

    if (activeEntry && M.deriveVitals) {
      const prog = M.getProgression ? M.getProgression() : null;
      const v = M.deriveVitals(scenario, r, state.norad, prog ? prog.severityMultiplier : 1, activeEntry.vitals);
      const monitor = document.getElementById("event-monitor");
      if (monitor) {
        monitor.textContent =
          `Live: SpO₂ ${r.spo2.toFixed(0)}% · HR ${v.hr.toFixed(0)} · MAP ${v.map.toFixed(0)} mmHg · ` +
          `Plateau ${r.plateauPressure.toFixed(1)} cmH₂O · PaCO₂ ${r.paco2.toFixed(0)} mmHg` +
          (activeEntry.vitals && activeEntry.vitals.tempAdd ? ` · Temp ${v.temp.toFixed(1)}°C` : "");
      }
    }
    updateScoreLine();
  }

  document.addEventListener("DOMContentLoaded", () => {
    populatePicker();
    initTrigger();
    updateScoreLine();
  });

  window.renderEvents = render;
})();
