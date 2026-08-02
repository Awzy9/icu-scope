(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Renders one synthetic breath cycle (not a live scrolling trace — a
  // single annotated diagram, redrawn whenever settings change) across
  // pressure/flow/volume-time canvases plus P-V and F-V loops. Also drives
  // the inspiratory-hold / expiratory-hold maneuver buttons, which mirror
  // the real bedside maneuvers used to read off Pplat and auto-PEEP.
  // ---------------------------------------------------------------------

  let holdMode = null; // null | "insp" | "exp"
  let lastArgs = null; // { state, scenario, r } from the most recent render

  function dpr() { return window.devicePixelRatio || 1; }

  function prepCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 280);
    // canvas.height here is the scaled DRAWING BUFFER we set below, not
    // the logical display height — reading it back would compound every
    // call (a real bug on devicePixelRatio > 1: each redraw multiplied the
    // already-scaled value again, ballooning the canvas within a handful of
    // frames). clientHeight is the CSS-rendered box height instead, which
    // stays fixed now that every canvas has an explicit CSS height.
    const h = canvas.clientHeight || 120;
    const ratio = dpr();
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function axisColor() {
    return getComputedStyle(document.documentElement).getPropertyValue("--text-muted") || "#888";
  }
  function traceColor() {
    return getComputedStyle(document.documentElement).getPropertyValue("--accent-strong") || "#2f7566";
  }
  function gridColor() {
    return getComputedStyle(document.documentElement).getPropertyValue("--border") || "#ddd";
  }

  function drawAxes(ctx, w, h, padL, padB) {
    ctx.strokeStyle = gridColor();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, 4);
    ctx.lineTo(padL, h - padB);
    ctx.lineTo(w - 4, h - padB);
    ctx.stroke();
  }

  // Builds a time-sampled trace for pressure, flow, and volume over one
  // breath, honoring the current hold-maneuver mode.
  // APRV has a fundamentally different cycle from a conventional breath —
  // a long pressure hold at P_high punctuated by brief timed releases —
  // so it gets its own trace builder rather than being forced through the
  // inspiration/expiration model above. Pressures here are derived the same
  // way as the engine's APRV mechanics override, so the drawn waveform and
  // the reported numbers agree.
  function buildAprvTrace(state, scenario, r) {
    const tau = Math.max(r.tau, 0.05);
    const tHigh = state.tHigh, tLow = state.tLow;
    const dispTtot = tHigh + tLow;
    const potential = Math.max(state.pHigh - state.pLow, 0) * scenario.crs; // mL above P_low equilibrium
    const reinflate = Math.min(0.15, tHigh * 0.1); // brief re-inflation ramp
    const points = [];
    const N = 180;

    for (let i = 0; i <= N; i++) {
      const t = (i / N) * dispTtot;
      let phase, volume, flow, pressure;

      if (t < reinflate) {
        // Re-pressurization back up to P_high after the release.
        const f = t / reinflate;
        phase = "insp";
        volume = potential * Math.exp(-tLow / tau) + (potential - potential * Math.exp(-tLow / tau)) * f;
        flow = ((potential - potential * Math.exp(-tLow / tau)) / 1000 / reinflate) * 60;
        pressure = r.totalPeep + (state.pHigh - r.totalPeep) * f;
      } else if (t <= tHigh) {
        // The long P_high hold — where spontaneous breathing happens and
        // where nearly all of this mode's mean airway pressure comes from.
        phase = "insp-hold";
        volume = potential;
        flow = 0;
        pressure = state.pHigh;
      } else {
        // Timed release, deliberately cut off before the lung empties.
        const tInRelease = t - tHigh;
        phase = "exp";
        volume = potential * Math.exp(-tInRelease / tau);
        flow = -(potential / tau / 1000) * Math.exp(-tInRelease / tau) * 60;
        pressure = state.pLow + (state.pHigh - state.pLow) * Math.exp(-tInRelease / tau);
      }

      points.push({ t, phase, volume, flow, pressure });
    }
    const peakFlowLpm = (potential / tau / 1000) * 60;
    return { points, dispTtot, peakFlowLpm };
  }

  function buildTrace(state, scenario, r) {
    if (r.detail && r.detail.kind === "aprv") return buildAprvTrace(state, scenario, r);
    const tau = Math.max(r.tau, 0.05);
    // In SIMV the trace shows one MANDATORY breath — that's the cycle whose
    // pressures the engine reports, and a rate-blended breath would draw a
    // waveform that matches neither the mandatory nor the supported breath.
    const simv = r.detail && r.detail.kind === "simv" ? r.detail : null;
    const ttot = simv ? 60 / Math.max(simv.mandRr, 1) : r.ttot;
    const ti = simv ? ttot / (1 + r.ratio) : r.ti;
    const te = ttot - ti;
    const vt = simv ? simv.mandVt : r.vt; // actual delivered volume, not the raw VC slider value
    const peakFlowLpm = (vt / 1000 / ti) * 60; // L/min
    const holdSec = 0.9;
    const points = [];
    const N = 140;

    // Effective total displayed duration, extended if a hold maneuver adds
    // a pause segment.
    const inspHold = holdMode === "insp";
    const expHold = holdMode === "exp";
    const dispTtot = ttot + (inspHold ? holdSec : 0) + (expHold ? holdSec : 0);

    for (let i = 0; i <= N; i++) {
      const frac = i / N;
      let t = frac * dispTtot;
      let phase, tInPhase;

      if (t <= ti) {
        phase = "insp"; tInPhase = t;
      } else if (inspHold && t <= ti + holdSec) {
        phase = "insp-hold"; tInPhase = t - ti;
      } else {
        const afterInsp = t - ti - (inspHold ? holdSec : 0);
        if (expHold && afterInsp > te) {
          phase = "exp-hold"; tInPhase = afterInsp - te;
        } else {
          phase = "exp"; tInPhase = Math.min(afterInsp, te);
        }
      }

      let volume, flow, pressure;
      if (phase === "insp") {
        volume = vt * (tInPhase / ti);
        flow = peakFlowLpm;
        pressure = r.setPeep + r.autoPeep + r.resistivePressure + r.drivingPressure * (tInPhase / ti);
      } else if (phase === "insp-hold") {
        volume = vt;
        flow = 0;
        pressure = r.plateauPressure; // no-flow plateau reveals true alveolar/plateau pressure
      } else if (phase === "exp-hold") {
        volume = vt * Math.exp(-te / tau);
        flow = 0;
        pressure = r.totalPeep; // no-flow equilibration reveals total (set + auto) PEEP
      } else { // exp
        volume = vt * Math.exp(-tInPhase / tau);
        flow = -(vt / tau / 1000) * Math.exp(-tInPhase / tau) * 60; // L/min, negative = expiratory
        pressure = r.setPeep + (r.peakPressure - r.setPeep) * Math.exp(-tInPhase / Math.max(tau * 0.4, 0.05));
      }

      points.push({ t, phase, volume, flow, pressure });
    }
    return { points, dispTtot, peakFlowLpm };
  }

  function drawSeries(canvas, points, dispTtot, key, opts) {
    const { ctx, w, h } = prepCanvas(canvas);
    const padL = 34, padB = 18, padT = 6, padR = 8;
    drawAxes(ctx, w, h, padL, padB);

    const vals = points.map((p) => p[key]);
    let lo = Math.min(0, ...vals);
    let hi = Math.max(0, ...vals);
    if (opts.fixedMin !== undefined) lo = Math.min(lo, opts.fixedMin);
    if (opts.fixedMax !== undefined) hi = Math.max(hi, opts.fixedMax);
    if (hi - lo < 1) hi = lo + 1;
    const pad = (hi - lo) * 0.12;
    lo -= pad; hi += pad;

    const xAt = (t) => padL + (t / dispTtot) * (w - padL - padR);
    const yAt = (v) => (h - padB) - ((v - lo) / (hi - lo)) * (h - padB - padT);

    // zero line
    if (lo < 0 && hi > 0) {
      ctx.strokeStyle = gridColor();
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(padL, yAt(0));
      ctx.lineTo(w - padR, yAt(0));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = traceColor();
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = xAt(p.t), y = yAt(p[key]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // y-axis labels (min/max)
    ctx.fillStyle = axisColor();
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(hi.toFixed(0), padL - 4, padT + 8);
    ctx.fillText(lo.toFixed(0), padL - 4, h - padB);

    // hold-maneuver annotation
    if (opts.holdLabel) {
      const holdPoints = points.filter((p) => p.phase === opts.holdPhase);
      if (holdPoints.length) {
        const mid = holdPoints[Math.floor(holdPoints.length / 2)];
        const x = xAt(mid.t), y = yAt(mid[key]);
        ctx.fillStyle = traceColor();
        ctx.textAlign = "center";
        ctx.fillText(opts.holdLabel, x, y - 8);
      }
    }
  }

  function drawLoop(canvas, points, xKey, yKey, xLabel, yLabel) {
    const { ctx, w, h } = prepCanvas(canvas);
    const padL = 34, padB = 18, padT = 6, padR = 8;
    drawAxes(ctx, w, h, padL, padB);

    const xs = points.map((p) => p[xKey]);
    const ys = points.map((p) => p[yKey]);
    let xlo = Math.min(0, ...xs), xhi = Math.max(...xs);
    let ylo = Math.min(0, ...ys), yhi = Math.max(0, ...ys);
    if (xhi - xlo < 1) xhi = xlo + 1;
    if (yhi - ylo < 1) yhi = ylo + 1;
    const xpad = (xhi - xlo) * 0.1, ypad = (yhi - ylo) * 0.1;
    xlo -= xpad; xhi += xpad; ylo -= ypad; yhi += ypad;

    const xAt = (v) => padL + ((v - xlo) / (xhi - xlo)) * (w - padL - padR);
    const yAt = (v) => (h - padB) - ((v - ylo) / (yhi - ylo)) * (h - padB - padT);

    ctx.strokeStyle = traceColor();
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = xAt(p[xKey]), y = yAt(p[yKey]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = axisColor();
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(xLabel, padL, h - 4);
    ctx.save();
    ctx.translate(10, padT + 10);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "left";
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }

  function renderWaveforms(state, scenario, r) {
    lastArgs = { state, scenario, r };
    const pressureCanvas = document.getElementById("wave-pressure");
    const flowCanvas = document.getElementById("wave-flow");
    const volumeCanvas = document.getElementById("wave-volume");
    const pvCanvas = document.getElementById("loop-pv");
    const fvCanvas = document.getElementById("loop-fv");
    if (!pressureCanvas) return; // page doesn't have waveform panel

    const trace = buildTrace(state, scenario, r);
    const holdOpts = {};
    if (holdMode === "insp") { holdOpts.holdPhase = "insp-hold"; }
    if (holdMode === "exp") { holdOpts.holdPhase = "exp-hold"; }

    drawSeries(pressureCanvas, trace.points, trace.dispTtot, "pressure", {
      holdPhase: holdOpts.holdPhase,
      holdLabel: holdMode === "insp" ? `Pplat ${r.plateauPressure.toFixed(1)}` : holdMode === "exp" ? `Total PEEP ${r.totalPeep.toFixed(1)}` : null,
    });
    drawSeries(flowCanvas, trace.points, trace.dispTtot, "flow", {});
    drawSeries(volumeCanvas, trace.points, trace.dispTtot, "volume", { fixedMin: 0 });

    if (pvCanvas) drawLoop(pvCanvas, trace.points, "pressure", "volume", "Pressure (cmH₂O)", "Volume (mL)");
    if (fvCanvas) drawLoop(fvCanvas, trace.points, "volume", "flow", "Volume (mL)", "Flow (L/min)");

    const pplatBtn = document.getElementById("insp-hold-btn");
    const peepBtn = document.getElementById("exp-hold-btn");
    if (pplatBtn) pplatBtn.setAttribute("aria-pressed", String(holdMode === "insp"));
    if (peepBtn) peepBtn.setAttribute("aria-pressed", String(holdMode === "exp"));

    const readout = document.getElementById("hold-readout");
    if (readout) {
      const aprv = r.detail && r.detail.kind === "aprv";
      if (aprv) {
        // A conventional hold maneuver isn't how these values are obtained in
        // APRV — the mode already spends nearly the whole cycle at plateau.
        readout.textContent = holdMode
          ? `In APRV the long T_high hold at P_high ${state.pHigh} cmH₂O is itself the plateau (${r.plateauPressure.toFixed(1)} cmH₂O), and end-release pressure ${r.totalPeep.toFixed(1)} cmH₂O is reached without a maneuver — the release is cut short deliberately, leaving ${r.autoPeep.toFixed(1)} cmH₂O of intentional PEEP above P_low.`
          : "";
      } else if (holdMode === "insp") {
        readout.textContent = `Inspiratory hold: plateau pressure ${r.plateauPressure.toFixed(1)} cmH₂O — this is the true alveolar distending pressure, with flow (and therefore resistive pressure) removed.`;
      } else if (holdMode === "exp") {
        readout.textContent = `Expiratory hold: total PEEP ${r.totalPeep.toFixed(1)} cmH₂O (set PEEP ${r.setPeep.toFixed(1)} + auto-PEEP ${r.autoPeep.toFixed(1)}) — pausing at end-exhalation lets alveolar and circuit pressure equilibrate.`;
      } else {
        readout.textContent = "";
      }
    }
  }

  // -----------------------------------------------------------------------
  // Simple 2D alveoli grid: visualizes collapsed / normally-aerated /
  // overdistended units as colored, differently-sized circles. Not a real
  // spatial model — just a qualitative picture of recruitment status.
  // -----------------------------------------------------------------------
  const LUNG_UNITS = 16;

  function renderLung(scenario, r) {
    const svg = document.getElementById("lung-svg");
    if (!svg) return;

    const collapsedCount = clampInt(Math.round(LUNG_UNITS * r.effectiveShunt), 0, LUNG_UNITS);
    const overdistCount = clampInt(Math.round(LUNG_UNITS * Math.min(r.overdistExcess / 8, 0.35)), 0, LUNG_UNITS - collapsedCount);
    const normalCount = LUNG_UNITS - collapsedCount - overdistCount;

    const roles = [];
    for (let i = 0; i < collapsedCount; i++) roles.push("collapsed");
    for (let i = 0; i < normalCount; i++) roles.push("normal");
    for (let i = 0; i < overdistCount; i++) roles.push("overdist");

    const cols = 4, rows = 4, cellW = 60, cellH = 60;
    svg.setAttribute("viewBox", `0 0 ${cols * cellW} ${rows * cellH}`);
    svg.innerHTML = "";

    roles.forEach((role, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const cx = col * cellW + cellW / 2;
      const cy = row * cellH + cellH / 2;
      let radius = 18, fill = "var(--accent, #2f7566)", extra = "";
      if (role === "collapsed") { radius = 8; fill = "var(--text-muted, #999)"; }
      else if (role === "overdist") { radius = 26; fill = "var(--danger-accent, #b3261e)"; }
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", cy);
      circle.setAttribute("r", radius);
      circle.setAttribute("fill", fill);
      circle.setAttribute("fill-opacity", role === "normal" ? "0.55" : "0.75");
      circle.setAttribute("class", `alveolus alveolus-${role}`);
      svg.appendChild(circle);
    });
  }

  function clampInt(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function initHoldButtons() {
    const pplatBtn = document.getElementById("insp-hold-btn");
    const peepBtn = document.getElementById("exp-hold-btn");
    if (pplatBtn) {
      pplatBtn.addEventListener("click", () => {
        holdMode = holdMode === "insp" ? null : "insp";
        if (lastArgs) renderWaveforms(lastArgs.state, lastArgs.scenario, lastArgs.r);
      });
    }
    if (peepBtn) {
      peepBtn.addEventListener("click", () => {
        holdMode = holdMode === "exp" ? null : "exp";
        if (lastArgs) renderWaveforms(lastArgs.state, lastArgs.scenario, lastArgs.r);
      });
    }
    window.addEventListener("resize", () => {
      if (lastArgs) renderWaveforms(lastArgs.state, lastArgs.scenario, lastArgs.r);
    });
  }

  document.addEventListener("DOMContentLoaded", initHoldButtons);

  window.renderWaveforms = renderWaveforms;
  window.renderLung = renderLung;
})();
