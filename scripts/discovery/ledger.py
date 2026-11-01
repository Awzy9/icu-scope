"""Per-article processing ledger: every discovered article has exactly one status and a complete transition history.

An article can leave the pipeline only through an explicit, reasoned terminal status (duplicate / rejected); there is no
code path that deletes a record. Missing fields, API failures and format differences route to retrieval_failed /
pending_retry / awaiting_verification (review), never to silent discard.
"""
import json
import os

from evidence.ledger import atomic_write, now_iso

DISCOVERED, RETRIEVED, AWAITING, APPROVED, PUBLISHED = "discovered", "retrieved", "awaiting_verification", "approved", "published"
DUPLICATE, REJECTED, RETRIEVAL_FAILED, PENDING_RETRY = "duplicate", "rejected", "retrieval_failed", "pending_retry"
STATUSES = [DISCOVERED, RETRIEVED, AWAITING, APPROVED, PUBLISHED, DUPLICATE, REJECTED, RETRIEVAL_FAILED, PENDING_RETRY]

ALLOWED = {
    DISCOVERED: {RETRIEVED, RETRIEVAL_FAILED, PENDING_RETRY, DUPLICATE, REJECTED},
    RETRIEVAL_FAILED: {PENDING_RETRY, RETRIEVED},
    PENDING_RETRY: {RETRIEVED, RETRIEVAL_FAILED, PENDING_RETRY},
    RETRIEVED: {AWAITING, DUPLICATE, REJECTED, PENDING_RETRY},
    AWAITING: {APPROVED, PUBLISHED, REJECTED, PENDING_RETRY, AWAITING, DUPLICATE},
    APPROVED: {PUBLISHED, AWAITING, REJECTED, PENDING_RETRY},
    PUBLISHED: {AWAITING, APPROVED, PUBLISHED, REJECTED},     # e.g. retraction/reassessment pulls it back to review
    DUPLICATE: {AWAITING, REJECTED},                          # an editor can overturn a duplicate decision
    REJECTED: {AWAITING},                                     # an editor / improved classifier can reinstate
}


class StatusError(Exception):
    pass


class DiscoveryLedger:
    def __init__(self, path):
        self.path = path
        self.articles = {}
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                self.articles = json.load(f).get("articles", {})

    def get(self, pmid):
        return self.articles.get(str(pmid))

    def discover(self, pmid, strategy, specialty, source="pubmed"):
        """Register a hit. Idempotent; returns (record, is_new)."""
        pmid = str(pmid)
        rec = self.articles.get(pmid)
        if rec is None:
            rec = {"pmid": pmid, "status": DISCOVERED, "status_reason": f"found by {strategy}", "history": [[now_iso(), DISCOVERED, f"found by {strategy} ({source})"]],
                   "strategies": [], "specialties": [], "sources": [], "first_seen": now_iso(), "attempts": 0, "last_error": None, "next_retry": None}
            self.articles[pmid] = rec
            new = True
        else:
            new = False
        for key, val in (("strategies", strategy), ("specialties", specialty), ("sources", source)):
            if val and val not in rec[key]:
                rec[key].append(val)
        return rec, new

    def move(self, pmid, to_status, reason=""):
        rec = self.articles[str(pmid)]
        frm = rec["status"]
        if to_status not in STATUSES:
            raise StatusError(f"unknown status {to_status}")
        if frm == to_status and to_status not in (PENDING_RETRY, AWAITING, PUBLISHED):
            return False
        if to_status != frm and to_status not in ALLOWED.get(frm, set()):
            raise StatusError(f"illegal transition {frm} -> {to_status} for {pmid}")
        if to_status in (REJECTED, DUPLICATE) and not reason:
            raise StatusError("rejected/duplicate requires a reason")
        if frm == to_status and rec["status_reason"] == reason:
            return False
        rec["status"], rec["status_reason"] = to_status, reason
        rec["history"].append([now_iso(), to_status, reason])
        return True

    def fail(self, pmid, error, max_attempts=6):
        """Record a retrieval failure -> pending_retry (never dropped, even after max attempts: it stays visible to admins)."""
        rec = self.articles[str(pmid)]
        rec["attempts"] += 1
        rec["last_error"] = str(error)[:200]
        if rec["status"] == DISCOVERED:
            self.move(pmid, RETRIEVAL_FAILED, f"attempt {rec['attempts']}: {rec['last_error']}")
        self.move(pmid, PENDING_RETRY, f"attempt {rec['attempts']}/{max_attempts}: {rec['last_error']}" + (" - exceeded automatic attempts, needs administrator" if rec["attempts"] >= max_attempts else ""))

    def by_status(self, *statuses):
        return [r for r in self.articles.values() if r["status"] in statuses]

    def counts(self):
        c = {s: 0 for s in STATUSES}
        for r in self.articles.values():
            c[r["status"]] += 1
        return c

    def save(self):
        atomic_write(self.path, json.dumps({"schema_version": 1, "articles": self.articles}, ensure_ascii=False, separators=(",", ":")) + "\n")
