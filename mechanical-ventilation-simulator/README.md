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

**Three ventilation modes** — Volume Control (AC/VC, tidal volume is the direct input), Pressure
Control (AC/PC, inspiratory pressure is the direct input and Vt is derived from compliance —
watch delivered Vt, not just the set pressure), and Pressure Support/CPAP (patient-triggered and
patient-cycled: only PEEP/CPAP and PS are set, rate and Vt emerge from the scenario's respiratory
muscle reserve and lung mechanics, the same model driving the weaning simulator's SBT). PSV mode
surfaces a specific teaching point: the displayed driving pressure doesn't include the patient's
own inspiratory effort, so a P-SILI-risk alert fires when the *true* transpulmonary driving
pressure (PS + effort) is high even though the set PS alone looks safe.

**Interactive ventilator controls** — PEEP, tidal volume or inspiratory pressure or pressure
support (depending on mode), FiO₂, I:E ratio, respiratory rate, and bicarbonate (for the pH
estimate). Every change recomputes the patient immediately.

**Physiology engine** — an alveolar-gas / shunt / dead-space model producing:

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

**Progressive clinical cases** — three multi-step cases (septic shock with ARDS, status
asthmaticus, acute cardiogenic pulmonary edema) that combine "configure" steps — set the main
simulator above to a lung-protective starting point, then click *Check my settings* to have your
actual live settings (not a quiz answer) evaluated against the case's criteria — with
multiple-choice decision points as the patient evolves. Non-blocking throughout: a missed step
still lets you continue, with accurate feedback either way. Each case ends with a short summary,
and outcomes feed the shared session dashboard.

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
| `cases.js` | Progressive multi-step clinical cases, evaluated against live simulator state |
| `dashboard.js` | Session performance summary read from `window.MVSIM.stats` |
| `styles.css` | Self-contained styling (light/dark themes) |

## Roadmap

Planned, not yet built — several of these need a backend, which the current static setup does not have:

- AI tutor explaining each intervention in context
- Additional ventilation modes (SIMV, APRV, BiLevel, NIV, HFNC) — VC/PC/PSV are built
- Imaging, ultrasound and ECMO physiology modules

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
