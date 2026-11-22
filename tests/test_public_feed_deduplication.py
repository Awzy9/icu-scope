"""Regression tests for public ICU literature feed deduplication."""
import unittest

from scripts.fetch_articles import dedupe_public_items
from scripts.evidence.normalize import identity_keys


class PublicFeedDeduplicationTests(unittest.TestCase):
    def test_same_post_at_two_foamed_urls_keeps_one_public_card(self):
        original = [
            {"title": "The Scarlet Letters", "pubdate": "2026-11-20",
             "url": "https://example.org/posts/scarlet-letters"},
            {"title": "The Scarlet Letters", "pubdate": "2026-11-20",
             "url": "https://example.org/category/blog/scarlet-letters"},
        ]
        public = dedupe_public_items(original, "foamed")
        self.assertEqual(len(public), 1)
        self.assertEqual(public[0]["url"], original[0]["url"])
        # Archive/source entries are preserved for audit, not removed in-place.
        self.assertEqual(len(original), 2)

    def test_distinct_publications_are_preserved(self):
        articles = [
            {"title": "The Scarlet Letters", "pubdate": "2025-11-20",
             "url": "https://example.org/2025"},
            {"title": "The Scarlet Letters", "pubdate": "2026-11-20",
             "url": "https://example.org/2026"},
            {"title": "A different article", "pubdate": "2026-11-20",
             "url": "https://example.org/other"},
        ]
        self.assertEqual(dedupe_public_items(articles, "foamed"), articles)

    def test_distinct_pmids_not_collapsed_by_identical_titles(self):
        articles = [
            {"pmid": "12345", "title": "Same name", "pubdate": "2026-11-20"},
            {"pmid": "12346", "title": "Same name", "pubdate": "2026-11-20"},
        ]
        self.assertEqual(dedupe_public_items(articles, "foamed"), articles)

    def test_uses_exact_publication_safety_gate_identity(self):
        articles = [
            {"title": "The Scarlet Letters!", "pubdate": "2026-11-20",
             "url": "https://example.org/one"},
            {"title": "the scarlet letters", "pubdate": "2026-11-21",
             "url": "https://example.org/two"},
        ]
        self.assertEqual(identity_keys(articles[0])[0], identity_keys(articles[1])[0])
        self.assertEqual(len(dedupe_public_items(articles, "foamed")), 1)

    def test_missing_identity_is_not_silently_ignored(self):
        # Keep malformed records in the output so that the strict safety gate
        # still detects them rather than the cleanup hiding a safety problem.
        articles = [{"summary": "No identity"}, {"summary": "No identity"}]
        self.assertEqual(dedupe_public_items(articles, "foamed"), articles)


if __name__ == "__main__":
    unittest.main()
