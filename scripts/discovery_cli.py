#!/usr/bin/env python3
"""ICU Scope literature discovery CLI.

  backfill --days N [--only ID]   controlled historical recovery (resumable, idempotent, never overwrites approved content)
  retry                           retry articles stuck in pending_retry / retrieval_failed
  reconcile                       compare discovered -> retrieved -> stored -> verification record -> displayed; re-queue recoverable gaps
  trace PMID                      follow one article: discovery -> retrieval -> storage -> verification -> approval -> display
  status [--fail-on-degraded]     print the monitoring status (exit 1 if degraded)
Exit codes: 0 ok, 1 degraded / unresolved problems, 2 internal error.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("CONTACT_EMAIL", os.environ.get("CONTACT_EMAIL", ""))
import fetch_articles as F  # noqa: E402
from discovery import archive as darch, engine as dengine, reconcile as drec, status as dstatus  # noqa: E402
from evidence import http  # noqa: E402
from evidence.pipeline import Pipeline  # noqa: E402

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")


def _ctx(data_dir=None, **cfg):
    d = data_dir or DATA
    eng = dengine.Engine(d, config=cfg or None)
    from evidence.ledger import Ledger
    ev = Pipeline(Ledger(d))
    F.EVIDENCE = ev
    eng.dup_check = F.duplicate_check
    return d, eng, ev


def _store(d, eng, ev):
    arch_path = os.path.join(d, "archive.json")
    archive = darch.load_archive(arch_path)
    added, kept = darch.merge_payloads(eng, archive, guard=ev.guard_update)
    darch.save_archive(arch_path, archive)          # body stored BEFORE statuses are advanced to anything beyond awaiting
    ev.persist()
    return archive, added, kept


def cmd_backfill(a):
    d, eng, ev = _ctx(backfill_days=a.days)
    eng.run_backfill(a.days, only=set(a.only) if a.only else None)
    eng.run_europepmc_backfill(a.days)
    eng.retrieve(F.discovery_article_builder, limit=a.limit)
    archive, added, kept = _store(d, eng, ev)
    run = eng.finish()
    print(json.dumps({"added_to_archive": added, "already_present": kept, "retrieved": run["retrieved"], "rejected": run["rejected"], "duplicates": run["duplicates"],
                      "uncertain": run["uncertain"], "failed_requests": len(run["failed_requests"]), "counts": run["counts"]}, indent=1))
    return 1 if run["failed_requests"] else 0


def cmd_retry(a):
    d, eng, ev = _ctx()
    eng.retrieve(F.discovery_article_builder)
    _store(d, eng, ev)
    run = eng.finish()
    print(json.dumps({"retrieved": run["retrieved"], "still_pending": run["counts"]["pending_retry"]}))
    return 0


def cmd_reconcile(a):
    d, eng, ev = _ctx()
    archive = darch.load_archive(os.path.join(d, "archive.json"))
    shown = drec.displayed_pmids(json.load(open(os.path.join(d, "articles.json"), encoding="utf-8")))
    rep = drec.reconcile(eng.ledger, archive, ev, shown, eng.cfg["max_attempts"])
    eng.ledger.save()
    with open(os.path.join(d, "reconciliation.json"), "w", encoding="utf-8") as f:
        json.dump(rep, f, indent=1, ensure_ascii=False)
    print(drec.report_markdown(rep))
    return 1 if rep["unrecoverable"] else 0


def cmd_trace(a):
    """Follow one article through every stage: discovery -> retrieval -> storage -> verification -> approval -> website."""
    d, eng, ev = _ctx()
    pmid = str(a.pmid)
    rec = eng.ledger.get(pmid)
    archive = darch.load_archive(os.path.join(d, "archive.json"))
    in_arch = [c for c, b in archive["categories"].items() if pmid in b]
    shown = drec.displayed_pmids(json.load(open(os.path.join(d, "articles.json"), encoding="utf-8")))
    er = ev.rec_for({"pmid": pmid})
    out = {"pmid": pmid, "discovered": bool(rec), "title": (rec or {}).get("title"),
           "found_by": {"strategies": (rec or {}).get("strategies"), "specialties": (rec or {}).get("specialties"), "sources": (rec or {}).get("sources")},
           "status": (rec or {}).get("status"), "status_reason": (rec or {}).get("status_reason"), "relevance": (rec or {}).get("relevance"),
           "stored_in_archive_categories": in_arch,
           "verification": ({"state": er["state"], "source_verification": er["source_verification"]["status"], "retraction_status": er["retraction_status"], "flags": er["flags"],
                             "editorial_reviewer": er["editorial_reviewer"]} if er else None),
           "displayed_on_website": pmid in shown, "history": [{"at": h[0], "status": h[1], "reason": h[2]} for h in (rec or {}).get("history", [])]}
    print(json.dumps(out, indent=1, ensure_ascii=False))
    return 0 if rec else 1


def cmd_status(a):
    st = json.load(open(os.path.join(DATA, "discovery_status.json"), encoding="utf-8"))
    print(json.dumps({k: st[k] for k in ("health", "problems", "last_successful_retrieval", "this_run", "totals")}, indent=1))
    return 1 if (a.fail_on_degraded and st["health"] != "healthy") else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    p = sp.add_parser("backfill"); p.add_argument("--days", type=int, default=30); p.add_argument("--only", nargs="*"); p.add_argument("--limit", type=int, default=None); p.set_defaults(fn=cmd_backfill)
    sp.add_parser("retry").set_defaults(fn=cmd_retry)
    sp.add_parser("reconcile").set_defaults(fn=cmd_reconcile)
    p = sp.add_parser("trace"); p.add_argument("pmid"); p.set_defaults(fn=cmd_trace)
    p = sp.add_parser("status"); p.add_argument("--fail-on-degraded", action="store_true"); p.set_defaults(fn=cmd_status)
    args = ap.parse_args(argv)
    try:
        return args.fn(args)
    except Exception as e:
        http.log_event("error", "discovery_cli_failure", error=f"{type(e).__name__}: {e}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
