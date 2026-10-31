import copy
import json
import unittest
from tests.helpers import *  # noqa
from evidence import decisions, publish
from evidence.ledger import LedgerError


def art(**kw):
    a = copy.deepcopy(GOOD); a.update(kw); return a


class PipeCase(unittest.TestCase):
    def setUp(self):
        self.t = TmpData(); self.d = self.t.__enter__()

    def tearDown(self):
        self.t.__exit__()

    def run_pipe(self, sections, legacy=False, **policy):
        p = make_pipeline(self.d, **policy)
        p.ingest(sections, legacy=legacy); p.verify_pending(); p.persist(); return p


class TestEvidencePipeline(PipeCase):
    def test_new_verified_item_is_auto_published_with_metadata_only_badge(self):
        standard_net()
        a = art(); p = self.run_pipe({"categories/x": [a]})
        rec = p.rec_for(a)
        self.assertEqual((rec["state"], rec["source_verification"]["status"]), ("published", "verified"))
        ev = publish.public_evidence(rec)
        self.assertTrue(ev["source_verified"]); self.assertFalse(ev["full_text_reviewed"]); self.assertFalse(ev["clinically_reviewed"])
        self.assertEqual(ev["verification_level"], "metadata")

    def test_new_unverified_item_never_published(self):
        n = FakeNet(); n.pubmed()                                   # PMID unknown to PubMed
        a = art(); p = self.run_pipe({"categories/x": [a]})
        self.assertEqual(p.filter_visible("categories/x", [a]), [])
        self.assertEqual(p.rec_for(a)["state"], "unverified")

    def test_new_item_during_outage_is_held_back(self):
        n = standard_net(); n.down.update({"eutils", "crossref"})
        a = art(); p = self.run_pipe({"categories/x": [a]})
        self.assertEqual(p.filter_visible("categories/x", [a]), [])

    def test_outage_never_erases_previously_verified_content(self):
        n = standard_net(); a = art(); p = self.run_pipe({"categories/x": [a]})
        before = copy.deepcopy(p.rec_for(a))
        n.down.update({"eutils", "crossref"})
        p2 = make_pipeline(self.d); p2.ingest({"categories/x": [a]})
        rec = p2.rec_for(a); rec["next_check"] = "2000-01-01T00:00:00+00:00"          # force re-check
        p2.verify_pending()
        after = p2.rec_for(a)
        self.assertEqual(after["state"], "published")
        self.assertEqual(after["source_verification"]["status"], "verified")
        self.assertEqual(after["source_verification"]["checked_at"], before["source_verification"]["checked_at"])
        self.assertEqual(len(p2.filter_visible("categories/x", [a])), 1)

    def test_legacy_item_stays_visible_but_unbadged_when_unverifiable(self):
        n = standard_net(); n.down.update({"eutils", "crossref"})
        a = art(); p = self.run_pipe({"categories/x": [a]}, legacy=True)
        self.assertEqual(len(p.filter_visible("categories/x", [a])), 1)
        ev = publish.public_evidence(p.rec_for(a))
        self.assertFalse(ev["source_verified"]); self.assertTrue(ev["unverified_legacy"])

    def test_legacy_item_failing_verification_is_withdrawn(self):
        n = FakeNet(); n.pubmed()
        a = art(); p = self.run_pipe({"categories/x": [a]}, legacy=True)
        self.assertEqual(p.filter_visible("categories/x", [a]), [])

    def test_guideline_and_discrepancy_need_editorial_approval(self):
        standard_net()
        g = art(study_type="Guideline"); p = self.run_pipe({"guidelines": [g]})
        self.assertEqual(p.rec_for(g)["state"], "pending_review")
        self.assertEqual(p.filter_visible("guidelines", [g]), [])           # not shown until a human approves
        with self.assertRaises(LedgerError):
            p.ledger.transition(p.rec_for(g), "published", "system:auto-policy")
        decisions.apply_decision(p, {"content_id": p.rec_for(g)["content_id"], "action": "approve", "reviewer": "dr.a", "note": "issuer confirmed"})
        self.assertEqual(p.rec_for(g)["state"], "published"); self.assertEqual(p.rec_for(g)["editorial_reviewer"], "dr.a")

    def test_strict_mode_holds_everything_for_human_review(self):
        standard_net(); a = art(); p = self.run_pipe({"categories/x": [a]}, strict_mode=True)
        self.assertEqual(p.rec_for(a)["state"], "pending_review")

    def test_duplicates_across_sections_collapse_to_one_record(self):
        standard_net(); a1, a2 = art(), art(url="https://x")
        p = self.run_pipe({"categories/a": [a1], "trending": [a2]})
        self.assertEqual(len(p.ledger.records), 1)
        self.assertEqual(sorted(p.placements[p.rec_for(a1)["content_id"]]), ["categories/a", "trending"])

    def test_retraction_on_recheck_flags_withholds_ai_alerts_and_lists_derived(self):
        n = standard_net(); a = art(ai_summary="In 1200 patients mortality was 20.1%.")
        p = self.run_pipe({"categories/x": [a], "trending": [a]}); p.finalize_ai([a]); p.persist()
        self.assertEqual(p.rec_for(a)["ai"]["status"], "auto_validated"); self.assertIn("ai_summary", a)
        n.pubmed({"pmid": "1001", "doi": "10.1000/good.1", "title": "RETRACTED: " + GOOD["title"], "pubtypes": ["Journal Article", "Retracted Publication"], "comments": [("RetractionIn", "5003")]})
        p2 = make_pipeline(self.d); p2.ingest({"categories/x": [a], "trending": [a]})
        p2.rec_for(a)["next_check"] = "2000-01-01T00:00:00+00:00"; p2.verify_pending()
        rec = p2.rec_for(a)
        self.assertEqual((rec["state"], rec["retraction_status"]), ("retracted", "retracted"))
        self.assertEqual(len(p2.alerts), 1); al = p2.alerts[0]
        self.assertEqual(al["kind"], "retracted")
        self.assertTrue(any("trending" in d for d in al["derived_content"]) and any("AI summary" in d for d in al["derived_content"]))
        self.assertEqual(p2.filter_visible("trending", [a]), [])            # never promoted
        self.assertEqual(len(p2.filter_visible("categories/x", [a])), 1)     # but history preserved, with banner
        b = copy.deepcopy(a); p2.finalize_ai([b]); self.assertNotIn("ai_summary", b)
        self.assertEqual(b["evidence"]["retraction_status"], "retracted")
        self.assertFalse(p2.featurable(a))

    def test_retraction_is_sticky_if_source_later_reports_none(self):
        n = standard_net(); a = art(); p = self.run_pipe({"categories/x": [a]})
        rec = p.rec_for(a); p.ledger.transition(rec, "retracted", "system:s"); rec["retraction_status"] = "retracted"
        p.apply_verification(rec, {"status": "verified", "level": "metadata", "checks": [], "discrepancies": [], "notices": [], "retraction_status": "none"})
        self.assertEqual(rec["retraction_status"], "retracted"); self.assertIn("retraction_status_conflict", rec["flags"])

    def test_correction_triggers_reassessment_and_withholds_ai(self):
        n = standard_net(); a = art(ai_summary="In 1200 patients mortality was 20.1%.")
        p = self.run_pipe({"categories/x": [a]}); p.finalize_ai([a]); self.assertIn("ai_summary", a)
        n.pubmed({"pmid": "1001", "doi": "10.1000/good.1", "title": GOOD["title"], "comments": [("ErratumIn", "5004")]})
        p2 = make_pipeline(self.d); p2.ingest({"categories/x": [a]}); p2.rec_for(a)["next_check"] = "2000-01-01T00:00:00+00:00"; p2.verify_pending()
        rec = p2.rec_for(a)
        self.assertEqual(rec["state"], "updated"); self.assertIn("reassess_after_correction", rec["flags"])
        b = art(ai_summary="In 1200 patients mortality was 20.1%."); p2.finalize_ai([b])
        self.assertNotIn("ai_summary", b)                                   # auto-validation cannot restore it
        decisions.apply_decision(p2, {"content_id": rec["content_id"], "action": "approve_ai", "reviewer": "dr", "note": "reassessed"}) if rec["ai"]["status"] == "auto_validated" else None
        self.assertFalse(publish.is_promotable(rec))

    def test_expression_of_concern_moves_to_under_investigation(self):
        n = standard_net(); a = art(); p = self.run_pipe({"categories/x": [a]})
        n.pubmed({"pmid": "1001", "doi": "10.1000/good.1", "title": GOOD["title"], "comments": [("ExpressionOfConcernIn", "5005")]})
        p2 = make_pipeline(self.d); p2.ingest({"categories/x": [a]}); p2.rec_for(a)["next_check"] = "2000-01-01T00:00:00+00:00"; p2.verify_pending()
        self.assertEqual(p2.rec_for(a)["state"], "under_investigation"); self.assertEqual(p2.filter_visible("trending", [a]), [])

    def test_approved_content_not_overwritten_by_changed_fetch(self):
        standard_net(); a = art(); p = self.run_pipe({"categories/x": [a]})
        changed = art(abstract="Completely rewritten conclusions favouring the drug strongly. " * 4)
        kept = p.guard_update(a, changed)
        self.assertEqual(kept["abstract"], a["abstract"])                   # approved version retained
        rec = p.rec_for(a); self.assertIn("source_changed", rec["flags"]); self.assertTrue(rec["pending_update"])
        self.assertTrue(any(al["kind"] == "approved_content_changed" for al in p.alerts))
        minor = art(citation_count=99); self.assertEqual(p.guard_update(a, minor)["citation_count"], 99)   # non-material fields still flow

    def test_same_pmid_in_two_sections_with_different_copies_is_not_a_false_change_alert(self):
        standard_net(); renal = art(study_type="Study"); endo = art(study_type="Randomized Controlled Trial")
        p = self.run_pipe({"categories/renal": [renal], "categories/endo": [endo]})
        self.assertEqual(p.guard_update(renal, copy.deepcopy(renal))["abstract"], renal["abstract"])
        self.assertEqual(p.alerts, [])

    def test_study_type_is_harmonised_from_verified_pubmed_types(self):
        standard_net(); stale = art(study_type="Study"); good = art(study_type="Randomized Controlled Trial")
        p = self.run_pipe({"categories/a": [stale], "categories/b": [good]})
        norm = lambda pts: "Randomized Controlled Trial" if "Randomized Controlled Trial" in pts else "Study"
        p.harmonize_study_type([stale, good], norm)
        self.assertEqual(stale["study_type"], "Randomized Controlled Trial"); self.assertEqual(p.stats["study_type_harmonized"], 1)

    def test_notice_records_are_not_published_as_evidence(self):
        n = standard_net(); n.pubmed({"pmid": "1001", "doi": "10.1000/good.1", "title": "Erratum: " + GOOD["title"], "pubtypes": ["Published Erratum"]})
        a = art(title="Erratum: " + GOOD["title"]); p = self.run_pipe({"categories/x": [a]})
        self.assertEqual(p.rec_for(a)["state"], "archived"); self.assertEqual(p.filter_visible("categories/x", [a]), [])

    def test_blog_content_is_expert_interpretation_without_source_badge(self):
        blog = {"title": "PulmCrit: thoughts", "url": "https://emcrit.org/x", "source": "EMCrit", "pubdate": "2026-10-01", "summary": "opinion " * 20}
        p = self.run_pipe({"foamed": [blog]})
        rec = p.rec_for(blog); ev = publish.public_evidence(rec)
        self.assertEqual((rec["state"], rec["content_class"]), ("published", "expert_interpretation"))
        self.assertFalse(ev["source_verified"])                             # no badge for something never verified

    def test_registry_record_populates_fields_from_clinicaltrials_gov(self):
        n = FakeNet()
        n.add("clinicaltrials.gov/api/v2/studies/NCT01234567", {"protocolSection": {"identificationModule": {"nctId": "NCT01234567", "briefTitle": "Drug X in sepsis"},
              "statusModule": {"overallStatus": "RECRUITING"}, "designModule": {"enrollmentInfo": {"count": 500, "type": "ESTIMATED"}},
              "armsInterventionsModule": {"interventions": [{"name": "Drug X"}], "armGroups": [{"label": "Placebo"}]}, "outcomesModule": {"primaryOutcomes": [{"measure": "28-day mortality"}]}}})
        t = {"title": "Drug X in sepsis", "nct_id": "NCT01234567", "url": "https://clinicaltrials.gov/study/NCT01234567", "pubdate": "2026-10-01", "study_type": "Clinical Trial (Recruiting)"}
        p = self.run_pipe({"trials": [t]}); rec = p.rec_for(t)
        self.assertEqual((rec["state"], rec["sample_size"], rec["primary_outcomes"]), ("published", "500 (estimated)", "28-day mortality"))
        self.assertIn("not available", rec["main_results"])


class TestAIPolicy(PipeCase):
    def test_practice_text_hidden_until_editor_approval(self):
        standard_net(); a = art(ai_summary="In 1200 patients mortality was 20.1%.", ai_rounds_takeaway="Consider early vasopressin.")
        p = self.run_pipe({"categories/x": [a]}); p.finalize_ai([a])
        self.assertIn("ai_summary", a); self.assertNotIn("ai_rounds_takeaway", a)
        b = art(ai_summary="In 1200 patients mortality was 20.1%.", ai_rounds_takeaway="Consider early vasopressin.")
        decisions.apply_decision(p, {"content_id": p.rec_for(a)["content_id"], "action": "approve_ai_practice", "reviewer": "dr", "note": "ok"})
        p.finalize_ai([b]); self.assertIn("ai_rounds_takeaway", b); self.assertEqual(b["evidence"]["ai_status"], "editor_approved")

    def test_failed_validation_hides_ai_and_cannot_be_approved(self):
        standard_net(); a = art(ai_summary="Mortality fell from 31.5% to 12.2%.")
        p = self.run_pipe({"categories/x": [a]}); p.finalize_ai([a])
        self.assertNotIn("ai_summary", a); self.assertEqual(p.rec_for(a)["ai"]["status"], "failed")
        with self.assertRaises(LedgerError):
            decisions.apply_decision(p, {"content_id": p.rec_for(a)["content_id"], "action": "approve_ai", "reviewer": "dr", "note": "x"})

    def test_approval_voided_when_source_text_changes(self):
        standard_net(); a = art(ai_summary="In 1200 patients mortality was 20.1%.")
        p = self.run_pipe({"categories/x": [a]}); p.finalize_ai([a])
        decisions.apply_decision(p, {"content_id": p.rec_for(a)["content_id"], "action": "approve_ai", "reviewer": "dr", "note": "ok"})
        c = art(ai_summary="In 1200 patients mortality was 20.1%.", abstract=GOOD["abstract"] + " An additional sentence about 1200 patients.")
        p.finalize_ai([c]); self.assertEqual(p.rec_for(a)["ai"]["status"], "auto_validated")     # re-validated, no longer 'editor_approved'

    def test_ai_without_abstract_is_never_shown(self):
        standard_net(); a = art(abstract="", ai_summary="Plausible but unsourced claim about 40 patients.")
        p = self.run_pipe({"categories/x": [a]}); p.finalize_ai([a]); self.assertNotIn("ai_summary", a)


class TestDecisions(PipeCase):
    def setUp(self):
        super().setUp(); standard_net(); self.a = art(study_type="Guideline"); self.p = self.run_pipe({"guidelines": [self.a]}); self.cid = self.p.rec_for(self.a)["content_id"]

    def test_decision_requires_documented_note(self):
        with self.assertRaises(LedgerError):
            decisions.apply_decision(self.p, {"content_id": self.cid, "action": "approve", "reviewer": "dr", "note": ""})

    def test_cannot_approve_failed_or_retracted(self):
        rec = self.p.rec_for(self.a); rec["source_verification"]["status"] = "failed"
        with self.assertRaises(LedgerError):
            decisions.apply_decision(self.p, {"content_id": self.cid, "action": "approve", "reviewer": "dr", "note": "x"})
        rec["source_verification"]["status"] = "verified"; self.p.ledger.transition(rec, "retracted", "system:s"); rec["retraction_status"] = "retracted"
        with self.assertRaises(LedgerError):
            decisions.apply_decision(self.p, {"content_id": self.cid, "action": "approve", "reviewer": "dr", "note": "x"})

    def test_restore_requires_reassessment_path_and_requeries_source(self):
        rec = self.p.rec_for(self.a); self.p.ledger.transition(rec, "retracted", "system:s"); rec["retraction_status"] = "retracted"
        decisions.apply_decision(self.p, {"content_id": self.cid, "action": "restore_to_review", "reviewer": "dr", "note": "publisher reinstated"})
        self.assertEqual((rec["state"], rec["source_verification"]["status"], rec["retraction_status"]), ("pending_review", "not_checked", "unknown"))

    def test_field_edits_are_whitelisted_and_audited(self):
        decisions.apply_decision(self.p, {"content_id": self.cid, "action": "set_fields", "reviewer": "dr", "note": "from paper", "fields": {"sample_size": "1200"}})
        self.assertEqual(self.p.rec_for(self.a)["sample_size"], "1200")
        self.assertTrue(any(e["action"] == "field_edit" for e in self.p.ledger.audit.entries()))
        with self.assertRaises(LedgerError):
            decisions.apply_decision(self.p, {"content_id": self.cid, "action": "set_fields", "reviewer": "dr", "note": "x", "fields": {"state": "published"}})

    def test_full_text_and_clinical_labels_only_via_human_decision(self):
        ev = publish.public_evidence(self.p.rec_for(self.a)); self.assertFalse(ev["full_text_reviewed"] or ev["clinically_reviewed"])
        for act in ("mark_full_text_reviewed", "mark_clinically_reviewed"):
            decisions.apply_decision(self.p, {"content_id": self.cid, "action": act, "reviewer": "dr", "note": "done"})
        ev = publish.public_evidence(self.p.rec_for(self.a)); self.assertTrue(ev["full_text_reviewed"] and ev["clinically_reviewed"])

    def test_decision_files_applied_or_rejected_with_audit(self):
        import os
        dd = os.path.join(self.d, "decisions"); os.makedirs(dd)
        json.dump({"content_id": self.cid, "action": "approve", "reviewer": "dr", "note": "ok"}, open(os.path.join(dd, "1.json"), "w"))
        json.dump({"content_id": self.cid, "action": "bogus", "reviewer": "dr", "note": "ok"}, open(os.path.join(dd, "2.json"), "w"))
        res = decisions.process_dir(self.p, dd)
        self.assertEqual([r["ok"] for r in res], [True, False])
        self.assertTrue(os.path.exists(os.path.join(dd, "applied", "1.json")) and os.path.exists(os.path.join(dd, "rejected", "2.json")))
        self.assertTrue(any(e["action"] == "decision_rejected" for e in self.p.ledger.audit.entries()))
        self.assertTrue(self.p.ledger.audit.verify_chain()[0])


if __name__ == "__main__":
    unittest.main()


class TestAppraisal(PipeCase):
    def test_framework_matches_design_and_defaults_to_not_assessed(self):
        from evidence import appraisal as A
        standard_net(); rct = art(); p = self.run_pipe({"categories/x": [rct]})
        ap = p.rec_for(rct)["appraisal"]
        self.assertTrue(ap["framework"].startswith("CONSORT 2025")); self.assertFalse(ap["completed"])
        judged = ("allocation_concealment", "blinding", "itt", "randomisation")
        self.assertTrue(all(ap["items"][k]["status"] == "not_assessed" for k in judged))   # never auto-judged from an abstract
        self.assertEqual(publish.public_evidence(p.rec_for(rct))["appraisal"], None)
        self.assertTrue(A.framework_for({"content_class": "evidence_synthesis", "pubtypes": ["Meta-Analysis"], "study_design": ""}).startswith("PRISMA"))
        self.assertTrue(A.framework_for({"content_class": "original_research", "pubtypes": ["Observational Study"], "study_design": ""}).startswith("STROBE"))
        self.assertTrue(A.framework_for({"content_class": "guideline", "pubtypes": [], "study_design": ""}).startswith("Guideline"))
        self.assertIsNone(A.framework_for({"content_class": "expert_interpretation", "pubtypes": [], "study_design": ""}))

    def test_incomplete_appraisal_cannot_be_completed_and_badge_needs_reviewer(self):
        standard_net(); a = art(); p = self.run_pipe({"categories/x": [a]}); cid = p.rec_for(a)["content_id"]
        with self.assertRaises(LedgerError):
            decisions.apply_decision(p, {"content_id": cid, "action": "set_appraisal", "reviewer": "dr", "note": "x", "items": {"blinding": {"status": "met"}}, "complete": True})
        with self.assertRaises(LedgerError):
            decisions.apply_decision(p, {"content_id": cid, "action": "set_appraisal", "reviewer": "dr", "note": "x", "items": {"nonsense": {"status": "met"}}})
        items = {k: {"status": "met", "note": "per full text"} for k in p.rec_for(a)["appraisal"]["items"]}
        decisions.apply_decision(p, {"content_id": cid, "action": "set_appraisal", "reviewer": "dr.b", "note": "full text read", "items": items, "complete": True})
        ev = publish.public_evidence(p.rec_for(a)); self.assertEqual(ev["appraisal"]["completed_by_reviewer"], True)


class TestFingerprint(PipeCase):
    def test_algorithm_change_never_looks_like_source_change_but_real_change_does(self):
        n = standard_net(); a = art(); p = self.run_pipe({"categories/x": [a]})
        rec = p.rec_for(a); rec["source_fingerprint"] = "legacy-format-fingerprint"           # stored by an older algorithm
        rec["next_check"] = "2000-01-01T00:00:00+00:00"; p.verify_pending()
        self.assertNotIn("source_metadata_changed", rec["flags"]); self.assertEqual(p.alerts, [])
        n.pubmed({"pmid": "1001", "doi": "10.1000/good.1", "title": GOOD["title"] + " (revised title)"})
        rec["next_check"] = "2000-01-01T00:00:00+00:00"; p.verify_pending()
        self.assertIn("source_metadata_changed", rec["flags"])
