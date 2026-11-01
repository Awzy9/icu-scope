"""Discovery engine: windows + watermarks + checkpoints + retries. Nothing here swallows an error into an empty result."""
import datetime as dt
import json
import os

from evidence import http
from evidence.http import SourceError
from evidence.ledger import atomic_write, now_iso

from . import ledger as L, relevance, retrieval, strategies
from .dates import utc_today, window_chunks, parse_pubmed_date

DEFAULTS = {
    "initial_days": 14,        # first-ever incremental window
    "overlap_days": 3,         # every run re-searches this many days before the watermark (late indexing, timezone, clock skew)
    "backfill_days": 30,         # conservative: ~68 candidates/day => ~2,000 per 30 days. Raise deliberately (archive size grows ~3KB/article)
    "chunk_days": 14,
    "datetype": "edat",        # Entrez (indexing) date: the reliable 'new since last run' key
    "max_attempts": 6,
    "retry_hours": [1, 6, 24, 72, 168],
    "detail_batch_limit": 3000,
    "use_europepmc": True,
    "display_per_category": 120,   # bounded public feed; overflow stays archived with a recorded reason
}


def load_json(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


class Engine:
    def __init__(self, data_dir, config=None, today=None, queries=None, epmc_queries=None):
        self.dir = os.path.abspath(data_dir)
        cfg = dict(DEFAULTS)
        cfg.update(load_json(os.path.join(self.dir, "discovery_config.json"), {}))
        cfg.update(config or {})
        self.cfg = cfg
        self.today = today or utc_today()
        self.queries = queries if queries is not None else strategies.pubmed_queries()
        self.epmc_queries = epmc_queries if epmc_queries is not None else (strategies.epmc_queries() if cfg["use_europepmc"] else [])
        self.ledger = L.DiscoveryLedger(os.path.join(self.dir, "discovery.json"))
        self.state_path = os.path.join(self.dir, "discovery_state.json")
        self.state = load_json(self.state_path, {"watermarks": {}, "backfill": {}, "runs": []})
        self.run = {"started_at": now_iso(), "strategy_results": {}, "failed_requests": [], "new_discovered": 0, "specialty_new": {}, "degraded": False,
                    "retrieved": 0, "rejected": 0, "duplicates": 0, "uncertain": 0}
        self.dup_check = None   # callable(article) -> (other_pmid, why) | None
        self.payloads = {}   # pmid -> (article, categories, relevance) produced this run

    # ------------------------------------------------------------------ discovery
    def _record(self, q, ids, source="pubmed"):
        new = 0
        for pmid in ids:
            _, is_new = self.ledger.discover(pmid, q["id"], q["specialty"], source)
            if is_new:
                new += 1
                self.run["specialty_new"][q["specialty"]] = self.run["specialty_new"].get(q["specialty"], 0) + 1
        self.run["new_discovered"] += new
        return new

    def _fail(self, q, window, err):
        self.run["degraded"] = True
        self.run["failed_requests"].append({"strategy": q["id"], "window": [window[0].isoformat(), window[1].isoformat()], "error": str(err)[:200], "at": now_iso()})
        http.log_event("error", "strategy_failed", strategy=q["id"], error=str(err)[:200])

    def run_incremental(self):
        end = self.today
        for q in self.queries:
            wm = self.state["watermarks"].get(q["id"])
            start = (dt.date.fromisoformat(wm) - dt.timedelta(days=self.cfg["overlap_days"])) if wm else end - dt.timedelta(days=self.cfg["initial_days"])
            start = min(start, end)
            try:
                retrieval.QUERY_WARNINGS.clear()
                found = 0
                for a, b in window_chunks(start, end, self.cfg["chunk_days"]):
                    ids, count = retrieval.esearch_window(q["query"], a, b, self.cfg["datetype"])
                    self._record(q, ids)
                    found += len(ids)
                self.state["watermarks"][q["id"]] = end.isoformat()      # advanced ONLY after a complete, count-verified retrieval
                self.run["strategy_results"][q["id"]] = {"found": found, "ok": True, "window": [start.isoformat(), end.isoformat()]}
                if retrieval.QUERY_WARNINGS:
                    self.run["strategy_results"][q["id"]]["warnings"] = list(dict.fromkeys(retrieval.QUERY_WARNINGS))[:3]
                    self.run.setdefault("query_warnings", []).append({"strategy": q["id"], "warnings": self.run["strategy_results"][q["id"]]["warnings"]})
            except SourceError as e:                                   # includes IncompleteRetrieval; watermark NOT advanced -> next run re-covers the gap
                self.run["strategy_results"][q["id"]] = {"found": 0, "ok": False, "error": str(e)[:160]}
                self._fail(q, (start, end), e)
            self.save_state()   # checkpoint after every strategy

    def run_europepmc(self):
        """Independent index. Anything it finds that PubMed-esearch strategies did not is registered (recovery + outage fallback)."""
        end, start = self.today, self.today - dt.timedelta(days=self.cfg["initial_days"] + self.cfg["overlap_days"])
        for q in self.epmc_queries:
            wm = self.state["watermarks"].get(q["id"])
            s = (dt.date.fromisoformat(wm) - dt.timedelta(days=self.cfg["overlap_days"])) if wm else start
            try:
                res, hits = retrieval.epmc_window(q["query"].replace("SRC:MED AND ", ""), min(s, end), end)
                ids = [str(r["pmid"]) for r in res if r.get("pmid")]
                self._record(q, ids, source="europepmc")
                self.state["watermarks"][q["id"]] = end.isoformat()
                self.run["strategy_results"][q["id"]] = {"found": len(ids), "ok": True, "window": [s.isoformat(), end.isoformat()]}
            except SourceError as e:
                self.run["strategy_results"][q["id"]] = {"found": 0, "ok": False, "error": str(e)[:160]}
                self._fail(q, (s, end), e)
            self.save_state()

    def run_backfill(self, days=None, only=None):
        """Controlled historical recovery. Resumable: completed (strategy, chunk) pairs are checkpointed and skipped."""
        days = days or self.cfg["backfill_days"]
        end, start = self.today, self.today - dt.timedelta(days=days)
        for q in self.queries:
            if only and q["id"] not in only:
                continue
            done = set(self.state["backfill"].setdefault(q["id"], []))
            for a, b in window_chunks(start, end, self.cfg["chunk_days"]):
                key = f"{a}..{b}"
                if key in done and b < end:        # the most recent chunk is always re-run (it is still filling)
                    continue
                try:
                    ids, _ = retrieval.esearch_window(q["query"], a, b, self.cfg["datetype"])
                    self._record(q, ids)
                    done.add(key)
                    self.state["backfill"][q["id"]] = sorted(done)
                except SourceError as e:
                    self._fail(q, (a, b), e)
                self.save_state()
                self.ledger.save()

    def run_europepmc_backfill(self, days=None):
        days = days or self.cfg["backfill_days"]
        end, start = self.today, self.today - dt.timedelta(days=days)
        for q in self.epmc_queries:
            done = set(self.state["backfill"].setdefault(q["id"], []))
            for a, b in window_chunks(start, end, self.cfg["chunk_days"]):
                key = f"{a}..{b}"
                if key in done and b < end:
                    continue
                try:
                    res, _ = retrieval.epmc_window(q["query"], a, b)
                    self._record(q, [str(r["pmid"]) for r in res if r.get("pmid")], source="europepmc")
                    done.add(key)
                    self.state["backfill"][q["id"]] = sorted(done)
                except SourceError as e:
                    self._fail(q, (a, b), e)
                self.save_state()
                self.ledger.save()

    # -------------------------------------------------------------------- retrieval
    def _due(self, rec):
        nr = rec.get("next_retry")
        return not nr or nr <= now_iso()

    def retrieve(self, builder, limit=None):
        """Fetch full metadata for everything discovered/pending. Failures -> pending_retry with backoff, never dropped."""
        todo = [r["pmid"] for r in self.ledger.by_status(L.DISCOVERED, L.PENDING_RETRY, L.RETRIEVAL_FAILED) if self._due(r)]
        todo = todo[: limit or self.cfg["detail_batch_limit"]]
        for i in range(0, len(todo), 100):
            chunk = todo[i:i + 100]
            try:
                details = retrieval.efetch_details(chunk)
                summaries = retrieval.esummary_batch(chunk)
            except SourceError as e:
                for pmid in chunk:
                    self._mark_failed(pmid, e)
                self.run["degraded"] = True
                self.run["failed_requests"].append({"strategy": "details", "window": [chunk[0], chunk[-1]], "error": str(e)[:200], "at": now_iso()})
                continue
            for pmid in chunk:
                d, s = details.get(pmid), summaries.get(pmid)
                if not d and not s:
                    self._mark_failed(pmid, "source returned no record for this id (may not be available yet)")
                    continue
                try:
                    self._accept(pmid, d or {}, s or {}, builder)
                except Exception as e:      # a malformed record is a retrieval problem to surface, not a reason to drop the article
                    self._mark_failed(pmid, f"unparseable record: {type(e).__name__}: {e}")
            self.ledger.save()
            self.save_state()

    def _mark_failed(self, pmid, err):
        rec = self.ledger.get(pmid)
        self.ledger.fail(pmid, err, self.cfg["max_attempts"])
        hrs = self.cfg["retry_hours"][min(rec["attempts"] - 1, len(self.cfg["retry_hours"]) - 1)]
        rec["next_retry"] = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=hrs)).isoformat(timespec="seconds")

    def _accept(self, pmid, detail, summary, builder):
        rec = self.ledger.get(pmid)
        article = builder(pmid, summary, detail)
        if rec["status"] in (L.DISCOVERED, L.PENDING_RETRY, L.RETRIEVAL_FAILED):
            self.ledger.move(pmid, L.RETRIEVED, "metadata retrieved")
        rec["next_retry"], rec["last_error"] = None, None
        rec["title"], rec["journal"], rec["pubdate"] = article.get("title", ""), article.get("journal", ""), article.get("pubdate", "")
        rec["dates"] = {"pubdate": article.get("pubdate"), "epub": article.get("epub_date"), "indexed": article.get("indexed_date")}
        if self.dup_check:
            dup = self.dup_check(article)
            if dup:
                self.ledger.move(pmid, L.DUPLICATE, f"duplicate of PMID {dup[0]}: {dup[1]}")
                self.run["duplicates"] += 1
                return
        verdict = relevance.classify(article, detail.get("mesh", []), detail.get("pubtypes", []), article.get("journal", ""))
        rec["relevance"] = {k: verdict[k] for k in ("decision", "score", "reasons")}
        self.run["retrieved"] += 1
        if verdict["decision"] == "rejected":
            self.ledger.move(pmid, L.REJECTED, "; ".join(verdict["reasons"]))
            self.run["rejected"] += 1
            return
        rec["categories"] = strategies.infer_categories(article.get("title"), article.get("abstract"), rec["specialties"], limit=2)
        if verdict["decision"] == "uncertain":
            rec["review"] = "relevance_uncertain"
            self.run["uncertain"] += 1
            self.ledger.move(pmid, L.AWAITING, "ICU relevance uncertain - editorial review required (" + ("; ".join(verdict["reasons"]) or "no ICU signal in title/abstract/MeSH") + ")")
        else:
            self.ledger.move(pmid, L.AWAITING, "ICU-relevant; queued for source verification")
        self.payloads[pmid] = (article, rec["categories"], verdict)

    def mark_duplicate(self, pmid, of, why):
        self.ledger.move(pmid, L.DUPLICATE, f"duplicate of {of}: {why}")
        self.run["duplicates"] += 1

    # ----------------------------------------------------------------- persistence
    def save_state(self):
        atomic_write(self.state_path, json.dumps(self.state, indent=1) + "\n")

    def finish(self):
        self.run["finished_at"] = now_iso()
        self.run["counts"] = self.ledger.counts()
        ok = not self.run["degraded"]
        self.run["ok"] = ok
        if ok:
            self.state["last_success"] = self.run["finished_at"]
        self.state["last_run"] = self.run["finished_at"]
        self.state["runs"] = (self.state.get("runs", []) + [{k: self.run[k] for k in ("started_at", "finished_at", "ok", "new_discovered", "retrieved", "rejected", "duplicates", "uncertain")}
                                                          | {"failed_requests": len(self.run["failed_requests"])}])[-30:]
        self.ledger.save()
        self.save_state()
        return self.run
