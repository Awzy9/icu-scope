import copy
import datetime as dt
import json
import os
import unittest

from tests.discovery_helpers import *  # noqa
from evidence import http
from evidence.ledger import Ledger
from discovery import archive as darch, dates, engine as dengine, ledger as L, reconcile as drec, relevance, retrieval, status as dstatus, sync as dsync
from discovery.retrieval import IncompleteRetrieval


class Base(unittest.TestCase):
    def setUp(self):
        self.t = TmpData(); self.d = self.t.__enter__(); self.net = FakeNCBI()

    def tearDown(self):
        self.t.__exit__()

    def eng(self, **kw):
        return make_engine(self.d, **kw)


class TestPagination(Base):
    def test_all_pages_retrieved_across_multiple_pages(self):
        self.net.add(*[art(i, day="2026-10-20") for i in range(1000, 2234)])      # 1,234 articles
        ids, count = retrieval.esearch_window("x", dt.date(2026, 10, 1), dt.date(2026, 10, 31), page=100)
        self.assertEqual((len(ids), count, len(set(ids))), (1234, 1234, 1234))
        self.assertGreaterEqual(sum("esearch" in c for c in self.net.calls), 13)   # 13 pages of 100

    def test_window_over_ceiling_is_split_not_truncated(self):
        orig = retrieval.PUBMED_CEILING; retrieval.PUBMED_CEILING = 250
        try:
            self.net.add(*[art(i, day=f"2026-10-{1 + i % 10:02d}") for i in range(1000, 1600)])
            ids, _ = retrieval.esearch_window("x", dt.date(2026, 10, 1), dt.date(2026, 10, 10), page=100)
            self.assertEqual(len(set(ids)), 600)
        finally:
            retrieval.PUBMED_CEILING = orig

    def test_short_page_is_detected_not_silently_accepted(self):
        self.net.add(*[art(i) for i in range(1000, 1300)]); self.net.fail_plan = [("truncate", 1)]
        with self.assertRaises(IncompleteRetrieval):
            retrieval.esearch_window("x", dt.date(2026, 10, 1), dt.date(2026, 10, 31), page=100)


class TestFailuresAndRecovery(Base):
    def test_timeout_then_recovery(self):
        self.net.add(art(1), art(2)); self.net.fail_plan = [("timeout", 2)]
        ids, _ = retrieval.esearch_window("x", dt.date(2026, 10, 1), dt.date(2026, 10, 31))
        self.assertEqual(sorted(ids), ["1", "2"]); self.assertEqual(http.METRICS["retries"], 2)
        self.assertEqual([s for s in self.net.sleeps if s >= 1][:2], [1.0, 2.0])      # exponential backoff

    def test_rate_limit_honours_retry_after(self):
        self.net.add(art(1)); self.net.fail_plan = [("429", 1)]
        retrieval.esearch_window("x", dt.date(2026, 10, 1), dt.date(2026, 10, 31))
        self.assertTrue(any(s >= 3 for s in self.net.sleeps))

    def test_persistent_failure_is_loud_and_watermark_not_advanced(self):
        self.net.add(art(1)); e = self.eng(); self.net.fail_plan = [("500", 99)]
        e.run_incremental(); run = e.finish()
        self.assertFalse(run["ok"]); self.assertTrue(run["degraded"]); self.assertEqual(len(run["failed_requests"]), 1)
        self.assertNotIn("s1:keyword", e.state["watermarks"])                          # gap will be re-covered next run
        self.assertNotIn("last_success", e.state)                                      # NOT reported as a successful update

    def test_failed_run_self_heals_next_run(self):
        self.net.add(art(1, day="2026-10-29"), art(2, day="2026-10-30"))
        e = self.eng(); self.net.fail_plan = [("500", 99)]; e.run_incremental(); e.finish()
        self.net.fail_plan = []
        e2 = self.eng(today="2026-11-01"); e2.run_incremental(); run = e2.finish()
        self.assertTrue(run["ok"]); self.assertEqual(sorted(e2.ledger.articles), ["1", "2"]); self.assertIn("last_success", e2.state)

    def test_watermark_advances_only_on_complete_success_and_drives_next_window(self):
        self.net.add(art(1, day="2026-10-29"))
        e1 = self.eng(today="2026-10-30", overlap_days=3); e1.run_incremental(); e1.finish()
        self.assertEqual(e1.state["watermarks"]["s1:keyword"], "2026-10-30")
        self.net.calls.clear(); self.net.fail_plan = [("500", 99)]
        e2 = self.eng(today="2026-10-31", overlap_days=3); e2.run_incremental(); e2.finish()
        self.assertEqual(e2.state["watermarks"]["s1:keyword"], "2026-10-30")                       # failure did NOT move it
        self.net.fail_plan = []; self.net.calls.clear()
        e3 = self.eng(today="2026-11-01", overlap_days=3); e3.run_incremental()
        first = [c for c in self.net.calls if "esearch" in c][0]
        self.assertIn("mindate=2026%2F10%2F27", first)                                             # watermark(10-30) - 3 days overlap, not just yesterday
        self.assertIn("maxdate=2026%2F11%2F01", first)

    def test_interrupted_backfill_resumes_without_redoing_completed_chunks(self):
        self.net.add(*[art(100 + i, day=(dt.date(2026, 7, 25) + dt.timedelta(days=i * 2)).isoformat()) for i in range(40)])
        e = self.eng(chunk_days=14)

        class Crash(BaseException):      # a killed process is not an Exception; the HTTP layer must not swallow it
            pass
        count = {"n": 0}

        def hook(url):
            if "esearch" in url:
                count["n"] += 1
                if count["n"] == 4:
                    raise Crash()
        self.net.hook = hook
        with self.assertRaises(Crash):
            e.run_backfill(100)
        done_before = list(e.state["backfill"]["s1:keyword"]); self.assertEqual(len(done_before), 3)
        reloaded = self.eng(chunk_days=14); self.net.hook = None; self.net.calls.clear()
        reloaded.run_backfill(100)
        searched = [c for c in self.net.calls if "esearch" in c]
        for key in done_before:                                                         # completed chunks were not searched again
            a = key.split("..")[0].replace("-", "%2F")
            self.assertFalse(any(f"mindate={a}" in c for c in searched), key)
        self.assertEqual(len(reloaded.ledger.articles), 40)


class TestRetrievalAndNoSilentLoss(Base):
    def test_missing_metadata_never_discards(self):
        self.net.add(art(1, title="", abstract="", doi="", mesh=(), journal=""), art(2, no_summary=True), art(3))
        e = self.eng(); e.run_incremental(); e.retrieve(simple_builder)
        for pmid in ("1", "2", "3"):
            self.assertIn(e.ledger.get(pmid)["status"], (L.AWAITING, L.PENDING_RETRY), pmid)
        r1 = e.ledger.get("1"); self.assertEqual(r1["status"], L.AWAITING); self.assertEqual(r1["review"], "relevance_uncertain")
        self.assertIn("missing title", r1["status_reason"].lower() + " ".join(r1["relevance"]["reasons"]).lower())

    def test_no_detail_record_goes_to_pending_retry_with_backoff_and_is_recovered(self):
        self.net.add(art(7, no_detail=True, no_summary=True))
        e = self.eng(); e.run_incremental(); e.retrieve(simple_builder)
        r = e.ledger.get("7"); self.assertEqual(r["status"], L.PENDING_RETRY); self.assertEqual(r["attempts"], 1); self.assertIsNotNone(r["next_retry"])
        self.assertEqual(len(r["history"]), 3)                                                    # discovered -> retrieval_failed -> pending_retry
        del self.net.corpus["7"]["no_detail"], self.net.corpus["7"]["no_summary"]; r["next_retry"] = None
        e.retrieve(simple_builder); self.assertEqual(e.ledger.get("7")["status"], L.AWAITING)

    def test_efetch_outage_marks_pending_retry_not_dropped(self):
        self.net.add(art(1)); e = self.eng(); e.run_incremental(); self.net.down.add("eutils")
        e.retrieve(simple_builder); self.assertEqual(e.ledger.get("1")["status"], L.PENDING_RETRY)
        self.assertTrue(e.run["degraded"])

    def test_retries_exhausted_stays_visible_to_admin(self):
        self.net.add(art(1)); e = self.eng(); e.run_incremental()
        for _ in range(7):
            e.ledger.fail("1", "boom", max_attempts=6)
        r = e.ledger.get("1"); self.assertEqual(r["status"], L.PENDING_RETRY); self.assertIn("administrator", r["status_reason"])

    def test_every_transition_is_logged_and_illegal_ones_rejected(self):
        e = self.eng(); rec, _ = e.ledger.discover("5", "s", "sepsis")
        e.ledger.move("5", L.RETRIEVED, "ok"); e.ledger.move("5", L.AWAITING, "queued")
        self.assertEqual([h[1] for h in rec["history"]], [L.DISCOVERED, L.RETRIEVED, L.AWAITING])
        with self.assertRaises(L.StatusError):
            e.ledger.move("5", L.DISCOVERED, "no")
        with self.assertRaises(L.StatusError):
            e.ledger.move("5", L.REJECTED, "")                                                    # rejection needs a reason

    def test_record_survives_save_failure(self):
        e = self.eng(); e.ledger.discover("5", "s", "sepsis"); e.ledger.save()
        before = open(e.ledger.path, "rb").read()
        import os as _os; real = _os.replace
        _os.replace = lambda *a, **k: (_ for _ in ()).throw(OSError("disk full"))
        try:
            e.ledger.discover("6", "s", "sepsis")
            with self.assertRaises(OSError):
                e.ledger.save()
        finally:
            _os.replace = real
        self.assertEqual(open(e.ledger.path, "rb").read(), before)                                # previous ledger intact


class TestDuplicatesAndRelevance(Base):
    def test_one_record_per_pmid_across_strategies(self):
        self.net.add(art(1)); qs = Q + [{"id": "s2:mesh", "specialty": "ards", "kind": "mesh", "query": "ards"}]
        e = self.eng(queries=qs); e.run_incremental()
        r = e.ledger.get("1"); self.assertEqual(len(e.ledger.articles), 1); self.assertEqual(sorted(r["strategies"]), ["s1:keyword", "s2:mesh"]); self.assertEqual(sorted(r["specialties"]), ["ards", "sepsis"])

    def test_same_doi_different_pmid_is_duplicate_but_same_title_is_not(self):
        self.net.add(art(1, doi="10.1000/same"), art(2, doi="10.1000/same"), art(3, title=art(1)["title"], doi="10.1000/other"))
        e = self.eng(); e.run_incremental()
        known = {"10.1000/same": "1"}
        e.dup_check = lambda a: (known[a["doi"]], "shares the same DOI") if a.get("doi") in known and known[a["doi"]] != a["pmid"] else None
        e.retrieve(simple_builder)
        self.assertEqual(e.ledger.get("2")["status"], L.DUPLICATE); self.assertIn("duplicate of PMID 1", e.ledger.get("2")["status_reason"])
        self.assertEqual(e.ledger.get("3")["status"], L.AWAITING)                                  # identical title but different DOI: kept
        self.assertEqual(e.ledger.get("1")["status"], L.AWAITING)

    def test_child_pugh_adult_paper_kept_paediatric_rejected_with_reason(self):
        self.net.add(art(1, title="Child-Pugh score and mortality in ICU patients with cirrhosis", mesh=("Critical Care",)), art(2, title="Neonatal sepsis outcomes in the NICU", mesh=("Infant, Newborn",)),
                     art(3, title="Erratum: Vasopressin in septic shock"))
        e = self.eng(); e.run_incremental(); e.retrieve(simple_builder)
        self.assertEqual(e.ledger.get("1")["status"], L.AWAITING)
        self.assertEqual(e.ledger.get("2")["status"], L.REJECTED); self.assertIn("paediatric", e.ledger.get("2")["status_reason"])
        self.assertEqual(e.ledger.get("3")["status"], L.REJECTED); self.assertIn("notice", e.ledger.get("3")["status_reason"])

    def test_dedicated_icu_journal_without_mesh_is_relevant_but_offtopic_is_not(self):
        r = relevance.classify({"title": "Physiology-guided ventilation as an equity intervention", "abstract": "Perspective on ventilation strategy.", "journal": "Intensive care medicine"}, mesh=[])
        self.assertEqual(r["decision"], "relevant")
        r2 = relevance.classify({"title": "Bites from hognose snakes reported to a poison centre", "abstract": "Reptile bites.", "journal": "Clinical toxicology (Philadelphia, Pa.)"}, mesh=[])
        self.assertEqual(r2["decision"], "uncertain")

    def test_uncertain_relevance_is_reviewed_not_rejected_or_published(self):
        self.net.add(art(1, title="A cohort study of knee pain", abstract="Orthopaedic outcomes after arthroplasty in adults. " * 3, mesh=("Adult",), journal="J Orthop Res"))
        e = self.eng(); e.run_incremental(); e.retrieve(simple_builder)
        r = e.ledger.get("1"); self.assertEqual(r["status"], L.AWAITING); self.assertEqual(r["review"], "relevance_uncertain")
        self.assertEqual(r["relevance"]["decision"], "uncertain")


class TestDates(Base):
    def test_formats_never_fall_to_unparseable(self):
        for t in ("2026 Oct 29", "2026 Oct", "2026 Oct-Dec", "2026 Fall", "2026 Oct 29-Nov 2", "2026"):
            self.assertIsNotNone(dates.parse_pubmed_date(t)[0], t)

    def test_future_print_date_does_not_hide_a_recent_epub(self):
        d, _ = dates.effective_date({"pubdate": "2026 Dec", "epub_date": "2026-10-29"}, dt.date(2026, 11, 1))
        self.assertEqual(d, dt.date(2026, 10, 29))

    def test_window_boundaries_are_inclusive_and_utc(self):
        self.net.add(art(1, day="2026-10-24"), art(2, day="2026-10-31"), art(3, day="2026-10-23"), art(4, day="2026-11-01"))
        ids, _ = retrieval.esearch_window("x", dt.date(2026, 10, 24), dt.date(2026, 10, 31))
        self.assertEqual(sorted(ids), ["1", "2"])                                                  # both boundary days included, neighbours excluded
        self.assertEqual([(a.isoformat(), b.isoformat()) for a, b in dates.window_chunks(dt.date(2026, 10, 1), dt.date(2026, 10, 31), 14)],
                         [("2026-10-01", "2026-10-14"), ("2026-10-15", "2026-10-28"), ("2026-10-29", "2026-10-31")])

    def test_overlap_catches_late_indexed_article(self):
        e1 = self.eng(today="2026-10-30"); self.net.add(art(1, day="2026-10-29")); e1.run_incremental(); e1.finish()
        self.net.add(art(2, day="2026-10-29"))                                                     # indexed late, edat still the 29th
        e2 = self.eng(today="2026-10-31", overlap_days=3); e2.run_incremental()
        self.assertIn("2", e2.ledger.articles)


class TestMissedArticlesAndBackfill(Base):
    def test_backfill_recovers_missed_articles_without_duplicating_or_touching_approved(self):
        self.net.add(art(1, day="2026-08-01"), art(2, day="2026-09-10"), art(3, day="2026-10-20"))
        e = self.eng(); e.run_incremental()                                                       # normal run only sees recent window
        self.assertEqual(sorted(e.ledger.articles), ["3"]); e.finish()
        e2 = self.eng(); e2.run_backfill(120); e2.retrieve(simple_builder)
        self.assertEqual(sorted(e2.ledger.articles), ["1", "2", "3"])
        arch = {"categories": {"infectious-sepsis": {"3": {"pmid": "3", "title": "approved text", "abstract": "approved abstract"}}}}
        added, kept = darch.merge_payloads(e2, arch, guard=lambda old, fresh: old)               # approved content untouched
        self.assertEqual(arch["categories"]["infectious-sepsis"]["3"]["title"], "approved text")
        e3 = self.eng(); e3.run_backfill(120); self.assertEqual(len(e3.ledger.articles), 3)        # idempotent: no duplicate records

    def test_europepmc_finds_what_pubmed_strategy_missed(self):
        self.net.add(art(1), art(9)); self.net.matches = lambda q, a: a["pmid"] == "1"; self.net.epmc_ids = ["1", "9"]
        e = dengine.Engine(self.d, config={"use_europepmc": True}, today=dt.date(2026, 10, 31), queries=Q, epmc_queries=[{"id": "epmc:x", "specialty": "sepsis", "kind": "epmc", "query": "x"}])
        e.run_incremental(); e.run_europepmc()
        self.assertEqual(e.ledger.get("9")["sources"], ["europepmc"]); self.assertEqual(sorted(e.ledger.get("1")["sources"]), ["europepmc", "pubmed"])


class TestReconciliation(Base):
    def setUp(self):
        super().setUp()
        self.ev = make_pipeline(self.d)

    def prepare(self, **over):
        self.net.add(art(1)); e = self.eng(); e.run_incremental(); e.retrieve(simple_builder)
        return e

    def test_retrieved_but_not_stored_is_detected_and_requeued(self):
        e = self.prepare()                                                                          # job "crashed" before archive write
        rep = drec.reconcile(e.ledger, {"categories": {}}, self.ev, set())
        self.assertEqual([d["type"] for d in rep["discrepancies"]], ["retrieved_not_stored"]); self.assertTrue(rep["discrepancies"][0]["recoverable"])
        self.assertEqual(e.ledger.get("1")["status"], L.PENDING_RETRY)
        e.ledger.get("1")["next_retry"] = None; e.payloads.clear(); e.retrieve(simple_builder); self.assertEqual(e.ledger.get("1")["status"], L.AWAITING)   # recovered

    def test_discovered_never_retrieved_is_requeued(self):
        self.net.add(art(1)); e = self.eng(); e.run_incremental()
        rep = drec.reconcile(e.ledger, {"categories": {}}, self.ev, set())
        self.assertEqual(rep["discrepancies"][0]["type"], "discovered_not_retrieved"); self.assertEqual(e.ledger.get("1")["status"], L.PENDING_RETRY)

    def test_stored_but_not_ingested_flagged(self):
        e = self.prepare(); archive = {"categories": {"infectious-sepsis": {"1": {"pmid": "1", "title": "t"}}}}
        rep = drec.reconcile(e.ledger, archive, self.ev, set())
        self.assertEqual([d["type"] for d in rep["discrepancies"]], ["stored_not_ingested"])

    def _published(self, display_reason=None):
        standard_net(); e = self.prepare()
        a = copy.deepcopy(GOOD); a["pmid"] = "1"; a["doi"] = "10.1000/good.1"
        self.net_unused = None
        return e, a

    def test_published_but_not_displayed_is_unrecoverable_discrepancy_unless_explained(self):
        e = self.prepare(); e.ledger.get("1")["status"] = L.PUBLISHED; e.ledger.get("1")["status_reason"] = "x"
        self.ev.ingest({"categories/x": [{"pmid": "1", "title": "t", "doi": "10.1000/t.1"}]})
        er = self.ev.rec_for({"pmid": "1"}); er["state"] = "published"; er["source_verification"]["status"] = "verified"
        archive = {"categories": {"x": {"1": {"pmid": "1"}}}}
        rep = drec.reconcile(e.ledger, archive, self.ev, set())
        self.assertEqual([d["type"] for d in rep["discrepancies"]], ["published_not_displayed"]); self.assertEqual(rep["unrecoverable"], 1)
        st = dstatus.build_status(e, rep, os.path.join(self.d, "s.json")); self.assertEqual(st["health"], "degraded"); self.assertTrue(any("reconciliation" in p for p in st["problems"]))
        e.ledger.get("1")["displayed"], e.ledger.get("1")["display_reason"] = False, "display cap (120/category)"
        rep2 = drec.reconcile(e.ledger, archive, self.ev, set()); self.assertEqual(rep2["discrepancies"], []); self.assertEqual(rep2["explained"]["not_in_public_feed_by_policy"], 1)

    def test_rejected_article_on_website_is_flagged(self):
        e = self.prepare(); e.ledger.move("1", L.REJECTED, "test")
        rep = drec.reconcile(e.ledger, {"categories": {}}, self.ev, {"1"}); self.assertEqual(rep["discrepancies"][0]["type"], "rejected_but_displayed")

    def test_display_policy_caps_with_reason_and_keeps_high_evidence(self):
        arts = [{"pmid": str(i), "title": "t", "pubdate": f"2026 Oct {1 + i % 28}", "study_type": "Randomized Controlled Trial" if i < 3 else "Study"} for i in range(10)]
        kept, excl = dsync.apply_display_policy(arts, 5)
        self.assertEqual(len(kept), 5); self.assertTrue({"0", "1", "2"} <= {a["pmid"] for a in kept}); self.assertEqual(len(excl), 5); self.assertIn("display cap", excl[0][1])

    def test_retracted_and_corrected_items_are_never_dropped_by_the_display_cap(self):
        arts = [{"pmid": str(i), "title": "t", "pubdate": f"2026 Oct {1 + i % 28}", "study_type": "Study"} for i in range(12)]
        notice = {"3", "7"}
        kept, excl = dsync.apply_display_policy(arts, 4, pin=lambda a: a["pmid"] in notice)
        self.assertTrue(notice <= {a["pmid"] for a in kept})                                       # pinned despite ranking last
        self.assertEqual(len(kept), 4 + 2); self.assertEqual(len(excl), 12 - 6)
        self.assertFalse(notice & {a["pmid"] for a, _ in excl})

    def test_stale_success_makes_status_degraded(self):
        e = self.eng(); e.finish(); e.state["last_success"] = "2026-10-01T00:00:00+00:00"
        st = dstatus.build_status(e, None, os.path.join(self.d, "s.json")); self.assertEqual(st["health"], "degraded")


class TestEndToEndTracking(Base):
    """Acceptance: one externally discovered article tracked through retrieval, verification, approval, storage and display."""

    def test_article_is_traceable_from_discovery_to_display_without_unexplained_loss(self):
        from evidence import decisions, publish
        from tests.test_safety_gate import build_output
        target = art(5001, title="Early vasopressin in septic shock: a randomized trial", day="2026-10-28", doi="10.1000/good.1", pubtypes=("Journal Article", "Randomized Controlled Trial"),
                     abstract=GOOD["abstract"], pubdate="2026 Oct 28")
        uncertain = art(5002, title="Perioperative outcomes after knee arthroplasty", abstract="Orthopaedic outcomes in adults after surgery, a cohort study. " * 3, mesh=("Adult",), doi="10.1000/uncertain.1", journal="J Orthop Res")
        self.net.add(target, uncertain)
        # fake verification sources reuse the same fake network
        pm_xml = pubmed_xml({"pmid": "5001", "doi": "10.1000/good.1", "title": target["title"], "pubtypes": ["Journal Article", "Randomized Controlled Trial"], "year": 2026},
                            {"pmid": "5002", "doi": "10.1000/uncertain.1", "title": uncertain["title"], "year": 2026})
        orig = self.net._efetch
        self.net._efetch = lambda q: (200, pm_xml, {}) if "abstract" not in q and q.get("rettype") != "xml-details" and q.get("_v") else orig(q)
        # 1. discover + retrieve
        e = self.eng(); e.dup_check = None; e.run_incremental(); e.retrieve(simple_builder)
        self.assertEqual(e.ledger.get("5001")["status"], L.AWAITING)
        self.assertEqual(e.ledger.get("5002")["relevance"]["decision"], "uncertain")
        # 2. store
        archive = {"categories": {}}; darch.merge_payloads(e, archive); darch.save_archive(os.path.join(self.d, "archive.json"), archive)
        # 3. verification (PubMed/Crossref fakes) + gate
        self.net._efetch = lambda q: (200, pm_xml, {})
        self.net.add_route = None
        net2 = standard_net(); net2.pubmed({"pmid": "5001", "doi": "10.1000/good.1", "title": target["title"], "pubtypes": ["Journal Article", "Randomized Controlled Trial"]},
                                         {"pmid": "5002", "doi": "10.1000/uncertain.1", "title": uncertain["title"]})
        net2.add("api.crossref.org/works/10.1000/good.1", json.loads(crossref_json("10.1000/good.1", target["title"])))
        net2.add("api.crossref.org/works/10.1000/uncertain.1", json.loads(crossref_json("10.1000/uncertain.1", uncertain["title"])))
        ev = make_pipeline(self.d)
        secs = {f"categories/{c}": [dict(archive["categories"][c][p]) for p in archive["categories"][c]] for c in archive["categories"]}
        ev.ingest(secs)
        ev.ledger.flag(ev.rec_for({"pmid": "5002"}), "relevance_review", "system:discovery")
        ev.verify_pending()
        self.assertEqual(ev.rec_for({"pmid": "5001"})["state"], "published")                      # verified + approved by policy
        self.assertEqual(ev.rec_for({"pmid": "5002"})["state"], "pending_review")                 # uncertain relevance: NOT published without a human
        # 4. website output + status sync
        shown_lists = {}
        for sec, lst in secs.items():
            shown_lists[sec] = ev.filter_visible(sec, lst)
        out = build_output(ev, shown_lists)
        displayed = drec.displayed_pmids(out); self.assertIn("5001", displayed); self.assertNotIn("5002", displayed)
        ev.rec_for({"pmid": "5002"})["state"] = "unverified"                                       # not yet verified AND relevance-flagged: reason must say so
        dsync.sync_statuses(e.ledger, ev, displayed, {})
        self.assertIn("relevance", e.ledger.get("5002")["status_reason"].lower()); ev.rec_for({"pmid": "5002"})["state"] = "pending_review"
        dsync.sync_statuses(e.ledger, ev, displayed, {})
        self.assertEqual(e.ledger.get("5001")["status"], L.PUBLISHED); self.assertEqual(e.ledger.get("5002")["status"], L.AWAITING)
        self.assertIn("relevance", e.ledger.get("5002")["status_reason"].lower())
        # 5. nothing unexplained
        rep = drec.reconcile(e.ledger, archive, ev, displayed); self.assertEqual(rep["discrepancies"], [], rep["discrepancies"])
        # 6. editor approves the uncertain one -> it appears
        decisions.apply_decision(ev, {"content_id": ev.rec_for({"pmid": "5002"})["content_id"], "action": "approve", "reviewer": "dr.a", "note": "ICU relevance confirmed"})
        shown_lists = {sec: ev.filter_visible(sec, lst) for sec, lst in secs.items()}
        out = build_output(ev, shown_lists); displayed = drec.displayed_pmids(out)
        dsync.sync_statuses(e.ledger, ev, displayed, {})
        self.assertEqual(e.ledger.get("5002")["status"], L.PUBLISHED)
        # 7. complete, ordered history for the first article
        hist = [h[1] for h in e.ledger.get("5001")["history"]]
        self.assertEqual(hist[:3], [L.DISCOVERED, L.RETRIEVED, L.AWAITING]); self.assertEqual(hist[-1], L.PUBLISHED)
        self.assertEqual(publish.safety_check(out, ev.ledger) and [f for f in publish.safety_check(out, ev.ledger) if f["severity"] == "critical"], [])


if __name__ == "__main__":
    unittest.main()
