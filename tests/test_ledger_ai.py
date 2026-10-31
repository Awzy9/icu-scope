import json
import unittest
from tests.helpers import *  # noqa
from evidence import ai_validate as V
from evidence.ledger import AuditLog, Ledger, LedgerError

SRC = GOOD["abstract"]


class TestLedger(unittest.TestCase):
    def setUp(self):
        self.t = TmpData(); self.d = self.t.__enter__(); self.L = Ledger(self.d)

    def tearDown(self):
        self.t.__exit__()

    def rec(self, art=GOOD):
        r, _ = self.L.get_or_create(art, "original_research"); return r

    def test_dedupe_same_publication_many_forms(self):
        r1 = self.rec({"pmid": "77", "title": "X", "pubdate": "2026"})
        r2, created = self.L.get_or_create({"doi": "10.1000/abc", "pmid": "0077", "title": "x"}, "original_research")
        self.assertFalse(created); self.assertEqual(r1["content_id"], r2["content_id"])
        r3, created = self.L.get_or_create({"doi": "https://doi.org/10.1000/ABC"}, "original_research")
        self.assertFalse(created); self.assertEqual(r3["content_id"], r1["content_id"])
        self.assertEqual(len(self.L.records), 1)

    def test_identity_conflict_flagged(self):
        self.rec({"pmid": "1", "title": "A"}); b = self.rec({"pmid": "2", "title": "B"})
        self.L.get_or_create({"pmid": "1", "doi": "10.1000/z"}, "original_research")       # DOI z now belongs to record 1
        self.L.get_or_create({"pmid": "2", "doi": "10.1000/z"}, "original_research")       # ...but record 2 claims it too
        self.assertEqual(len(self.L.records), 2)
        self.assertIn("duplicate_identity_conflict", b["flags"])

    def test_illegal_transition_rejected(self):
        r = self.rec()
        with self.assertRaises(LedgerError):
            self.L.transition(r, "bogus", "system:x")
        r["state"] = "archived"
        with self.assertRaises(LedgerError):        # archived content can only re-enter via review
            self.L.transition(r, "published", "reviewer:dr")

    def test_retracted_cannot_be_published(self):
        r = self.rec(); r["retraction_status"] = "retracted"
        r["source_verification"]["status"] = "verified"
        with self.assertRaises(LedgerError):
            self.L.transition(r, "published", "reviewer:dr")

    def test_failed_verification_blocks_publication(self):
        r = self.rec(); r["source_verification"]["status"] = "failed"
        with self.assertRaises(LedgerError):
            self.L.transition(r, "published", "reviewer:dr")

    def test_publication_requires_completed_verification(self):
        r = self.rec()
        with self.assertRaises(LedgerError):
            self.L.transition(r, "published", "system:auto")

    def test_protective_states_require_reassessment(self):
        r = self.rec(); r["source_verification"]["status"] = "verified"
        self.L.transition(r, "retracted", "system:s")
        with self.assertRaises(LedgerError):
            self.L.transition(r, "published", "reviewer:dr")
        self.L.transition(r, "pending_review", "reviewer:dr", reassessed=True)
        self.assertEqual(r["state"], "pending_review")

    def test_discrepancy_needs_human(self):
        r = self.rec(); r["source_verification"]["status"] = "discrepancy"; self.L.transition(r, "pending_review", "system:x")
        with self.assertRaises(LedgerError):
            self.L.transition(r, "published", "system:auto")
        self.L.transition(r, "published", "reviewer:dr")
        self.assertEqual(r["editorial_reviewer"], "dr")

    def test_strict_mode_requires_human(self):
        L = Ledger(self.d, policy={**self.L.policy, "strict_mode": True})
        r, _ = L.get_or_create(GOOD, "original_research"); r["source_verification"]["status"] = "verified"
        L.transition(r, "pending_review", "system:x")
        with self.assertRaises(LedgerError):
            L.transition(r, "published", "system:auto")

    def test_audit_chain_detects_tampering_and_deletion(self):
        r = self.rec(); self.L.transition(r, "pending_review", "system:x"); self.L.flag(r, "f1")
        self.assertEqual(self.L.audit.verify_chain(), (True, "ok"))
        p = self.L.audit.path; lines = open(p).read().splitlines()
        # edit an entry
        e = json.loads(lines[1]); e["detail"]["reason"] = "forged"; tampered = lines[:1] + [json.dumps(e)] + lines[2:]
        open(p, "w").write("\n".join(tampered) + "\n"); self.assertFalse(AuditLog(p).verify_chain()[0])
        # delete an entry
        open(p, "w").write("\n".join(lines[:1] + lines[2:]) + "\n"); self.assertFalse(AuditLog(p).verify_chain()[0])
        # restore -> valid again
        open(p, "w").write("\n".join(lines) + "\n"); self.assertTrue(AuditLog(p).verify_chain()[0])

    def test_state_changes_are_audited(self):
        r = self.rec(); self.L.transition(r, "pending_review", "reviewer:dr", "why")
        last = self.L.audit.entries()[-1]
        self.assertEqual((last["action"], last["actor"], last["detail"]["to_state"]), ("state_change", "reviewer:dr", "pending_review"))

    def test_clinical_fields_default_to_unable_to_verify(self):
        r = self.rec()
        for f in ("population", "sample_size", "intervention", "comparator", "primary_outcomes", "main_results", "limitations"):
            self.assertEqual(r[f], "Unable to verify")
        self.assertEqual(r["full_text_review"]["status"], "not_performed")


class TestAIValidation(unittest.TestCase):
    def test_grounded_summary_passes(self):
        r = V.validate({"key_stats": "n=1200, RR 0.83 (95% CI 0.70-0.98), p=0.03", "summary": "In 1200 patients mortality was 20.1% versus 24.3%."}, SRC, "Randomized Controlled Trial")
        self.assertEqual(r["status"], "auto_validated"); self.assertTrue(r["trace"])
        self.assertTrue(all(t["source_span"] for t in r["trace"]))     # claims trace to a source sentence

    def test_fabricated_number_rejected(self):
        r = V.validate({"summary": "Mortality fell from 31.5% to 12.2%."}, SRC, "Randomized Controlled Trial")
        self.assertEqual(r["status"], "failed"); self.assertTrue(any("31.5" in i for i in r["issues"]))

    def test_fabricated_trial_identifier_and_name_rejected(self):
        r = V.validate({"summary": "The SMARTER trial (NCT01234567) found benefit."}, SRC, "Randomized Controlled Trial")
        self.assertEqual(r["status"], "failed")
        txt = " ".join(r["issues"]); self.assertIn("NCT01234567", txt); self.assertIn("SMARTER", txt)

    def test_causal_language_for_observational_rejected(self):
        src = "This retrospective cohort study of 840 ICU patients found that early mobilisation was associated with shorter stay (OR 0.71, 95% CI 0.55-0.92). Residual confounding is possible. " * 2
        bad = V.validate({"summary": "Early mobilisation led to shorter stays in 840 patients."}, src, "Observational Study")
        self.assertEqual(bad["status"], "failed"); self.assertTrue(any("association" in i for i in bad["issues"]))
        ok = V.validate({"summary": "Early mobilisation was associated with shorter stays in 840 patients."}, src, "Observational Study")
        self.assertEqual(ok["status"], "auto_validated")

    def test_overstated_certainty_and_directives_rejected(self):
        r = V.validate({"summary": "This proves that vasopressin works; clinicians should use it."}, SRC, "Randomized Controlled Trial")
        self.assertEqual(r["status"], "failed")

    def test_significance_claim_against_null_result_rejected(self):
        src = "In 600 patients there was no significant difference in 28-day mortality (RR 0.95, 95% CI 0.80-1.12; p=0.52). " * 3
        r = V.validate({"summary": "Treatment significantly reduced mortality in 600 patients."}, src, "Randomized Controlled Trial")
        self.assertEqual(r["status"], "failed")

    def test_statistical_inconsistencies_detected(self):
        self.assertTrue(V.check_stats("RR 0.83 (95% CI 0.90-0.98)"))                 # estimate outside CI
        self.assertTrue(V.check_stats("HR 0.85 (95% CI 0.70-1.04), p=0.01"))          # significant p but CI spans 1
        self.assertTrue(V.check_stats("OR 0.60 (95% CI 0.40-0.90), p=0.40"))          # CI excludes 1 but p not significant
        self.assertTrue(V.check_stats("ARR 4.0%, NNT 90"))                              # NNT != 100/ARR
        self.assertFalse(V.check_stats("RR 0.83 (95% CI 0.70-0.98), p=0.03, ARR 4.2%, NNT 24"))

    def test_no_source_text_cannot_be_validated(self):
        r = V.validate({"summary": "Something."}, "", "Review")
        self.assertEqual(r["status"], "failed")

    def test_empty_result_is_none(self):
        self.assertEqual(V.validate({}, SRC)["status"], "none")


if __name__ == "__main__":
    unittest.main()
