(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Reads the shared window.MVSIM.stats bucket (populated by simulator.js,
  // weaning.js, and alarms.js) and renders a summary. Purely a motivational
  // session summary, not a validated competency assessment.
  // ---------------------------------------------------------------------

  function pct(numerator, denominator) {
    if (denominator === 0) return null;
    return Math.round((numerator / denominator) * 100);
  }

  function fillBar(barId, value) {
    const bar = document.getElementById(barId);
    if (!bar) return;
    bar.style.width = `${value === null ? 0 : value}%`;
    bar.className = "gauge-fill " + (value === null ? "gauge-warn" : value >= 80 ? "gauge-good" : value >= 50 ? "gauge-warn" : "gauge-bad");
  }

  function render() {
    const panel = document.getElementById("dashboard-panel");
    if (!panel || !window.MVSIM) return;
    const s = window.MVSIM.stats;

    const safePct = pct(s.settingsSafe, s.settingsChecked);
    const weanPct = pct(s.weaningReasonable, s.weaningDecisions);
    const alarmPct = pct(s.alarmCorrect, s.alarmTotal);

    document.getElementById("dash-settings-value").textContent = safePct === null ? "–" : `${safePct}%`;
    document.getElementById("dash-settings-sub").textContent = s.settingsChecked === 0
      ? "No settings explored yet — adjust the controls above."
      : `${s.settingsSafe} / ${s.settingsChecked} configurations had no danger-level alerts`;
    fillBar("dash-settings-bar", safePct);

    document.getElementById("dash-weaning-value").textContent = weanPct === null ? "–" : `${weanPct}%`;
    document.getElementById("dash-weaning-sub").textContent = s.weaningDecisions === 0
      ? "No weaning decisions made yet."
      : `${s.weaningReasonable} / ${s.weaningDecisions} decisions were reasonable given the modeled criteria`;
    fillBar("dash-weaning-bar", weanPct);

    document.getElementById("dash-alarms-value").textContent = alarmPct === null ? "–" : `${alarmPct}%`;
    document.getElementById("dash-alarms-sub").textContent = s.alarmTotal === 0
      ? "No alarm scenarios attempted yet."
      : `${s.alarmCorrect} / ${s.alarmTotal} scenarios diagnosed and managed correctly`;
    fillBar("dash-alarms-bar", alarmPct);

    const attempted = [safePct, weanPct, alarmPct].filter((v) => v !== null);
    const overall = document.getElementById("dash-overall");
    if (attempted.length === 0) {
      overall.textContent = "Explore the simulator, weaning assessment, and alarm scenarios above to build a session summary.";
      overall.className = "sim-subnote";
    } else {
      const avg = attempted.reduce((a, b) => a + b, 0) / attempted.length;
      let label, cls;
      if (avg >= 80) { label = "🟢 Strong session"; cls = "wean-status-ok"; }
      else if (avg >= 50) { label = "🟡 Solid, with room to tighten up"; cls = ""; }
      else { label = "🔴 Worth reviewing the sections above again"; cls = "wean-status-bad"; }
      overall.textContent = `${label} — a rough, motivational read across whichever sections you've used, not a validated competency score.`;
      overall.className = `sim-subnote ${cls}`;
    }
  }

  function initResetButton() {
    const btn = document.getElementById("dash-reset-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        if (window.MVSIM && window.MVSIM.resetStats) window.MVSIM.resetStats();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initResetButton();
    render();
  });

  window.renderDashboard = render;
})();
