"""Complementary search strategies per ICU specialty.

Each specialty is searched three independent ways so that a gap in any one (e.g. MeSH indexing lag, which leaves the
newest articles without MeSH for weeks) cannot hide an article:
  mesh     controlled vocabulary AND an ICU-context MeSH set
  keyword  title/abstract synonyms AND ICU-context wording (works before MeSH indexing)
  pubtype  high-evidence publication types (RCT, meta-analysis, SR, guideline) matching the specialty at any ICU strength
Plus cross-cutting strategies: core ICU journals (everything they publish), and a general ICU-context sweep.
"""

# MeSH/keyword descriptors for the 15 requested specialties. `category` = existing display category id (design unchanged).
SPECIALTIES = [
    {"id": "general-critical-care", "label": "General critical care", "category": "general-critical-care",
     "mesh": ['"Critical Care"[MeSH]', '"Critical Illness"[MeSH]', '"Intensive Care Units"[MeSH]', '"Patient Admission"[MeSH] AND "Intensive Care Units"[MeSH]'],
     "kw": ['"critically ill"', '"intensive care"', '"critical care"', 'ICU']},
    {"id": "ventilation-resp-failure", "label": "Mechanical ventilation & respiratory failure", "category": "respiratory",
     "mesh": ['"Respiration, Artificial"[MeSH]', '"Respiratory Insufficiency"[MeSH]', '"Ventilator Weaning"[MeSH]', '"Airway Extubation"[MeSH]', '"Noninvasive Ventilation"[MeSH]', '"Oxygen Inhalation Therapy"[MeSH]'],
     "kw": ['"mechanical ventilation"', '"respiratory failure"', 'extubation', '"high-flow nasal"', '"noninvasive ventilation"', 'ventilator*', 'intubation']},
    {"id": "ards", "label": "ARDS", "category": "respiratory",
     "mesh": ['"Respiratory Distress Syndrome"[MeSH]'],
     "kw": ['ARDS', '"acute respiratory distress"', '"acute lung injury"', '"prone position*"', '"driving pressure"']},
    {"id": "sepsis", "label": "Sepsis & septic shock", "category": "infectious-sepsis",
     "mesh": ['"Sepsis"[MeSH]', '"Shock, Septic"[MeSH]'],
     "kw": ['sepsis', '"septic shock"', 'bacteremia', '"qSOFA"', '"surviving sepsis"']},
    {"id": "hemodynamics-cardio", "label": "Hemodynamics & cardiovascular critical care", "category": "cardiovascular",
     "mesh": ['"Shock, Cardiogenic"[MeSH]', '"Heart Arrest"[MeSH]', '"Hemodynamics"[MeSH]', '"Vasoconstrictor Agents"[MeSH]', '"Cardiopulmonary Resuscitation"[MeSH]', '"Shock"[MeSH]'],
     "kw": ['vasopressor*', '"cardiogenic shock"', '"cardiac arrest"', '"fluid resuscitation"', '"mean arterial pressure"', 'norepinephrine', 'vasopressin']},
    {"id": "neurocritical", "label": "Neurocritical care", "category": "neurology",
     "mesh": ['"Brain Injuries, Traumatic"[MeSH]', '"Intracranial Hypertension"[MeSH]', '"Status Epilepticus"[MeSH]', '"Subarachnoid Hemorrhage"[MeSH]', '"Brain Death"[MeSH]', '"Intracranial Pressure"[MeSH]'],
     "kw": ['"traumatic brain injury"', '"intracranial pressure"', '"status epilepticus"', '"subarachnoid hemorrhage"', '"neurocritical"', '"brain death"']},
    {"id": "rrt-renal", "label": "Renal replacement therapy & AKI", "category": "renal",
     "mesh": ['"Renal Replacement Therapy"[MeSH]', '"Acute Kidney Injury"[MeSH]', '"Continuous Renal Replacement Therapy"[MeSH]'],
     "kw": ['CRRT', '"renal replacement therapy"', '"acute kidney injury"', 'hemodiafiltration', '"kidney replacement"']},
    {"id": "infections", "label": "Critical care infections", "category": "infectious-sepsis",
     "mesh": ['"Pneumonia, Ventilator-Associated"[MeSH]', '"Cross Infection"[MeSH]', '"Anti-Bacterial Agents"[MeSH]', '"Catheter-Related Infections"[MeSH]'],
     "kw": ['"ventilator-associated pneumonia"', '"hospital-acquired pneumonia"', 'antimicrobial', '"candidemia"', '"antibiotic stewardship"', '"central line-associated"']},
    {"id": "toxicology", "label": "Toxicology", "category": "pharmacology",
     "mesh": ['"Poisoning"[MeSH]', '"Drug Overdose"[MeSH]', '"Antidotes"[MeSH]', '"Hemoperfusion"[MeSH]'],
     "kw": ['overdose', 'poisoning', 'antidote', 'intoxication', '"toxic ingestion"', '"acetaminophen toxicity"']},
    {"id": "trauma-surgical", "label": "Trauma & surgical critical care", "category": "trauma-surgical",
     "mesh": ['"Wounds and Injuries"[MeSH]', '"Hemorrhage"[MeSH]', '"Resuscitation"[MeSH]', '"Postoperative Complications"[MeSH]', '"Burns"[MeSH]'],
     "kw": ['polytrauma', '"hemorrhagic shock"', '"massive transfusion"', '"damage control"', '"emergency laparotomy"', 'burn*']},
    {"id": "ecmo", "label": "ECMO & extracorporeal support", "category": "respiratory",
     "mesh": ['"Extracorporeal Membrane Oxygenation"[MeSH]', '"Extracorporeal Circulation"[MeSH]'],
     "kw": ['ECMO', '"extracorporeal membrane oxygenation"', '"extracorporeal life support"', '"extracorporeal CPR"', 'ECCO2R']},
    {"id": "nutrition-metabolism", "label": "Nutrition & metabolism", "category": "gi-nutrition",
     "mesh": ['"Enteral Nutrition"[MeSH]', '"Parenteral Nutrition"[MeSH]', '"Nutritional Support"[MeSH]', '"Hyperglycemia"[MeSH]', '"Refeeding Syndrome"[MeSH]'],
     "kw": ['"enteral nutrition"', '"parenteral nutrition"', '"protein dose"', '"glycemic control"', '"insulin therapy"', '"refeeding"']},
    {"id": "sedation-delirium", "label": "Sedation, analgesia & delirium", "category": "neurology",
     "mesh": ['"Deep Sedation"[MeSH]', '"Delirium"[MeSH]', '"Analgesia"[MeSH]', '"Hypnotics and Sedatives"[MeSH]'],
     "kw": ['sedation', 'dexmedetomidine', 'propofol', 'delirium', 'analgesia', '"pain management"', 'agitation']},
    {"id": "hematology-coag", "label": "Hematology & coagulation", "category": "hematology-coag",
     "mesh": ['"Blood Coagulation Disorders"[MeSH]', '"Blood Transfusion"[MeSH]', '"Anticoagulants"[MeSH]', '"Thrombocytopenia"[MeSH]', '"Disseminated Intravascular Coagulation"[MeSH]'],
     "kw": ['coagulopathy', 'transfusion', '"disseminated intravascular coagulation"', 'anticoagulation', 'thrombocytopenia', '"venous thromboembolism"']},
    {"id": "obstetric-critical-care", "label": "Obstetric critical care", "category": "general-critical-care",
     "mesh": ['"Pre-Eclampsia"[MeSH]', '"Eclampsia"[MeSH]', '"Postpartum Hemorrhage"[MeSH]', '"Pregnancy Complications"[MeSH] AND "Critical Care"[MeSH]', '"HELLP Syndrome"[MeSH]'],
     "kw": ['"obstetric critical care"', '"maternal sepsis"', '"severe maternal morbidity"', '"postpartum hemorrhage"', 'eclampsia', 'HELLP', '"peripartum cardiomyopathy"']},
]

ICU_CONTEXT_MESH = '("Critical Care"[MeSH] OR "Intensive Care Units"[MeSH] OR "Critical Illness"[MeSH])'
ICU_CONTEXT_TEXT = '("critically ill"[tiab] OR "intensive care"[tiab] OR "critical care"[tiab] OR ICU[tiab] OR "intensive care unit"[tiab])'
# Obstetric / toxicology / trauma papers often never say "ICU" in the title; allow specialty-only evidence for high-evidence designs.
HIGH_EVIDENCE = '("Randomized Controlled Trial"[pt] OR "Meta-Analysis"[pt] OR "Systematic Review"[pt] OR "Practice Guideline"[pt] OR "Guideline"[pt] OR "Multicenter Study"[pt])'

CORE_JOURNALS = ["Intensive Care Med", "Crit Care Med", "Crit Care", "J Crit Care", "Ann Intensive Care", "Resuscitation", "Neurocrit Care", "Shock",
                 "Crit Care Explor", "Intensive Crit Care Nurs", "J Intensive Care", "Intensive Care Med Exp", "Am J Respir Crit Care Med", "ASAIO J",
                 "Clin Toxicol (Phila)", "Lancet Respir Med", "Ann Am Thorac Soc"]
GENERAL_JOURNALS = ["N Engl J Med", "JAMA", "Lancet", "BMJ", "Chest", "Cochrane Database Syst Rev", "Anesthesiology", "Br J Anaesth", "Thorax", "Eur Respir J",
                    "J Trauma Acute Care Surg", "Burns", "Anaesthesia", "Crit Care Nurse", "Am J Obstet Gynecol", "Lancet Infect Dis", "Clin Infect Dis", "Kidney Int", "J Am Soc Nephrol"]


def _or(items):
    return "(" + " OR ".join(items) + ")"


def _adult(q):
    """Exclude paediatric/neonatal unless the record is ALSO tagged adult (keeps adult papers that merely mention 'children')."""
    return (f'({q}) NOT (("Infant, Newborn"[MeSH] OR "Infant"[MeSH] OR "Child"[MeSH] OR "Adolescent"[MeSH] OR "Pediatrics"[MeSH] OR neonat*[ti] '
            f'OR pediatric*[ti] OR paediatric*[ti] OR infant*[ti]) NOT "Adult"[MeSH])')


def pubmed_queries():
    """-> list of dicts {id, specialty, kind, query}. Date windows are applied by the caller."""
    out = []
    for sp in SPECIALTIES:
        core = sp["id"] in ("general-critical-care",)
        mesh = _or(sp["mesh"])
        field = "ti" if core else "tiab"      # general ICU wording must be in the TITLE; specialty terms may be in title/abstract
        kw = _or(f"{k}[{field}]" if "[" not in k else k for k in sp["kw"])
        # 1. controlled vocabulary: specialty MeSH within an ICU context (general-critical-care IS the context)
        out.append({"id": f"{sp['id']}:mesh", "specialty": sp["id"], "kind": "mesh",
                    "query": _adult(mesh if core else f"{mesh} AND {ICU_CONTEXT_MESH}")})
        # 2. keyword/synonyms in title/abstract with ICU wording - independent of MeSH indexing lag
        out.append({"id": f"{sp['id']}:keyword", "specialty": sp["id"], "kind": "keyword",
                    "query": _adult(kw if core else f"{kw} AND {ICU_CONTEXT_TEXT}")})
        # 3. publication types: specialty (MeSH or keyword) + high-evidence design + (ICU context OR core-journal)
        out.append({"id": f"{sp['id']}:pubtype", "specialty": sp["id"], "kind": "pubtype",
                    "query": _adult(f"({mesh} OR {kw}) AND {HIGH_EVIDENCE} AND ({ICU_CONTEXT_MESH} OR {ICU_CONTEXT_TEXT})")})
    core_j = _or(f'"{j}"[Journal]' for j in CORE_JOURNALS)
    gen_j = _or(f'"{j}"[Journal]' for j in GENERAL_JOURNALS)
    out.append({"id": "core-journals", "specialty": "general-critical-care", "kind": "journal", "query": _adult(core_j)})
    out.append({"id": "general-journals-icu", "specialty": "general-critical-care", "kind": "journal",
                "query": _adult(f"{gen_j} AND ({ICU_CONTEXT_MESH} OR {ICU_CONTEXT_TEXT})")})
    return out


def epmc_queries():
    """Independent second source (Europe PMC), same specialties. Two hard-won rules (verified against the live API):
      1. bare phrases match FULL TEXT -> every term is field-restricted (TITLE_ABS:/TITLE:/MESH:);
      2. Europe PMC mis-evaluates OR-groups that MIX fields (union returned MORE than its parts) -> groups are never mixed:
         one pure-TITLE_ABS query and one pure-MESH query per specialty; results are unioned client-side."""
    ctx_ta = '(' + " OR ".join(f'TITLE_ABS:"{t}"' for t in ("critically ill", "intensive care", "critical care", "ICU")) + ')'
    ctx_mesh = '(' + " OR ".join(f'MESH:"{t}"' for t in ("Critical Care", "Intensive Care Units", "Critical Illness")) + ')'
    out = []
    for sp in SPECIALTIES:
        terms = [m.split("[")[0].strip().strip('"') for m in sp["mesh"] if " AND " not in m]
        kws = [k.replace("*", "").strip().strip('"') for k in sp["kw"]]
        if sp["id"] == "general-critical-care":
            ta = "(" + " OR ".join(f'TITLE:"{k}"' for k in kws) + ")"
            out.append({"id": f"epmc:{sp['id']}:title", "specialty": sp["id"], "kind": "epmc", "query": ta})
            out.append({"id": f"epmc:{sp['id']}:mesh", "specialty": sp["id"], "kind": "epmc", "query": ctx_mesh})
            continue
        out.append({"id": f"epmc:{sp['id']}:text", "specialty": sp["id"], "kind": "epmc",
                    "query": "(" + " OR ".join(f'TITLE_ABS:"{k}"' for k in kws) + f") AND {ctx_ta}"})
        out.append({"id": f"epmc:{sp['id']}:mesh", "specialty": sp["id"], "kind": "epmc",
                    "query": "(" + " OR ".join(f'MESH:"{t}"' for t in terms) + f") AND {ctx_mesh}"})
    return out


def specialty_category(specialty_id):
    return next((s["category"] for s in SPECIALTIES if s["id"] == specialty_id), "infectious-sepsis")


def infer_categories(title, abstract, specialties, limit=3):
    """Display categories for an article: its specialties' categories, plus content-based inference so a paper found only by the
    general ICU strategy still lands where its subject belongs. Always returns >=1 category."""
    cats = []
    def add(c):
        if c not in cats:
            cats.append(c)
    text_t, text_a = (title or "").lower(), (abstract or "").lower()
    scores = []
    for sp in SPECIALTIES:
        if sp["id"] == "general-critical-care":
            continue
        kws = [k.strip('"*').lower() for k in sp["kw"]]
        sc = sum(2 for k in kws if k and k in text_t) + sum(1 for k in kws if k and k in text_a)
        if sc:
            scores.append((sc, sp["category"]))
    for _, c in sorted(scores, reverse=True):
        add(c)
    for sp in specialties:
        if sp != "general-critical-care":
            add(specialty_category(sp))
    if not cats:
        add("general-critical-care")
    return cats[:limit]
