# Mechanical Ventilation Simulator

An interactive, evidence-based educational platform for critical care.

Adjust ventilator settings and immediately see the predicted effects on respiratory mechanics,
gas exchange, waveforms, and hemodynamics — with explanations anchored to major ICU guidelines
and landmark clinical trials.

> ⚠️ **Educational tool only — not for clinical decision-making.**
> Physiology relationships are simplified for teaching and do not model any real patient.
> Never use this to guide actual ventilator settings.

## Why this exists

Most ventilator simulators teach you **which buttons to press**. This one aims to teach **why the
physiology changes** — so clinicians understand not just how to ventilate a patient, but why a given
strategy improves or worsens outcomes.

It is intended for medical students, residents, fellows, intensivists, emergency physicians,
anaesthetists, respiratory therapists, and critical care educators.

## Current features

**Seven ventilation modes**, grouped into invasive and non-invasive — Volume Control (AC/VC, tidal volume is the direct input), Pressure
Control (AC/PC, inspiratory pressure is the direct input and Vt is derived from compliance —
watch delivered Vt, not just the set pressure), and Pressure Support/CPAP (patient-triggered and
patient-cycled: only PEEP/CPAP and PS are set, rate and Vt emerge from the scenario's respiratory
muscle reserve and lung mechanics, the same model driving the weaning simulator's SBT). PSV mode
surfaces a specific teaching point: the displayed driving pressure doesn't include the patient's
own inspiratory effort, so a P-SILI-risk alert fires when the *true* transpulmonary driving
pressure (PS + effort) is high even though the set PS alone looks safe.

*SIMV + Pressure Support* adds mandatory volume-targeted breaths with patient-triggered supported
breaths in between: lowering the SIMV rate visibly shifts ventilation onto the patient, and a
weak patient (e.g. the neuromuscular scenario) can be seen failing to make up the difference.
Reported pressures come from the mandatory breath, which is the pressure-limiting one — a
rate-blended average would understate the real plateau. The mode also carries the evidence that
SIMV rate-reduction weaning was *slower* than pressure support or daily SBTs.

*APRV / BiLevel* is modeled on its own terms — P_high, P_low, T_high and T_low rather than
Vt/rate — because its cycle isn't a conventional breath. The release is deliberately truncated,
so the pressure never reaches P_low and the residual is the intentional PEEP that holds the lung
open. Lengthening T_low demonstrates the central trade-off directly: release volume and CO₂
clearance improve while end-expiratory pressure collapses, driving pressure climbs into injurious
territory, and the lung derecruits.

*NIV (bilevel)* and *high-flow nasal oxygen* cover non-invasive support. On NIV the delivered
support is IPAP − EPAP eroded by mask leak, so raising IPAP against a big leak is visibly futile;
alerts reflect where the evidence actually points — strongly favourable in hypercapnic COPD and
cardiogenic pulmonary edema, and explicitly cautionary in de novo hypoxemic failure, where NIV
performs worst. High-flow is modeled through its three real mechanisms rather than as a
low-pressure ventilator: nasopharyngeal dead-space washout, a small flow-generated pressure, and
reliable FiO₂ **only when flow meets peak inspiratory demand** — set the flow too low and the
patient entrains room air, so the delivered FiO₂ falls well below the dial. The ROX index
(SpO₂/FiO₂ ÷ RR) is computed live as the high-flow analogue of RSBI.

**Living virtual patient** — a bedside picture rather than a bare set of numbers: diagnosis, ICU
day, airway and sedation status (RASS), vasopressor dose, a six-figure monitor strip (SpO₂, MAP,
heart rate, respiratory rate, temperature, urine output), a full arterial blood gas and a
laboratory panel. None of it is a stored snapshot — the vitals are derived from the engine, so the
monitor responds to the ventilator. Raise mean airway pressure and venous return falls, MAP drops,
the heart rate climbs, urine output falls and lactate rises.

The noradrenaline control exists to expose a specific trap: turn it up and the MAP comes back,
but the cause is untouched. When the blood pressure only looks acceptable because of the pressor,
the panel says so explicitly.

**Interactive ventilator controls** — PEEP, tidal volume or inspiratory pressure or pressure
support (depending on mode), FiO₂, I:E ratio, respiratory rate, and bicarbonate (for the pH
estimate). Every change recomputes the patient immediately.

**Physiology engine** — an alveolar-gas / shunt / dead-space model producing the values below.
Shunt is applied to oxygen **content** (Severinghaus dissociation curve + dissolved O₂), not by
interpolating partial pressure, because end-capillary blood is already saturated and it is the
drop in content that pushes PaO₂ down the steep part of the curve. That's what makes a large
shunt so resistant to FiO₂ — and it's why each scenario lands in the P/F band its label claims.
Mixed venous PO₂ also falls as raised mean airway pressure cuts cardiac output, which is how the
model reproduces PEEP *worsening* oxygenation in preload-dependent states like massive PE:

- *Oxygenation*: PaO₂, SpO₂, P/F ratio, effective shunt fraction
- *Ventilation*: PaCO₂, pH, minute and alveolar minute ventilation, dead-space fraction
- *Mechanics*: plateau, peak, mean airway and driving pressure, auto-PEEP, total PEEP
- *Hemodynamics*: a simplified venous-return / cardiac-output impact estimate

**15 disease scenarios**, each with its own compliance, resistance, recruitability, dead space and
teaching note:

| | |
|---|---|
| Normal lungs | ARDS — mild / moderate / severe (Berlin) |
| COPD / asthma exacerbation | Cardiogenic pulmonary edema |
| Severe pneumonia / consolidation | Pulmonary fibrosis |
| Neuromuscular weakness | Obesity / raised intra-abdominal pressure |
| COVID-19 ARDS | Massive / submassive pulmonary embolism |
| Chest trauma / flail chest | Undrained pneumothorax |
| Bronchopleural fistula (large air leak) | |

**Ventilator waveforms** — pressure–time, flow–time and volume–time traces plus pressure–volume and
flow–volume loops, generated from the same physiology values.

**Hold maneuvers** — inspiratory hold reveals the true plateau pressure (flow, and therefore
resistive pressure, removed); expiratory hold reveals total PEEP and the auto-PEEP component,
mirroring the real bedside maneuvers.

**Alveolar recruitment view** — a simple 2D visualisation of collapsed, normally aerated and
overdistended lung units that updates live with the settings.

**Collapsible panels** — every section (settings, results, patient labs, waveforms, ultrasound, etc.)
has a toggle in its header to collapse it out of the way; the Patient panel's ABG and Laboratory
blocks collapse independently of each other and of the rest of the panel. Collapsed state persists
in localStorage across reloads.

**Chest radiograph** — a characteristic film for each scenario with its findings and the
discriminators that matter (cardiomegaly and effusions separating cardiogenic oedema from ARDS;
flat diaphragms in obstruction; a normal film in massive PE). Aeration is driven by the engine, so
recruiting the lung visibly clears the infiltrate — the same coupling as the ultrasound B-lines.

These are **drawn schematics, not photographs**, for two reasons. Real teaching radiographs
(Radiopaedia, LITFL) are CC BY-NC-SA: the non-commercial term would limit how this project can
ever be used, share-alike would attach itself to the whole work, and Radiopaedia's terms
specifically exclude assembling numerous of their cases into comparable content. The panel links
out to their real cases instead. Secondly, a photograph is one frozen moment and cannot respond to
the ventilator, which is the entire point here.

**Real radiographs are supported.** Drop properly licensed files into `images/cxr/` and register
them in `cxr-images.js`; a registered image replaces the schematic and its credit renders beneath
the film. Entries missing a licence or source URL are refused rather than shown uncredited. That
file's header lists sources that are actually reusable — Wikimedia Commons (per-file licence,
prefer PD/CC0), NIH ChestX-ray14, NLM Open-i, the PMC open-access subset, CDC PHIL — and the ones
not to bundle (Radiopaedia, LITFL, MIMIC-CXR, CheXpert).

**Lung ultrasound** — each scenario's characteristic appearance, organised around the BLUE
protocol profiles, with anterior and lateral/PLAPS windows. Two things make it more than a
picture gallery. Lung sliding is **animated**, because a frozen pneumothorax and a normal lung are
genuinely indistinguishable — the artifacts are identical and only the motion differs, which is
why the freeze button is itself a teaching device. And B-line density is driven by the physiology
engine's live recruitment state rather than hard-coded, so adding PEEP to a recruitable lung
visibly clears the B-lines (the basis of ultrasound-guided PEEP titration) while a consolidated
or fibrotic lung barely changes. Artifacts are drawn schematics, not real clip captures.

**Progressive clinical cases** — three multi-step cases (septic shock with ARDS, status
asthmaticus, acute cardiogenic pulmonary edema) that combine "configure" steps — set the main
simulator above to a lung-protective starting point, then click *Check my settings* to have your
actual live settings (not a quiz answer) evaluated against the case's criteria — with
multiple-choice decision points as the patient evolves. Non-blocking throughout: a missed step
still lets you continue, with accurate feedback either way. Each case ends with a short summary,
and outcomes feed the shared session dashboard.

**Four learner levels** — Beginner, Resident, Fellow, Consultant, selected from the header and
persisted across visits. This gates how much guidance the page volunteers, not what the monitor
shows: alerts, alarms, and evidence citations are visible at every level, the same way a real
ventilator's alarms don't turn off for a more senior clinician. What changes:

- **Beginner** gets everything below, plus a "Suggested next step" box that turns whichever
  danger-level alert is active into a concrete action ("Reduce tidal volume toward ~400 mL (6
  mL/kg IBW)"), and the clinical-cases module spells out exactly which criteria a configure step
  failed.
- **Resident** keeps the physiology explanation panel, scenario teaching notes, weaning RSBI/NIF
  interpretation, and the clinical-course trend narrative — but loses the beginner-only "here's the
  fix" hints, so a mistake has to be reasoned out rather than corrected by button-pushing.
- **Fellow and Consultant** drop the interpretive layer entirely: the physiology explanation panel
  collapses to a bare factual summary, teaching notes and RSBI/NIF interpretive labels/colour
  coding disappear (the raw numbers stay), the clinical-course trend badge and reasoning sentence
  are replaced by the plain before/after P/F, and a failed clinical-cases step says only that it
  failed, not why.

**Clinical course** — advance simulated time (+30 min / +1 h / +6 h / +12 h / +24 h / +48 h) to see
whether the settings dialed in *right now* help or hurt this patient over hours, not just this
instant. Only advancing time moves the trend; adjusting a control alone never does — matching the
bedside fact that injury and recovery accrue over hours, not the moment a dial turns. Each advance
scores the current settings mode-agnostically (plateau/driving pressure, Vt/IBW, oxygenation,
acid-base, FiO₂, how close PEEP sits to this lung's estimated optimum, hemodynamic cost) and nudges
the underlying shunt and compliance toward recovery or injury for that whole interval — 24 hours of
lung-protective settings on a recruitable ARDS lung produces a dramatic, visible recovery (P/F
206 → 288, plateau 25 → 20 cmH₂O in testing); the same 24 hours of a plateau/driving-pressure-
violating pattern produces comparably dramatic deterioration (P/F 200 → 116, plateau 24 → 34 cmH₂O).

Because every other module already reads off the physiology engine's live results rather than the
scenario's static presentation values, this one change propagates everywhere automatically: the CXR
infiltrate, the ultrasound B-line density, and the weaning SBT estimate all reflect the drifted
patient without any of those modules knowing progression exists. A sparkline tracks P/F over the
course, and a running log narrates each advance from the actual measured before/after numbers —
same "nothing canned" principle as the physiology explanation panel below.

**Laboratory trends** — a single ABG or metabolic panel is a snapshot; this panel is the trend that
snapshot sits on. Six sparklines (pH, PaO₂, PaCO₂, lactate, WBC, creatinine) plot every clinical-
course time point against a shaded normal-range band, so a glance shows whether the trace is
drifting into or out of range rather than requiring the reader to compare each number against a
remembered threshold. Like the P/F sparkline above it, these move only when time is advanced, never
from a settings tweak alone, and they read off the exact same `progression.history` snapshots — so
a lactate/WBC/creatinine rise tracks the same underlying severity drift a worsening P/F or plateau
pressure does, rather than being a second, independently-tuned model. The living-patient panel's
labs gained four rows alongside them (BUN, sodium, potassium, chloride), with creatinine and WBC
now drifting with illness severity rather than sitting fixed regardless of clinical trajectory.

**Physiology explanation panel** — after each adjustment settles, a breakdown of what happened:
the mechanism, the benefits, the potential risks, and the supporting evidence. Nothing here is
canned. Every line is generated from a *measured* delta between two engine runs, so the panel can
only claim a benefit that actually occurred and only warns about a risk the numbers actually show.
The same adjustment produces different text in different lungs, because it produces different
physiology: raising PEEP in recruitable ARDS reports recruitment and improved oxygenation, while
the identical move in the fibrotic scenario reports no recruitment at all — just overdistension,
rising dead space and a falling PaO₂.

**Session dashboard** — a persistent (localStorage) summary tying the other sections together:
what fraction of explored settings had no danger-level alerts, how many weaning decisions were
reasonable given the modeled criteria, alarm-troubleshooting accuracy, and clinical-case step
accuracy, plus a rough qualitative read and a reset button. Nothing is sent anywhere; it's purely
a local, motivational summary, not a validated competency score.

**Alarm troubleshooting** — 8 randomized vignettes (kinked tube, mucus plug, bronchospasm,
mainstem intubation, tension pneumothorax, dynamic hyperinflation/auto-PEEP, circuit
disconnection, cuff leak) built around the DOPES differential (Displacement, Obstruction,
Pneumothorax, Equipment failure, Stacked breathing) and DOTTS response framework. Each case has
monitor numbers, exam findings, and a stylized illustrative waveform; users pick a diagnosis and
next action and get immediate, explained feedback. Deliberately decoupled from the main physiology
engine — these are discrete faults (a disconnected circuit isn't a steady state the continuous
compliance/resistance model represents).

**Weaning readiness assessment** — simulates a spontaneous breathing trial (CPAP 5 / PS 7) using
each scenario's respiratory muscle reserve and current lung mechanics to estimate spontaneous RR,
Vt, Rapid Shallow Breathing Index (RSBI), and NIF, plus a cuff-leak toggle and an extubate/hold
decision with feedback. Deliberately shows where RSBI alone can be misleading — e.g. the
neuromuscular-weakness scenario can look RSBI-favorable while NIF flags inadequate strength,
mirroring RSBI's known unreliability in neuromuscular disease.

**Evidence citations** — alerts and teaching notes carry inline references (hover for detail) to:

- ARDSnet ARMA trial (NEJM 2000) — low tidal volume
- Amato et al. (NEJM 2015) — driving pressure
- PROSEVA (NEJM 2013) — prone positioning
- EXPRESS (JAMA 2008) — PEEP titration
- ART trial (JAMA 2017) — harm from aggressive recruitment / high PEEP
- HOT-ICU / LOCO₂ (NEJM 2021 / 2020) — conservative oxygen targets
- ATS/ESICM/SCCM clinical practice guideline (2017) — ARDS ventilation
- BLUE protocol (Lichtenstein, Chest 2008) — lung ultrasound in acute respiratory failure
- International LUS consensus (Volpicelli, Intensive Care Med 2012)
- Brochard (NEJM 1995) / Lightowler (BMJ 2003) — NIV in hypercapnic COPD
- 3CPO (NEJM 2008) / Vital (Cochrane 2013) — NIV in cardiogenic pulmonary edema
- FLORALI (NEJM 2015) — high-flow vs. NIV in de novo hypoxemic failure
- LUNG SAFE (AJRCCM 2017) — NIV use and mortality in moderate–severe ARDS
- ROX index (Roca, 2016 / 2019) — predicting high-flow failure
- Brochard (AJRCCM 1994) / Esteban (NEJM 1995) — SIMV is inferior for weaning
- Zhou (Intensive Care Med 2017) — APRV in ARDS

## Running it

The site is fully static — no build step, no backend, no dependencies. Either:

```bash
# serve locally
python3 -m http.server 8000
# then open http://localhost:8000
```

…or open `index.html` directly in a browser.

To publish with GitHub Pages: **Settings → Pages → Source → Deploy from a branch → `main` / `/ (root)`**.

## Project layout

| File | Purpose |
|---|---|
| `index.html` | Page structure and controls |
| `simulator.js` | Disease scenarios, physiology engine, evidence map, DOM wiring, `window.MVSIM` shared namespace |
| `waveforms.js` | Waveform + loop rendering, hold maneuvers, alveolar recruitment view |
| `weaning.js` | Simulated SBT, RSBI/NIF estimate, cuff leak, extubation decision feedback |
| `alarms.js` | 8 DOPES/DOTTS alarm-troubleshooting vignettes with stylized waveforms |
| `patient.js` | Living virtual patient: monitor, ABG, labs, engine-derived vitals |
| `explain.js` | Mechanism / benefit / risk / evidence breakdown from measured deltas |
| `progression.js` | Clinical course: time advance, sparkline, course log |
| `labtrends.js` | Laboratory trends: pH/PaO₂/PaCO₂/lactate/WBC/creatinine sparklines read from the clinical-course history |
| `difficulty.js` | Four-level learner mode, gates guidance across every module |
| `cxr.js` | Chest radiograph panel: schematic films, real-image support |
| `cxr-images.js` | Attribution manifest for real radiographs (empty by default) |
| `panels.js` | Collapsible-panel toggles, persisted in localStorage |
| `cases.js` | Progressive multi-step clinical cases, evaluated against live simulator state |
| `ultrasound.js` | BLUE-protocol lung ultrasound views with animated sliding and engine-driven B-lines |
| `dashboard.js` | Session performance summary read from `window.MVSIM.stats` |
| `styles.css` | Self-contained styling (light/dark themes) |

## Roadmap

Planned, not yet built — several of these need a backend, which the current static setup does not have:

- AI tutor explaining each intervention in context
- Additional invasive modes (PRVC, volume-guaranteed pressure modes)
- Chest imaging and ECMO physiology modules (lung ultrasound is built)

## Sources

The physiology and thresholds are drawn from standard references — West's *Respiratory Physiology:
The Essentials*, Wilcox et al., *Mechanical Ventilation in Emergency Medicine*, Owens, *The
Ventilator Book*, and the Puritan Bennett *Ventilator Waveforms* pocket guide — together with the
guidelines and trials cited above. FOAMed resources (EMCrit, LITFL, Deranged Physiology, Open
Critical Care) informed how concepts are explained, but the simulator's rules are based on textbooks
and primary literature.

## Contributing

Issues and pull requests are welcome — particularly corrections to the physiology, better teaching
explanations, and additional evidence citations. Please keep the educational-use-only framing intact.
