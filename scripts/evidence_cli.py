#!/usr/bin/env python3
"""ICU Scope evidence-safety CLI.

  migrate            grandfather existing archive items as legacy 'unverified' (idempotent)
  verify             verify pending/due items against PubMed/Crossref/ClinicalTrials.gov
  surveillance       verify + retraction/correction/registry surveillance, write alerts
  apply-decisions    apply reviewer decisions from data/decisions/*.json
  check              pre-deploy safety gate over data/articles.json (exit 1 = block)
  audit-verify       verify the audit-log hash chain
  review-list        show items awaiting editorial action
  decide             record a reviewer decision locally (writes data/decisions/*.json)
Exit codes: 0 ok, 1 critical safety failure, 2 usage/internal error.
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from evidence import decisions, http, pipeline, publish  # noqa: E402
from evidence.ledger import Ledger, atomic_write, now_iso  # noqa: E402
from evidence.normalize import identity_keys  # noqa: E402

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")


def load_json(name, default):
    p = os.path.join(DATA, name)
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return default


def save_alerts(new_alerts, data_dir=None):
    data_dir = data_dir or DATA
    p = os.path.join(data_dir, "evidence_alerts.json")
    cur = json.load(open(p)) if os.path.exists(p) else []
    cur = (cur + new_alerts)[-500:]
    atomic_write(p, json.dumps(cur, indent=1, ensure_ascii=False) + "\n")


def write_run_metrics(pipe, started, command, data_dir=None):
    data_dir = data_dir or DATA
    m = {"command": command, "finished_at": now_iso(), "duration_s": round(time.time() - started, 1), "http_requests": http.METRICS["requests"],
         "http_retries": http.METRICS["retries"], "source_errors": http.METRICS["errors"][:10], "stats": dict(pipe.stats),
         "states": {s: sum(1 for r in pipe.ledger.records.values() if r["state"] == s) for s in
                    ("unverified", "pending_review", "verified", "published", "updated", "under_investigation", "retracted", "archived")}}
    atomic_write(os.path.join(data_dir, "evidence_run.json"), json.dumps(m, indent=1) + "\n")
    return m


def write_issue_file(alerts, path):
    if not alerts or not path:
        return
    lines = ["# ICU Scope evidence alerts", "", "Automated surveillance flagged the following. Affected content has already been withheld/flagged; "
             "reassessment is required before restoring publication status.", ""]
    for a in alerts:
        lines += [f"## {a['kind']}: {a['title'][:120]}", f"- content id: `{a['content_id']}`  PMID: {a['pmid'] or 'n/a'}  DOI: {a['doi'] or 'n/a'}",
                  f"- detail: {a['detail']}", "- derived content:"] + [f"  - {d}" for d in a["derived_content"]] + [""]
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def build_pipeline(data_dir=None):
    pipe = pipeline.Pipeline(Ledger(data_dir or DATA))
    return pipe


def ingest_all(pipe, data_dir=None, legacy=False):
    data_dir = data_dir or DATA
    archive = json.load(open(os.path.join(data_dir, "archive.json"), encoding="utf-8")) if os.path.exists(os.path.join(data_dir, "archive.json")) else {}
    secs = {}
    for sec, a in pipeline.iter_archive(archive):
        secs.setdefault(sec, []).append(a)
    pipe.ingest(secs, legacy=legacy)
    return archive


def archive_lookup_factory(archive):
    index = {}
    for _, a in pipeline.iter_archive(archive):
        for k in identity_keys(a):
            index[k] = a
    return lambda rec: next((index[k] for k in ([f"pmid:{rec['pmid']}"] if rec["pmid"] else []) + ([f"doi:{rec['doi']}"] if rec["doi"] else []) if k in index), None)


def cmd_migrate(args):
    pipe = build_pipeline()
    ingest_all(pipe, legacy=True)
    pipe.persist()
    print(f"migrated: {len(pipe.ledger.records)} records ({pipe.stats['records_created']} new)")
    return 0


def cmd_verify(args, surveillance=False):
    started = time.time()
    pipe = build_pipeline()
    ingest_all(pipe, legacy=True if not pipe.ledger.records else False)
    pipe.verify_pending(args.budget)
    pipe.persist()
    save_alerts(pipe.alerts)
    write_issue_file(pipe.alerts, args.issue_file)
    m = write_run_metrics(pipe, started, "surveillance" if surveillance else "verify")
    print(json.dumps({k: m[k] for k in ("stats", "states", "http_requests", "source_errors")}, indent=1))
    return 0


def cmd_apply(args):
    pipe = build_pipeline()
    archive = ingest_all(pipe)
    d = os.path.join(DATA, "decisions")
    res = decisions.process_dir(pipe, d, archive_lookup_factory(archive))
    pending_updates = [(r["content_id"], r.pop("_accepted_update")) for r in pipe.ledger.records.values() if "_accepted_update" in r]
    if pending_updates:   # write accepted source updates into the archive
        lk = {cid: art for cid, art in pending_updates}
        for sec, bucket in archive.items():
            groups = bucket.values() if sec == "categories" else [bucket]
            for g in groups:
                for key, a in list(g.items()):
                    hits = pipe.ledger.find(a)
                    if hits and hits[0] in lk:
                        g[key] = {**a, **lk[hits[0]]}
        atomic_write(os.path.join(DATA, "archive.json"), json.dumps(archive, indent=2, ensure_ascii=False))
    pipe.persist()
    for r in res:
        print(("applied " if r["ok"] else "REJECTED ") + r["file"] + (": " + r["error"] if r["error"] else ""))
    return 0


def cmd_check(args):
    pipe = build_pipeline()
    path = args.articles or os.path.join(DATA, "articles.json")
    try:
        out = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        print(f"cannot read {path}: {e}", file=sys.stderr)
        return 2
    findings = publish.safety_check(out, pipe.ledger)
    crit = [f for f in findings if f["severity"] == "critical"]
    if not args.quiet:
        for f in findings[:60]:
            print(f"[{f['severity'].upper()}] {f['code']}: {f['message']} ({f['ref']})")
        print(f"safety check: {len(crit)} critical, {len(findings) - len(crit)} warnings")
    return 1 if crit else 0


def cmd_audit(args):
    ok, msg = Ledger().audit.verify_chain()
    print("audit chain:", msg)
    return 0 if ok else 1


def cmd_review_list(args):
    L = Ledger()
    rows = [r for r in L.records.values() if r["state"] == "pending_review" or r.get("pending_update") or r["state"] in ("under_investigation", "retracted", "updated")
            or r["ai"]["status"] in ("auto_validated",) and False]
    for r in sorted(rows, key=lambda r: r["last_updated"]):
        print(f"{r['content_id']}  {r['state']:<20} {r['retraction_status']:<10} {r['title'][:80]}")
    print(f"{len(rows)} item(s)")
    return 0


def cmd_decide(args):
    d = {"content_id": args.content_id, "action": args.action, "reviewer": args.reviewer, "note": args.note, "via": "cli", "at": now_iso()}
    if args.fields:
        d["fields"] = json.loads(args.fields)
    os.makedirs(os.path.join(DATA, "decisions"), exist_ok=True)
    fn = os.path.join(DATA, "decisions", f"{d['at'].replace(':', '')}-{args.content_id}.json")
    atomic_write(fn, json.dumps(d, indent=1))
    print("wrote", fn, "- run `apply-decisions` (or commit it; CI applies it)")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    sp.add_parser("migrate").set_defaults(fn=cmd_migrate)
    for name, fn in (("verify", cmd_verify), ("surveillance", lambda a: cmd_verify(a, True))):
        p = sp.add_parser(name)
        p.add_argument("--budget", type=int, default=None)
        p.add_argument("--issue-file", default="")
        p.set_defaults(fn=fn)
    sp.add_parser("apply-decisions").set_defaults(fn=cmd_apply)
    p = sp.add_parser("check")
    p.add_argument("--quiet", action="store_true")
    p.add_argument("--articles")
    p.set_defaults(fn=cmd_check)
    sp.add_parser("audit-verify").set_defaults(fn=cmd_audit)
    sp.add_parser("review-list").set_defaults(fn=cmd_review_list)
    p = sp.add_parser("decide")
    p.add_argument("content_id"), p.add_argument("action", choices=sorted(decisions.ACTIONS))
    p.add_argument("--reviewer", required=True), p.add_argument("--note", required=True), p.add_argument("--fields")
    p.set_defaults(fn=cmd_decide)
    args = ap.parse_args(argv)
    try:
        return args.fn(args)
    except SystemExit:
        raise
    except Exception as e:
        http.log_event("error", "cli_failure", error=f"{type(e).__name__}: {e}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
