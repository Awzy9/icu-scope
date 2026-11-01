"""Keeps the discovery status in step with the evidence (verification/approval) ledger and with what is actually on the website,
and applies the bounded display policy WITHOUT making any article disappear unexplained."""
import re

from evidence import publish as ev_publish
from evidence.ledger import PROTECTIVE

from . import ledger as L
from .dates import effective_date

TIER1_TYPES = ("randomized", "meta-analysis", "systematic review", "guideline")


def tier(article):
    st = (article.get("study_type") or "").lower()
    if any(t in st for t in TIER1_TYPES):
        return 0
    return 1 if article.get("is_top_journal") else 2


def apply_display_policy(category_articles, cap, today=None):
    """Keep the `cap` best per category (high-evidence first, then newest). -> (kept, excluded[(article, reason)]).
    Excluded articles stay in the archive and keep status `published` with an explicit display reason - never silent."""
    def key(a):
        d, _ = effective_date(a, today)
        return (tier(a), -(d.toordinal() if d else 0))
    ranked = sorted(category_articles, key=key)
    kept, excl = ranked[:cap], [(a, f"display cap ({cap}/category) - lower-ranked than {cap} higher-evidence/newer items") for a in ranked[cap:]]
    # preserve original (date-desc) order for display
    order = {id(a): i for i, a in enumerate(category_articles)}
    kept.sort(key=lambda a: order[id(a)])
    return kept, excl


def sync_statuses(dledger, evidence, displayed_pmids, display_excluded):
    """Derive each article's status from verifiable facts. Returns number of transitions."""
    n = 0
    for rec in list(dledger.articles.values()):
        pmid, st = rec["pmid"], rec["status"]
        if st in (L.DISCOVERED, L.RETRIEVAL_FAILED, L.PENDING_RETRY, L.REJECTED, L.DUPLICATE):
            continue
        er = evidence.rec_for({"pmid": pmid})
        if er is None:
            continue                       # reconciliation reports 'stored_not_ingested'
        rec["evidence_id"] = er["content_id"]
        state, sv = er["state"], er["source_verification"]["status"]
        if state == "archived":
            reason = "rejected by editor" if "rejected_by_editor" in er["flags"] else "correction/retraction notice or archived by editor"
            n += dledger.move(pmid, L.REJECTED, reason)
        elif state in ("published", "updated", "under_investigation", "retracted"):
            if pmid in displayed_pmids:
                rec["displayed"], rec["display_reason"] = True, ""
                n += dledger.move(pmid, L.PUBLISHED, f"verified and displayed (evidence state: {state})")
            elif pmid in display_excluded:
                rec["displayed"], rec["display_reason"] = False, display_excluded[pmid]
                n += dledger.move(pmid, L.PUBLISHED, f"published; not in public feed: {display_excluded[pmid]}")
            else:
                rec["displayed"] = False                          # unexplained -> reconciliation flags it
        elif state == "verified":
            n += dledger.move(pmid, L.APPROVED, "verified; awaiting publication")
        else:   # unverified / pending_review
            rel = "relevance_review" in er["flags"]
            why = ("editorial review required" + (" (ICU relevance uncertain)" if rel else "")) if state == "pending_review" else \
                  ("source verification failed - rechecked on schedule" if sv == "failed" else
                   "awaiting source verification" + (" and editorial ICU-relevance review (will not publish without a reviewer's approval)" if rel else ""))
            n += dledger.move(pmid, L.AWAITING, why)
    return n
