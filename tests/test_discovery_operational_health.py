"""Operational CI failures must be distinct from routine editorial backlog."""
import datetime as dt
import json
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from tests import helpers  # noqa: F401 - adds scripts/ to sys.path
from discovery import ledger as L, status as dstatus
import discovery_cli


class EmptyLedger:
    articles = {}

    def counts(self):
        return {s: 0 for s in (
            L.DISCOVERED, L.RETRIEVED, L.RETRIEVAL_FAILED, L.PENDING_RETRY,
            L.AWAITING, L.APPROVED, L.PUBLISHED, L.REJECTED, L.DUPLICATE,
        )}

    def by_status(self, *statuses):
        return []


def engine(*, failed_requests=None, stale=False, warnings=None, bad_strategy=False):
    recent = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=3) if stale else dt.datetime.now(dt.timezone.utc)
    return SimpleNamespace(
        ledger=EmptyLedger(),
        state={"last_success": recent.isoformat(), "last_run": recent.isoformat()},
        run={
            "specialty_new": {}, "failed_requests": failed_requests or [],
            "strategy_results": {"pubmed": {"ok": not bad_strategy}},
            "query_warnings": warnings or [],
            "new_discovered": 0, "retrieved": 0, "rejected": 0,
            "duplicates": 0, "uncertain": 0,
        },
        cfg={"max_attempts": 6},
    )


def report(*types):
    discrepancies = [{"type": kind, "pmid": str(i), "recoverable": False} for i, kind in enumerate(types)]
    return {
        "discrepancies": discrepancies,
        "recoverable": 0,
        "unrecoverable": len(discrepancies),
        "stages": {},
        "strategy_gap_found_only_by_europepmc": 0,
    }


class TestOperationalGate(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = os.path.join(self.tmp.name, "discovery_status.json")

    def build(self, eng, rep):
        return dstatus.build_status(eng, rep, self.path)

    def cli_exit(self, status):
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(status, f)
        with patch.object(discovery_cli, "DATA", self.tmp.name):
            return discovery_cli.cmd_status(
                SimpleNamespace(fail_on_degraded=False, fail_on_operational=True)
            )

    def test_editorial_backlog_only_is_warning_not_ci_failure(self):
        st = self.build(engine(), report("stalled_awaiting", "stalled_awaiting"))
        self.assertEqual(st["health"], "attention_needed")
        self.assertEqual(st["operational_health"], "healthy")
        self.assertEqual(st["editorial_backlog_count"], 2)
        self.assertEqual(self.cli_exit(st), 0)

    def test_data_integrity_discrepancy_still_fails(self):
        st = self.build(engine(), report("stalled_awaiting", "published_not_displayed"))
        self.assertEqual(st["health"], "degraded")
        self.assertEqual(st["operational_health"], "degraded")
        self.assertEqual(st["editorial_backlog_count"], 1)
        self.assertEqual(self.cli_exit(st), 1)

    def test_failed_retrieval_still_fails(self):
        st = self.build(engine(failed_requests=[{"error": "HTTP 500"}]), report("stalled_awaiting"))
        self.assertEqual(self.cli_exit(st), 1)

    def test_query_warnings_and_failed_strategies_still_fail(self):
        for eng in (engine(warnings=["bad query"]), engine(bad_strategy=True)):
            st = self.build(eng, report("stalled_awaiting"))
            self.assertEqual(self.cli_exit(st), 1)

    def test_stale_retrieval_still_fails(self):
        st = self.build(engine(stale=True), report("stalled_awaiting"))
        self.assertEqual(self.cli_exit(st), 1)

    def test_missing_new_operational_field_fails_closed(self):
        st = self.build(engine(), report("stalled_awaiting"))
        del st["operational_health"]
        self.assertEqual(self.cli_exit(st), 1)


if __name__ == "__main__":
    unittest.main()
