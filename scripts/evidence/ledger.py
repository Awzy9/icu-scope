"""Verification ledger (data/verification.json) + immutable hash-chained audit log
(data/audit_log.jsonl). Git history is the second, independent layer of immutability."""
import datetime as dt
import hashlib
import json
import os
import tempfile

from . import SCHEMA_VERSION
from .normalize import identity_keys, norm_text

DATA = os.path.join(os.path.dirname(__file__), "..", "..", "data")
STATES = ["unverified", "pending_review", "verified", "published", "updated", "under_investigation", "retracted", "archived"]
PROTECTIVE = {"under_investigation", "retracted"}
VISIBLE_STATES = {"published", "updated", "under_investigation", "retracted"}
NOT_REPORTED, UNABLE = "Not reported", "Unable to verify"

ALLOWED = {
    "unverified": {"pending_review", "verified", "published", "updated", "under_investigation", "retracted", "archived"},
    "pending_review": {"verified", "unverified", "published", "updated", "under_investigation", "retracted", "archived"},
    "verified": {"published", "pending_review", "updated", "under_investigation", "retracted", "archived"},
    "published": {"updated", "under_investigation", "retracted", "archived", "pending_review"},
    "updated": {"published", "under_investigation", "retracted", "archived", "pending_review"},
    # Reassessment is mandatory: protective states can only go back through pending_review.
    "under_investigation": {"pending_review", "retracted", "archived"},
    "retracted": {"pending_review", "under_investigation", "archived"},
    "archived": {"pending_review"},
}


class LedgerError(Exception):
    pass


def now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def _canon(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def atomic_write(path, text):
    d = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".tmp-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


class AuditLog:
    def __init__(self, path):
        self.path = path
        self._tail = None   # (count, last_hash) cached so appends are O(1)

    def _load_tail(self):
        if self._tail is None:
            ents = self.entries()
            self._tail = (len(ents), ents[-1]["hash"] if ents else "0" * 64)
        return self._tail

    def entries(self):
        if not os.path.exists(self.path):
            return []
        with open(self.path, encoding="utf-8") as f:
            return [json.loads(l) for l in f if l.strip()]

    def append(self, actor, action, content_id, **detail):
        count, prev = self._load_tail()
        e = {"seq": count + 1, "ts": now_iso(), "actor": actor, "action": action, "content_id": content_id, "detail": detail, "prev_hash": prev}
        e["hash"] = hashlib.sha256((prev + _canon(e)).encode()).hexdigest()
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")
        self._tail = (e["seq"], e["hash"])
        return e

    def verify_chain(self):
        """-> (ok, message). Detects edits, deletions, reordering."""
        prev = "0" * 64
        for i, e in enumerate(self.entries(), 1):
            body = {k: v for k, v in e.items() if k != "hash"}
            if e.get("seq") != i or e.get("prev_hash") != prev:
                return False, f"chain broken at entry {i}"
            if hashlib.sha256((prev + _canon(body)).encode()).hexdigest() != e.get("hash"):
                return False, f"entry {i} has been modified"
            prev = e["hash"]
        return True, "ok"


def new_record(content_id, article, content_class):
    return {
        "content_id": content_id, "content_class": content_class,
        "title": article.get("title", ""), "authors": article.get("authors") or [], "journal": article.get("journal", ""),
        "publication_date": article.get("pubdate", ""), "doi": (article.get("doi") or "").lower(), "pmid": str(article.get("pmid") or ""),
        "trial_registration": [article["nct_id"]] if article.get("nct_id") else [],
        "study_design": article.get("study_type") or UNABLE,
        "population": UNABLE, "sample_size": UNABLE, "intervention": UNABLE, "comparator": UNABLE,
        "primary_outcomes": UNABLE, "main_results": UNABLE, "statistical_interpretation": UNABLE, "limitations": UNABLE,
        "retraction_status": "unknown", "notices": [],
        "source_verification": {"status": "not_checked", "level": "metadata", "checked_at": None, "discrepancies": [], "checks": []},
        "full_text_review": {"status": "not_performed", "reviewer": None, "date": None},
        "clinical_review": {"status": "not_performed", "reviewer": None, "date": None},
        "ai": {"status": "none", "source_hash": None, "validated_at": None, "issues": [], "trace": [], "reviewer": None, "practice_text_approved": False},
        "pubtypes": [], "appraisal": None,
        "state": "unverified", "legacy": False, "flags": [],
        "editorial_reviewer": None, "verification_date": None, "last_updated": now_iso(), "version": 1,
        "approved_snapshot": None, "pending_update": None, "next_check": None, "last_attempt": None,
    }


class Ledger:
    def __init__(self, data_dir=None, policy=None):
        self.dir = os.path.abspath(data_dir or DATA)
        self.path = os.path.join(self.dir, "verification.json")
        self.audit = AuditLog(os.path.join(self.dir, "audit_log.jsonl"))
        self.records, self.aliases = {}, {}
        self.policy = policy or load_policy(self.dir)
        if os.path.exists(self.path):
            with open(self.path, encoding="utf-8") as f:
                d = json.load(f)
            self.records, self.aliases = d.get("records", {}), d.get("aliases", {})
            for r in self.records.values():     # forward-compatible schema upgrades (additive only)
                r.setdefault("pubtypes", [])
                r.setdefault("appraisal", None)

    # ---- identity / de-duplication -------------------------------------
    def find(self, article):
        hits = []
        for k in identity_keys(article):
            cid = self.aliases.get(k)
            if cid and cid not in hits:
                hits.append(cid)
        return hits

    def get_or_create(self, article, content_class, actor="system:ingest"):
        hits = self.find(article)
        keys = identity_keys(article)
        if hits:
            cid = hits[0]
            rec = self.records[cid]
            if len(hits) > 1 and "duplicate_identity_conflict" not in rec["flags"]:
                rec["flags"].append("duplicate_identity_conflict")
                self.audit.append("system:dedupe", "duplicate_conflict", cid, other_records=hits[1:])
            for k in keys:                     # learn new aliases (e.g. DOI first seen later)
                self.aliases.setdefault(k, cid)
            for fld, val in (("pmid", str(article.get("pmid") or "")), ("doi", (article.get("doi") or "").lower())):
                if val and not rec.get(fld):
                    rec[fld] = val
            return rec, False
        base = keys[0] if keys else norm_text(article.get("title"))
        cid = "ev_" + hashlib.sha1(base.encode()).hexdigest()[:12]
        if cid in self.records:
            cid += "_" + hashlib.sha1(_canon(article).encode()).hexdigest()[:4]
        rec = new_record(cid, article, content_class)
        self.records[cid] = rec
        for k in keys:
            self.aliases[k] = cid
        self.audit.append(actor, "record_created", cid, keys=keys, content_class=content_class)
        return rec, True

    # ---- state machine ---------------------------------------------------
    def transition(self, rec, to_state, actor, reason="", reassessed=False):
        frm = rec["state"]
        if frm == to_state:
            return False
        if to_state not in ALLOWED.get(frm, set()):
            raise LedgerError(f"illegal transition {frm} -> {to_state}")
        human = actor.startswith("reviewer:")
        if to_state in ("verified", "published", "updated") and rec["retraction_status"] == "retracted":
            raise LedgerError("retracted content cannot be verified/published")
        if to_state in ("verified", "published") and rec["source_verification"]["status"] == "failed":
            raise LedgerError("failed source verification prevents publication")
        if to_state in ("verified", "published") and rec["source_verification"]["status"] in ("not_checked",) and rec["content_class"] in ("original_research", "guideline"):
            raise LedgerError("publication requires completed source verification")
        if to_state in ("published", "verified") and frm == "pending_review" and not human:
            raise LedgerError("content in editorial review can only be approved by a human reviewer")
        if frm in PROTECTIVE and rec["state"] != to_state and to_state not in ("pending_review", "retracted", "under_investigation", "archived"):
            raise LedgerError("protected content requires reassessment before restoration")
        rec["state"] = to_state
        rec["last_updated"] = now_iso()
        rec["version"] += 1
        if human:
            rec["editorial_reviewer"] = actor.split(":", 1)[1]
        if to_state in ("verified", "published"):
            rec["verification_date"] = rec["verification_date"] or now_iso()
        self.audit.append(actor, "state_change", rec["content_id"], from_state=frm, to_state=to_state, reason=reason, reassessed=reassessed)
        return True

    def flag(self, rec, flag, actor="system"):
        if flag not in rec["flags"]:
            rec["flags"].append(flag)
            self.audit.append(actor, "flag_added", rec["content_id"], flag=flag)

    def unflag(self, rec, flag, actor):
        if flag in rec["flags"]:
            rec["flags"].remove(flag)
            self.audit.append(actor, "flag_cleared", rec["content_id"], flag=flag)

    def save(self):
        atomic_write(self.path, json.dumps({"schema_version": SCHEMA_VERSION, "records": self.records, "aliases": self.aliases},
                                           indent=1, ensure_ascii=False, sort_keys=True) + "\n")


def load_policy(data_dir):
    p = {"strict_mode": False, "max_verify_per_run": 400, "recheck_days_recent": 7, "recheck_days_old": 30, "recent_years": 2,
         "surveillance_budget": 250}
    path = os.path.join(data_dir, "evidence_policy.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            p.update(json.load(f))
    return p
