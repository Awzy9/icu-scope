"""Deterministic ICU-relevance classification (no AI cost).

relevant   -> flows on to verification
uncertain  -> routed to editorial review (NEVER auto-rejected)
rejected   -> only for clear, explainable reasons (paediatric/neonatal-only population per existing policy, or a notice)
"""
import re

ICU_MESH = {"critical care", "intensive care units", "critical illness", "respiration, artificial", "respiratory distress syndrome",
            "respiratory distress syndrome, adult", "shock, septic", "sepsis", "shock", "extracorporeal membrane oxygenation", "ventilator weaning",
            "delirium", "resuscitation", "heart arrest", "renal replacement therapy", "acute kidney injury", "multiple organ failure",
            "intubation, intratracheal", "ventilators, mechanical", "hemodynamic monitoring", "cardiopulmonary resuscitation", "brain injuries, traumatic",
            "enteral nutrition", "parenteral nutrition", "conscious sedation", "hypnotics and sedatives", "poisoning", "drug overdose", "pre-eclampsia", "eclampsia"}
STRONG_TERMS = ["intensive care unit", "intensive care", "critically ill", "critical illness", "critical care", "icu", "mechanical ventilation",
                "invasive ventilation", "ventilator", "septic shock", "ards", "acute respiratory distress", "ecmo", "extracorporeal", "vasopressor",
                "norepinephrine", "cardiac arrest", "status epilepticus", "renal replacement", "crrt", "organ failure", "extubation", "tracheostomy",
                "delirium", "analgosedation", "sedation", "resuscitation", "traumatic brain injury", "intracranial pressure", "hemorrhagic shock",
                "massive transfusion", "overdose", "poisoning", "antidote", "peripartum", "obstetric critical", "eclampsia", "hellp"]
# Journals whose whole remit is critical care / resuscitation / extracorporeal support: a strong prior (recent records have no MeSH yet).
DEDICATED_ICU_JOURNALS = ["intensive care med", "critical care med", "crit care", "j crit care", "ann intensive care", "resuscitation", "neurocrit care", "shock",
                          "crit care explor", "intensive crit care nurs", "j intensive care", "am j respir crit care med", "asaio j", "lancet respir med"]
CORE_ICU_JOURNALS = ["intensive care med", "critical care med", "crit care", "j crit care", "ann intensive care", "resuscitation", "neurocrit care",
                     "shock", "crit care explor", "intensive crit care nurs", "j intensive care", "am j respir crit care med", "asaio j", "clin toxicol",
                     "n engl j med", "jama", "lancet", "bmj", "chest", "thorax", "anesthesiology", "br j anaesth", "j trauma acute care surg"]
PEDS_TITLE = re.compile(r"\b(pediatric|paediatric|neonat\w*|infants?|newborns?|children|child(?!-)|adolescen\w*|preterm|premature infants?)\b", re.I)
PEDS_MESH = {"infant, newborn", "pediatrics", "child", "adolescent", "infant", "infant, premature", "intensive care units, neonatal", "intensive care units, pediatric", "child, preschool"}
NOTICE = re.compile(r"^\s*(erratum|corrigendum|correction|retraction notice|expression of concern|publisher correction)\s*[:\-–]", re.I)


def classify(article, mesh=(), pubtypes=(), journal_hint=""):
    """-> dict(decision, score, reasons, signals). Uses only data already in hand."""
    title = (article.get("title") or "")
    text = f"{title} {article.get('abstract') or ''}".lower()
    mesh_l = {m.lower() for m in mesh}
    reasons, score = [], 0
    if NOTICE.match(title) or any(p in ("Published Erratum", "Retraction of Publication", "Retraction Notice", "Expression of Concern") for p in pubtypes):
        return {"decision": "rejected", "score": 0, "reasons": ["correction/retraction notice, not primary evidence (tracked against the original)"], "signals": {}}
    # Paediatric exclusion (existing policy) - based on population signals, NOT a bare substring ("Child-Pugh" is adult hepatology).
    peds_title = bool(PEDS_TITLE.search(title))
    peds_mesh = bool(mesh_l & PEDS_MESH)
    adult_mesh = bool(mesh_l & {"adult", "aged", "middle aged", "young adult"})
    if (peds_title and not adult_mesh) or (peds_mesh and not adult_mesh and peds_title):
        return {"decision": "rejected", "score": 0, "reasons": ["paediatric/neonatal population (out of scope per existing editorial policy)"], "signals": {"peds_title": peds_title, "peds_mesh": peds_mesh}}
    mesh_hits = sorted(mesh_l & ICU_MESH)
    if mesh_hits:
        score += min(4, 2 * len(mesh_hits)); reasons.append("ICU MeSH: " + ", ".join(mesh_hits[:4]))
    term_hits = [t for t in STRONG_TERMS if re.search(r"(?<![a-z])" + re.escape(t) + r"(?![a-z])", text)]
    title_hits = [t for t in term_hits if t in title.lower()]
    if term_hits:
        score += min(4, len(term_hits)) + min(2, len(title_hits)); reasons.append("ICU terms: " + ", ".join(term_hits[:5]))
    j = (journal_hint or article.get("journal") or "").lower()
    dedicated = any(j.startswith(c) for c in DEDICATED_ICU_JOURNALS)
    if dedicated:
        score += 3; reasons.append("dedicated critical-care journal")
    elif any(j.startswith(c) or c == j for c in CORE_ICU_JOURNALS):
        score += 1; reasons.append("core/general-medicine journal")
    if peds_title and adult_mesh:
        reasons.append("paediatric wording but adult MeSH - kept for review"); score -= 1
    # Relevant = a clear ICU anchor (ICU MeSH, or an ICU term in the TITLE, or >=3 distinct ICU terms). Everything else -> editorial review.
    # A zero-signal article is still reviewed, never silently dropped.
    anchored = bool(mesh_hits) or bool(title_hits) or len(term_hits) >= 3 or dedicated
    decision = "relevant" if (score >= 3 and anchored) else "uncertain"
    if not title:
        decision, reasons = "uncertain", reasons + ["missing title - metadata incomplete, needs review"]
    return {"decision": decision, "score": score, "reasons": reasons, "signals": {"mesh": mesh_hits, "terms": term_hits[:8]}}
