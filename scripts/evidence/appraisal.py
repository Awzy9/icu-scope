"""Design-specific structured appraisal checklists (one framework per study design — never one
checklist for everything). Items default to 'not_assessed'; only objectively verifiable items are
pre-filled (and marked source='auto'). Judgement items (allocation concealment, risk of bias,
certainty of evidence...) can only be set by a named human reviewer who has read the full text."""
from .ledger import now_iso

STATUSES = ("not_assessed", "met", "partially_met", "not_met", "not_reported")

TEMPLATES = {
    "CONSORT 2025 / RoB 2 (randomised trial)": [
        ("registration", "Trial prospectively registered; identifier matches publication"), ("randomisation", "Sequence generation / randomisation method"),
        ("allocation_concealment", "Allocation concealment"), ("blinding", "Blinding (participants, clinicians, assessors)"),
        ("population", "Eligibility criteria & enrolled population"), ("intervention_comparator", "Intervention and comparator adequately described"),
        ("primary_outcome", "Primary outcome pre-specified; secondary outcomes identified"), ("sample_size_power", "Sample size justification / statistical power"),
        ("itt", "Intention-to-treat analysis; handling of missing data"), ("effect_sizes", "Absolute AND relative effects reported"),
        ("confidence_intervals", "Confidence intervals reported"), ("harms", "Adverse events / harms reported"), ("generalisability", "Limitations and generalisability discussed")],
    "PRISMA 2020 / GRADE (systematic review or meta-analysis)": [
        ("protocol", "Protocol registered (e.g. PROSPERO)"), ("search", "Search strategy complete and reproducible"), ("eligibility", "Inclusion / exclusion criteria"),
        ("risk_of_bias", "Risk of bias assessed per study"), ("heterogeneity", "Heterogeneity assessed and explained"), ("publication_bias", "Publication bias assessed"),
        ("pooled_estimate", "Pooled estimate with confidence interval"), ("certainty", "Certainty of evidence (GRADE) rated")],
    "STROBE (observational study)": [
        ("design", "Study design clearly stated"), ("selection_bias", "Selection bias addressed"), ("confounding", "Confounding addressed"),
        ("missing_data", "Missing data handled"), ("definitions", "Exposure and outcome definitions"), ("adjusted_estimates", "Adjusted vs unadjusted estimates reported"),
        ("causation", "Conclusions stay at association, not causation")],
    "Guideline appraisal (issuer, versioning, methodology)": [
        ("issuer", "Issuing organisation verified"), ("dates", "Publication / update dates and version"), ("grading_method", "Evidence-grading methodology stated (e.g. GRADE)"),
        ("strength", "Recommendation strength reported"), ("superseded", "Not superseded / withdrawn"), ("official_source", "Official source available")],
}
FRAMEWORKS = list(TEMPLATES)


def framework_for(rec):
    types = " ".join(rec.get("pubtypes") or []) + " " + (rec.get("study_design") or "")
    if rec["content_class"] == "guideline":
        return FRAMEWORKS[3]
    if rec["content_class"] in ("registry_record", "preprint", "expert_interpretation", "landmark_trial", "review"):
        return None
    if "Randomized Controlled Trial" in types:
        return FRAMEWORKS[0]
    if rec["content_class"] == "evidence_synthesis":
        return FRAMEWORKS[1]
    return FRAMEWORKS[2] if rec["content_class"] == "original_research" else None


def ensure_appraisal(rec):
    fw = framework_for(rec)
    cur = rec.get("appraisal")
    if not fw:
        rec["appraisal"] = None
        return
    if cur and cur["framework"] == fw:
        return
    items = {k: {"label": label, "status": "not_assessed", "note": "", "source": None} for k, label in TEMPLATES[fw]}
    rec["appraisal"] = {"framework": fw, "items": items, "completed": False, "completed_by": None, "completed_at": None}
    prefill(rec)


def prefill(rec):
    """Only items that metadata can objectively establish."""
    a = rec.get("appraisal")
    if not a:
        return
    it = a["items"]
    sv = rec["source_verification"]
    if "registration" in it and it["registration"]["status"] == "not_assessed" and rec.get("trial_registration") and sv["status"] == "verified" and \
            any(c["name"].startswith("registry_") and c["result"] == "pass" for c in sv.get("checks", [])):
        it["registration"].update(status="met", source="auto: registration number exists in ClinicalTrials.gov (existence only; timing not assessed)")
    if "superseded" in it and it["superseded"]["status"] == "not_assessed" and sv["status"] == "verified" and rec["retraction_status"] == "none" \
            and not any(n["type"] in ("update", "retraction", "expression_of_concern") for n in rec["notices"]):
        it["superseded"].update(status="met", source="auto: no update/withdrawal notice found in PubMed or Crossref (metadata check)")


def apply_appraisal(rec, items, complete, reviewer):
    a = rec.get("appraisal")
    if not a:
        raise ValueError("no structured appraisal framework applies to this publication type")
    for k, v in (items or {}).items():
        if k not in a["items"]:
            raise ValueError(f"unknown appraisal item '{k}' for {a['framework']}")
        if v.get("status") not in STATUSES:
            raise ValueError(f"invalid status for '{k}'")
        a["items"][k].update(status=v["status"], note=str(v.get("note", ""))[:500], source=f"reviewer:{reviewer}", at=now_iso())
    if complete:
        pending = [k for k, v in a["items"].items() if v["status"] == "not_assessed"]
        if pending:
            raise ValueError("cannot complete: unassessed items remain: " + ", ".join(pending))
        a.update(completed=True, completed_by=reviewer, completed_at=now_iso())
    else:
        a.update(completed=False, completed_by=None, completed_at=None)
