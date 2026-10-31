import copy
import json
import os
import unittest
from tests.helpers import *  # noqa
from evidence import decisions, publish
import evidence_cli


def build_output(p, arts_by_section):
    """Assemble an articles.json-shaped object exactly as fetch_articles.main does."""
    p.finalize_ai([a for lst in arts_by_section.values() for a in lst])
    out = {"generated_at": "x", "categories": [], "spotlight": {}}
    for sec, lst in arts_by_section.items():
        if sec.startswith("categories/"):
            out["categories"].append({"id": sec.split("/")[1], "label": "L", "abbr": "L", "articles": lst})
        else:
            out[sec] = {"window_days": 1, "articles": lst}
    return out


class GateCase(unittest.TestCase):
    def setUp(self):
        self.t = TmpData(); self.d = self.t.__enter__(); standard_net()
        self.a = copy.deepcopy(GOOD); self.a["ai_summary"] = "In 1200 patients mortality was 20.1%."
        self.p = make_pipeline(self.d); self.p.ingest({"categories/x": [self.a]}); self.p.verify_pending(); self.p.persist()
        self.out = build_output(self.p, {"categories/x": [self.a]}); self.p.persist()   # same order as fetch_articles.main
        self.path = os.path.join(self.d, "articles.json")

    def tearDown(self):
        self.t.__exit__()

    def codes(self, out=None):
        return {f["code"] for f in publish.safety_check(out or self.out, self.p.ledger) if f["severity"] == "critical"}


class TestSafetyGate(GateCase):
    def test_good_output_passes_and_is_written(self):
        written, findings = publish.publish_if_safe(self.out, self.p.ledger, self.path)
        self.assertTrue(written); self.assertFalse([f for f in findings if f["severity"] == "critical"])
        self.assertEqual(json.load(open(self.path))["categories"][0]["articles"][0]["evidence"]["state"], "published")

    def test_false_verification_badge_is_critical(self):
        rec = self.p.rec_for(self.a); rec["source_verification"]["status"] = "discrepancy"
        self.assertIn("false_badge", self.codes())
        self.out["categories"][0]["articles"][0]["evidence"]["clinically_reviewed"] = True
        self.assertIn("false_badge", self.codes())

    def test_unvalidated_ai_shown_is_critical(self):
        self.p.rec_for(self.a)["ai"]["status"] = "failed"
        self.assertIn("ai_not_validated", self.codes())

    def test_practice_text_without_approval_is_critical(self):
        self.out["categories"][0]["articles"][0]["ai_rounds_takeaway"] = "Give drug X."
        self.assertIn("ai_not_validated", self.codes())

    def test_retracted_promoted_is_critical(self):
        rec = self.p.rec_for(self.a); self.p.ledger.transition(rec, "retracted", "system:s"); rec["retraction_status"] = "retracted"
        self.out["trending"] = {"articles": [self.out["categories"][0]["articles"][0]]}
        self.assertIn("retracted_promoted", self.codes())
        self.out["spotlight"] = {"pmid": "1001"}
        self.assertIn("spotlight_ineligible", self.codes())

    def test_duplicates_are_critical(self):
        self.out["categories"][0]["articles"].append(copy.deepcopy(self.out["categories"][0]["articles"][0]))
        self.assertIn("duplicate", self.codes())

    def test_item_without_verification_record_is_critical(self):
        bad = copy.deepcopy(self.out); del bad["categories"][0]["articles"][0]["evidence"]
        self.assertIn("no_evidence_block", self.codes(bad))

    def test_missing_critical_clinical_fields_are_critical(self):
        a = self.out["categories"][0]["articles"][0]; a["title"] = ""; a["pmid"] = ""; a["doi"] = ""
        self.assertIn("missing_field", self.codes())

    def test_published_but_failed_verification_is_critical(self):
        self.p.rec_for(self.a)["source_verification"]["status"] = "failed"
        self.assertTrue({"failed_verification_published", "invisible_published"} & self.codes())

    def test_audit_tampering_blocks_publication(self):
        open(self.p.ledger.audit.path, "a").write('{"seq": 99, "forged": true}\n')
        self.assertIn("audit_chain", self.codes())

    def test_failed_gate_leaves_deployed_content_intact(self):
        """Rollback/recovery: the previously deployed verified file is untouched byte-for-byte."""
        publish.publish_if_safe(self.out, self.p.ledger, self.path)
        before = open(self.path, "rb").read()
        bad = copy.deepcopy(self.out); bad["categories"][0]["articles"][0]["ai_rounds_takeaway"] = "unapproved recommendation"
        written, findings = publish.publish_if_safe(bad, self.p.ledger, self.path)
        self.assertFalse(written); self.assertEqual(open(self.path, "rb").read(), before)
        self.assertFalse([f for f in os.listdir(self.d) if f.startswith(".tmp-")])      # no partial temp files left

    def test_crash_mid_write_never_corrupts_target(self):
        publish.publish_if_safe(self.out, self.p.ledger, self.path); before = open(self.path, "rb").read()
        import evidence.ledger as lg, os as _os
        real = _os.replace
        _os.replace = lambda *a, **k: (_ for _ in ()).throw(OSError("disk full"))
        try:
            with self.assertRaises(OSError):
                lg.atomic_write(self.path, "{truncated")
        finally:
            _os.replace = real
        self.assertEqual(open(self.path, "rb").read(), before)

    def test_ledger_rollback_via_backup_restores_state(self):
        shutil.copy(self.p.ledger.path, self.p.ledger.path + ".bak")
        rec = self.p.rec_for(self.a); self.p.ledger.transition(rec, "retracted", "system:s"); self.p.persist()
        shutil.copy(self.p.ledger.path + ".bak", self.p.ledger.path)
        from evidence.ledger import Ledger
        self.assertEqual(Ledger(self.d).records[rec["content_id"]]["state"], "published")


class TestCli(GateCase):
    def setUp(self):
        super().setUp(); self.old = evidence_cli.DATA; evidence_cli.DATA = self.d

    def tearDown(self):
        evidence_cli.DATA = self.old; super().tearDown()

    def test_check_exit_codes_block_on_critical(self):
        publish.publish_if_safe(self.out, self.p.ledger, self.path)
        self.assertEqual(evidence_cli.main(["check", "--quiet", "--articles", self.path]), 0)
        bad = copy.deepcopy(self.out); bad["categories"][0]["articles"][0]["ai_rounds_takeaway"] = "x"
        badp = os.path.join(self.d, "bad.json"); json.dump(bad, open(badp, "w"))
        self.assertEqual(evidence_cli.main(["check", "--quiet", "--articles", badp]), 1)
        self.assertEqual(evidence_cli.main(["check", "--quiet", "--articles", os.path.join(self.d, "missing.json")]), 2)

    def test_audit_verify_command(self):
        self.assertEqual(evidence_cli.main(["audit-verify"]), 0)


import shutil  # noqa: E402

if __name__ == "__main__":
    unittest.main()
