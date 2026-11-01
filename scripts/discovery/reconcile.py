"""Stage reconciliation: discovered -> retrieved -> stored (archive) -> verification record -> displayed.

An article present at one stage and absent from the next WITHOUT a recorded reason is a discrepancy. Recoverable ones are
re-queued automatically; the rest are reported to administrators. Also reports articles an independent source (Europe PMC)
knows about that the PubMed strategies never found (strategy gaps)."""
import datetime as dt

from evidence.ledger import now_iso
from . import ledger as L

STALL_DAYS = 14


def archive_pmids(archive):
    out = set()
    for sec, bucket in archive.items():
        for g in (bucket.values() if sec == "categories" else [bucket]):
            for a in g.values():
                if a.get("pmid"):
                    out.add(str(a["pmid"]))
    return out


def displayed_pmids(articles_json):
    out = set()
    for c in articles_json.get("categories", []):
        out.update(str(a["pmid"]) for a in c.get("articles", []) if a.get("pmid"))
    for k in ("trending", "guidelines", "ksa", "this_week", "preprints", "trials", "foamed", "bottom_line"):
        out.update(str(a["pmid"]) for a in (articles_json.get(k) or {}).get("articles", []) if a.get("pmid"))
    return out


def reconcile(dledger, archive, evidence, shown, max_attempts=6, today=None, requeue=True):
    """-> report dict. Mutates dledger only to re-queue recoverable failures (status pending_retry)."""
    stored = archive_pmids(archive)
    disc, now = [], dt.datetime.now(dt.timezone.utc)
    stages = {"discovered": len(dledger.articles), "retrieved": 0, "stored": 0, "verification_record": 0, "displayed": 0}
    explained = {"rejected": 0, "duplicate": 0, "pending_retry": 0, "awaiting_verification": 0, "not_in_public_feed_by_policy": 0}

    def add(pmid, typ, detail, recoverable, action=""):
        disc.append({"pmid": pmid, "type": typ, "detail": detail, "recoverable": recoverable, "action": action, "title": (dledger.get(pmid) or {}).get("title", "")})

    for rec in dledger.articles.values():
        pmid, st = rec["pmid"], rec["status"]
        if st not in (L.DISCOVERED, L.RETRIEVAL_FAILED, L.PENDING_RETRY):
            stages["retrieved"] += 1
        if st == L.REJECTED:
            explained["rejected"] += 1
            if pmid in shown:
                add(pmid, "rejected_but_displayed", rec["status_reason"], False, "investigate: rejected article is on the website")
            continue
        if st == L.DUPLICATE:
            explained["duplicate"] += 1
            continue
        if st in (L.DISCOVERED, L.RETRIEVAL_FAILED, L.PENDING_RETRY):
            explained["pending_retry"] += 1
            if rec["attempts"] >= max_attempts:
                add(pmid, "retrieval_exhausted", rec.get("last_error") or "", False, "administrator: automatic attempts exhausted")
            elif st == L.DISCOVERED:
                if requeue:
                    dledger.move(pmid, L.PENDING_RETRY, "discovered but metadata not retrieved - re-queued by reconciliation"); rec["next_retry"] = None
                add(pmid, "discovered_not_retrieved", "metadata never retrieved", True, "re-queued")
            continue
        # retrieved or later
        in_archive = pmid in stored
        stages["stored"] += in_archive
        if not in_archive:
            add(pmid, "retrieved_not_stored", f"status {st} but article body absent from the archive", True, "re-queued for retrieval")
            if requeue:
                dledger.move(pmid, L.PENDING_RETRY, "reconciliation: retrieved but not stored - refetching"); rec["next_retry"] = None
            continue
        er = evidence.rec_for({"pmid": pmid})
        if er is None:
            add(pmid, "stored_not_ingested", "in archive but has no verification record", True, "will be ingested on the next run")
            continue
        stages["verification_record"] += 1
        shown_here = pmid in shown
        stages["displayed"] += shown_here
        if st in (L.AWAITING, L.APPROVED):
            explained["awaiting_verification"] += 1
            age = (now - dt.datetime.fromisoformat(rec["history"][0][0])).days
            if age > STALL_DAYS and er["state"] in ("unverified", "pending_review"):
                add(pmid, "stalled_awaiting", f"{er['state']} for {age} days ({rec['status_reason'][:80]})", False, "editorial/verification attention needed")
        elif st == L.PUBLISHED:
            if not shown_here:
                if rec.get("displayed") is False and rec.get("display_reason"):
                    explained["not_in_public_feed_by_policy"] += 1
                else:
                    add(pmid, "published_not_displayed", f"evidence state {er['state']} but absent from articles.json with no recorded reason", False, "investigate display pipeline")
    # independent-source gap analysis
    only_epmc = [r for r in dledger.articles.values() if r["sources"] == ["europepmc"]]
    by_spec = {}
    for r in only_epmc:
        for s in r["specialties"]:
            by_spec[s] = by_spec.get(s, 0) + 1
    return {"generated_at": now_iso(), "stages": stages, "explained": explained, "discrepancies": disc,
            "unrecoverable": sum(1 for d in disc if not d["recoverable"]), "recoverable": sum(1 for d in disc if d["recoverable"]),
            "strategy_gap_found_only_by_europepmc": len(only_epmc), "strategy_gap_by_specialty": by_spec}


def report_markdown(rep):
    lines = ["# ICU Scope literature reconciliation", "", f"Generated {rep['generated_at']}", "",
             "| stage | articles |", "|---|---|"] + [f"| {k} | {v} |" for k, v in rep["stages"].items()]
    lines += ["", f"Explained (not a problem): {rep['explained']}", "",
              f"**Discrepancies: {len(rep['discrepancies'])}** ({rep['recoverable']} auto-recoverable, {rep['unrecoverable']} need an administrator)", ""]
    for d in rep["discrepancies"][:100]:
        lines.append(f"- `{d['type']}` PMID {d['pmid']} — {d['title'][:80]} — {d['detail']} → {d['action']}")
    if rep["strategy_gap_found_only_by_europepmc"]:
        lines += ["", f"Found only by Europe PMC (PubMed strategies missed them): {rep['strategy_gap_found_only_by_europepmc']} {rep['strategy_gap_by_specialty']}"]
    return "\n".join(lines)
