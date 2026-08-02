(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Laboratory trends: six small sparklines (pH, PaO2, PaCO2, lactate,
  // WBC, creatinine) drawn from the SAME progression.history array the
  // clinical course panel's P/F sparkline already reads — simulator.js's
  // advanceTime() populates it with a full physiology + labs snapshot at
  // every time point, not just P/F. This module only draws; it owns no
  // state of its own.
  //
  // Like the rest of the course system: these move only when time is
  // advanced, never from a settings tweak alone. A single ABG/metabolic
  // panel (the Patient panel above) is one snapshot; this is the trend
  // that snapshot sits on.
  // ---------------------------------------------------------------------

  const CHARTS = [
    { id: "ph", key: (h) => h.ph, fmt: (v) => v.toFixed(2), good: [7.35, 7.45] },
    { id: "pao2", key: (h) => h.pao2, fmt: (v) => v.toFixed(0), good: [80, 500] },
    { id: "paco2", key: (h) => h.paco2, fmt: (v) => v.toFixed(0), good: [35, 45] },
    { id: "lactate", key: (h) => h.labs.lactate, fmt: (v) => v.toFixed(1), good: [0, 2] },
    { id: "wbc", key: (h) => h.labs.wbc, fmt: (v) => v.toFixed(1), good: [4, 11] },
    { id: "creatinine", key: (h) => h.labs.creatinine, fmt: (v) => v.toFixed(1), good: [0.5, 1.3] },
  ];

  // Same fixed-CSS-height / clientHeight pattern as every other canvas in
  // this app (waveforms, ultrasound, CXR, the course sparkline) — reading
  // canvas.height back here instead would compound on every redraw on any
  // devicePixelRatio > 1 device.
  function drawMiniTrend(canvasId, points, goodRange) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 80);
    const h = canvas.clientHeight || 56;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const border = getComputedStyle(document.documentElement).getPropertyValue("--border") || "#ccc";
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent-strong") || "#2f7566";
    const okBg = getComputedStyle(document.documentElement).getPropertyValue("--ok-accent") || "#2e7d32";
    const padL = 4, padR = 4, padT = 6, padB = 6;

    if (points.length < 2) {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text-muted") || "#888";
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText("—", padL, h / 2 + 3);
      return;
    }

    const maxT = points[points.length - 1].t || 1;
    const vals = points.map((p) => p.v);
    const lo = Math.min(...vals, goodRange[0]);
    const hi = Math.max(...vals, goodRange[1]);
    const span = Math.max(hi - lo, 0.01);

    const xAt = (t) => padL + (t / maxT) * (w - padL - padR);
    const yAt = (v) => h - padB - ((v - lo) / span) * (h - padT - padB);

    // Shaded normal-range band, so a glance shows whether the trace is in
    // or out of range without reading the axis.
    const bandTop = yAt(Math.min(goodRange[1], hi));
    const bandBottom = yAt(Math.max(goodRange[0], lo));
    ctx.fillStyle = `${okBg.trim()}22`;
    ctx.fillRect(padL, bandTop, w - padL - padR, Math.max(bandBottom - bandTop, 0));

    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = xAt(p.t), y = yAt(p.v);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const last = points[points.length - 1];
    const lastInRange = last.v >= goodRange[0] && last.v <= goodRange[1];
    ctx.fillStyle = lastInRange ? okBg : accent;
    ctx.beginPath();
    ctx.arc(xAt(last.t), yAt(last.v), 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  let lastRenderedHours = -1;

  function render() {
    const panel = document.getElementById("labtrends-panel");
    if (!panel) return;
    const M = window.MVSIM;
    if (!M || !M.getProgression) return;
    const progression = M.getProgression();

    // Only redraw on an actual time advance — same reasoning as the course
    // panel's sparkline: every other render is a slider tick that leaves
    // the history untouched.
    if (progression.elapsedHours === lastRenderedHours) return;
    lastRenderedHours = progression.elapsedHours;

    CHARTS.forEach((chart) => {
      const points = progression.history
        .filter((h) => h.labs) // defensive: only points with a labs snapshot
        .map((h) => ({ t: h.t, v: chart.key(h) }));
      drawMiniTrend(`trend-${chart.id}`, points, chart.good);
      const valueEl = document.getElementById(`trend-${chart.id}-value`);
      if (valueEl) {
        valueEl.textContent = points.length ? chart.fmt(points[points.length - 1].v) : "—";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", render);
  window.renderLabTrends = render;
})();
