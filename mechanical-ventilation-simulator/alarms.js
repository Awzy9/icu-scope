(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Ventilator alarm troubleshooting. Deliberately decoupled from the main
  // physiology engine — these are discrete, hand-specified vignettes (a
  // disconnected circuit or a kinked tube isn't a steady-state the
  // continuous compliance/resistance model represents), each with its own
  // illustrative waveform shape and DOPES/DOTTS-anchored explanation.
  //
  // DOPES (differential): Displacement, Obstruction, Pneumothorax,
  // Equipment failure, Stacked breathing.
  // DOTTS (response): Disconnect + bag, Oxygen 100%, Tube position/patency,
  // Tweak the vent, Sonography/exam.
  // ---------------------------------------------------------------------

  const CASES = [
    {
      id: "kinked-ett",
      category: "High-pressure alarm",
      dopes: "O — Obstruction",
      vignette: "A 58-year-old man on AC/VC (Vt 420 mL, RR 18, PEEP 5) develops a sudden high-pressure alarm while the nursing team repositions him in bed.",
      monitor: { pip: 48, pplat: 19, spo2: 94, hr: 92, bp: "118/74" },
      exam: "Breath sounds equal bilaterally. The tubing is taut and the tube appears bent just past the corner of the mouth.",
      waveform: "highResistance",
      differentials: [
        { text: "Kinked / obstructed endotracheal tube", correct: true },
        { text: "New pneumothorax", correct: false },
        { text: "Worsening pulmonary edema", correct: false },
        { text: "Right mainstem intubation", correct: false },
      ],
      actions: [
        { text: "Straighten the tube (consider a bite block), then reassess pressures", correct: true },
        { text: "Increase PEEP", correct: false },
        { text: "Needle-decompress the chest immediately", correct: false },
        { text: "Give a 500 mL crystalloid bolus", correct: false },
      ],
      explanation: "Peak pressure is markedly elevated but plateau pressure is only mildly high — a large PIP−Pplat gap localizes the problem to resistance (the tube/airways/circuit), not the alveoli. Equal bilateral breath sounds argue against mainstem intubation or pneumothorax, both of which would be asymmetric. A kink during repositioning is a classic resistance-pattern cause; DOPES' ‘O’ (obstruction) and DOTTS' ‘T’ (tube position/patency) both point here before escalating to anything invasive.",
    },
    {
      id: "mucus-plug",
      category: "High-pressure alarm",
      dopes: "O — Obstruction",
      vignette: "A 71-year-old woman, ventilated for 6 days for pneumonia, has thick secretions on your last several assessments. The high-pressure alarm now sounds repeatedly, and her SpO₂ has drifted down over 20 minutes.",
      monitor: { pip: 44, pplat: 21, spo2: 89, hr: 104, bp: "126/80" },
      exam: "Coarse, transmitted breath sounds bilaterally; no wheeze. She has not been suctioned in over 8 hours.",
      waveform: "highResistance",
      differentials: [
        { text: "Mucus plugging of the endotracheal tube / airways", correct: true },
        { text: "Bronchospasm", correct: false },
        { text: "Auto-PEEP from breath stacking", correct: false },
        { text: "Circuit disconnection", correct: false },
      ],
      actions: [
        { text: "Pass a suction catheter down the endotracheal tube", correct: true },
        { text: "Start a bronchodilator nebulizer only, no suctioning", correct: false },
        { text: "Sedate and paralyze without checking the tube", correct: false },
        { text: "Switch to pressure control and accept a lower tidal volume", correct: false },
      ],
      explanation: "A resistance-pattern high-pressure alarm (PIP−Pplat gap) plus a long interval without suctioning and known thick secretions points to a mucus plug rather than bronchospasm (no wheeze here) or a mechanical problem. Passing a suction catheter is both diagnostic (resistance on the catheter, return of secretions) and therapeutic — exactly the ‘T’ (tube patency check) in DOTTS.",
    },
    {
      id: "bronchospasm",
      category: "High-pressure alarm",
      dopes: "O — Obstruction",
      vignette: "A 34-year-old with known asthma, intubated for status asthmaticus, triggers a high-pressure alarm shortly after a nebulized treatment was due but delayed.",
      monitor: { pip: 46, pplat: 20, spo2: 91, hr: 118, bp: "132/86" },
      exam: "Diffuse expiratory wheeze bilaterally. Prolonged expiratory phase.",
      waveform: "highResistance",
      differentials: [
        { text: "Bronchospasm", correct: true },
        { text: "Kinked tube", correct: false },
        { text: "Tension pneumothorax", correct: false },
        { text: "Mainstem intubation", correct: false },
      ],
      actions: [
        { text: "Give inhaled bronchodilators and consider systemic steroids/magnesium", correct: true },
        { text: "Increase the respiratory rate to compensate", correct: false },
        { text: "Perform an inspiratory hold and stop there", correct: false },
        { text: "Immediately obtain a chest tube tray", correct: false },
      ],
      explanation: "Diffuse wheeze with a resistance-pattern pressure gradient in a known asthmatic is bronchospasm until proven otherwise. Treat the airways directly; increasing the rate would worsen air trapping by shortening the time available to exhale — the opposite of what this patient needs (see the COPD/asthma scenario in the main simulator for why).",
    },
    {
      id: "mainstem",
      category: "High-pressure alarm",
      dopes: "D — Displacement",
      vignette: "A 45-year-old man was intubated 30 minutes ago in the emergency department and just arrived in the ICU. The high-pressure alarm sounds during transfer.",
      monitor: { pip: 41, pplat: 36, spo2: 90, hr: 108, bp: "122/78" },
      exam: "Breath sounds present on the right, diminished/absent on the left. The tube is secured at 25 cm at the teeth.",
      waveform: "highCompliance",
      differentials: [
        { text: "Right mainstem intubation (tube advanced too far)", correct: true },
        { text: "Left-sided mucus plug", correct: false },
        { text: "Bronchospasm", correct: false },
        { text: "Ventilator circuit leak", correct: false },
      ],
      actions: [
        { text: "Pull the tube back a few centimeters and re-auscultate", correct: true },
        { text: "Increase FiO₂ only and observe", correct: false },
        { text: "Deepen sedation and reassess in an hour", correct: false },
        { text: "Extubate and reintubate from scratch", correct: false },
      ],
      explanation: "Both PIP and Pplat are elevated with only a small gap between them — a compliance-pattern problem, here from overdistending one lung while the other isn't ventilated at all. Unilateral (right-sided) breath sounds and a tube secured deep (25 cm, longer than typical) point to mainstem intubation — DOPES' ‘D’ (displacement, in this case too far in rather than out). Pulling back 2–4 cm and reassessing breath sounds is the direct fix; a full reintubation is unnecessary and adds risk.",
    },
    {
      id: "tension-ptx",
      category: "High-pressure alarm + hypotension",
      dopes: "P — Pneumothorax",
      vignette: "A 39-year-old with severe ARDS on high PEEP (16 cmH₂O) develops a sudden high-pressure alarm together with a sharp fall in blood pressure.",
      monitor: { pip: 52, pplat: 39, spo2: 82, hr: 132, bp: "78/50" },
      exam: "Absent breath sounds on the left, distended neck veins, trachea deviated to the right.",
      waveform: "highCompliance",
      differentials: [
        { text: "Tension pneumothorax", correct: true },
        { text: "Right mainstem intubation", correct: false },
        { text: "Massive pulmonary embolism", correct: false },
        { text: "Anaphylaxis", correct: false },
      ],
      actions: [
        { text: "Needle decompression / chest tube now, don't wait for imaging", correct: true },
        { text: "Order a stat chest X-ray and wait for the result", correct: false },
        { text: "Give more sedation for presumed agitation", correct: false },
        { text: "Reduce PEEP slightly and reassess in 30 minutes", correct: false },
      ],
      explanation: "Sudden high pressures with hemodynamic collapse, absent unilateral breath sounds, tracheal deviation, and distended neck veins is tension pneumothorax — DOPES' ‘P’ — a clinical diagnosis that should not wait for a chest X-ray. High-PEEP ARDS patients are at elevated barotrauma risk (see the ARDS scenarios' plateau-pressure alerts in the main simulator). Immediate needle decompression or tube thoracostomy is the correct move over any lower-acuity measure.",
    },
    {
      id: "autopeep",
      category: "High-pressure alarm / distress",
      dopes: "S — Stacked breathing",
      vignette: "A 62-year-old with COPD, ventilated for a severe exacerbation at RR 24, becomes progressively more tachypneic and agitated over the past 15 minutes. The high-pressure alarm intermittently sounds.",
      monitor: { pip: 45, pplat: 24, spo2: 90, hr: 128, bp: "96/58" },
      exam: "Diffuse wheeze, visibly using accessory muscles, abdominal muscles contracting forcefully during exhalation. Blood pressure trending down over several minutes.",
      waveform: "autoPeep",
      differentials: [
        { text: "Dynamic hyperinflation / auto-PEEP (breath stacking)", correct: true },
        { text: "New pneumothorax", correct: false },
        { text: "Anxiety alone, no ventilator problem", correct: false },
        { text: "Ventilator circuit disconnection", correct: false },
      ],
      actions: [
        { text: "Disconnect the circuit briefly to let trapped gas escape, then lower RR / extend expiratory time", correct: true },
        { text: "Increase the respiratory rate to ‘catch up’ on minute ventilation", correct: false },
        { text: "Give a large fluid bolus for the falling blood pressure without addressing the vent", correct: false },
        { text: "Increase tidal volume", correct: false },
      ],
      explanation: "The expiratory flow trace never returns to zero before the next breath — the hallmark of air trapping. Falling blood pressure with progressively worsening tachypnea in an obstructive patient is dynamic hyperinflation raising intrathoracic pressure and reducing venous return, which can progress to PEA arrest if untreated. Briefly disconnecting the circuit (letting trapped gas vent to atmosphere) is a recognized emergency maneuver while definitive fixes — lower RR, shorter inspiratory time, treating bronchospasm — are applied. Increasing rate or tidal volume would make this worse, not better.",
    },
    {
      id: "disconnect",
      category: "Low-pressure alarm",
      dopes: "E — Equipment failure",
      vignette: "You hear a low-pressure alarm and a hissing sound from a patient's bedside just after the overnight respiratory therapist finished a circuit change.",
      monitor: { pip: 0, pplat: 0, spo2: 84, hr: 122, bp: "108/70" },
      exam: "No chest rise. No breath sounds. The ventilator screen shows no pressure or flow waveform at all.",
      waveform: "noWaveform",
      differentials: [
        { text: "Ventilator circuit disconnected", correct: true },
        { text: "Severe bronchospasm", correct: false },
        { text: "Massive mucus plug", correct: false },
        { text: "Tension pneumothorax", correct: false },
      ],
      actions: [
        { text: "Reconnect the circuit immediately and confirm chest rise / waveform return", correct: true },
        { text: "Increase PEEP to compensate for lost pressure", correct: false },
        { text: "Give a bronchodilator nebulizer", correct: false },
        { text: "Start chest compressions immediately without checking the circuit", correct: false },
      ],
      explanation: "A flat, absent waveform — not just a low number, but literally no trace — with no chest rise and a hissing sound is a disconnected circuit until proven otherwise, especially right after a circuit change. This is DOPES' ‘E’ (equipment) and the most reversible cause on the list. Reconnect and confirm return of the waveform and chest rise before considering anything else; a mucus plug or bronchospasm would show resistance-pattern high pressures, not an absent trace.",
    },
    {
      id: "cuff-leak",
      category: "Low-pressure alarm",
      dopes: "E — Equipment failure",
      vignette: "A 50-year-old on AC/VC (set Vt 450 mL) has an intermittent low-pressure alarm. The bedside nurse notes a soft gurgling sound near the mouth with every breath.",
      monitor: { pip: 22, pplat: 15, spo2: 93, hr: 96, bp: "116/72" },
      exam: "Audible air leak around the tube. Exhaled tidal volume displayed on the ventilator is 260 mL against a set 450 mL.",
      waveform: "leak",
      differentials: [
        { text: "Endotracheal tube cuff leak", correct: true },
        { text: "Bronchopleural fistula", correct: false },
        { text: "Ventilator malfunction", correct: false },
        { text: "Normal variation, no action needed", correct: false },
      ],
      actions: [
        { text: "Check/add cuff pressure with a manometer; if still leaking, consider the tube needs repositioning or exchange", correct: true },
        { text: "Ignore it since SpO₂ is still acceptable", correct: false },
        { text: "Increase set tidal volume to compensate for the leak", correct: false },
        { text: "Increase FiO₂ to 100% and stop there", correct: false },
      ],
      explanation: "A large, consistent gap between set and exhaled tidal volume with an audible leak at the mouth (not from a chest tube, which would suggest bronchopleural fistula instead) localizes this to the cuff — DOPES' ‘E’ again, but at the tube rather than the circuit. Checking cuff pressure is the first, least invasive step; simply raising the set volume just increases the amount lost through the leak rather than fixing it.",
    },
  ];

  let currentCase = null;
  let diagnosisChosen = null;
  let actionChosen = null;
  let stats = { correct: 0, total: 0 };

  function pickCase() {
    const pool = CASES.filter((c) => c.id !== (currentCase && currentCase.id));
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function shuffled(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // ---- Illustrative (non-physiology-engine) waveform shapes ------------

  const WAVEFORM_SHAPES = {
    // [x(0-1), y(0-1)] control points for a stylized pressure-time trace.
    highResistance: [[0, 0.15], [0.04, 0.95], [0.15, 0.55], [0.45, 0.5], [0.5, 0.15], [0.5, 0.15], [1, 0.15]],
    highCompliance: [[0, 0.15], [0.06, 0.85], [0.15, 0.88], [0.45, 0.85], [0.5, 0.15], [1, 0.15]],
    noWaveform: [[0, 0.5], [1, 0.5]],
    leak: [[0, 0.4], [0.08, 0.6], [0.2, 0.5], [0.3, 0.65], [0.45, 0.55], [0.5, 0.4], [0.7, 0.42], [1, 0.4]],
    // autoPeep is drawn as a flow-time trace instead (see drawAutoPeepFlow).
    autoPeep: null,
  };

  function drawStylizedTrace(canvas, points) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 260);
    // canvas.height here is the scaled DRAWING BUFFER we set below, not
    // the logical display height — reading it back would compound every
    // call (a real bug on devicePixelRatio > 1: each redraw multiplied the
    // already-scaled value again, ballooning the canvas within a handful of
    // frames). clientHeight is the CSS-rendered box height instead, which
    // stays fixed now that every canvas has an explicit CSS height.
    const h = canvas.clientHeight || 130;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const border = getComputedStyle(document.documentElement).getPropertyValue("--border") || "#ccc";
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--danger-accent") || "#b3261e";
    const padL = 8, padR = 8, padT = 10, padB = 10;

    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, h - padB);
    ctx.lineTo(w - padR, h - padB);
    ctx.stroke();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    points.forEach(([x, y], i) => {
      const px = padL + x * (w - padL - padR);
      const py = padT + (1 - y) * (h - padT - padB);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  function drawAutoPeepFlow(canvas) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 260);
    // canvas.height here is the scaled DRAWING BUFFER we set below, not
    // the logical display height — reading it back would compound every
    // call (a real bug on devicePixelRatio > 1: each redraw multiplied the
    // already-scaled value again, ballooning the canvas within a handful of
    // frames). clientHeight is the CSS-rendered box height instead, which
    // stays fixed now that every canvas has an explicit CSS height.
    const h = canvas.clientHeight || 130;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const border = getComputedStyle(document.documentElement).getPropertyValue("--border") || "#ccc";
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--danger-accent") || "#b3261e";
    const padL = 8, padR = 8, padT = 10, padB = 10;
    const zeroY = padT + 0.4 * (h - padT - padB);

    ctx.strokeStyle = border;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, zeroY);
    ctx.lineTo(w - padR, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Inspiratory flow up, expiratory flow down but never returning to the
    // zero line before the next breath starts — the classic auto-PEEP sign.
    const pts = [[0, 0.4], [0.08, 0.95], [0.22, 0.4], [0.28, 0.05], [0.55, 0.28], [0.7, 0.05], [0.95, 0.24], [1, 0.05]];
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const px = padL + x * (w - padL - padR);
      const py = padT + (1 - y) * (h - padT - padB);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  function renderWaveform(caseData) {
    const canvas = document.getElementById("alarm-waveform");
    if (!canvas) return;
    if (caseData.waveform === "autoPeep") {
      drawAutoPeepFlow(canvas);
    } else {
      drawStylizedTrace(canvas, WAVEFORM_SHAPES[caseData.waveform]);
    }
  }

  // ---- Rendering ---------------------------------------------------------

  function renderOptions(containerId, options, onPick) {
    const container = document.getElementById(containerId);
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
    if (!diagnosisChosen || !actionChosen) return;
    const box = document.getElementById("alarm-feedback");
    const bothCorrect = diagnosisChosen.correct && actionChosen.correct;
    stats.total += 1;
    if (bothCorrect) stats.correct += 1;
    document.getElementById("alarm-score").textContent = `${stats.correct} / ${stats.total} correct this session`;
    if (window.MVSIM && window.MVSIM.recordAlarmAttempt) window.MVSIM.recordAlarmAttempt(bothCorrect);

    box.className = `alarm-feedback ${bothCorrect ? "alarm-feedback-good" : "alarm-feedback-bad"}`;
    const dopesLine = `<p><strong>DOPES category:</strong> ${currentCase.dopes}</p>`;
    const verdict = bothCorrect
      ? "<p><strong>✅ Correct diagnosis and action.</strong></p>"
      : `<p><strong>${diagnosisChosen.correct ? "✅" : "❌"} Diagnosis</strong> — ${diagnosisChosen.correct ? "correct." : "not the best fit here."}
         &nbsp; <strong>${actionChosen.correct ? "✅" : "❌"} Action</strong> — ${actionChosen.correct ? "correct." : "not the safest/most direct next step here."}</p>`;
    box.innerHTML = `${verdict}${dopesLine}<p>${currentCase.explanation}</p>`;
  }

  function newCase() {
    currentCase = pickCase();
    diagnosisChosen = null;
    actionChosen = null;

    document.getElementById("alarm-category").textContent = currentCase.category;
    document.getElementById("alarm-vignette").textContent = currentCase.vignette;
    document.getElementById("alarm-exam").textContent = currentCase.exam;
    const m = currentCase.monitor;
    document.getElementById("alarm-monitor").textContent =
      `PIP ${m.pip} cmH₂O · Pplat ${m.pplat} cmH₂O · SpO₂ ${m.spo2}% · HR ${m.hr} · BP ${m.bp}`;
    renderWaveform(currentCase);

    document.getElementById("alarm-feedback").className = "alarm-feedback";
    document.getElementById("alarm-feedback").innerHTML = "";

    renderOptions("alarm-diagnoses", currentCase.differentials, (opt, btn, container) => {
      diagnosisChosen = opt;
      lockOptions(container);
      Array.from(container.children).forEach((b) => {
        if (b === btn) b.classList.add(opt.correct ? "alarm-option-correct" : "alarm-option-wrong");
      });
      showFeedback();
    });
    renderOptions("alarm-actions", currentCase.actions, (opt, btn, container) => {
      actionChosen = opt;
      lockOptions(container);
      Array.from(container.children).forEach((b) => {
        if (b === btn) b.classList.add(opt.correct ? "alarm-option-correct" : "alarm-option-wrong");
      });
      showFeedback();
    });
  }

  function init() {
    const panel = document.getElementById("alarm-panel");
    if (!panel) return;
    document.getElementById("alarm-next-btn").addEventListener("click", newCase);
    newCase();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
