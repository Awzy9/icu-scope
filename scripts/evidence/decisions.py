"""Editorial decisions (from the CLI or the web review API). Every decision needs a documented
note, is validated against the safety rules, and is written to the immutable audit log."""
import glob
import json
import os
import shutil

from .ledger import LedgerError, now_iso, PROTECTIVE
from . import appraisal as appraisal_mod
from .pipeline import material_hash

CLINICAL_FIELDS = ("population", "sample_size", "intervention", "comparator", "primary_outcomes", "main_results", "statistical_interpretation", "limitations")
ACTIONS = {"approve", "reject", "approve_ai", "approve_ai_practice", "reject_ai", "mark_full_text_reviewed", "mark_clinically_reviewed",
           "accept_update", "reject_update", "restore_to_review", "archive", "investigate", "set_fields", "set_appraisal"}


def apply_decision(pipe, d, archive_lookup=None):
    L = pipe.ledger
    for k in ("content_id", "action", "reviewer", "note"):
        if not str(d.get(k) or "").strip():
            raise LedgerError(f"decision missing '{k}'")
    if d["action"] not in ACTIONS:
        raise LedgerError(f"unknown action {d['action']}")
    rec = L.records.get(d["content_id"])
    if rec is None:
        raise LedgerError("unknown content_id")
    actor, note, a = f"reviewer:{d['reviewer']}", d["note"].strip(), d["action"]
    L.audit.append(actor, "decision", rec["content_id"], decision=a, note=note, via=d.get("via", "cli"))

    if a == "approve":
        if rec["state"] in PROTECTIVE:
            raise LedgerError("protected content must first be moved to reassessment (restore_to_review)")
        if rec["source_verification"]["status"] not in ("verified", "discrepancy", "not_applicable"):
            raise LedgerError(f"cannot approve: source verification is '{rec['source_verification']['status']}'")
        if rec["state"] == "pending_review" or rec["state"] == "unverified":
            L.transition(rec, "verified", actor, note)
        if rec["state"] in ("verified", "updated"):
            L.transition(rec, "published", actor, note)
        L.unflag(rec, "reassess_after_correction", actor)
        art = (archive_lookup or (lambda r: None))(rec)
        if art:
            pipe.snapshot(rec, art)
    elif a == "reject":
        L.transition(rec, "archived", actor, note)
        L.flag(rec, "rejected_by_editor", actor)
    elif a == "archive":
        L.transition(rec, "archived", actor, note)
    elif a == "investigate":
        L.transition(rec, "under_investigation", actor, note)
    elif a == "restore_to_review":
        if rec["state"] not in PROTECTIVE | {"archived"}:
            raise LedgerError("only protected/archived content needs restoration to review")
        if rec["state"] == "retracted":
            rec["retraction_status"] = "unknown"   # source is re-queried; sticky retraction re-applies if still retracted
        L.transition(rec, "pending_review", actor, note, reassessed=True)
        rec["source_verification"]["status"] = "not_checked"   # force fresh verification
        rec["next_check"] = None
    elif a in ("approve_ai", "approve_ai_practice"):
        if rec["ai"]["status"] not in ("auto_validated", "editor_approved"):
            raise LedgerError(f"AI content is '{rec['ai']['status']}': it must pass automated grounding validation before editorial approval")
        if rec["state"] in PROTECTIVE or rec["retraction_status"] in ("retracted", "expression_of_concern"):
            raise LedgerError("AI content for protected publications cannot be approved")
        rec["ai"].update(status="editor_approved", reviewer=d["reviewer"], approved_at=now_iso())
        if a == "approve_ai_practice":
            rec["ai"]["practice_text_approved"] = True
        L.unflag(rec, "reassess_after_correction", actor)
    elif a == "reject_ai":
        rec["ai"].update(status="rejected", reviewer=d["reviewer"], practice_text_approved=False)
    elif a == "mark_full_text_reviewed":
        rec["full_text_review"] = {"status": "completed", "reviewer": d["reviewer"], "date": now_iso()}
    elif a == "mark_clinically_reviewed":
        rec["clinical_review"] = {"status": "completed", "reviewer": d["reviewer"], "date": now_iso()}
    elif a == "set_fields":
        for k, v in (d.get("fields") or {}).items():
            if k not in CLINICAL_FIELDS:
                raise LedgerError(f"field '{k}' is not editable")
            L.audit.append(actor, "field_edit", rec["content_id"], field=k, old=rec[k], new=v)
            rec[k] = str(v).strip() or "Unable to verify"
    elif a == "set_appraisal":
        appraisal_mod.ensure_appraisal(rec)
        try:
            appraisal_mod.apply_appraisal(rec, d.get("items"), bool(d.get("complete")), d["reviewer"])
        except ValueError as e:
            raise LedgerError(str(e))
        L.audit.append(actor, "appraisal_updated", rec["content_id"], framework=rec["appraisal"]["framework"], completed=rec["appraisal"]["completed"])
    elif a == "accept_update":
        pu = rec.get("pending_update")
        if not pu:
            raise LedgerError("no pending update")
        rec["_accepted_update"] = pu["article"]       # applied to the archive by the caller
        rec["pending_update"], rec["approved_snapshot"] = None, None
        L.unflag(rec, "source_changed", actor)
        rec["version"] += 1
        if rec["state"] == "published":
            L.transition(rec, "updated", actor, note)
            L.transition(rec, "published", actor, "update re-approved")
    elif a == "reject_update":
        rec["pending_update"] = None
        L.unflag(rec, "source_changed", actor)
    rec["last_updated"] = now_iso()
    return rec


def process_dir(pipe, decisions_dir, archive_lookup=None):
    """Apply decisions/*.json in timestamp order; move to applied/ or rejected/."""
    results = []
    for path in sorted(glob.glob(os.path.join(decisions_dir, "*.json"))):
        name = os.path.basename(path)
        try:
            with open(path, encoding="utf-8") as f:
                d = json.load(f)
            apply_decision(pipe, d, archive_lookup)
            dest, ok, err = "applied", True, ""
        except (LedgerError, json.JSONDecodeError, KeyError) as e:
            dest, ok, err = "rejected", False, str(e)
            cid = locals().get("d", {}).get("content_id", "") if isinstance(locals().get("d"), dict) else ""
            pipe.ledger.audit.append("system:decisions", "decision_rejected", cid, file=name, error=err)
        os.makedirs(os.path.join(decisions_dir, dest), exist_ok=True)
        shutil.move(path, os.path.join(decisions_dir, dest, name))
        results.append({"file": name, "ok": ok, "error": err})
    return results
