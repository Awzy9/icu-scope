import unittest
from tests.helpers import *  # noqa
from evidence import http, normalize as N


class TestNormalize(unittest.TestCase):
    def test_doi_forms_equal(self):
        self.assertEqual(N.norm_doi("https://doi.org/10.1000/ABC.1"), N.norm_doi("DOI: 10.1000/abc.1"))
        self.assertEqual(N.norm_doi("http://dx.doi.org/10.1000/x."), "10.1000/x")

    def test_doi_syntax_is_not_validity(self):
        self.assertTrue(N.doi_syntax_ok("10.1000/fake.but.well-formed"))   # syntax only; existence is checked by sources
        self.assertFalse(N.doi_syntax_ok("10.1/x"))
        self.assertFalse(N.doi_syntax_ok("not-a-doi"))

    def test_pmid(self):
        self.assertEqual(N.norm_pmid(" 00123 "), "123")
        self.assertEqual(N.norm_pmid("PMID: 42645558"), "42645558")

    def test_identity_keys_dedupe_across_forms(self):
        a = {"pmid": "123", "doi": "10.1000/ABC"}
        b = {"doi": "https://doi.org/10.1000/abc"}
        self.assertTrue(set(N.identity_keys(a)) & set(N.identity_keys(b)))

    def test_title_only_key_normalised(self):
        a = {"title": "Early  Vasopressin: A TRIAL!", "pubdate": "2026 Oct"}
        b = {"title": "early vasopressin a trial", "pubdate": "2026-10-01"}
        self.assertEqual(N.identity_keys(a), N.identity_keys(b))

    def test_nct_ids(self):
        self.assertEqual(N.nct_ids("registered nct05624450 and NCT01234567"), ["NCT01234567", "NCT05624450"])

    def test_greek_and_markup(self):
        self.assertGreater(N.title_similarity("ß-blockade in <i>sepsis</i>", "β-blockade in sepsis"), 0.95)


class TestHttp(unittest.TestCase):
    def test_retry_with_exponential_backoff_then_success(self):
        n = FakeNet()
        seq = [(429, b"", {}), (503, b"", {}), (200, b'{"ok":1}', {})]
        http.TRANSPORT = lambda u, h, t: seq.pop(0)
        self.assertEqual(http.request_json("https://api.crossref.org/x"), {"ok": 1})
        waits = [s for s in n.sleeps if s >= 1]
        self.assertEqual(waits, [1.0, 2.0])        # base * 2**attempt

    def test_404_is_not_found_not_error(self):
        FakeNet()
        with self.assertRaises(http.NotFound):
            http.request("https://api.crossref.org/missing")

    def test_persistent_failure_raises_source_error(self):
        n = FakeNet(); n.down.add("crossref")
        with self.assertRaises(http.SourceError):
            http.request("https://api.crossref.org/x", retries=2)
        self.assertEqual(http.METRICS["retries"], 2)

    def test_client_error_not_retried(self):
        n = FakeNet(); n.add("api.crossref.org", b"", 400)
        with self.assertRaises(http.SourceError):
            http.request("https://api.crossref.org/x")
        self.assertEqual(http.METRICS["retries"], 0)

    def test_invalid_json_is_source_error(self):
        n = FakeNet(); n.add("api.crossref.org", b"<html>oops")
        with self.assertRaises(http.SourceError):
            http.request_json("https://api.crossref.org/x")


if __name__ == "__main__":
    unittest.main()
