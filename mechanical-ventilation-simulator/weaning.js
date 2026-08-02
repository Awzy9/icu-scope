(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Weaning readiness assessment: simulates a spontaneous breathing trial
  // (SBT) by estimating what respiratory rate and tidal volume a patient's
  // own respiratory muscles (scenario.effortPressure) would generate against
  // their current lung mechanics, on typical low-level SBT settings
  // (CPAP 5 + PS 6-8). Reuses the same compliance/resistance/CO2 model as
  // the main ventilator engine — this is not a separate patient model.
  //
  // Illustrative only: real weaning decisions rest on far more than RSBI —
  // mental status, secretions, hemodynamic stability, and the reason for
  // intubation all matter and are not modeled here.
  // ---------------------------------------------------------------------

  const SBT_PEEP = 5;
  const SBT_PS = 7;

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function runSBT(scenario, pbw, mainState, mainResults) {
    const M = window.MVSIM;
    const driveP = scenario.effortPressure + SBT_PS;

    // Vt from the same compliance relationship used everywhere else
    // (Vt = drivingPressure * compliance), then penalized for airway
    // resistance — a stiff/obstructed patient gets less volume for the
    // same respiratory effort.
    const resistancePenalty = clamp(1 - (scenario.raw - 8) * 0.006, 0.5, 1);
    let spontVt = driveP * scenario.crs * resistancePenalty;
    spontVt = clamp(spontVt, 100, 700);

    // RR needed to hit the scenario's target alveolar ventilation at this
    // Vt — mirrors the main engine's PaCO2 relationship, solved for rate.
    const deadSpaceFrac = clamp(scenario.deadSpaceFrac + (scenario.leakFrac || 0), 0, 0.9);
    const va = Math.max(spontVt * (1 - deadSpaceFrac), 20);
    const targetAlveolarMV = M.co2Constant(scenario) / scenario.paco2Ref; // L/min
    let spontRR = (targetAlveolarMV * 1000) / va;
    spontRR = clamp(spontRR, 8, 55);

    const rsbi = spontRR / (spontVt / 1000); // breaths/min per liter

    // A crude illustrative NIF: a maximal effort is larger than the
    // pressure generated during ordinary tidal breathing.
    const nifEstimate = -(scenario.effortPressure * 4.2);

    const gasExchangeOk = mainState.fio2 <= 50 && mainState.peep <= 8
      && mainResults.pao2 >= 60 && mainResults.ph >= 7.30 && mainResults.ph <= 7.50;

    return { spontVt, spontRR, rsbi, nifEstimate, driveP, gasExchangeOk };
  }

  function rsbiBand(rsbi) {
    if (rsbi < 80) return { cls: "good", label: "favorable" };
    if (rsbi < 105) return { cls: "warn", label: "borderline" };
    return { cls: "bad", label: "unfavorable" };
  }

  let cuffLeakPresent = true;

  function render(mainState, scenario, mainResults, pbw) {
    const panel = document.getElementById("weaning-panel");
    if (!panel) return;

    const sbt = runSBT(scenario, pbw, mainState, mainResults);
    const band = rsbiBand(sbt.rsbi);

    document.getElementById("wean-rr").textContent = `${sbt.spontRR.toFixed(0)} /min`;
    document.getElementById("wean-vt").textContent = `${sbt.spontVt.toFixed(0)} mL (${(sbt.spontVt / pbw).toFixed(1)} mL/kg PBW)`;
    const rsbiEl = document.getElementById("wean-rsbi");
    rsbiEl.textContent = sbt.rsbi.toFixed(0);
    rsbiEl.className = `wean-rsbi-value wean-${band.cls}`;
    document.getElementById("wean-rsbi-label").textContent = `${band.label} (<80 favorable, ≥105 predicts likely failure)`;
    document.getElementById("wean-nif").textContent = `≈ ${sbt.nifEstimate.toFixed(0)} cmH₂O`;
    const nifLabel = document.getElementById("wean-nif-label");
    if (nifLabel) {
      nifLabel.textContent = sbt.nifEstimate > -25
        ? "Weaker than the usual −20 to −25 cmH₂O adequacy threshold — worth noting this can look concerning even when RSBI is favorable, particularly in neuromuscular disease, where RSBI is a poor predictor and NIF/vital capacity matter more."
        : "At or beyond the usual −20 to −25 cmH₂O adequacy threshold.";
    }

    const gasEl = document.getElementById("wean-gas-status");
    gasEl.textContent = sbt.gasExchangeOk
      ? "✅ Gas exchange criteria met (FiO₂ ≤50%, PEEP ≤8, PaO₂ ≥60, pH 7.30–7.50) on current settings."
      : "⚠️ Gas exchange criteria not yet met on current ventilator settings — an SBT is premature regardless of RSBI.";
    gasEl.className = sbt.gasExchangeOk ? "wean-status-ok" : "wean-status-bad";

    const leakBtn = document.getElementById("wean-leak-toggle");
    if (leakBtn) {
      leakBtn.setAttribute("aria-pressed", String(cuffLeakPresent));
      leakBtn.textContent = cuffLeakPresent ? "Cuff leak: present ✓" : "Cuff leak: absent ✗";
    }

    window.MVSIM._lastWeaning = { sbt, band, scenario, mainState, mainResults, pbw };
  }

  function renderDecision(outcome) {
    const box = document.getElementById("wean-decision-result");
    if (!box || !window.MVSIM._lastWeaning) return;
    const { sbt, band, mainResults } = window.MVSIM._lastWeaning;

    const reasons = [];
    if (!sbt.gasExchangeOk) reasons.push("gas exchange criteria not met");
    if (band.cls === "bad") reasons.push(`RSBI ${sbt.rsbi.toFixed(0)} (≥105) predicts a high work-of-breathing / rapid shallow breathing pattern`);
    if (sbt.nifEstimate > -25) reasons.push(`NIF ≈ ${sbt.nifEstimate.toFixed(0)} cmH₂O is weaker than the usual adequacy threshold — RSBI alone can miss this`);
    if (!cuffLeakPresent) reasons.push("absent cuff leak — raises concern for post-extubation stridor from airway edema");
    if (mainResults.hemodynamicImpact > 20) reasons.push("current settings already show a meaningful hemodynamic impact");

    const likelySuccess = reasons.length === 0;

    if (outcome === "extubate") {
      box.className = likelySuccess ? "wean-decision wean-decision-good" : "wean-decision wean-decision-bad";
      box.textContent = likelySuccess
        ? "Reasonable decision: favorable RSBI, gas exchange criteria met, and a cuff leak present — this combination is associated with a low reintubation risk in the literature, though no single index is definitive."
        : `Risky call: ${reasons.join("; ")}. In practice this combination is associated with a higher chance of extubation failure — consider optimizing further (secretions, mental status, fluid balance) before extubating, or plan close post-extubation monitoring / NIV bridge.`;
    } else {
      box.className = "wean-decision wean-decision-neutral";
      box.textContent = likelySuccess
        ? "Reasonable to hold if there's another specific concern (e.g. copious secretions, depressed mental status) not captured here — by the numbers modeled, this patient looks ready."
        : `Reasonable decision to continue ventilatory support: ${reasons.join("; ")}.`;
    }

    // Holding is never scored as the "wrong" call (caution isn't an error);
    // extubating is reasonable exactly when the modeled criteria support it.
    if (window.MVSIM && window.MVSIM.recordWeaningDecision) {
      window.MVSIM.recordWeaningDecision(outcome === "hold" || likelySuccess);
    }
  }

  function initButtons() {
    const leakBtn = document.getElementById("wean-leak-toggle");
    if (leakBtn) {
      leakBtn.addEventListener("click", () => {
        cuffLeakPresent = !cuffLeakPresent;
        if (window.MVSIM._lastWeaning) {
          const { mainState, scenario, mainResults, pbw } = window.MVSIM._lastWeaning;
          render(mainState, scenario, mainResults, pbw);
        }
      });
    }
    const extubateBtn = document.getElementById("wean-extubate-btn");
    const holdBtn = document.getElementById("wean-hold-btn");
    if (extubateBtn) extubateBtn.addEventListener("click", () => renderDecision("extubate"));
    if (holdBtn) holdBtn.addEventListener("click", () => renderDecision("hold"));
  }

  document.addEventListener("DOMContentLoaded", initButtons);

  window.renderWeaning = render;
})();
