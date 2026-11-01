"""Publication gate: which records may be shown, what the public sees, what AI text is allowed."""
from .ledger import VISIBLE_STATES, PROTECTIVE, now_iso

CLASS_LABELS = {
    "original_research": "Original research", "evidence_synthesis": "Evidence synthesis (systematic review / meta-analysis)",
    "review": "Review article", "guideline": "Guideline publication", "registry_record": "Trial registry record (no results)",
    "preprint": "Preprint — not peer-reviewed", "expert_interpretation": "Expert interpretation (not primary research)",
    "landmark_trial": "Curated landmark trial (editorial summary)",
}
SECTION_CLASS = {"foamed": "expert_interpretation", "bottom_line": "expert_interpretation", "preprints": "preprint",
                 "trials": "registry_record", "guidelines": "guideline", "classics": "landmark_trial"}
# Never promoted as "current evidence" while in a protective state or retracted.
PROMOTION_SECTIONS = {"trending", "this_week", "spotlight", "guidelines", "trials"}
STRICT_PROMOTION = {"trending", "this_week"}      # must be published/updated (i.e. approved) to be featured
# Sections that must never contain retracted / under-investigation / EoC items. (Legacy items awaiting
# review may still appear in Guideline Watch / Trial lists; they are labelled, not featured.)


def classify(article, section):
    if section in SECTION_CLASS:
        return SECTION_CLASS[section]
    st = article.get("study_type") or ""
    if st in ("Guideline", "Practice Guideline"):
        return "guideline"
    if st in ("Systematic Review", "Meta-Analysis"):
        return "evidence_synthesis"
    if st == "Review":
        return "review"
    return "original_research"


def is_visible(rec):
    if rec["source_verification"]["status"] == "failed":
        return False
    if rec["state"] in VISIBLE_STATES:
        return True
    return bool(rec.get("legacy")) and rec["state"] in ("unverified", "pending_review", "verified")


def is_promotable(rec):
    """May this item be featured as current evidence (trending, this-week, spotlight)?"""
    return (rec["state"] in ("published", "updated") and rec["retraction_status"] not in ("retracted", "expression_of_concern")
            and "reassess_after_correction" not in rec["flags"])


def ai_generation_allowed(rec):
    """Rule 1: AI text may only be generated from verified source material of unprotected content."""
    return (rec["source_verification"]["status"] in ("verified", "not_applicable") and rec["state"] not in PROTECTIVE
            and rec["retraction_status"] not in ("retracted", "expression_of_concern") and "reassess_after_correction" not in rec["flags"]
            and is_visible(rec))


def allowed_ai_fields(rec):
    """Names of AI-generated fields that may be shown publicly for this record."""
    ai, st = rec["ai"], rec["ai"]["status"]
    if not is_visible(rec) or rec["state"] in PROTECTIVE or rec["retraction_status"] in ("retracted", "expression_of_concern"):
        return set()
    if "reassess_after_correction" in rec["flags"] and st != "editor_approved":
        return set()
    base = {"ai_summary", "ai_significance", "ai_key_stats", "ai_appraisal_core"}
    if st == "editor_approved":
        return base | ({"ai_rounds_takeaway", "ai_appraisal_bottom_line"} if ai.get("practice_text_approved") else set())
    if st == "auto_validated":
        return base
    return set()


AI_ARTICLE_FIELDS = ("ai_summary", "ai_significance", "ai_key_stats", "ai_rounds_takeaway", "ai_appraisal")


def apply_ai_policy(article, rec):
    allowed = allowed_ai_fields(rec)
    for f in ("ai_summary", "ai_significance", "ai_key_stats", "ai_rounds_takeaway"):
        if f in article and f not in allowed:
            del article[f]
    appr = article.get("ai_appraisal")
    if appr is not None:
        if "ai_appraisal_core" not in allowed:
            del article["ai_appraisal"]
        elif "ai_appraisal_bottom_line" not in allowed and "bottom_line" in appr:
            article["ai_appraisal"] = {k: v for k, v in appr.items() if k != "bottom_line"}
    return article


def public_evidence(rec):
    sv, ai = rec["source_verification"], rec["ai"]
    ok = sv["status"] == "verified"
    return {
        "id": rec["content_id"], "state": rec["state"], "class": rec["content_class"], "class_label": CLASS_LABELS.get(rec["content_class"], ""),
        "source_verified": ok, "verification_level": "metadata" if ok else None,
        "last_verified": (sv.get("checked_at") or "")[:10] if ok else None,
        "full_text_reviewed": rec["full_text_review"]["status"] == "completed",
        "clinically_reviewed": rec["clinical_review"]["status"] == "completed" and bool(rec["clinical_review"].get("reviewer")),
        "ai_status": ai["status"] if allowed_ai_fields(rec) else ("withheld" if ai["status"] not in ("none",) else "none"),
        "ai_practice_approved": "ai_rounds_takeaway" in allowed_ai_fields(rec),
        "retraction_status": rec["retraction_status"],
        "notices": [{"type": n["type"], "date": n.get("date", ""), "doi": n.get("doi", ""), "pmid": n.get("pmid", "")} for n in rec["notices"]
                    if not n["type"].endswith("_notice")][:6],
        "appraisal": ({"framework": (rec.get("appraisal") or {}).get("framework"), "completed_by_reviewer": True}
                      if (rec.get("appraisal") or {}).get("completed") and rec["appraisal"].get("completed_by") else None),
        "unverified_legacy": bool(rec.get("legacy")) and not ok,
        "needs_reassessment": "reassess_after_correction" in rec["flags"] or rec["state"] in PROTECTIVE,
        "pending_update": bool(rec.get("pending_update")),
    }


def stamp(article, rec):
    apply_ai_policy(article, rec)
    article["evidence"] = public_evidence(rec)
    return article


def safety_check(output, ledger, sections_of=None):
    """Critical pre-deploy checks over the final articles.json object. -> list of findings."""
    from .normalize import identity_keys
    F = []

    def add(sev, code, msg, ref=""):
        F.append({"severity": sev, "code": code, "message": msg, "ref": ref})

    ok, msg = ledger.audit.verify_chain()
    if not ok:
        add("critical", "audit_chain", f"Audit log integrity failure: {msg}")

    def walk():
        for c in output.get("categories", []):
            for a in c.get("articles", []):
                yield f"categories/{c['id']}", a
        for k in ("trending", "foamed", "bottom_line", "guidelines", "ksa", "this_week", "preprints", "trials"):
            for a in (output.get(k) or {}).get("articles", []):
                yield k, a

    for sec, a in walk():
        ref = f"{sec}:{a.get('pmid') or a.get('nct_id') or a.get('url')}"
        ev = a.get("evidence")
        if not ev:
            add("critical", "no_evidence_block", "Published item has no verification record", ref)
            continue
        rec = ledger.records.get(ev["id"])
        if rec is None or not is_visible(rec):
            add("critical", "invisible_published", f"Item is published but its record is missing/not visible ({rec['state'] if rec else 'no record'})", ref)
            continue
        if ev["source_verified"] and rec["source_verification"]["status"] != "verified":
            add("critical", "false_badge", "source_verified badge without completed verification", ref)
        if ev["clinically_reviewed"] and not rec["clinical_review"].get("reviewer"):
            add("critical", "false_badge", "clinically_reviewed badge without reviewer", ref)
        if ev["full_text_reviewed"] and rec["full_text_review"]["status"] != "completed":
            add("critical", "false_badge", "full_text_reviewed badge without full-text review", ref)
        if ev.get("appraisal") and not ((rec.get("appraisal") or {}).get("completed") and rec["appraisal"].get("completed_by")):
            add("critical", "false_badge", "structured-appraisal badge without a completed reviewer appraisal", ref)
        if ev.get("ai_practice_approved") and not rec["ai"].get("practice_text_approved"):
            add("critical", "false_badge", "practice text flagged approved without editorial approval", ref)
        shown = {f for f in AI_ARTICLE_FIELDS if a.get(f)}
        if shown:
            allowed = allowed_ai_fields(rec)
            for f in shown:
                if f == "ai_appraisal":
                    if "ai_appraisal_core" not in allowed or ("bottom_line" in a["ai_appraisal"] and "ai_appraisal_bottom_line" not in allowed):
                        add("critical", "ai_not_validated", "AI appraisal shown without required validation/approval", ref)
                elif f not in allowed:
                    add("critical", "ai_not_validated", f"{f} shown without required validation/approval", ref)
        sec_root = sec.split("/")[0]
        if rec["retraction_status"] == "retracted" and sec_root in PROMOTION_SECTIONS:
            add("critical", "retracted_promoted", "Retracted publication promoted as current evidence", ref)
        if sec_root in STRICT_PROMOTION and not is_promotable(rec) and rec["content_class"] != "expert_interpretation":
            add("critical" if rec["state"] in PROTECTIVE else "warning", "unpromotable_promoted", f"Item in state '{rec['state']}' shown in {sec_root}", ref)
        if rec["content_class"] in ("original_research", "evidence_synthesis", "review", "guideline") and not a.get("title"):
            add("critical", "missing_field", "Missing title", ref)
        if rec["content_class"] in ("original_research", "evidence_synthesis", "guideline") and not (a.get("pmid") or a.get("doi")):
            add("critical", "missing_field", "Clinical publication without PMID or DOI", ref)
        if rec["source_verification"]["status"] == "failed":
            add("critical", "failed_verification_published", "Item with failed source verification is published", ref)

    for sec in ("trending", "foamed", "bottom_line", "guidelines", "ksa", "this_week", "preprints", "trials"):
        seen = set()
        for a in (output.get(sec) or {}).get("articles", []):
            k = (identity_keys(a) or [""])[0]
            if k in seen:
                add("critical", "duplicate", f"Duplicate publication in {sec}", k)
            seen.add(k)
    for c in output.get("categories", []):
        seen = set()
        for a in c.get("articles", []):
            k = (identity_keys(a) or [""])[0]
            if k in seen:
                add("critical", "duplicate", f"Duplicate publication in category {c['id']}", k)
            seen.add(k)

    sp = output.get("spotlight") or {}
    if sp.get("pmid"):
        ids = ledger.find({"pmid": sp["pmid"]})
        if not ids or not is_promotable(ledger.records[ids[0]]):
            add("critical", "spotlight_ineligible", "Article of the Week is not verified/promotable", sp["pmid"])
    return F


def publish_if_safe(output, ledger, out_path):
    """Atomically replace out_path only if no critical safety finding exists.
    On failure the currently deployed file is left byte-for-byte intact.
    -> (written: bool, findings)"""
    import json
    from .ledger import atomic_write
    findings = safety_check(output, ledger)
    if any(f["severity"] == "critical" for f in findings):
        return False, findings
    atomic_write(out_path, json.dumps(output, indent=2, ensure_ascii=False))
    return True, findings
