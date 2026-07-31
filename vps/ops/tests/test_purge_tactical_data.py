from __future__ import annotations

import datetime as dt
import importlib.util
from pathlib import Path
import unittest

MODULE_PATH = Path(__file__).resolve().parents[1] / "purge_tactical_data.py"
SPEC = importlib.util.spec_from_file_location("purge_tactical_data", MODULE_PATH)
assert SPEC and SPEC.loader
purge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(purge)


class PurgeTacticalDataTests(unittest.TestCase):
    def setUp(self) -> None:
        self.cutoff = dt.datetime(2026, 7, 22, tzinfo=dt.timezone.utc)

    def test_parses_epoch_ms_and_iso(self) -> None:
        self.assertEqual(
            purge.parse_datetime("2026-07-22T00:00:00Z"),
            self.cutoff,
        )
        self.assertEqual(
            purge.parse_datetime(1784678400000),
            self.cutoff,
        )

    def test_tries_later_date_field_when_first_is_invalid(self) -> None:
        record = {
            "ts": "not-a-date",
            "source": {"collectedAt": "2026-07-23T12:30:00Z"},
        }
        self.assertEqual(
            purge.record_datetime(record),
            dt.datetime(2026, 7, 23, 12, 30, tzinfo=dt.timezone.utc),
        )

    def test_removes_before_cutoff_and_unknown_date(self) -> None:
        records = [
            {"id": "old", "ts": "2026-07-21T23:59:59Z"},
            {"id": "boundary", "ts": "2026-07-22T00:00:00Z"},
            {"id": "new", "source": {"collectedAt": "2026-07-31T09:00:00Z"}},
            {"id": "missing"},
            {"id": "invalid", "ts": "unknown"},
        ]
        kept, stats = purge.filter_records(records, self.cutoff)
        self.assertEqual([row["id"] for row in kept], ["boundary", "new"])
        self.assertEqual(stats["before"], 5)
        self.assertEqual(stats["kept"], 2)
        self.assertEqual(stats["removedBeforeCutoff"], 1)
        self.assertEqual(stats["removedUnknownDate"], 2)

    def test_nan_and_boolean_are_not_dates(self) -> None:
        self.assertIsNone(purge.parse_datetime(float("nan")))
        self.assertIsNone(purge.parse_datetime(True))


if __name__ == "__main__":
    unittest.main()
