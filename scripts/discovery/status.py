"""Administrator monitoring status (data/discovery_status.json).

Keep editorial-review backlog visible without conflating it with operational
failures. The clinical publication safety gate is independent and unchanged.
"""
import datetime as dt
import json

from evidence.ledger import atomic_write, now_iso
from . import ledger as L
from . import strategies

STALE_HOURS = 36


def build_status(engine, report, path):
    led, st, run = engine.ledger, engine.state, engine.run
    counts = led.counts()
    reasons = {}
    for r in led.by_status(L.REJECTED, L.DUPLICATE):
        k = r["status_reason"].split(":")[0][:80]
        reasons[k] = reasons.get(k, 0) + 1
    spec = {s["id"]: {"label": s["label"], "total_discovered": 0, "relevant_or_review": 0, "published": 0, "new_this_run": run["specialty_new"].get(s["id"], 0)} for s in strategies.SPECIALTIES}
    for r in led.articles.values():
        for sp in r["specialties"]:
            if sp in spec:
                spec[sp]["total_discovered"] += 1
                if r["status"] in (L.AWAITING, L.APPROVED, L.PUBLISHED):
                    spec[sp]["relevant_or_review"] += 1
                if r["status"] == L.PUBLISHED:
                    spec[sp]["published"] += 1
    pend = led.by_status(L.PENDING_RETRY, L.RETRIEVAL_FAILED)
    last_ok = st.get("last_success")
    stale = (not last_ok) or (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(last_ok)).total_seconds() > STALE_HOURS * 3600
    operational_problems = []
    editorial_problems = []
    if run["failed_requests"]:
        operational_problems.append(f"{len(run['failed_requests'])} failed request(s) this run")
    if stale:
        operational_problems.append("no fully successful retrieval in the last %dh" % STALE_HOURS)

    # An article awaiting human verification is not a broken retrieval.
    # Other discrepancies, including rejected articles displayed publicly,
    # remain operational failures and must not be silently ignored.
    discrepancies = report["discrepancies"] if report else []
    editorial_count = sum(d["type"] == "stalled_awaiting" for d in discrepancies)
    operational_count = len(discrepancies) - editorial_count
    if operational_count:
        operational_problems.append(f"{operational_count} operational reconciliation discrepancies")
    if editorial_count:
        editorial_problems.append(f"{editorial_count} articles awaiting editorial verification beyond 14 days")

    if any(r["attempts"] >= engine.cfg["max_attempts"] for r in pend):
        operational_problems.append("articles exhausted automatic retries")
    bad_strat = [k for k, v in run["strategy_results"].items() if not v.get("ok")]
    if bad_strat:
        operational_problems.append(f"{len(bad_strat)} failed search strategy(ies)")
    if run.get("query_warnings"):
        operational_problems.append(f"{len(run['query_warnings'])} search strategy(ies) returned PubMed query warnings (possible malformed query)")
    status = {
        "generated_at": now_iso(),
        "health": "degraded" if operational_problems else ("attention_needed" if editorial_problems else "healthy"),
        "problems": operational_problems + editorial_problems,
        "operational_health": "degraded" if operational_problems else "healthy",
        "operational_problems": operational_problems,
        "editorial_backlog_count": editorial_count,
        "last_successful_retrieval": last_ok, "last_run": st.get("last_run"),
        "this_run": {"new_discovered": run["new_discovered"], "retrieved": run["retrieved"], "rejected": run["rejected"], "duplicates": run["duplicates"],
                     "relevance_uncertain": run["uncertain"], "strategies_ok": sum(1 for v in run["strategy_results"].values() if v.get("ok")),
                     "strategies_failed": bad_strat, "query_warnings": run.get("query_warnings", [])[:10]},
        "totals": {"discovered": len(led.articles), "retrieved": len(led.articles) - len(pend) - counts[L.DISCOVERED], "awaiting_verification": counts[L.AWAITING],
                   "approved": counts[L.APPROVED], "published": counts[L.PUBLISHED], "duplicate": counts[L.DUPLICATE], "rejected": counts[L.REJECTED],
                   "pending_retry": counts[L.PENDING_RETRY] + counts[L.RETRIEVAL_FAILED]},
        "by_status": counts, "rejection_reasons": reasons, "failed_requests": run["failed_requests"][-25:],
        "pending_retry": [{"pmid": r["pmid"], "attempts": r["attempts"], "last_error": r["last_error"], "next_retry": r["next_retry"]} for r in pend[:50]],
        "reconciliation": ({"discrepancies": len(report["discrepancies"]), "recoverable": report["recoverable"], "unrecoverable": report["unrecoverable"],
                            "stages": report["stages"], "strategy_gap_found_only_by_europepmc": report["strategy_gap_found_only_by_europepmc"],
                            "top": report["discrepancies"][:15]} if report else None),
        "specialties": spec,
        "strategy_watermarks": st.get("watermarks", {}), "recent_runs": st.get("runs", [])[-10:],
    }
    atomic_write(path, json.dumps(status, indent=1, ensure_ascii=False) + "\n")
    return status
