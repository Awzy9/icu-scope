(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Chest radiograph module.
  //
  // These are SCHEMATIC radiographs drawn on a canvas, not photographs, and
  // the panel says so plainly. Two reasons that is the right call here:
  //
  //   1. Licensing. Real teaching radiographs (Radiopaedia and similar) are
  //      CC BY-NC-SA, whose non-commercial and share-alike terms would attach
  //      themselves to this whole project, and whose terms specifically
  //      exclude assembling numerous cases into comparable content. We link
  //      out to the real cases instead, which is what linking is for.
  //   2. Pedagogy. The findings here have to CHANGE with the patient. A
  //      photograph is one frozen moment; a drawn film can respond to
  //      recruitment, lung volume and the current pathology, so adding PEEP
  //      to a recruitable lung visibly clears the infiltrate the same way it
  //      clears the B-lines in the ultrasound panel.
  //
  // Real radiographs ARE supported. Register a properly licensed image in
  // cxr-images.js and it replaces the schematic for that scenario, with its
  // attribution rendered underneath. The manifest requires the licence and
  // source fields, so an image cannot be shown without its citation.
  // ---------------------------------------------------------------------

  const FILMS = {
    normal: {
      title: "Clear lung fields",
      infiltrate: 0, pattern: "clear", cardiomegaly: false, hyperinflated: false,
      findings: [
        "Clear, symmetrically aerated lung fields",
        "Normal cardiothoracic ratio (<0.5)",
        "Sharp costophrenic angles, normally domed diaphragms",
      ],
      teaching: "Worth knowing well: most of the value of a portable ICU film is comparison against the previous one. A single film rarely makes a diagnosis on its own.",
      search: "normal chest radiograph",
    },
    ardsMild: { ref: "ards" },
    ardsModerate: { ref: "ards" },
    ardsSevere: { ref: "ards" },
    covidArds: {
      title: "Bilateral peripheral opacities",
      infiltrate: 0.7, pattern: "peripheral", cardiomegaly: false, hyperinflated: false,
      findings: [
        "Bilateral, predominantly PERIPHERAL and basal opacities",
        "Normal cardiac silhouette and no effusions",
        "Progression over days rather than hours",
      ],
      teaching: "The peripheral, basal distribution with a normal heart size is the characteristic pattern. As with any ARDS, the radiograph lags the physiology — the P/F ratio moves before the film does.",
      search: "COVID-19 chest radiograph",
    },
    copd: {
      title: "Hyperinflation",
      infiltrate: 0, pattern: "clear", cardiomegaly: false, hyperinflated: true,
      findings: [
        "Hyperinflated, hyperlucent lungs with more than 6 anterior ribs visible",
        "FLATTENED diaphragms — the most reliable single sign",
        "Narrow, vertically oriented cardiac silhouette",
        "Increased retrosternal air space on the lateral projection",
      ],
      teaching: "Flat diaphragms are the sign to look for. In a ventilated obstructive patient a rising degree of hyperinflation on serial films should prompt you to look for auto-PEEP rather than to add more PEEP.",
      search: "COPD hyperinflation chest radiograph",
    },
    edema: {
      title: "Cardiogenic pulmonary oedema",
      infiltrate: 0.75, pattern: "perihilar", cardiomegaly: true, effusion: true,
      findings: [
        "Perihilar \"bat-wing\" alveolar opacities",
        "CARDIOMEGALY (cardiothoracic ratio >0.5) — the key discriminator from ARDS",
        "Upper-lobe blood diversion, septal (Kerley B) lines",
        "Bilateral pleural effusions blunting the costophrenic angles",
      ],
      teaching: "Cardiomegaly, effusions and a perihilar distribution point to a cardiogenic cause; ARDS classically shows a normal heart size with peripheral, patchy opacities. The other discriminator is time — cardiogenic oedema clears within hours of diuresis, ARDS does not.",
      search: "cardiogenic pulmonary oedema chest radiograph",
    },
    pneumonia: {
      title: "Lobar consolidation",
      infiltrate: 0.85, pattern: "lobar", cardiomegaly: false,
      findings: [
        "Dense, well-demarcated LOBAR opacity respecting a fissure",
        "Air bronchograms within the consolidation",
        "Silhouette sign — loss of the adjacent cardiac or diaphragmatic border localises the lobe",
        "May have an associated parapneumonic effusion",
      ],
      teaching: "The silhouette sign localises the lobe: an opacity that obscures the right heart border sits in the right middle lobe, while one that obscures the right hemidiaphragm sits in the lower lobe. Consolidated lung is not recruitable, which is why PEEP does relatively little here.",
      search: "lobar pneumonia consolidation chest radiograph",
    },
    fibrosis: {
      title: "Reticular interstitial pattern",
      infiltrate: 0.55, pattern: "reticular", cardiomegaly: false, lowVolume: true,
      findings: [
        "Coarse reticular / reticulonodular pattern, basal and peripheral predominance",
        "REDUCED lung volumes — the diaphragms sit high",
        "Honeycombing in advanced disease",
        "No effusion, normal heart size",
      ],
      teaching: "Reduced lung volumes with a reticular pattern separates fibrosis from ARDS, where volumes are preserved early. Small volumes plus stiff lungs mean the driving pressure climbs fast for any given tidal volume.",
      search: "pulmonary fibrosis chest radiograph",
    },
    neuromuscular: {
      title: "Low volumes, clear lungs",
      infiltrate: 0.12, pattern: "basal", cardiomegaly: false, lowVolume: true,
      findings: [
        "Clear lung parenchyma — the lungs themselves are normal",
        "Low lung volumes with raised hemidiaphragms",
        "Basal subsegmental atelectasis from poor inspiratory effort",
      ],
      teaching: "The film is essentially normal apart from small volumes, which is the point: the failure is of the respiratory pump, not the lung. Fluoroscopic or ultrasound assessment of diaphragm movement is the more informative study.",
      search: "diaphragmatic weakness chest radiograph",
    },
    obesity: {
      title: "Basal atelectasis, low volumes",
      infiltrate: 0.35, pattern: "basal", cardiomegaly: false, lowVolume: true,
      findings: [
        "Dependent basal atelectasis, worse at the bases",
        "Reduced lung volumes from chest-wall and abdominal loading",
        "Technically difficult film — soft tissue reduces penetration",
      ],
      teaching: "The basal collapse here is recruitable, unlike consolidation, which is why higher PEEP and reverse Trendelenburg positioning both help. Watch the atelectasis clear as PEEP rises.",
      search: "basal atelectasis chest radiograph",
    },
    pe: {
      title: "Normal film — the key negative",
      infiltrate: 0.05, pattern: "clear", cardiomegaly: false,
      findings: [
        "USUALLY NORMAL despite severe hypoxemia — the most important finding",
        "Occasionally a peripheral wedge-shaped opacity (Hampton hump)",
        "Occasionally regional oligaemia (Westermark sign)",
        "A normal radiograph in a profoundly hypoxemic patient should raise, not lower, suspicion",
      ],
      teaching: "A clear film in a patient this hypoxemic is a finding in itself, and mirrors the A-profile on the ultrasound panel. The diagnosis is made on CT pulmonary angiography and echocardiography, not on plain film.",
      search: "pulmonary embolism chest radiograph Hampton hump",
    },
    traumaFlail: {
      title: "Contusion with rib fractures",
      infiltrate: 0.6, pattern: "unilateral", cardiomegaly: false, ribFractures: true,
      findings: [
        "Unilateral patchy opacity from pulmonary contusion, not respecting fissures",
        "Multiple rib fractures, often with a flail segment",
        "Actively exclude pneumothorax and haemothorax on every trauma film",
        "Contusion appears within 6 hours and resolves over days",
      ],
      teaching: "Contusion crosses fissures, which distinguishes it from lobar pneumonia. Supine trauma films are insensitive for pneumothorax — air collects anteriorly and may only show as a deep sulcus sign, which is why ultrasound outperforms plain film here.",
      search: "pulmonary contusion flail chest radiograph",
    },
    pneumothorax: {
      title: "Pneumothorax",
      infiltrate: 0, pattern: "pneumothorax", cardiomegaly: false,
      findings: [
        "Visible visceral PLEURAL LINE with no lung markings beyond it",
        "Hyperlucent hemithorax",
        "Under tension: mediastinal shift AWAY, depressed hemidiaphragm",
        "Deep sulcus sign on a supine film",
      ],
      teaching: "Tension pneumothorax is a clinical diagnosis treated immediately — waiting for the film is the classic error. On a supine ICU film air collects anteriorly and basally, producing a deep sulcus rather than the obvious apical rim seen on an erect film.",
      search: "tension pneumothorax chest radiograph deep sulcus",
    },
    bpf: {
      title: "Hydropneumothorax with drain",
      infiltrate: 0.3, pattern: "hydropneumothorax", cardiomegaly: false,
      findings: [
        "Persistent pleural air despite a chest drain",
        "Air-fluid level in the pleural space",
        "Drain visible with its tip in the pleural cavity",
        "Adjacent parenchymal disease at the fistula site",
      ],
      teaching: "The film shows the consequence; the fistula is diagnosed at the drain by a continuous bubbling air leak. The ventilator goal is the lowest airway pressure that maintains adequate gas exchange, because every cmH₂O drives more flow through the leak.",
      search: "bronchopleural fistula hydropneumothorax radiograph",
    },
  };

  FILMS.ards = {
    title: "Bilateral diffuse alveolar opacities",
    infiltrate: 0.8, pattern: "diffuse", cardiomegaly: false,
    findings: [
      "Bilateral, patchy, diffuse alveolar opacities involving all four quadrants",
      "NORMAL cardiac silhouette — no cardiomegaly",
      "Usually no significant pleural effusions",
      "Air bronchograms; preserved lung volumes early on",
      "Appears 12–24 h after the insult and persists for days to weeks",
    ],
    teaching: "The Berlin definition requires bilateral opacities not fully explained by effusion, collapse or nodules, and not fully explained by cardiac failure or fluid overload. A normal heart size and absent effusions are what separate this from cardiogenic oedema — and unlike cardiogenic oedema, it will not clear with diuresis.",
    search: "ARDS chest radiograph",
  };

  function filmFor(id) {
    const f = FILMS[id];
    if (!f) return FILMS.normal;
    return f.ref ? FILMS[f.ref] : f;
  }

  let last = null;   // { scenarioId, aeration, volume }
  let rendered = null;

  function prep(canvas) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 260);
    const h = canvas.height || 340;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx, w, h };
  }

  // Radiographic convention: air black, soft tissue grey, bone white.
  function drawFilm(ctx, w, h, film, aeration, volume) {
    ctx.fillStyle = "#07070a";
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const top = h * 0.10;
    const apex = h * 0.14;
    // Diaphragm sits lower with hyperinflation, higher with low volumes.
    let diaph = h * (0.72 + volume * 0.10);
    if (film.lowVolume) diaph = h * 0.64;
    const halfW = w * 0.30;

    // --- Lung fields ---------------------------------------------------
    function lungPath(side) {
      const s = side; // -1 left of image, +1 right
      ctx.beginPath();
      ctx.moveTo(cx + s * w * 0.045, apex + 8);
      ctx.quadraticCurveTo(cx + s * halfW * 1.05, apex - 4, cx + s * halfW, h * 0.42);
      ctx.quadraticCurveTo(cx + s * halfW * 1.02, diaph - 12, cx + s * w * 0.30, diaph);
      ctx.quadraticCurveTo(cx + s * w * 0.16, diaph + (film.hyperinflated ? 6 : 10), cx + s * w * 0.05, diaph - h * 0.04);
      ctx.closePath();
    }

    [-1, 1].forEach((side) => {
      lungPath(side);
      ctx.save();
      ctx.clip();
      // Base aeration: darker = better aerated.
      const g = ctx.createLinearGradient(0, apex, 0, diaph);
      const baseDark = film.hyperinflated ? 8 : 20;
      g.addColorStop(0, `rgb(${baseDark},${baseDark},${baseDark + 3})`);
      g.addColorStop(1, `rgb(${baseDark + 10},${baseDark + 10},${baseDark + 13})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      drawPattern(ctx, w, h, cx, side, apex, diaph, halfW, film, aeration);
      ctx.restore();

      // Vascular markings (absent in pneumothorax zone, sparse in COPD)
      if (film.pattern !== "pneumothorax" || side < 0) {
        drawVessels(ctx, cx, side, apex, diaph, halfW, film);
      }
    });

    drawRibs(ctx, w, h, cx, apex, diaph, halfW, film);
    drawMediastinum(ctx, w, h, cx, apex, diaph, film);
    drawDiaphragm(ctx, w, h, cx, diaph, film);
    if (film.pattern === "pneumothorax" || film.pattern === "hydropneumothorax") {
      drawPneumothorax(ctx, w, h, cx, apex, diaph, halfW, film);
    }
    if (film.ribFractures) drawRibFractures(ctx, w, h, cx, apex, diaph);
  }

  function drawPattern(ctx, w, h, cx, side, apex, diaph, halfW, film, aeration) {
    const intensity = film.infiltrate * aeration;
    if (intensity <= 0.02) return;
    const alpha = 0.10 + intensity * 0.42;
    const midY = (apex + diaph) / 2;

    if (film.pattern === "perihilar") {
      // Bat-wing: dense centrally, fading peripherally.
      const g = ctx.createRadialGradient(cx + side * w * 0.15, midY, 6, cx + side * w * 0.15, midY, halfW * 0.95);
      g.addColorStop(0, `rgba(232,236,245,${alpha})`);
      g.addColorStop(0.55, `rgba(210,216,228,${alpha * 0.5})`);
      g.addColorStop(1, "rgba(200,210,225,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Kerley B lines: short horizontal septal lines at the periphery.
      ctx.strokeStyle = `rgba(240,244,252,${alpha * 0.8})`;
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 7; i++) {
        const y = diaph - 14 - i * 9;
        const x = cx + side * (halfW - 6);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - side * 16, y);
        ctx.stroke();
      }
    } else if (film.pattern === "peripheral") {
      const g = ctx.createRadialGradient(cx + side * w * 0.10, midY, halfW * 0.25, cx + side * w * 0.10, midY, halfW * 1.15);
      g.addColorStop(0, "rgba(200,210,225,0)");
      g.addColorStop(0.6, `rgba(226,232,242,${alpha * 0.75})`);
      g.addColorStop(1, `rgba(236,240,248,${alpha})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, cx, side, midY + h * 0.10, halfW, alpha, 9, 0.85);
    } else if (film.pattern === "lobar") {
      // One dense lobe only, with air bronchograms.
      if (side > 0) {
        ctx.fillStyle = `rgba(236,240,248,${Math.min(alpha * 1.5, 0.75)})`;
        ctx.beginPath();
        ctx.moveTo(cx + w * 0.05, apex + h * 0.16);
        ctx.lineTo(cx + halfW, apex + h * 0.20);
        ctx.lineTo(cx + halfW * 0.92, diaph - 6);
        ctx.lineTo(cx + w * 0.06, diaph - 10);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(20,20,26,0.85)";
        ctx.lineWidth = 2.2;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(cx + w * 0.08, apex + h * 0.20 + i * 12);
          ctx.quadraticCurveTo(cx + w * 0.17, apex + h * 0.22 + i * 13, cx + w * 0.24, apex + h * 0.21 + i * 15);
          ctx.stroke();
        }
      }
    } else if (film.pattern === "unilateral") {
      if (side > 0) blotches(ctx, cx, side, midY, halfW, Math.min(alpha * 1.4, 0.7), 12, 1.0);
    } else if (film.pattern === "reticular") {
      ctx.strokeStyle = `rgba(226,232,242,${alpha * 0.75})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 90; i++) {
        const x = cx + side * (w * 0.05 + Math.random() * (halfW - 6));
        const y = apex + 20 + Math.random() * (diaph - apex - 24);
        const bias = (y - apex) / (diaph - apex); // basal predominance
        if (Math.random() > bias * 0.9 + 0.15) continue;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() - 0.5) * 13, y + (Math.random() - 0.5) * 13);
        ctx.stroke();
      }
    } else if (film.pattern === "basal") {
      const g = ctx.createLinearGradient(0, diaph - h * 0.16, 0, diaph);
      g.addColorStop(0, "rgba(220,228,240,0)");
      g.addColorStop(1, `rgba(232,238,246,${Math.min(alpha * 1.6, 0.6)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (film.pattern === "diffuse") {
      ctx.fillStyle = `rgba(224,230,242,${alpha * 0.55})`;
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, cx, side, midY, halfW, alpha, 14, 1.0);
    } else if (film.pattern === "hydropneumothorax" && side > 0) {
      ctx.fillStyle = `rgba(230,236,246,${alpha})`;
      ctx.fillRect(cx, diaph - h * 0.12, halfW, h * 0.12);
    }
  }

  function blotches(ctx, cx, side, midY, halfW, alpha, n, spread) {
    for (let i = 0; i < n; i++) {
      const a = (i * 2.39996);
      const rad = halfW * 0.72 * Math.sqrt((i + 0.5) / n) * spread;
      const x = cx + side * (Math.abs(Math.cos(a)) * rad + halfW * 0.12);
      const y = midY + Math.sin(a) * rad * 0.95;
      const r = 12 + (i % 4) * 6;
      const g = ctx.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, `rgba(238,242,250,${alpha * 0.85})`);
      g.addColorStop(1, "rgba(230,236,246,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawVessels(ctx, cx, side, apex, diaph, halfW, film) {
    ctx.save();
    ctx.strokeStyle = film.hyperinflated ? "rgba(150,158,175,0.30)" : "rgba(178,186,204,0.50)";
    const hilum = { x: cx + side * (halfW * 0.30), y: apex + (diaph - apex) * 0.42 };
    for (let i = 0; i < 7; i++) {
      const ang = (-0.75 + (i / 6) * 1.7);
      ctx.lineWidth = 2.4 - i * 0.18;
      ctx.beginPath();
      ctx.moveTo(hilum.x, hilum.y);
      const len = halfW * (0.55 + (i % 3) * 0.14);
      ctx.quadraticCurveTo(
        hilum.x + side * len * 0.5, hilum.y + Math.sin(ang) * len * 0.55,
        hilum.x + side * len, hilum.y + Math.sin(ang) * len
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRibs(ctx, w, h, cx, apex, diaph, halfW, film) {
    ctx.save();
    ctx.strokeStyle = "rgba(228,232,242,0.30)";
    ctx.lineWidth = 2.8;
    const n = film.hyperinflated ? 9 : 7;
    for (let side of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const y = apex + 8 + i * ((diaph - apex) / (n + 0.4));
        ctx.beginPath();
        ctx.moveTo(cx + side * w * 0.035, y);
        ctx.quadraticCurveTo(cx + side * halfW * 0.75, y - 12, cx + side * halfW * 1.02, y + 16);
        ctx.stroke();
      }
    }
    // Clavicles
    ctx.strokeStyle = "rgba(236,240,248,0.55)";
    ctx.lineWidth = 4;
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(cx + side * w * 0.03, apex - 2);
      ctx.quadraticCurveTo(cx + side * w * 0.16, apex - 12, cx + side * w * 0.30, apex + 2);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawMediastinum(ctx, w, h, cx, apex, diaph, film) {
    ctx.save();
    // Spine / trachea column
    ctx.fillStyle = "rgba(150,156,172,0.30)";
    ctx.fillRect(cx - w * 0.022, apex - 10, w * 0.044, diaph - apex + 10);
    // Trachea (air column, dark)
    ctx.fillStyle = "rgba(10,10,14,0.85)";
    ctx.fillRect(cx - w * 0.012, apex - 10, w * 0.024, (diaph - apex) * 0.34);

    // Cardiac silhouette — width is the discriminator that matters.
    const heartW = film.cardiomegaly ? w * 0.25 : film.hyperinflated ? w * 0.13 : w * 0.175;
    const heartTop = apex + (diaph - apex) * 0.50;
    const heartH = (diaph - heartTop) * (film.hyperinflated ? 0.86 : 0.94);
    // Semi-transparent so an overlying infiltrate still reads through it,
    // the way a real silhouette sign does.
    ctx.fillStyle = "rgba(192,199,215,0.72)";
    ctx.beginPath();
    ctx.ellipse(cx - heartW * 0.10, heartTop + heartH * 0.50, heartW * 0.55, heartH * 0.56, -0.10, 0, Math.PI * 2);
    ctx.fill();
    // Aortic knuckle
    ctx.beginPath();
    ctx.ellipse(cx - w * 0.038, heartTop - 4, w * 0.026, h * 0.018, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawDiaphragm(ctx, w, h, cx, diaph, film) {
    ctx.save();
    // Abdomen below the diaphragm: dense, but it must not out-shine the
    // mediastinum or it pulls the eye away from the lungs entirely.
    const ag = ctx.createLinearGradient(0, diaph - 10, 0, h);
    ag.addColorStop(0, "rgba(150,157,174,0.62)");
    ag.addColorStop(1, "rgba(96,102,116,0.42)");
    ctx.fillStyle = ag;
    [-1, 1].forEach((side) => {
      const domeH = film.hyperinflated ? 5 : film.lowVolume ? 20 : 13;
      const yOff = side < 0 ? 0 : -6; // right hemidiaphragm slightly higher
      ctx.beginPath();
      ctx.moveTo(cx + side * w * 0.02, diaph + yOff);
      ctx.bezierCurveTo(
        cx + side * w * 0.13, diaph - domeH + yOff,
        cx + side * w * 0.25, diaph - domeH * 0.8 + yOff,
        cx + side * w * 0.335, diaph + 8 + yOff
      );
      ctx.lineTo(cx + side * w * 0.37, h);
      ctx.lineTo(cx + side * w * 0.01, h);
      ctx.closePath();
      ctx.fill();
    });
    // Blunted costophrenic angles when there is an effusion.
    if (film.effusion) {
      ctx.fillStyle = "rgba(198,205,220,0.72)";
      [-1, 1].forEach((side) => {
        const yOff = side < 0 ? 0 : -6;
        ctx.beginPath();
        ctx.moveTo(cx + side * w * 0.335, diaph - 26 + yOff);
        ctx.quadraticCurveTo(cx + side * w * 0.315, diaph - 4 + yOff, cx + side * w * 0.225, diaph + 4 + yOff);
        ctx.lineTo(cx + side * w * 0.345, diaph + 8 + yOff);
        ctx.closePath();
        ctx.fill();
      });
    }
    ctx.restore();
  }

  function drawPneumothorax(ctx, w, h, cx, apex, diaph, halfW, film) {
    ctx.save();
    // Right hemithorax: collapsed lung edge with lucent space beyond it.
    const edgeX = cx + halfW * 0.52;
    ctx.fillStyle = "#050508";
    ctx.beginPath();
    ctx.moveTo(edgeX, apex + 6);
    ctx.quadraticCurveTo(cx + halfW * 1.0, (apex + diaph) / 2, cx + halfW * 0.86, diaph - 4);
    ctx.lineTo(cx + halfW * 1.08, diaph);
    ctx.lineTo(cx + halfW * 1.08, apex);
    ctx.closePath();
    ctx.fill();
    // The visceral pleural line itself.
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(edgeX, apex + 6);
    ctx.quadraticCurveTo(cx + halfW * 1.0, (apex + diaph) / 2, cx + halfW * 0.86, diaph - 4);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,196,84,0.95)";
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.fillText("pleural line", edgeX + 4, apex + 22);
    if (film.pattern === "hydropneumothorax") {
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.moveTo(cx + halfW * 0.5, diaph - h * 0.12);
      ctx.lineTo(cx + halfW * 1.06, diaph - h * 0.12);
      ctx.stroke();
      ctx.fillText("air–fluid level", cx + halfW * 0.5, diaph - h * 0.13);
      // Chest drain
      ctx.strokeStyle = "rgba(240,244,252,0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + halfW * 1.12, diaph - h * 0.03);
      ctx.lineTo(cx + halfW * 0.6, apex + h * 0.16);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRibFractures(ctx, w, h, cx, apex, diaph) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,150,120,0.95)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const y = apex + (diaph - apex) * (0.30 + i * 0.14);
      const x = cx + w * 0.24 + i * 4;
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 4);
      ctx.lineTo(x + 5, y + 5);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,150,120,0.95)";
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.fillText("rib fractures", cx + w * 0.16, apex + (diaph - apex) * 0.24);
    ctx.restore();
  }

  function draw() {
    const canvas = document.getElementById("cxr-canvas");
    if (!canvas || !last || canvas.hidden) return;
    const { ctx, w, h } = prep(canvas);
    drawFilm(ctx, w, h, filmFor(last.scenarioId), last.aeration, last.volume);
  }

  // A registered image must carry its attribution; anything missing the
  // licence or source is treated as unusable rather than shown uncredited.
  function registeredImage(scenarioId) {
    const reg = window.CXR_IMAGES && window.CXR_IMAGES[scenarioId];
    if (!reg || !reg.src) return null;
    if (!reg.licence || !reg.sourceUrl) {
      console.warn(`cxr-images.js: "${scenarioId}" is missing licence or sourceUrl — not displaying it uncredited.`);
      return null;
    }
    return reg;
  }

  function showImage(reg) {
    const canvas = document.getElementById("cxr-canvas");
    const img = document.getElementById("cxr-photo");
    const cred = document.getElementById("cxr-credit");
    canvas.hidden = true;
    img.hidden = false;
    img.src = reg.src;
    img.alt = reg.title || "Chest radiograph";
    cred.hidden = false;
    const author = reg.author ? `${reg.author}, ` : "";
    const lic = reg.licenceUrl
      ? `<a href="${reg.licenceUrl}" target="_blank" rel="noopener noreferrer">${reg.licence}</a>`
      : reg.licence;
    cred.innerHTML = `Image: ${author}<a href="${reg.sourceUrl}" target="_blank" rel="noopener noreferrer">${reg.title || "source"}</a> — ${lic}`;
    document.getElementById("cxr-schematic-note").hidden = true;
  }

  function showSchematic() {
    const canvas = document.getElementById("cxr-canvas");
    const img = document.getElementById("cxr-photo");
    canvas.hidden = false;
    img.hidden = true;
    img.removeAttribute("src");
    document.getElementById("cxr-credit").hidden = true;
    document.getElementById("cxr-schematic-note").hidden = false;
    draw();
  }

  function render(scenarioId, scenario, r, state) {
    const panel = document.getElementById("cxr-panel");
    if (!panel) return;
    const film = filmFor(scenarioId);

    // Recruitment clears the infiltrate; lung volume moves the diaphragms.
    // Same coupling as the ultrasound B-lines, for the same reason: the
    // radiograph should answer to the ventilator, not sit there as a picture.
    const aeration = Math.max(0.25, 1 - r.recruitedFraction * 0.6);
    const volume = Math.min(1, Math.max(0, (r.totalPeep - 4) / 18));
    last = { scenarioId, aeration, volume };

    if (rendered !== scenarioId) {
      rendered = scenarioId;
      document.getElementById("cxr-title").textContent = film.title;
      document.getElementById("cxr-teaching").textContent = film.teaching;
      const ul = document.getElementById("cxr-findings");
      ul.innerHTML = "";
      film.findings.forEach((f) => {
        const li = document.createElement("li");
        li.textContent = f;
        ul.appendChild(li);
      });
      const link = document.getElementById("cxr-real-link");
      link.href = "https://radiopaedia.org/search?q=" + encodeURIComponent(film.search) + "&scope=cases";
      link.textContent = `See real cases of this on Radiopaedia: “${film.search}” →`;
    }

    const reg = registeredImage(scenarioId);
    if (reg) showImage(reg); else showSchematic();

    const dyn = document.getElementById("cxr-dynamic");
    if (film.infiltrate > 0.2 && !reg) {
      dyn.hidden = false;
      dyn.textContent = `Aeration tracks the engine: ${(r.recruitedFraction * 100).toFixed(0)}% of the recruitable lung is currently open, and the opacity shown reflects that. Change PEEP and watch the film — a recruitable lung clears, a consolidated or fibrotic one will not.`;
    } else {
      dyn.hidden = true;
    }

  }

  window.addEventListener("resize", draw);
  window.renderCXR = render;
})();
