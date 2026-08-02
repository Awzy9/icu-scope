(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Clinical course: lets the patient evolve over simulated time instead
  // of staying frozen at presentation. The learner advances a clock (+15
  // min / +1 h / +6 h / +24 h); each advance scores whatever settings are
  // CURRENTLY dialed in (via simulator.js's assessManagementQuality) and
  // nudges the underlying lung mechanics toward recovery or injury for
  // that whole interval. Settings changes alone never move the course —
  // only advancing time does, matching the bedside fact that injury and
  // recovery accrue over hours, not instantaneously with a dial turn.
  //
  // Every downstream module (oxygenation, the CXR panel's aeration, the
  // ultrasound panel's B-line density) already reads off compute()'s
  // results rather than the static scenario object, so nudging shunt and
  // compliance once in the engine (simulator.js's computeEffectiveScenario)
  // propagates to all of them for free — this module is purely the
  // clock, the trend readout, the sparkline, and the course log.
  // ---------------------------------------------------------------------

  function fmtElapsed(hours) {
    if (hours === 0) return "at presentation";
    if (hours < 1) return `+${Math.round(hours * 60)} min`;
    if (hours < 24) {
      const whole = Math.floor(hours);
      const mins = Math.round((hours - whole) * 60);
      return mins > 0 ? `+${whole}h ${mins}m` : `+${whole}h`;
    }
    const days = Math.floor(hours / 24);
    const rem = hours - days * 24;
    return `+${days}d${rem > 0 ? ` ${Math.round(rem)}h` : ""}`;
  }

  function trendFor(severityMultiplier) {
    if (severityMultiplier <= 0.93) return { label: "Improving", cls: "course-trend-good", arrow: "↓" };
    if (severityMultiplier >= 1.08) return { label: "Deteriorating", cls: "course-trend-bad", arrow: "↑" };
    return { label: "Stable", cls: "course-trend-neutral", arrow: "→" };
  }

  // ---- Sparkline -----------------------------------------------------
  // Same runaway-buffer fix as every other canvas in this app: CSS pins
  // the display height (see styles.css), and we read clientHeight rather
  // than the mutable canvas.height attribute.
  function drawSparkline(history) {
    const canvas = document.getElementById("course-sparkline");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 200);
    const h = canvas.clientHeight || 70;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const border = getComputedStyle(document.documentElement).getPropertyValue("--border") || "#ccc";
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent-strong") || "#2f7566";
    const padL = 6, padR = 6, padT = 8, padB = 8;

    if (history.length < 2) {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text-muted") || "#888";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText("Advance time to start the trend", padL, h / 2);
      return;
    }

    // history[0] is always the t=0 baseline point (advanceTime() anchors it
    // there on the first call), so no synthetic starting point is needed.
    const pts = history;
    const maxT = pts[pts.length - 1].t || 1;
    const pfVals = pts.map((p) => p.pf);
    const loPf = Math.max(0, Math.min(...pfVals) - 20);
    const hiPf = Math.max(...pfVals) + 20;

    const xAt = (t) => padL + (t / maxT) * (w - padL - padR);
    const yAt = (pf) => h - padB - ((pf - loPf) / Math.max(hiPf - loPf, 1)) * (h - padT - padB);

    // Reference bands: 200 (mild/moderate ARDS boundary) and 300 (normal).
    ctx.strokeStyle = border;
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;
    [200, 300].forEach((line) => {
      if (line < loPf || line > hiPf) return;
      ctx.beginPath();
      ctx.moveTo(padL, yAt(line));
      ctx.lineTo(w - padR, yAt(line));
      ctx.stroke();
    });
    ctx.setLineDash([]);

    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = xAt(p.t), y = yAt(p.pf);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Endpoint marker.
    const last = pts[pts.length - 1];
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(xAt(last.t), yAt(last.pf), 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- Narrative -------------------------------------------------------
  // Built from the actual before/after values advanceTime() returns, not
  // canned text — same principle as the physiology explanation panel.
  function describeAdvance(result, scenario, ibw) {
    const { hours, quality, before, after } = result;
    const dPf = after.pfRatio - before.pfRatio;
    const direction = quality > 0.15 ? "improving" : quality < -0.15 ? "worsening" : "roughly unchanged";

    const reasons = [];
    if (quality > 0.15) {
      reasons.push("plateau and driving pressure stayed within lung-protective limits");
    } else if (quality < -0.15) {
      reasons.push("plateau and/or driving pressure exceeded the protective thresholds, or oxygenation/acid-base was inadequate");
    } else {
      reasons.push("settings were neither clearly protective nor clearly injurious");
    }

    const pfClause = Math.abs(dPf) >= 3
      ? `P/F ratio moved ${before.pfRatio.toFixed(0)} → ${after.pfRatio.toFixed(0)}.`
      : `P/F ratio held roughly steady (${before.pfRatio.toFixed(0)} → ${after.pfRatio.toFixed(0)}).`;

    return `Over ${fmtElapsed(hours).replace("+", "")} at the current settings: ${reasons[0]}, so the lung is ${direction}. ${pfClause}`;
  }

  let lastRenderedHours = -1;

  function render(state, scenario, r, ibw) {
    const panel = document.getElementById("course-panel");
    if (!panel) return;
    const M = window.MVSIM;
    if (!M || !M.getProgression) return;
    const progression = M.getProgression();

    const icuDayStart = scenario.clinical ? scenario.clinical.icuDay : 1;
    const totalHoursIn = progression.elapsedHours;
    const icuDay = icuDayStart + Math.floor(totalHoursIn / 24);
    const hourOfDay = Math.floor(totalHoursIn % 24);

    document.getElementById("course-elapsed").textContent =
      totalHoursIn === 0 ? `ICU Day ${icuDayStart} — presentation` : `ICU Day ${icuDay}, ${hourOfDay}h — ${fmtElapsed(totalHoursIn)} since presentation`;

    const trend = trendFor(progression.severityMultiplier);
    const badge = document.getElementById("course-trend");
    badge.textContent = `${trend.arrow} ${trend.label}`;
    badge.className = `course-trend-badge ${trend.cls}`;

    document.getElementById("course-current-pf").textContent = r.pfRatio.toFixed(0);
    document.getElementById("course-current-driving").textContent = `${r.drivingPressure.toFixed(1)} cmH₂O`;
    document.getElementById("course-current-vtkg").textContent = `${(r.vt / ibw).toFixed(1)} mL/kg IBW`;

    // Only redraw the sparkline / log when the course actually advanced —
    // every other render (a slider tick) leaves the history untouched, so
    // redrawing is wasted work and would just repaint the identical trace.
    if (progression.elapsedHours !== lastRenderedHours) {
      // A fresh course (new scenario picked, "Reset to scenario defaults",
      // or the course's own "Reset course" button) all funnel through the
      // same simulator.js resetProgression() and land here at hour 0 with
      // an empty history. Whichever path got us here, the log has to be
      // cleared too, or it keeps showing the PREVIOUS patient's entries
      // even though the trend/sparkline have correctly gone back to zero.
      if (progression.history.length === 0) {
        const log = document.getElementById("course-log");
        if (log) log.innerHTML = "";
      }
      lastRenderedHours = progression.elapsedHours;
      drawSparkline(progression.history);
    }
  }

  function appendLogEntry(text, quality) {
    const log = document.getElementById("course-log");
    if (!log) return;
    const li = document.createElement("li");
    li.className = quality > 0.15 ? "course-log-good" : quality < -0.15 ? "course-log-bad" : "course-log-neutral";
    li.textContent = text;
    log.insertBefore(li, log.firstChild);
    // Keep the log from growing without bound across a long session.
    while (log.children.length > 12) log.removeChild(log.lastChild);
  }

  function initControls() {
    const panel = document.getElementById("course-panel");
    if (!panel) return;

    document.querySelectorAll("[data-advance-hours]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const hours = Number(btn.getAttribute("data-advance-hours"));
        const M = window.MVSIM;
        if (!M || !M.advanceTime) return;
        const live = M._lastRender;
        if (!live) return;
        const result = M.advanceTime(hours);
        if (!result) return;
        appendLogEntry(describeAdvance(result, live.scenario, live.ibw), result.quality);
      });
    });

    const resetBtn = document.getElementById("course-reset-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (window.MVSIM && window.MVSIM.resetCourse) window.MVSIM.resetCourse();
        const log = document.getElementById("course-log");
        if (log) log.innerHTML = "";
        lastRenderedHours = -1;
      });
    }
  }

  document.addEventListener("DOMContentLoaded", initControls);
  window.renderCourse = render;
})();
