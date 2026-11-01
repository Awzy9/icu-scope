import json
import unittest
from tests.helpers import *  # noqa
from evidence import sources, verify


def names(res, result):
    return {c["name"] for c in res["checks"] if c["result"] == result}


class TestSourceVerification(unittest.TestCase):
    def test_real_retracted_pubmed_record_detected(self):
        """Fixture is the genuine PubMed XML of the retracted Surgisphere/Lancet paper (PMID 32450107)."""
        pm = sources.parse_pubmed_xml(open(os.path.join(FIX, "pubmed_retracted_32450107.xml"), "rb").read())["32450107"]
        art = {"pmid": "32450107", "doi": "10.1016/S0140-6736(20)31180-6", "title": pm["title"], "pubdate": "2020 May"}
        res = verify.verify_publication(art, pm, None, None)
        self.assertEqual(res["retraction_status"], "retracted")
        self.assertTrue(pm["retracted_flag"])
        kinds = {n["type"] for n in res["notices"]}
        self.assertTrue({"retraction", "expression_of_concern"} <= kinds)

    def test_consistent_record_is_verified(self):
        n = standard_net()
        res = verify.gather_and_verify(GOOD)
        self.assertEqual(res["status"], "verified")
        self.assertEqual(res["level"], "metadata")           # never claims full-text verification
        self.assertEqual(res["retraction_status"], "none")

    def test_nonexistent_pmid_fails_critically(self):
        FakeNet().pubmed()                                    # PubMed answers, record absent
        res = verify.gather_and_verify({**GOOD, "doi": ""})
        self.assertEqual(res["status"], "failed")
        self.assertIn("pmid_exists", names(res, "fail"))

    def test_well_formed_but_unregistered_doi_fails(self):
        n = FakeNet()
        n.pubmed({"pmid": "1001", "doi": "10.1000/good.1", "title": GOOD["title"]})
        # Crossref 404 and doi.org 404 -> syntactically valid DOI that does not exist
        res = verify.gather_and_verify(GOOD)
        self.assertEqual(res["status"], "failed")
        self.assertIn("doi_registered", names(res, "fail"))

    def test_doi_in_other_agency_accepted_via_handle_service(self):
        n = FakeNet()
        n.pubmed({"pmid": "1001", "doi": "10.1000/good.1", "title": GOOD["title"]})
        n.add("doi.org/api/handles", {"responseCode": 1})
        res = verify.gather_and_verify(GOOD)
        self.assertEqual(res["status"], "verified")

    def test_doi_pmid_mismatch_fails(self):
        n = FakeNet()
        n.pubmed({"pmid": "1001", "doi": "10.1000/other.99", "title": GOOD["title"]})
        n.add("api.crossref.org/works/10.1000/good.1", crossref_json("10.1000/good.1", GOOD["title"]).decode() and json.loads(crossref_json("10.1000/good.1", GOOD["title"])))
        res = verify.gather_and_verify(GOOD)
        self.assertEqual(res["status"], "failed")
        self.assertIn("doi_matches_pmid", names(res, "fail"))

    def test_title_mismatch_requires_review_not_publication(self):
        n = FakeNet()
        n.pubmed({"pmid": "1001", "doi": "10.1000/good.1", "title": GOOD["title"]})
        n.add("api.crossref.org/works/10.1000", json.loads(crossref_json("10.1000/good.1", "A completely different paper about renal replacement")))
        res = verify.gather_and_verify(GOOD)
        self.assertEqual(res["status"], "discrepancy")

    def test_incorrect_publication_date_flagged(self):
        n = standard_net()
        res = verify.gather_and_verify({**GOOD, "pubdate": "2019 Oct"})
        self.assertIn("pubdate_vs_pubmed", names(res, "fail"))
        self.assertEqual(res["status"], "discrepancy")

    def test_nonexistent_trial_registration_fails(self):
        n = standard_net()
        n.pubmed({"pmid": "1001", "doi": "10.1000/good.1", "title": GOOD["title"], "nct": "NCT99999999"})
        res = verify.gather_and_verify(GOOD)                  # ClinicalTrials.gov 404 for NCT99999999
        self.assertEqual(res["status"], "failed")
        self.assertIn("registry_NCT99999999", names(res, "fail"))

    def test_inconsistent_registry_title_fails(self):
        n = FakeNet()
        n.add("clinicaltrials.gov/api/v2/studies/NCT01234567", {"protocolSection": {"identificationModule": {"nctId": "NCT01234567", "briefTitle": "Statins for knee pain"}}})
        art = {"title": "Tozorakimab in viral lung infection", "nct_id": "NCT01234567", "url": "https://clinicaltrials.gov/study/NCT01234567", "pubdate": "2026-10-01"}
        res = verify.gather_and_verify(art)
        self.assertEqual(res["status"], "failed")

    def test_outage_is_unavailable_never_failed(self):
        n = standard_net(); n.down.update({"eutils", "crossref"})
        res = verify.gather_and_verify(GOOD)
        self.assertEqual(res["status"], "unavailable")

    def test_correction_and_eoc_statuses(self):
        n = standard_net()
        n.pubmed({"pmid": "1001", "doi": "10.1000/good.1", "title": GOOD["title"], "comments": [("ErratumIn", "5001")]})
        self.assertEqual(verify.gather_and_verify(GOOD)["retraction_status"], "corrected")
        n.pubmed({"pmid": "1001", "doi": "10.1000/good.1", "title": GOOD["title"], "comments": [("ExpressionOfConcernIn", "5002")]})
        self.assertEqual(verify.gather_and_verify(GOOD)["retraction_status"], "expression_of_concern")

    def test_crossref_retraction_detected(self):
        n = standard_net()
        n.add("api.crossref.org/works/10.1000", json.loads(crossref_json("10.1000/good.1", GOOD["title"], updates=[("retraction", "10.1000/ret.1")])))
        self.assertEqual(verify.gather_and_verify(GOOD)["retraction_status"], "retracted")

    def test_erratum_title_is_not_primary_evidence(self):
        n = standard_net()
        res = verify.gather_and_verify({**GOOD, "title": "Erratum: " + GOOD["title"]})
        self.assertIn("is_primary_publication", names(res, "fail"))


if __name__ == "__main__":
    unittest.main()
