from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

MODULE_PATH = Path(__file__).resolve().with_name("slf_tactics_audit_252_digest.py")
SPEC = importlib.util.spec_from_file_location("slf_tactics_audit_252_digest", MODULE_PATH)
assert SPEC and SPEC.loader
digest = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(digest)

ARTETA = "Arteta_Control433_bal3"
OTHER = "Pep_BoxControl_bal2"


def event_row(game_id, *, preset_name=ARTETA, situation=None, recommended=None):
    """Digest-shaped v4 event row (only fields the digest reads)."""
    decision = None
    if situation is not None or recommended is not None:
        decision = {
            "preset": recommended if recommended is not None else preset_name,
            "situation": situation,
            "score": None,
            "confidence": None,
            "guardType": None,
        }
    return {
        "gameId": game_id,
        "presetName": preset_name,
        "minute": 0,
        "bucket": "b0",
        "ts": 1770000000000,
        "scriptVersion": "4.4.328",
        "telemetry": {"recommendationPreset": recommended},
        "decision": decision,
        "activeSignals": [],
    }


def full_delta():
    return {
        "myXG": 0.5,
        "oppXG": 0.2,
        "xGDifference": 0.3,
        "myShots": 3,
        "oppShots": 1,
        "shotDifference": 2,
        "myBadActionsPct": -2.0,
        "oppBadActionsPct": 0.5,
        "myPower": 88,
        "oppPower": 85,
        "strengthGap": 3,
    }


def empty_delta():
    return {field: None for field in digest.DELTA_FIELDS} | {
        "myPower": None,
        "oppPower": None,
        "strengthGap": None,
    }


def effect_row(game_id, from_minute, *, preset_name=ARTETA, eligible=True, duration=10, completeness=1.0, delta=None):
    """Digest-shaped v4 effect row."""
    return {
        "gameId": game_id,
        "sessionId": "session-1",
        "phaseId": "phase-1",
        "phaseSequence": 1,
        "presetName": preset_name,
        "fromMinute": from_minute,
        "toMinute": from_minute + duration,
        "fromBucket": "b",
        "toBucket": "b",
        "scriptVersion": "4.4.328",
        "tacticContext": {},
        "delta": delta if delta is not None else full_delta(),
        "eligibility": {
            "durationMinutes": duration,
            "completeness": completeness,
            "eligibleForRanking": eligible,
            "reasons": [],
        },
        "telemetry": {},
    }


def segment(from_minute, to_minute, *, situation=None, recommended=None, actual=None, score_state=None):
    return {
        "fromMinute": from_minute,
        "toMinute": to_minute,
        "situation": situation,
        "recommendedPreset": recommended,
        "actualPreset": actual,
        "scoreState": score_state,
    }


def finished(outcome, home, away):
    return {"outcome": outcome, "score": {"home": home, "away": away}, "homeAway": "home"}


def arteta_game(game_id, *, segments=None, exposure=0, non_stable=0, mismatch=0, finished_result=None):
    return {
        "gameId": game_id,
        "finishedResult": finished_result,
        "artetaPhaseCount": 0,
        "firstArtetaMinute": None,
        "lastArtetaMinute": None,
        "firstNonStableSituationMinute": None,
        "matchEndMinute": None,
        "artetaExposureMinutes": exposure,
        "artetaNonStableMinutes": non_stable,
        "recommendationMismatchMinutes": mismatch,
        "segments": segments or [],
    }


def build_report(events=None, effects=None, games=None):
    """Assemble a synthetic slf_tactics_audit_252_v1 report at runtime."""
    events = events or []
    effects = effects or []
    games = games or []
    by_preset_situation = {}
    for row in events:
        decision = row.get("decision")
        situation = decision.get("situation") if isinstance(decision, dict) else None
        key = situation if isinstance(situation, str) else "missing"
        preset = row.get("presetName")
        preset = preset if isinstance(preset, str) else str(preset)
        slot = by_preset_situation.setdefault(preset, {})
        slot[key] = slot.get(key, 0) + 1
    inputs = {
        name: {"path": f"<{name}>", "bytes": 0, "sha256": "0" * 64, "rows": rows}
        for name, rows in (
            ("results", 0),
            ("snapshots", 0),
            ("events", len(events)),
            ("effects", len(effects)),
        )
    }
    return {
        "meta": {
            "schema": "slf_tactics_audit_252_v1",
            "scriptVersion": "slf_tactics_audit_252_v1",
            "generatedAt": 1770000000000,
            "artetaPreset": ARTETA,
            "inputs": inputs,
            "freshness": {"results": None, "snapshots": None, "events": None, "effects": None},
        },
        "coverage": {},
        "results_cohort": [],
        "events": events,
        "effects": effects,
        "arteta_segments": {"games": games},
        "distributions": {
            "eventsByPreset": {},
            "eventsByPresetSituation": by_preset_situation,
            "recommendationCounts": {},
            "effectEligibility": {"eligibleCount": 0, "ineligibleCount": 0, "reasons": {}},
            "scriptVersionHistogram": {},
        },
        "linkage": {
            "artetaGames": len(games),
            "artetaGamesWithFinishedValidResult": 0,
            "artetaPhasesTotal": 0,
            "artetaEligiblePhases": 0,
            "artetaPhaseExposureMinutes": 0,
        },
    }


class SlfTacticsAudit252DigestTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.env = dict(os.environ)

    def write_report(self, report, name="report.json"):
        path = self.dir / name
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return path

    def run_main(self, *args):
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = digest.main(list(args))
        return code, buffer.getvalue().splitlines()

    def run_digest(self, *args):
        cmd = [sys.executable, str(MODULE_PATH), *args]
        return subprocess.run(cmd, capture_output=True, text=True, env=self.env)

    # -- 1. happy path: header, situation table, TOTAL, notInvolved ----------

    def test_header_and_situation_table_happy_path(self):
        events = [
            event_row("g1", situation="stable_control", recommended=ARTETA),
            event_row("g1", situation="stable_control", recommended=ARTETA),
            event_row("g1", situation="pressure_escape", recommended=ARTETA),
            event_row("g1", preset_name=OTHER, recommended=OTHER),
        ]
        games = [
            arteta_game(
                "g1",
                segments=[
                    segment(0, 10, situation="stable_control", recommended=ARTETA, actual=ARTETA),
                    segment(10, 20, situation="pressure_escape", recommended=OTHER, actual=ARTETA),
                ],
            )
        ]
        report = build_report(events=events, games=games)
        path = self.write_report(report)
        code, lines = self.run_main("--report", str(path))
        self.assertEqual(code, 0)
        self.assertTrue(lines[0].startswith(f"report: {path} "))
        self.assertIn("sha256=", lines[0])
        self.assertIn("schema: slf_tactics_audit_252_v1", lines)
        self.assertIn("inputs: results=0 snapshots=0 events=4 effects=0", lines)
        self.assertIn("  situation=stable_control events=2 appliedMinutes=10", lines)
        self.assertIn("  situation=pressure_escape events=1 appliedMinutes=10", lines)
        self.assertIn("  TOTAL events=3 appliedMinutes=20", lines)
        # Canonical universe: stable_control, pressure_escape + "missing" from
        # the OTHER event without a decision -> exactly one not involved.
        self.assertIn("  notInvolved=1", lines)
        footer = lines[-1]
        self.assertTrue(footer.startswith("digest: sections=8 lines="))
        self.assertEqual(int(footer.split("lines=")[1].split()[0]), len(lines))

    # -- 2. zero arteta involvement collapses to others=0 ---------------------

    def test_situation_table_zero_involvement(self):
        events = [event_row("g1", preset_name=OTHER, recommended=OTHER)]
        report = build_report(events=events)
        path = self.write_report(report)
        code, lines = self.run_main("--report", str(path))
        self.assertEqual(code, 0)
        self.assertIn("  others=0", lines)
        self.assertFalse(any("TOTAL events=" in line for line in lines))
        self.assertFalse(any("notInvolved=" in line for line in lines))

    # -- 3. alignment aggregate + segment alignment classes -------------------

    def test_alignment_aggregate_and_segment_classes(self):
        games = [
            arteta_game(
                "g1",
                segments=[
                    segment(0, 10, recommended=ARTETA, actual=ARTETA),  # aligned
                    segment(10, 20, recommended=ARTETA, actual=OTHER),  # notApplied
                    segment(20, 30, recommended=OTHER, actual=ARTETA),  # fallbackApplied
                    segment(30, 40, recommended=None, actual=None),  # no class
                ],
                exposure=30,
                non_stable=10,
                mismatch=20,
            ),
            arteta_game("g2", exposure=5, non_stable=0, mismatch=0),
        ]
        report = build_report(games=games)
        path = self.write_report(report)
        code, lines = self.run_main("--report", str(path))
        self.assertEqual(code, 0)
        self.assertIn(
            "alignment: artetaExposureMinutes=35 artetaNonStableMinutes=10 "
            "recommendationMismatchMinutes=20",
            lines,
        )
        self.assertIn("segments: aligned=1 notApplied=1 fallbackApplied=1", lines)

    # -- 4. outcome split math + failure candidates (sorted, capped) ----------

    def test_outcome_split_and_failure_candidates(self):
        losses = [
            ("loss-1", 7, 30), ("loss-2", 6, 10), ("loss-3", 5, 20), ("loss-4", 4, 5),
            ("loss-5", 3, 1), ("loss-6", 2, 15), ("loss-7", 1, 2),
        ]
        games = [
            arteta_game("win-1", exposure=10, mismatch=2, finished_result=finished("win", 2, 1)),
            arteta_game("win-2", exposure=5, mismatch=1, finished_result=finished("win", 1, 0)),
            arteta_game("draw-1", exposure=8, mismatch=3, finished_result=finished("draw", 1, 1)),
        ] + [
            arteta_game(game_id, exposure=exp, mismatch=mis, finished_result=finished("loss", 0, 1))
            for game_id, exp, mis in losses
        ]
        report = build_report(games=games)
        path = self.write_report(report)
        code, lines = self.run_main("--report", str(path))
        self.assertEqual(code, 0)
        self.assertIn("  outcome=win games=2 exposure=15 mismatch=3", lines)
        self.assertIn("  outcome=draw games=1 exposure=8 mismatch=3", lines)
        self.assertIn("  outcome=loss games=7 exposure=28 mismatch=83", lines)
        # Failure candidates: losses sorted by mismatch desc, capped at 5.
        failure_index = next(i for i, line in enumerate(lines) if line.startswith("failure candidates"))
        self.assertIn("failure candidates (7 losses, mismatch desc, max 5):", lines)
        self.assertIn("  gameId=loss-1 outcome=loss score=0:1 exposure=7 nonStable=0 mismatch=30", lines[failure_index + 1])
        self.assertIn("  gameId=loss-3 outcome=loss score=0:1 exposure=5 nonStable=0 mismatch=20", lines[failure_index + 2])
        self.assertIn("  ... +2 more loss games", lines[failure_index + 6])

    # -- 5. scored-games table truncation cap ---------------------------------

    def test_scored_games_cap_marker(self):
        games = [
            arteta_game(f"g{index:02d}", exposure=1, finished_result=finished("win", 1, 0))
            for index in range(25)
        ]
        report = build_report(games=games)
        path = self.write_report(report)
        code, lines = self.run_main("--report", str(path))
        self.assertEqual(code, 0)
        self.assertIn("scored games (25 with finished valid result):", lines)
        self.assertIn("  ... +5 more scored games", lines)
        scored_rows = [line for line in lines if line.startswith("  gameId=g")]
        self.assertEqual(len(scored_rows), 20)

    # -- 6. eligible phases: delta line and none-linked line ------------------

    def test_eligible_phases_delta_and_none_linked(self):
        games = [
            arteta_game(
                "g1",
                segments=[
                    segment(0, 10, situation="stable_control", recommended=ARTETA, actual=ARTETA),
                    segment(10, 30, situation="pressure_escape", recommended=OTHER, actual=ARTETA),
                ],
            )
        ]
        effects = [
            effect_row("g1", 0, duration=10, completeness=1.0),
            effect_row("g1", 20, duration=12, completeness=0.75, delta=empty_delta()),
            effect_row("g1", 5, eligible=False),  # never listed
        ]
        report = build_report(effects=effects, games=games)
        path = self.write_report(report)
        code, lines = self.run_main("--report", str(path))
        self.assertEqual(code, 0)
        self.assertIn("eligible phases (2):", lines)
        self.assertIn(
            "  gameId=g1 situation=stable_control minutes=10 completeness=1 "
            "delta=0.5/0.2/0.3 shots=3:1 badActions=-2%:0.5%",
            lines,
        )
        self.assertIn(
            "  gameId=g1 situation=pressure_escape minutes=12 completeness=0.75 effects=none-linked",
            lines,
        )

    # -- 7. zero eligible phases edge -----------------------------------------

    def test_zero_eligible_phases_edge(self):
        report = build_report(games=[arteta_game("g1", exposure=0)])
        path = self.write_report(report)
        code, lines = self.run_main("--report", str(path))
        self.assertEqual(code, 0)
        self.assertIn("eligible phases (0):", lines)
        self.assertIn("alignment: artetaExposureMinutes=0 artetaNonStableMinutes=0 recommendationMismatchMinutes=0", lines)
        self.assertIn("  outcome=win games=0 exposure=0 mismatch=0", lines)
        self.assertIn("  outcome=draw games=0 exposure=0 mismatch=0", lines)
        self.assertIn("  outcome=loss games=0 exposure=0 mismatch=0", lines)

    # -- 8. fail-closed: missing report file -> exit 2 -------------------------

    def test_fail_closed_missing_file_exit_2(self):
        missing = self.dir / "does-not-exist.json"
        proc = self.run_digest("--report", str(missing))
        self.assertEqual(proc.returncode, 2)
        self.assertEqual(proc.stderr.count("\n"), 1)
        self.assertTrue(proc.stderr.startswith("ERROR: report file not found"))
        self.assertNotIn("Traceback", proc.stderr)
        self.assertEqual(proc.stdout, "")

    # -- 9. fail-closed: wrong schema / invalid JSON -> exit 2 -----------------

    def test_fail_closed_wrong_schema_exit_2(self):
        path = self.write_report({"meta": {"schema": "some_other_schema_v9"}})
        proc = self.run_digest("--report", str(path))
        self.assertEqual(proc.returncode, 2)
        self.assertEqual(proc.stderr.count("\n"), 1)
        self.assertIn("unsupported report schema", proc.stderr)
        self.assertNotIn("Traceback", proc.stderr)

        bad = self.dir / "broken.json"
        bad.write_text("{not json", encoding="utf-8")
        proc = self.run_digest("--report", str(bad))
        self.assertEqual(proc.returncode, 2)
        self.assertIn("invalid JSON in report", proc.stderr)

    # -- 10. line budget on a wide fixture + zero-write CLI contract ----------

    def test_line_budget_many_situations_and_no_out_flag(self):
        events = [
            event_row(f"g{i}", situation=f"situation_{i:02d}", recommended=ARTETA)
            for i in range(50)
        ]
        report = build_report(events=events)
        path = self.write_report(report)
        code, lines = self.run_main("--report", str(path))
        self.assertEqual(code, 0)
        self.assertLessEqual(len(lines), digest.LINE_BUDGET)
        self.assertIn("  ... +40 more situations", lines)
        self.assertIn("  TOTAL events=50 appliedMinutes=0", lines)
        # Zero writes by construction: there is no --out flag to accept.
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                digest.build_parser().parse_args(["--report", str(path), "--out", "x.json"])

    # -- 11. fail-closed: top-level JSON array report -> exit 2 (F1) ----------

    def test_fail_closed_top_level_array_exit_2(self):
        path = self.dir / "array-report.json"
        path.write_text(
            json.dumps([{"meta": {"schema": "slf_tactics_audit_252_v1"}}]),
            encoding="utf-8",
        )
        proc = self.run_digest("--report", str(path))
        self.assertEqual(proc.returncode, 2)
        self.assertEqual(proc.stderr.count("\n"), 1)
        self.assertIn("report must be a JSON object", proc.stderr)
        self.assertNotIn("Traceback", proc.stderr)
        self.assertEqual(proc.stdout, "")

    # -- 12. outcome=None (unorientable) split line + scored table (F2) -------

    def test_outcome_unknown_split_and_scored_table(self):
        games = [
            arteta_game("g-ok", exposure=4, mismatch=2, finished_result=finished("win", 2, 0)),
            arteta_game(
                "g-unk",
                exposure=6,
                mismatch=1,
                finished_result={
                    "outcome": None,
                    "score": {"home": 2, "away": 2},
                    "homeAway": "unknown",
                },
            ),
        ]
        report = build_report(games=games)
        path = self.write_report(report)
        code, lines = self.run_main("--report", str(path))
        self.assertEqual(code, 0)
        # The scored-games table renders the unorientable outcome as unknown.
        self.assertIn(
            "  gameId=g-unk outcome=unknown score=2:2 exposure=6 nonStable=0 mismatch=1",
            lines,
        )
        # The outcome split prints a 4th line for the unknown bucket.
        self.assertIn("  outcome=win games=1 exposure=4 mismatch=2", lines)
        self.assertIn("  outcome=unknown games=1 exposure=6 mismatch=1", lines)

    # -- 13. eligible-phases cap marker + rendered-delta gate (F3, F6) --------

    def test_eligible_phases_cap_marker(self):
        effects = [
            effect_row(f"g{index:02d}", 0, duration=5, completeness=1.0)
            for index in range(11)
        ]
        # F6 pin: a delta carrying ONLY a non-rendered field (shotDifference)
        # must honestly print effects=none-linked.
        effects[0] = effect_row(
            "g00", 0, duration=5, completeness=1.0, delta={"shotDifference": 3}
        )
        report = build_report(effects=effects)
        path = self.write_report(report)
        code, lines = self.run_main("--report", str(path))
        self.assertEqual(code, 0)
        self.assertIn("eligible phases (11):", lines)
        start = next(
            i for i, line in enumerate(lines) if line.startswith("eligible phases")
        )
        rows = lines[start + 1 : start + 11]
        self.assertEqual(len(rows), 10)
        self.assertTrue(all(row.startswith("  gameId=g") for row in rows))
        self.assertEqual(lines[start + 11], "  ... +1 more eligible phases")
        self.assertIn(
            "  gameId=g00 situation=unknown minutes=5 completeness=1 effects=none-linked",
            lines,
        )


if __name__ == "__main__":
    unittest.main()
