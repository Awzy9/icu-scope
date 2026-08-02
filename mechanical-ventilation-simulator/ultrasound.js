(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Lung ultrasound module.
  //
  // Renders a stylized, animated B-mode view of the current scenario's
  // characteristic lung ultrasound appearance, organised around the BLUE
  // protocol's profiles. Two things make this more than a picture gallery:
  //
  //   1. Lung sliding is animated. It is the single most important dynamic
  //      sign in lung ultrasound and cannot be shown in a still frame — the
  //      difference between a normal A-profile and a pneumothorax IS the
  //      motion, not the artifacts, which look identical frozen.
  //   2. B-line density is driven by the physiology engine's recruitment
  //      state, not hard-coded. Adding PEEP to a recruitable lung visibly
  //      clears B-lines, which is the basis of ultrasound-guided PEEP
  //      titration; adding it to consolidated lung does nothing.
  //
  // Artifacts are drawn, not photographic. They are schematic teaching
  // diagrams of what each pattern looks like, not real clip captures.
  // ---------------------------------------------------------------------

  const PROFILES = {
    normal: {
      profile: "A-profile",
      anterior: "a-lines",
      lateral: "a-lines",
      sliding: true,
      findings: [
        "Lung sliding present in all zones",
        "A-lines (horizontal repeats of the pleural line)",
        "Thin, smooth, regular pleural line",
        "No B-lines, no consolidation, no effusion",
      ],
      teaching: "A-lines plus lung sliding means aerated lung directly under the probe. This is the normal appearance — and importantly, it effectively rules out pneumothorax at that spot (sliding present) and interstitial syndrome (no B-lines).",
    },
    ardsMild: { ref: "ards" },
    ardsModerate: { ref: "ards" },
    ardsSevere: { ref: "ards" },
    covidArds: {
      profile: "B-profile (patchy, with spared areas)",
      anterior: "b-lines",
      lateral: "consolidation",
      sliding: true,
      slidingReduced: true,
      findings: [
        "Multifocal B-lines with characteristically SPARED normal areas between them",
        "Thickened, irregular, fragmented pleural line",
        "Small subpleural consolidations, often posterolateral and basal",
        "Reduced (not absent) lung sliding in affected zones",
      ],
      teaching: "COVID-19 ARDS shows the same non-homogeneous pattern as other ARDS: patchy B-lines with normal spared areas, an irregular fragmented pleural line, and subpleural consolidations. The patchiness and the abnormal pleural line are what separate it from cardiogenic edema, where B-lines are smooth, symmetric, gravity-dependent and the pleural line stays thin.",
    },
    copd: {
      profile: "A-profile with lung sliding (nude profile)",
      anterior: "a-lines",
      lateral: "a-lines",
      sliding: true,
      findings: [
        "A-lines with preserved lung sliding throughout",
        "No B-lines, no consolidation, no effusion",
        "Often a hyperinflated, low-lying diaphragm",
      ],
      teaching: "In a patient with acute respiratory failure, an A-profile WITH sliding and no leg vein thrombosis points to asthma/COPD in the BLUE protocol. The ultrasound is essentially normal — the problem is airflow, not lung water or alveolar filling. A normal-looking scan in a struggling patient is a finding, not a failure to find anything.",
    },
    edema: {
      profile: "B-profile (bilateral, symmetric)",
      anterior: "b-lines-dense",
      lateral: "b-lines-dense",
      sliding: true,
      findings: [
        "Diffuse, bilateral, symmetric B-lines (\"lung rockets\")",
        "SMOOTH, thin, regular pleural line — a key discriminator",
        "Gravity-dependent: denser in dependent zones",
        "Often bilateral pleural effusions",
      ],
      teaching: "Cardiogenic pulmonary edema gives bilateral symmetric B-lines with a smooth regular pleural line and no spared areas. That combination — smooth pleura, symmetry, gravity dependence — is what distinguishes it from ARDS, where the pleural line is thickened and irregular and normal areas sit between affected ones.",
    },
    pneumonia: {
      profile: "C-profile (anterior consolidation)",
      anterior: "consolidation",
      lateral: "consolidation",
      sliding: true,
      slidingReduced: true,
      findings: [
        "Tissue-like (\"hepatised\") consolidated lung",
        "Dynamic air bronchograms — branching bright specks that move with breathing",
        "Shred sign at the deep border of the consolidation",
        "Focal B-lines at the margins; may have a parapneumonic effusion",
      ],
      teaching: "A dynamic air bronchogram — bright specks moving within the consolidation during inspiration — indicates a patent airway and strongly favours pneumonia over resorptive atelectasis, where the bronchogram is static. That single dynamic sign changes management: one needs antibiotics, the other needs recruitment or a bronchoscopy.",
    },
    fibrosis: {
      profile: "B-profile with a markedly irregular pleural line",
      anterior: "b-lines",
      lateral: "b-lines",
      sliding: true,
      slidingReduced: true,
      findings: [
        "Coarse, irregular, thickened and fragmented pleural line",
        "Irregularly spaced B-lines",
        "Small subpleural cysts / nodules",
        "Reduced lung sliding from poor compliance",
      ],
      teaching: "Chronic interstitial disease produces B-lines too, so B-lines alone never mean \"fluid\". The pleural line does the discriminating: coarse, irregular and fragmented here versus the smooth thin line of cardiogenic edema. Always ask whether the finding is acute before treating it as such.",
    },
    neuromuscular: {
      profile: "A-profile (normal lung)",
      anterior: "a-lines",
      lateral: "a-lines",
      sliding: true,
      findings: [
        "Entirely normal aerated lung: A-lines with sliding",
        "Reduced diaphragmatic excursion and thickening fraction on diaphragm views",
      ],
      teaching: "The lungs are normal — the pump has failed. Lung ultrasound is unremarkable, and the informative scan here is of the diaphragm: excursion and thickening fraction. A diaphragm thickening fraction under about 20% predicts weaning failure, which is exactly the mismatch this scenario teaches.",
    },
    obesity: {
      profile: "A-profile anteriorly, dependent consolidation",
      anterior: "a-lines",
      lateral: "consolidation",
      sliding: true,
      findings: [
        "Normal A-lines in the anterior (non-dependent) zones",
        "Dependent atelectasis / consolidation in posterolateral zones",
        "Recruits with PEEP, unlike an infective consolidation",
      ],
      teaching: "Scanning only the anterior chest here would report a normal lung. The pathology is entirely dependent — which is also why it responds to PEEP and to positioning. Never conclude the lungs are clear from anterior views alone.",
    },
    pe: {
      profile: "A-profile (normal lungs) — the key negative finding",
      anterior: "a-lines",
      lateral: "a-lines",
      sliding: true,
      findings: [
        "Normal A-lines with preserved lung sliding despite severe hypoxemia",
        "Occasionally small peripheral wedge-shaped subpleural infarcts",
        "Echocardiography: dilated RV, septal flattening, McConnell's sign",
        "Compression ultrasound of the leg veins may show DVT",
      ],
      teaching: "This is the most important pattern in the BLUE protocol: a profoundly hypoxemic patient whose lungs look NORMAL on ultrasound. An A-profile with severe hypoxemia sends you to the leg veins and the right ventricle, not to more PEEP. The lungs are fine — the perfusion isn't.",
    },
    traumaFlail: {
      profile: "Mixed — contusion with B-lines, exclude pneumothorax",
      anterior: "b-lines",
      lateral: "consolidation",
      sliding: true,
      findings: [
        "Focal B-lines and subpleural consolidation over contused segments",
        "Rib fractures visible as cortical step-offs",
        "MUST actively exclude pneumothorax and haemothorax in every trauma scan",
      ],
      teaching: "In chest trauma, lung ultrasound outperforms supine chest X-ray for detecting pneumothorax and haemothorax. Contusion gives focal B-lines and subpleural consolidation, but the priority in the scan is the exclusion — check for sliding in every zone before attributing the hypoxemia to contusion.",
    },
    pneumothorax: {
      profile: "A'-profile — absent sliding, with a lung point",
      anterior: "pneumothorax",
      lateral: "lung-point",
      sliding: false,
      findings: [
        "ABSENT lung sliding (the defining finding)",
        "A-lines still present — the artifacts look normal; only the motion is gone",
        "Absent B-lines (a single B-line rules out pneumothorax at that spot)",
        "LUNG POINT: the exact spot where absent sliding meets normal sliding — 100% specific",
        "Absent lung pulse on M-mode; \"barcode/stratosphere\" sign replaces the seashore sign",
      ],
      teaching: "Freeze the image and a pneumothorax looks completely normal — A-lines and all. Only motion distinguishes them, which is why sliding must be assessed live. Absent sliding alone is sensitive but not specific (it also occurs in ARDS, consolidation, mainstem intubation, pleurodesis); the lung point is what makes the diagnosis definitively.",
    },
    bpf: {
      profile: "Variable — sliding present, air leak at the fistula",
      anterior: "a-lines",
      lateral: "consolidation",
      sliding: true,
      findings: [
        "Lung sliding usually preserved (the lung remains partly apposed)",
        "Consolidation and B-lines adjacent to the fistula",
        "Persistent air leak is a clinical/drain finding, not an ultrasound one",
      ],
      teaching: "Ultrasound helps here mainly by mapping which lung is aerated and where the pathology sits, and by excluding a tension component. The fistula itself is diagnosed at the chest drain — a continuous bubbling air leak — not on the screen.",
    },
  };

  // Shared ARDS profile referenced by all three Berlin severities.
  PROFILES.ards = {
    profile: "B-profile (non-homogeneous, with spared areas)",
    anterior: "b-lines",
    lateral: "consolidation",
    sliding: true,
    slidingReduced: true,
    findings: [
      "Patchy, non-homogeneous B-lines with SPARED normal areas in between",
      "Thickened, irregular, fragmented pleural line",
      "Subpleural consolidations, worst in dependent posterolateral zones",
      "Reduced lung sliding over affected areas",
    ],
    teaching: "ARDS and cardiogenic edema both produce B-lines, and telling them apart is the classic bedside question. ARDS: patchy distribution, spared areas, thickened irregular pleural line, subpleural consolidations. Cardiogenic edema: homogeneous, symmetric, gravity-dependent, with a smooth thin pleural line.",
  };

  function profileFor(scenarioId) {
    const p = PROFILES[scenarioId];
    if (!p) return PROFILES.normal;
    return p.ref ? PROFILES[p.ref] : p;
  }

  const EVIDENCE_KEYS = ["blueProtocol", "lusConsensus"];

  let zone = "anterior";
  let animating = true;
  let rafId = null;
  let phase = 0;
  let lastCtx = null; // { scenarioId, bLineScale }
  let renderedScenarioId = null; // guards rebuilding static text on every tick

  // -----------------------------------------------------------------------
  // Drawing helpers. The view mimics a linear-probe intercostal window:
  // soft tissue at the top, two rib shadows framing the pleural line
  // between them (the "bat sign"), then artifact space below.
  // -----------------------------------------------------------------------

  function prep(canvas) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 280);
    const h = canvas.height || 240;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx, w, h };
  }

  function drawBackground(ctx, w, h) {
    ctx.fillStyle = "#0b0b0f";
    ctx.fillRect(0, 0, w, h);
    // Faint speckle so it reads as ultrasound rather than a flat diagram.
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const a = Math.random() * 0.06;
      ctx.fillStyle = `rgba(200,205,215,${a})`;
      ctx.fillRect(x, y, 1.4, 1.4);
    }
  }

  function drawSoftTissue(ctx, w, pleuraY) {
    const grad = ctx.createLinearGradient(0, 0, 0, pleuraY);
    grad.addColorStop(0, "rgba(150,155,170,0.55)");
    grad.addColorStop(0.5, "rgba(110,115,130,0.32)");
    grad.addColorStop(1, "rgba(90,95,110,0.20)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, pleuraY);
  }

  // Ribs cast acoustic shadows; their bright convex surfaces plus the
  // pleural line between them form the bat sign used to orient the probe.
  function drawRibs(ctx, w, h, pleuraY) {
    const ribs = [{ cx: w * 0.13 }, { cx: w * 0.87 }];
    ribs.forEach(({ cx }) => {
      const rw = w * 0.18;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, pleuraY - 16, rw / 2, 9, 0, Math.PI, 2 * Math.PI);
      ctx.fillStyle = "rgba(235,238,245,0.92)";
      ctx.fill();
      // Acoustic shadow beneath the rib.
      const sg = ctx.createLinearGradient(0, pleuraY - 14, 0, h);
      sg.addColorStop(0, "rgba(0,0,0,0.94)");
      sg.addColorStop(1, "rgba(0,0,0,0.99)");
      ctx.fillStyle = sg;
      ctx.fillRect(cx - rw / 2, pleuraY - 14, rw, h - pleuraY + 14);
      ctx.restore();
    });
    return { leftEdge: w * 0.13 + w * 0.09, rightEdge: w * 0.87 - w * 0.09 };
  }

  function drawPleuralLine(ctx, x0, x1, y, opts) {
    const irregular = opts.irregular;
    ctx.save();
    ctx.lineWidth = irregular ? 3.4 : 2.6;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.shadowColor = "rgba(255,255,255,0.7)";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    if (irregular) {
      // Thickened, fragmented pleural line — the ARDS/fibrosis discriminator.
      let x = x0;
      while (x < x1) {
        const seg = 6 + Math.random() * 14;
        const dy = (Math.random() - 0.5) * 3.6;
        ctx.moveTo(x, y + dy);
        ctx.lineTo(Math.min(x + seg, x1), y + (Math.random() - 0.5) * 3.6);
        x += seg + 2 + Math.random() * 4;
      }
    } else {
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // A-lines: reverberation artifacts, evenly spaced repeats of the pleural
  // line at multiples of the skin-to-pleura distance. They mean air.
  function drawALines(ctx, x0, x1, pleuraY, h) {
    const spacing = pleuraY;
    let n = 1;
    while (pleuraY + n * spacing < h) {
      const y = pleuraY + n * spacing;
      ctx.save();
      ctx.strokeStyle = `rgba(228,234,245,${0.5 / Math.sqrt(n)})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.restore();
      n++;
    }
  }

  // B-lines: laser-like vertical artifacts arising from the pleural line,
  // extending to the bottom without fading, and erasing A-lines.
  function drawBLines(ctx, x0, x1, pleuraY, h, count, sway) {
    const span = x1 - x0;
    for (let i = 0; i < count; i++) {
      // Deterministic spacing with a little jitter so it looks scanned.
      const frac = (i + 0.5) / count;
      const jitter = Math.sin(i * 12.9898) * 0.035;
      const x = x0 + span * Math.min(Math.max(frac + jitter, 0.02), 0.98);
      const drift = Math.sin(phase * 0.9 + i) * sway;
      const grad = ctx.createLinearGradient(0, pleuraY, 0, h);
      grad.addColorStop(0, "rgba(255,255,255,0.85)");
      grad.addColorStop(0.35, "rgba(240,245,255,0.5)");
      grad.addColorStop(1, "rgba(220,230,245,0.32)");
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x - 5, pleuraY);
      ctx.lineTo(x + 5, pleuraY);
      ctx.lineTo(x + 11 + drift, h);
      ctx.lineTo(x - 11 + drift, h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }
  }

  function drawConsolidation(ctx, x0, x1, pleuraY, h) {
    const top = pleuraY + 4;
    const depth = (h - pleuraY) * 0.62;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, top);
    ctx.lineTo(x1, top);
    // Irregular deep border — the shred sign.
    let x = x1;
    while (x > x0) {
      ctx.lineTo(x, top + depth + (Math.random() - 0.5) * 26);
      x -= (x1 - x0) / 9;
    }
    ctx.closePath();
    ctx.clip();

    ctx.fillStyle = "rgba(120,126,142,0.62)";
    ctx.fillRect(x0, top, x1 - x0, depth + 30);
    // Tissue-like ("hepatised") speckle.
    for (let i = 0; i < 700; i++) {
      const px = x0 + Math.random() * (x1 - x0);
      const py = top + Math.random() * (depth + 20);
      ctx.fillStyle = `rgba(200,206,220,${Math.random() * 0.28})`;
      ctx.fillRect(px, py, 2, 2);
    }
    // Dynamic air bronchograms: bright specks that shift with the phase,
    // which is exactly what distinguishes pneumonia from atelectasis.
    for (let i = 0; i < 26; i++) {
      const bx = x0 + ((i * 37.7) % (x1 - x0));
      const by = top + 14 + ((i * 23.3) % (depth - 10));
      const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(phase * 1.4 + i));
      ctx.fillStyle = `rgba(255,255,255,${0.75 * twinkle})`;
      ctx.beginPath();
      ctx.arc(bx + Math.sin(phase + i) * 1.6, by, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEffusion(ctx, x0, x1, pleuraY, h) {
    const top = pleuraY + 6;
    const depth = (h - pleuraY) * 0.45;
    ctx.save();
    ctx.fillStyle = "rgba(4,6,12,0.96)"; // anechoic
    ctx.fillRect(x0, top, x1 - x0, depth);
    ctx.strokeStyle = "rgba(230,235,245,0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, top + depth);
    ctx.lineTo(x1, top + depth + Math.sin(phase) * 3);
    ctx.stroke();
    ctx.restore();
  }

  // The pleural line is drawn as moving granular texture when sliding is
  // present, and as a static line when it is absent. This animation is the
  // entire point of the module — frozen, the two are indistinguishable.
  function drawSlidingTexture(ctx, x0, x1, y, present, reduced) {
    if (!present) return;
    const amp = reduced ? 0.45 : 1;
    const n = 70;
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,0.55)";
    ctx.shadowBlur = 3;
    for (let i = 0; i < n; i++) {
      const base = x0 + ((x1 - x0) * i) / n;
      const shift = Math.sin(phase * 2.2 + i * 0.7) * 3.4 * amp;
      ctx.fillStyle = `rgba(255,255,255,${0.18 + 0.3 * Math.abs(Math.sin(phase * 2 + i))})`;
      ctx.fillRect(base + shift, y - 1.1, 2.1, 2.2);
    }
    ctx.restore();
  }

  function drawLungPoint(ctx, x0, x1, pleuraY, h) {
    const mid = (x0 + x1) / 2;
    // Left half: normal sliding lung. Right half: pneumothorax, no sliding.
    drawALines(ctx, x0, x1, pleuraY, h);
    drawSlidingTexture(ctx, x0, mid, pleuraY, true, false);
    ctx.save();
    ctx.strokeStyle = "rgba(255,196,84,0.95)";
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mid, pleuraY - 26);
    ctx.lineTo(mid, h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,196,84,0.95)";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("LUNG POINT", mid, pleuraY - 32);
    ctx.textAlign = "left";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillStyle = "rgba(220,230,245,0.8)";
    ctx.fillText("sliding", x0 + 6, h - 8);
    ctx.textAlign = "right";
    ctx.fillText("no sliding", x1 - 6, h - 8);
    ctx.restore();
  }

  function drawLabel(ctx, w, h, text) {
    ctx.save();
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(150,220,255,0.9)";
    ctx.fillText(text, 8, 16);
    ctx.restore();
  }

  function renderCanvas() {
    const canvas = document.getElementById("us-canvas");
    if (!canvas || !lastCtx) return;
    const { ctx, w, h } = prep(canvas);
    const prof = profileFor(lastCtx.scenarioId);
    const pattern = zone === "anterior" ? prof.anterior : prof.lateral;
    const pleuraY = Math.round(h * 0.26);

    drawBackground(ctx, w, h);
    drawSoftTissue(ctx, w, pleuraY);
    const { leftEdge, rightEdge } = drawRibs(ctx, w, h, pleuraY);

    const irregular = pattern === "b-lines" || pattern === "consolidation" ||
      lastCtx.scenarioId === "fibrosis";

    if (pattern === "lung-point") {
      drawPleuralLine(ctx, leftEdge, rightEdge, pleuraY, { irregular: false });
      drawLungPoint(ctx, leftEdge, rightEdge, pleuraY, h);
      drawLabel(ctx, w, h, "Lung point — pathognomonic for pneumothorax");
    } else if (pattern === "pneumothorax") {
      drawALines(ctx, leftEdge, rightEdge, pleuraY, h);
      drawPleuralLine(ctx, leftEdge, rightEdge, pleuraY, { irregular: false });
      // Deliberately no sliding texture: the still image looks normal.
      drawLabel(ctx, w, h, "A-lines, NO lung sliding — looks normal frozen");
    } else if (pattern === "consolidation") {
      drawPleuralLine(ctx, leftEdge, rightEdge, pleuraY, { irregular: true });
      drawConsolidation(ctx, leftEdge, rightEdge, pleuraY, h);
      drawSlidingTexture(ctx, leftEdge, rightEdge, pleuraY, prof.sliding, true);
      drawLabel(ctx, w, h, "Consolidation with dynamic air bronchograms");
    } else if (pattern === "effusion") {
      drawPleuralLine(ctx, leftEdge, rightEdge, pleuraY, { irregular: false });
      drawEffusion(ctx, leftEdge, rightEdge, pleuraY, h);
      drawLabel(ctx, w, h, "Anechoic pleural effusion");
    } else if (pattern === "b-lines" || pattern === "b-lines-dense") {
      // B-line count responds to the live recruitment state, so PEEP
      // titration visibly clears (or fails to clear) the lung.
      const base = pattern === "b-lines-dense" ? 9 : 6;
      const count = Math.max(1, Math.round(base * lastCtx.bLineScale));
      drawBLines(ctx, leftEdge, rightEdge, pleuraY, h, count, 1.8);
      drawPleuralLine(ctx, leftEdge, rightEdge, pleuraY, { irregular });
      drawSlidingTexture(ctx, leftEdge, rightEdge, pleuraY, prof.sliding, prof.slidingReduced);
      drawLabel(ctx, w, h, `B-lines (${count} in this window)`);
    } else {
      drawALines(ctx, leftEdge, rightEdge, pleuraY, h);
      drawPleuralLine(ctx, leftEdge, rightEdge, pleuraY, { irregular: false });
      drawSlidingTexture(ctx, leftEdge, rightEdge, pleuraY, prof.sliding, prof.slidingReduced);
      drawLabel(ctx, w, h, "A-lines with lung sliding");
    }
  }

  function loop() {
    if (!animating) { rafId = null; return; }
    phase += 0.045;
    renderCanvas();
    rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (rafId === null && animating) rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  // -----------------------------------------------------------------------
  // Public render: called from the main simulator's render loop.
  // -----------------------------------------------------------------------
  function render(scenarioId, scenario, r) {
    const panel = document.getElementById("ultrasound-panel");
    if (!panel) return;
    const prof = profileFor(scenarioId);

    // More recruitment (and less shunt) => fewer B-lines, which is the
    // physiological basis of ultrasound-guided PEEP titration. Scenarios
    // with little recruitable lung barely move, which is the lesson.
    const recruited = r ? r.recruitedFraction : 0;
    const bLineScale = Math.max(0.15, 1 - recruited * 0.9);
    lastCtx = { scenarioId, bLineScale };

    // The static text only changes with the scenario, but render() runs on
    // every slider tick — skip rebuilding the list during a drag.
    const scenarioChanged = renderedScenarioId !== scenarioId;
    renderedScenarioId = scenarioId;

    if (scenarioChanged) {
      document.getElementById("us-profile").textContent = prof.profile;
      document.getElementById("us-teaching").textContent = prof.teaching;

      const list = document.getElementById("us-findings");
      list.innerHTML = "";
      prof.findings.forEach((f) => {
        const li = document.createElement("li");
        li.textContent = f;
        list.appendChild(li);
      });
    }

    const slidingEl = document.getElementById("us-sliding-status");
    if (!prof.sliding) {
      slidingEl.className = "us-sliding us-sliding-absent";
      slidingEl.textContent = "Lung sliding: ABSENT — the artifacts below look normal; only the missing motion gives it away.";
    } else if (prof.slidingReduced) {
      slidingEl.className = "us-sliding us-sliding-reduced";
      slidingEl.textContent = "Lung sliding: reduced but present over affected areas.";
    } else {
      slidingEl.className = "us-sliding us-sliding-present";
      slidingEl.textContent = "Lung sliding: present — excludes pneumothorax at this spot.";
    }

    // B-line responsiveness note, driven by the live engine values.
    const dyn = document.getElementById("us-dynamic");
    const usesBLines = (zone === "anterior" ? prof.anterior : prof.lateral).indexOf("b-lines") === 0;
    if (usesBLines && r) {
      dyn.hidden = false;
      dyn.textContent = `At the current settings ${(recruited * 100).toFixed(0)}% of the recruitable lung is open, so the B-line density shown reflects that. Change PEEP and watch this window: in a recruitable lung the B-lines clear, which is how ultrasound-guided PEEP titration works. In a consolidated or fibrotic lung they will barely move.`;
    } else {
      dyn.hidden = true;
    }

    const ev = document.getElementById("us-evidence");
    const M = window.MVSIM;
    if (ev.children.length === 0 && M && M.EVIDENCE) {
      EVIDENCE_KEYS.forEach((k) => {
        const e = M.EVIDENCE[k];
        if (!e) return;
        const span = document.createElement("span");
        span.className = "evidence-tag";
        span.textContent = e.name;
        span.title = e.detail;
        ev.appendChild(span);
      });
    }

    renderCanvas();
    startLoop();
  }

  function initControls() {
    const panel = document.getElementById("ultrasound-panel");
    if (!panel) return;

    document.querySelectorAll("[data-us-zone]").forEach((btn) => {
      btn.addEventListener("click", () => {
        zone = btn.getAttribute("data-us-zone");
        document.querySelectorAll("[data-us-zone]").forEach((b) => {
          b.setAttribute("aria-pressed", String(b === btn));
        });
        const live = window.MVSIM && window.MVSIM._lastRender;
        if (live) render(live.scenarioId, live.scenario, live.r);
      });
    });

    const playBtn = document.getElementById("us-play-btn");
    if (playBtn) {
      playBtn.addEventListener("click", () => {
        animating = !animating;
        playBtn.setAttribute("aria-pressed", String(animating));
        playBtn.textContent = animating ? "⏸ Freeze image" : "▶ Resume (show sliding)";
        if (animating) startLoop(); else { stopLoop(); renderCanvas(); }
      });
    }

    // Don't burn frames while the panel is scrolled out of view.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) startLoop(); else stopLoop();
        });
      }, { threshold: 0.05 }).observe(panel);
    }
  }

  document.addEventListener("DOMContentLoaded", initControls);
  window.renderUltrasound = render;
})();
