(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Progressive clinical cases: multi-step scenarios mixing two step types.
  //   "configure" — the learner is told to select a scenario and settings
  //     in the main simulator above, then clicks "Check my settings" to
  //     have the CURRENT live state (window.MVSIM._lastRender) evaluated
  //     against the step's criteria. Non-blocking: they can continue
  //     regardless, but get accurate pass/fail feedback either way.
  //   "mc" — a straightforward multiple-choice decision point, evaluated
  //     immediately on click, same interaction pattern as alarms.js.
  // Each case ends with a short summary. Step outcomes feed the shared
  // dashboard via window.MVSIM.recordCaseStep().
  // ---------------------------------------------------------------------

  const CASES = [
    {
      id: "septic-ards",
      title: "Septic shock with ARDS",
      steps: [
        {
          type: "configure",
          prompt: "A 54-year-old man is intubated for septic shock and worsening hypoxemia from pneumonia. Chest X-ray shows bilateral infiltrates; P/F ratio is 145 (moderate ARDS). In the simulator above, select the “ARDS — moderate (P/F 100–200)” scenario and set lung-protective initial settings.",
          requireScenarioId: "ardsModerate",
          check: (ctx) => {
            const problems = [];
            const vtPerKg = ctx.r.vt / ctx.ibw;
            if (vtPerKg > 8) problems.push(`Tidal volume is ${vtPerKg.toFixed(1)} mL/kg IBW — above the lung-protective target.`);
            if (ctx.r.plateauPressure > 30) problems.push(`Plateau pressure ${ctx.r.plateauPressure.toFixed(0)} cmH₂O exceeds 30.`);
            if (ctx.r.drivingPressure > 15) problems.push(`Driving pressure ${ctx.r.drivingPressure.toFixed(0)} cmH₂O exceeds 15.`);
            if (ctx.r.pao2 < 60) problems.push(`PaO₂ ${ctx.r.pao2.toFixed(0)} mmHg is still under 60 — consider more PEEP and/or FiO₂.`);
            return problems;
          },
          passText: "Lung-protective targets met and oxygenation is reasonable for a moderate-ARDS starting point.",
        },
        {
          type: "mc",
          prompt: "6 hours later, plateau pressure has crept up and P/F has fallen further despite your settings, with worsening acidemia on repeat ABG. What's the single most evidence-based next step?",
          options: [
            { text: "Prone positioning", correct: true },
            { text: "Empirically increase tidal volume to improve CO₂ clearance", correct: false },
            { text: "Switch to high-frequency oscillatory ventilation (HFOV)", correct: false },
            { text: "An aggressive recruitment maneuver up to a very high PEEP", correct: false },
          ],
          explanation: "PROSEVA showed a mortality benefit for prone positioning in moderate–severe ARDS refractory to initial lung-protective ventilation. Raising Vt increases VILI risk. HFOV (OSCILLATE/OSCAR) showed no benefit and a mortality signal toward harm. Aggressive recruitment-to-high-PEEP (ART trial) increased 28-day mortality versus a lower-PEEP ARDSnet-style strategy.",
          evidence: ["proseva", "art"],
        },
        {
          type: "mc",
          prompt: "Over the next 3 days the patient improves: P/F rises to 220, FiO₂ is down to 40%, PEEP is 8, and he's initiating breaths and more awake. What's the most appropriate next move?",
          options: [
            { text: "Screen daily for spontaneous breathing trial (SBT) readiness", correct: true },
            { text: "Continue deep sedation and neuromuscular blockade indefinitely", correct: false },
            { text: "Extubate immediately with no SBT or readiness assessment", correct: false },
            { text: "Start HFOV prophylactically to “protect” the improving lungs", correct: false },
          ],
          explanation: "Daily screening plus an SBT is the standard approach once the reason for intubation is resolving — see this site's weaning readiness section for the mechanics (RSBI, NIF, gas-exchange criteria). Prolonged unnecessary paralysis raises ICU-acquired weakness risk; extubating with zero readiness assessment is unsafe; HFOV has no role here.",
        },
      ],
    },
    {
      id: "status-asthmaticus",
      title: "Status asthmaticus",
      steps: [
        {
          type: "configure",
          prompt: "A 24-year-old with poorly controlled asthma is intubated for status asthmaticus after failing maximal bronchodilator therapy. In the simulator above, select “COPD / asthma exacerbation” and set initial settings prioritizing a long expiratory time.",
          requireScenarioId: "copd",
          check: (ctx) => {
            const problems = [];
            if (ctx.state.rr > 16) problems.push(`Respiratory rate ${ctx.state.rr}/min is fairly high for an obstructive patient — a lower rate leaves more time to exhale.`);
            if (ctx.state.ratio < 2.5) problems.push(`I:E ratio is only 1:${ctx.state.ratio.toFixed(1)} — obstructive patients usually need 1:3 or longer.`);
            const vtPerKg = ctx.r.vt / ctx.ibw;
            if (vtPerKg > 8.5) problems.push(`Tidal volume is ${vtPerKg.toFixed(1)} mL/kg IBW — keep it modest to reduce the volume that has to be exhaled.`);
            return problems;
          },
          passText: "Good — low rate, long expiratory time. Note: an elevated PaCO₂ here is expected and acceptable (permissive hypercapnia) as long as pH is tolerable; don't chase a normal PaCO₂ by raising the rate.",
        },
        {
          type: "mc",
          prompt: "Peak pressure is high (plateau near-normal), and the patient looks progressively more agitated with a falling blood pressure. What's happening, and what do you do first?",
          options: [
            { text: "Dynamic hyperinflation / auto-PEEP — briefly disconnect the circuit to vent trapped gas, then lower RR and extend expiratory time", correct: true },
            { text: "Give IV fluids only; no ventilator changes needed", correct: false },
            { text: "Increase the respiratory rate to correct the falling SpO₂", correct: false },
            { text: "Assume a new pneumothorax and place a chest tube with no further assessment", correct: false },
          ],
          explanation: "Falling blood pressure with worsening agitation in an obstructive patient is the classic picture of dynamic hyperinflation raising intrathoracic pressure and reducing venous return — it can progress to PEA arrest. Briefly disconnecting the circuit to let trapped gas escape is a recognized emergency maneuver while RR/Ti are corrected. Raising the rate would make air trapping worse, not better (see the auto-PEEP alarm scenario above for the same physiology).",
        },
        {
          type: "mc",
          prompt: "After treatment, wheeze resolves and gas trapping improves. Which combination would most reassure you he's ready to wean?",
          options: [
            { text: "RSBI <80 on a low-support SBT, resolved wheeze, and adequate oxygenation on modest FiO₂/PEEP", correct: true },
            { text: "A single reassuring ABG obtained immediately after intubation", correct: false },
            { text: "Ongoing need for continuous nebulized bronchodilators every 15 minutes", correct: false },
            { text: "Persistent visible accessory muscle use at rest", correct: false },
          ],
          explanation: "A favorable RSBI plus resolved airway obstruction and reasonable gas exchange is the pattern the weaning readiness section above is built to estimate. A single early ABG doesn't reflect current readiness; ongoing heavy bronchodilator need and visible accessory muscle use both argue the patient is not yet ready.",
        },
      ],
    },
    {
      id: "cardiogenic-edema",
      title: "Acute cardiogenic pulmonary edema",
      steps: [
        {
          type: "configure",
          prompt: "A 68-year-old with a history of heart failure is intubated for acute pulmonary edema and hypoxemic respiratory failure. In the simulator above, select “Cardiogenic pulmonary edema / CHF” and set reasonable initial settings, including adequate PEEP to recruit fluid-filled alveoli.",
          requireScenarioId: "edema",
          check: (ctx) => {
            const problems = [];
            if (ctx.state.peep < 8) problems.push(`PEEP is only ${ctx.state.peep} cmH₂O — this scenario usually benefits from ≥8 cmH₂O to recruit fluid-filled alveoli.`);
            const vtPerKg = ctx.r.vt / ctx.ibw;
            if (vtPerKg > 8) problems.push(`Tidal volume is ${vtPerKg.toFixed(1)} mL/kg IBW — keep it lung-protective.`);
            if (ctx.r.pao2 < 60) problems.push(`PaO₂ ${ctx.r.pao2.toFixed(0)} mmHg is still under 60 — consider more PEEP and/or FiO₂.`);
            return problems;
          },
          passText: "Reasonable PEEP for recruiting fluid-filled alveoli, with protective tidal volume and adequate oxygenation.",
        },
        {
          type: "mc",
          prompt: "Shortly after increasing PEEP for oxygenation, blood pressure falls from 118/76 to 84/54 with a rising heart rate. What's the most likely mechanism and best first step?",
          options: [
            { text: "Reduced venous return from increased intrathoracic pressure — reduce PEEP toward the lowest level that maintains adequate oxygenation, then reassess", correct: true },
            { text: "New sepsis — start broad-spectrum antibiotics before anything else", correct: false },
            { text: "Anaphylaxis to the sedative — give epinephrine immediately", correct: false },
            { text: "This is expected and self-resolving; no action needed", correct: false },
          ],
          explanation: "PEEP raises intrathoracic pressure, which reduces venous return/preload — usually beneficial in cardiogenic edema (reduces preload and afterload) but capable of causing frank hypotension, especially if there's any element of volume depletion. The direct, reversible first move is titrating PEEP back down while addressing oxygenation another way, not reaching for unrelated diagnoses.",
        },
        {
          type: "mc",
          prompt: "Which patients are generally most likely to tolerate higher PEEP hemodynamically?",
          options: [
            { text: "Euvolemic or hypervolemic patients with adequate preload reserve", correct: true },
            { text: "Hypovolemic patients", correct: false },
            { text: "Patients with a large untreated pneumothorax", correct: false },
            { text: "Patients with severe right ventricular failure / pulmonary hypertension", correct: false },
          ],
          explanation: "Patients with adequate preload reserve (this cardiogenic-edema patient, once past acute hypotension) tolerate PEEP's preload-reducing effect well. Hypovolemic patients, those with an untreated pneumothorax (see the pneumothorax alarm scenario above), and those with RV failure/pulmonary hypertension (see the PE scenario in the main simulator) are all more PEEP-sensitive and afterload-vulnerable.",
        },
      ],
    },
  ];

  let currentCase = null;
  let currentStepIndex = 0;
  let stepOutcomes = []; // per-step: true/false/null(skipped)

  function evalConfigureStep(step) {
    const live = window.MVSIM && window.MVSIM._lastRender;
    const resultBox = document.getElementById("case-step-result");
    if (!live) {
      resultBox.className = "alarm-feedback alarm-feedback-bad";
      resultBox.innerHTML = "<p>No live settings detected yet — adjust the simulator above at least once, then check again.</p>";
      return;
    }
    const scenarioOk = !step.requireScenarioId || live.scenarioId === step.requireScenarioId;
    const problems = scenarioOk ? step.check(live) : [`Select the “${window.MVSIM.SCENARIOS[step.requireScenarioId].label}” scenario above first.`];
    const passed = problems.length === 0;

    stepOutcomes[currentStepIndex] = passed;
    if (window.MVSIM && window.MVSIM.recordCaseStep) window.MVSIM.recordCaseStep(passed);

    // Itemizing exactly what's wrong is the most direct kind of hint — this
    // is a "beginner" feature specifically, not "beginner and resident":
    // residents get limited hints, not the answer key. Everyone above
    // beginner has to work out which setting is off from the pass/fail
    // alone, same as a real attending wouldn't spell it out for them.
    const D = window.MVSIM_DIFFICULTY;
    const showDetail = !D || D.current() === "beginner";

    resultBox.className = `alarm-feedback ${passed ? "alarm-feedback-good" : "alarm-feedback-bad"}`;
    resultBox.innerHTML = passed
      ? `<p>✅ ${step.passText}</p>`
      : showDetail
      ? `<p>⚠️ Not quite there yet:</p><ul>${problems.map((p) => `<li>${p}</li>`).join("")}</ul><p class="sim-subnote">Adjust the settings above and click “Check my settings” again — or continue anyway.</p>`
      : `<p>⚠️ Not quite there yet — recheck your settings against the case's opening prompt.</p><p class="sim-subnote">Adjust the settings above and click “Check my settings” again — or continue anyway.</p>`;

    document.getElementById("case-next-btn").hidden = false;
  }

  function renderStep() {
    const step = currentCase.steps[currentStepIndex];
    document.getElementById("case-title").textContent = `${currentCase.title} — step ${currentStepIndex + 1} of ${currentCase.steps.length}`;
    document.getElementById("case-prompt").textContent = step.prompt;
    document.getElementById("case-step-result").className = "alarm-feedback";
    document.getElementById("case-step-result").innerHTML = "";
    document.getElementById("case-next-btn").hidden = true;

    const actionArea = document.getElementById("case-action-area");
    actionArea.innerHTML = "";

    if (step.type === "configure") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toolbar-btn";
      btn.textContent = "✅ Check my settings";
      btn.addEventListener("click", () => evalConfigureStep(step));
      actionArea.appendChild(btn);
    } else {
      const optWrap = document.createElement("div");
      optWrap.className = "alarm-options";
      step.options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "toolbar-btn alarm-option-btn";
        btn.textContent = opt.text;
        btn.addEventListener("click", () => {
          Array.from(optWrap.children).forEach((b) => { b.disabled = true; });
          btn.classList.add(opt.correct ? "alarm-option-correct" : "alarm-option-wrong");
          stepOutcomes[currentStepIndex] = opt.correct;
          if (window.MVSIM && window.MVSIM.recordCaseStep) window.MVSIM.recordCaseStep(opt.correct);

          const resultBox = document.getElementById("case-step-result");
          resultBox.className = `alarm-feedback ${opt.correct ? "alarm-feedback-good" : "alarm-feedback-bad"}`;
          const evidenceTags = (step.evidence || []).map((key) => {
            const e = window.MVSIM.EVIDENCE[key];
            return e ? `<span class="evidence-tag" title="${e.detail}">${e.name}</span>` : "";
          }).join(" ");
          resultBox.innerHTML = `<p>${opt.correct ? "✅ Correct." : "❌ Not the best choice here."}</p><p>${step.explanation}</p><div class="evidence-row">${evidenceTags}</div>`;
          document.getElementById("case-next-btn").hidden = false;
        });
        optWrap.appendChild(btn);
      });
      actionArea.appendChild(optWrap);
    }

    document.getElementById("case-next-btn").textContent =
      currentStepIndex === currentCase.steps.length - 1 ? "Finish case →" : "Next step →";
  }

  function renderSummary() {
    const correct = stepOutcomes.filter((o) => o === true).length;
    const total = currentCase.steps.length;
    document.getElementById("case-title").textContent = `${currentCase.title} — complete`;
    document.getElementById("case-prompt").textContent = `You got ${correct} of ${total} steps right. Pick another case below to continue, or revisit this one.`;
    document.getElementById("case-step-result").className = "";
    document.getElementById("case-step-result").innerHTML = "";
    document.getElementById("case-action-area").innerHTML = "";
    document.getElementById("case-next-btn").hidden = true;
  }

  function startCase(caseId) {
    currentCase = CASES.find((c) => c.id === caseId);
    currentStepIndex = 0;
    stepOutcomes = [];
    document.getElementById("case-runner").hidden = false;
    renderStep();
    document.getElementById("case-runner").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderPicker() {
    const list = document.getElementById("case-picker-list");
    list.innerHTML = "";
    CASES.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toolbar-btn case-picker-btn";
      btn.textContent = `▶ ${c.title} (${c.steps.length} steps)`;
      btn.addEventListener("click", () => startCase(c.id));
      list.appendChild(btn);
    });
  }

  function init() {
    const panel = document.getElementById("case-panel");
    if (!panel) return;
    renderPicker();
    document.getElementById("case-next-btn").addEventListener("click", () => {
      if (currentStepIndex < currentCase.steps.length - 1) {
        currentStepIndex += 1;
        renderStep();
      } else {
        renderSummary();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
