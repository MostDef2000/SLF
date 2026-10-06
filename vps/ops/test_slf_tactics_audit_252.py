from __future__ import annotations

import contextlib
import email.message
import hashlib
import importlib.util
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

MODULE_PATH = Path(__file__).resolve().with_name("slf_tactics_audit_252.py")
SPEC = importlib.util.spec_from_file_location("slf_tactics_audit_252", MODULE_PATH)
assert SPEC and SPEC.loader
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)

ARTETA = "Arteta_Control433_bal3"
OTHER = "Pep_BoxControl_bal2"
GENERATED_AT = 1770000000000

API_BASE = "http://127.0.0.1:5000/api"
COLLECTION_FILES = {
    "results": "match_results_v2",
    "snapshots": "match_snapshots_v2",
    "events": "preset_events_v2",
    "effects": "preset_effects_v2",
}


def api_url(collection):
    return f"{API_BASE}/{COLLECTION_FILES[collection]}"


def rule_decision(preset=None, situation=None, signals=None, confidence=None, guard_type=None):
    action = {"preset": preset, "decision": situation}
    if guard_type is not None:
        action["guardType"] = guard_type
    decision = {"action": action, "signals": signals or {}}
    if confidence is not None:
        decision["confidence"] = confidence
    return decision


class SlfTacticsAudit252Test(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.env = dict(os.environ)
        self.env.pop("SLF_API_TOKEN", None)
        self.env.pop("SLF_API_BASE", None)

    # -- fixture builders ---------------------------------------------------

    def write(self, path, payload):
        Path(path).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    def result_row(
        self,
        game_id,
        *,
        status="finished",
        score={"home": 1, "away": 0},
        teams=("TeamA", "TeamB"),
        my_team: object = "TeamA",
        parsed_at=1770000000000,
        script_version="4.4.400",
        **extra,
    ):
        row = {
            "recordType": "match_result",
            "resultKey": f"match_result|{game_id}|{status}|{json.dumps(score)}",
            "gameId": game_id,
            "status": status,
            "score": score,
            "teams": list(teams),
            "myTeam": my_team,
            "parsedAt": parsed_at,
            "source": {"scriptVersion": script_version},
            "initialPreset": ARTETA,
            "currentPreset": ARTETA,
            "transitionCount": 1,
            "tacticTelemetry": {"riskAppetite": "balanced"},
            "telemetryContext": {"scoreState": "winning"},
        }
        row.update(extra)
        return row

    def snapshot_row(
        self,
        game_id,
        minute,
        ts,
        *,
        situation=None,
        recommended=None,
        actual=None,
        score_state=None,
        **extra,
    ):
        row = {
            "recordType": "match_snapshot",
            "snapshotKey": f"match_snapshot|{game_id}|{minute}",
            "gameId": game_id,
            "status": "live",
            "minute": minute,
            "bucket": f"b{minute}",
            "ts": ts,
            "score": {"home": 0, "away": 0},
            "myTeam": "TeamA",
            "telemetryContext": {"scoreState": score_state},
            "tacticTelemetry": {"currentPreset": actual, "recommendedPreset": recommended},
            "tacticalPhase": {"presetId": actual},
        }
        if situation is not None or recommended is not None:
            row["ruleDecision"] = rule_decision(preset=recommended, situation=situation)
        row.update(extra)
        return row

    def event_row(
        self,
        game_id,
        minute,
        *,
        preset_name: object = ARTETA,
        schema_version: object = 4,
        decision: object = None,
        signals: object = None,
        script_version: object = "4.4.328",
        **extra: object,
    ):
        row = {
            "recordType": "preset_event",
            "eventKey": f"preset_event|{game_id}|{minute}",
            "schemaVersion": schema_version,
            "gameId": game_id,
            "phaseId": "phase-1",
            "phaseSequence": 1,
            "presetName": preset_name,
            "minute": minute,
            "bucket": f"b{minute}",
            "ts": 1770000000000 + minute,
            "scriptVersion": script_version,
            "telemetry": {
                "homeAway": "home",
                "scoreState": "drawing",
                "strengthGap": 2,
                "strengthGapBucket": "even",
                "presetId": preset_name,
                "recommendationPreset": preset_name,
                "riskAppetite": "balanced",
                "explorationApplied": False,
                "completeness": 1.0,
            },
        }
        if decision is not None:
            row["ruleDecision"] = decision
        if signals is not None:
            row.setdefault("ruleDecision", rule_decision())["signals"] = signals
        row.update(extra)
        return row

    def effect_row(
        self,
        game_id,
        from_minute,
        to_minute,
        *,
        preset_name: object = ARTETA,
        schema_version: object = 4,
        eligible=True,
        duration=10,
        reasons=("duration_ok",),
        script_version="4.4.328",
        **extra: object,
    ):
        row = {
            "recordType": "preset_effect",
            "effectKey": f"preset_effect|{game_id}|{from_minute}|{to_minute}",
            "schemaVersion": schema_version,
            "gameId": game_id,
            "sessionId": "session-1",
            "phaseId": "phase-1",
            "phaseSequence": 1,
            "presetName": preset_name,
            "fromMinute": from_minute,
            "toMinute": to_minute,
            "fromBucket": f"b{from_minute}",
            "toBucket": f"b{to_minute}",
            "scriptVersion": script_version,
            "tacticContext": {
                "appliedPreset": preset_name,
                "appliedTactic": "4-3-3",
                "tacticFingerprint": "fp-1",
                "transitionSource": "recommendation",
                "closeReason": "window_close",
            },
            "delta": {
                "myXG": 0.4,
                "oppXG": 0.1,
                "xGDifference": 0.3,
                "myShots": 2,
                "oppShots": 1,
                "shotDifference": 1,
                "myBadActionsPct": -1.0,
                "oppBadActionsPct": 0.0,
                "myPower": 88,
                "oppPower": 85,
                "strengthGap": 3,
            },
            "eligibility": {
                "durationMinutes": duration,
                "completeness": 1.0,
                "eligibleForRanking": eligible,
                "reasons": list(reasons),
            },
            "telemetry": {
                "homeAway": "home",
                "scoreState": "drawing",
                "strengthGap": 3,
                "strengthGapBucket": "even",
                "presetId": preset_name,
                "recommendationPreset": preset_name,
                "riskAppetite": "balanced",
                "explorationApplied": False,
                "completeness": 1.0,
            },
        }
        row.update(extra)
        return row

    def inputs_meta(self, results, snapshots, events, effects):
        return {
            name: {
                "path": f"<{name}>",
                "bytes": 0,
                "sha256": "0" * 64,
                "rows": len(rows),
            }
            for name, rows in (
                ("results", results),
                ("snapshots", snapshots),
                ("events", events),
                ("effects", effects),
            )
        }

    def make_report(self, results=None, snapshots=None, events=None, effects=None, arteta=ARTETA):
        results = results or []
        snapshots = snapshots or []
        events = events or []
        effects = effects or []
        return audit.build_report(
            results,
            snapshots,
            events,
            effects,
            arteta=arteta,
            inputs=self.inputs_meta(results, snapshots, events, effects),
            generated_at=GENERATED_AT,
        )

    def run_cli(self, *args, cwd=None):
        cmd = [sys.executable, str(MODULE_PATH), *args]
        return subprocess.run(cmd, capture_output=True, text=True, env=self.env, cwd=cwd)

    def set_env(self, key, value):
        old = os.environ.get(key)
        os.environ[key] = value
        self.addCleanup(self._restore_env, key, old)

    def _restore_env(self, key, old):
        if old is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = old

    # -- 1. cohort filter (RED-CHECK: outcome absence AND coverage presence) --

    def test_cohort_filter_missing_score_excluded_but_counted(self):
        missing = self.result_row("g1", score=None)
        report = self.make_report(results=[missing])
        # RED-CHECK half A: the game must NOT appear in the outcome cohort.
        self.assertEqual(report["results_cohort"], [])
        # RED-CHECK half B: the same row must be counted in coverage as
        # missing_score (a finished invalid-score row).
        coverage = report["coverage"]["results"]
        self.assertEqual(coverage["finishedRows"], 1)
        self.assertEqual(coverage["finishedInvalidScoreRows"], 1)
        self.assertEqual(coverage["finishedInvalidScoreReasons"]["missing_score"], 1)
        self.assertEqual(coverage["finishedInvalidScoreReasons"]["invalid_score"], 0)

    # -- 2. bool/float scores are invalid per the QR-010 mirror --------------

    def test_bool_and_float_scores_invalid_qr010(self):
        rows = [
            self.result_row("g-bool", score={"home": True, "away": 0}),
            self.result_row("g-float", score={"home": 1.0, "away": 0}),
            self.result_row("g-over", score={"home": 100, "away": 0}),
            self.result_row("g-ok0", score={"home": 0, "away": 0}),
            self.result_row("g-ok99", score={"home": 99, "away": 99}),
        ]
        self.assertFalse(audit.valid_finished_score({"home": True, "away": 0}))
        self.assertFalse(audit.valid_finished_score({"home": 1.0, "away": 0}))
        self.assertTrue(audit.valid_finished_score({"home": 0, "away": 99}))
        report = self.make_report(results=rows)
        coverage = report["coverage"]["results"]
        self.assertEqual(coverage["finishedValidScoreRows"], 2)
        self.assertEqual(coverage["finishedInvalidScoreRows"], 3)
        self.assertEqual(coverage["finishedInvalidScoreReasons"]["invalid_score"], 3)
        cohort_ids = {entry["gameId"] for entry in report["results_cohort"]}
        self.assertEqual(cohort_ids, {"g-ok0", "g-ok99"})

    # -- 3. duplicate gameIds: latest parsedAt wins --------------------------

    def test_duplicate_gameid_latest_parsedat_wins(self):
        older = self.result_row("g1", score={"home": 0, "away": 0}, parsed_at=1000)
        newer = self.result_row("g1", score={"home": 2, "away": 1}, parsed_at=2000)
        tie_first = self.result_row("g2", score={"home": 1, "away": 0}, parsed_at=3000)
        tie_second = self.result_row("g2", score={"home": 0, "away": 0}, parsed_at=3000)
        report = self.make_report(results=[older, newer, tie_first, tie_second])
        self.assertEqual(len(report["results_cohort"]), 2)
        by_game = {entry["gameId"]: entry for entry in report["results_cohort"]}
        self.assertEqual(by_game["g1"]["score"], {"home": 2, "away": 1})
        self.assertEqual(by_game["g1"]["parsedAt"], 2000)
        # Ties keep the FIRST row in file order (deterministic).
        self.assertEqual(by_game["g2"]["score"], {"home": 1, "away": 0})
        self.assertEqual(report["coverage"]["results"]["duplicateGameIdRows"], 2)
        self.assertEqual(report["coverage"]["results"]["distinctGames"], 2)

    # -- 4. homeAway derivation, orientation, outcomes and points ------------

    def test_homeaway_orientation_outcomes_points(self):
        rows = [
            self.result_row(
                "g-home", score={"home": 2, "away": 1}, my_team="TeamA"
            ),
            self.result_row(
                "g-away", score={"home": 3, "away": 1}, my_team="TeamB"
            ),
            self.result_row(
                "g-draw", score={"home": 1, "away": 1}, my_team="TeamA"
            ),
            self.result_row(
                "g-unknown", score={"home": 4, "away": 0}, my_team="TeamC"
            ),
        ]
        report = self.make_report(results=rows)
        by_game = {entry["gameId"]: entry for entry in report["results_cohort"]}
        self.assertEqual(by_game["g-home"]["homeAway"], "home")
        self.assertEqual(
            (by_game["g-home"]["myGoals"], by_game["g-home"]["oppGoals"]), (2, 1)
        )
        self.assertEqual(by_game["g-home"]["outcome"], "win")
        self.assertEqual(by_game["g-home"]["points"], 3)
        self.assertEqual(by_game["g-away"]["homeAway"], "away")
        self.assertEqual(
            (by_game["g-away"]["myGoals"], by_game["g-away"]["oppGoals"]), (1, 3)
        )
        self.assertEqual(by_game["g-away"]["outcome"], "loss")
        self.assertEqual(by_game["g-away"]["points"], 0)
        self.assertEqual(by_game["g-draw"]["outcome"], "draw")
        self.assertEqual(by_game["g-draw"]["points"], 1)
        # Unknown side: the score cannot be oriented, so the audit keeps None
        # instead of guessing.
        self.assertEqual(by_game["g-unknown"]["homeAway"], "unknown")
        self.assertIsNone(by_game["g-unknown"]["myGoals"])
        self.assertIsNone(by_game["g-unknown"]["oppGoals"])
        self.assertIsNone(by_game["g-unknown"]["outcome"])
        self.assertIsNone(by_game["g-unknown"]["points"])

    # -- 5. segments: change on each of the four features --------------------

    def test_segments_change_on_each_feature(self):
        snapshots = [
            self.snapshot_row(
                "g1", 0, 100,
                situation="stable_control", recommended=ARTETA, actual=ARTETA,
                score_state="losing",
            ),
            self.snapshot_row(
                "g1", 1, 101,
                situation="pressure_escape", recommended=ARTETA, actual=ARTETA,
                score_state="losing",
            ),
            self.snapshot_row(
                "g1", 2, 102,
                situation="pressure_escape", recommended=OTHER, actual=ARTETA,
                score_state="losing",
            ),
            self.snapshot_row(
                "g1", 3, 103,
                situation="pressure_escape", recommended=OTHER, actual=OTHER,
                score_state="losing",
            ),
            self.snapshot_row(
                "g1", 4, 104,
                situation="pressure_escape", recommended=OTHER, actual=OTHER,
                score_state="winning",
            ),
            self.snapshot_row(
                "g1", 5, 105,
                situation="pressure_escape", recommended=OTHER, actual=OTHER,
                score_state="winning",
            ),
        ]
        events = [self.event_row("g1", 0, preset_name=ARTETA)]
        report = self.make_report(snapshots=snapshots, events=events)
        games = report["arteta_segments"]["games"]
        self.assertEqual(len(games), 1)
        segments = games[0]["segments"]
        self.assertEqual(
            [(s["fromMinute"], s["toMinute"]) for s in segments],
            [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5)],
        )
        self.assertEqual(segments[0]["situation"], "stable_control")
        self.assertEqual(segments[1]["situation"], "pressure_escape")
        self.assertEqual(segments[2]["recommendedPreset"], OTHER)
        self.assertEqual(segments[3]["actualPreset"], OTHER)
        self.assertEqual(segments[4]["scoreState"], "winning")

    # -- 6. minute dedupe keeps the latest ts --------------------------------

    def test_minute_dedupe_keeps_latest_ts(self):
        snapshots = [
            self.snapshot_row(
                "g1", 10, 100,
                situation="stable_control", recommended=ARTETA, actual=ARTETA,
                score_state="losing",
            ),
            self.snapshot_row(
                "g1", 10, 200,
                situation="pressure_escape", recommended=OTHER, actual=OTHER,
                score_state="winning",
            ),
            self.snapshot_row(
                "g1", 20, 300,
                situation="pressure_escape", recommended=OTHER, actual=OTHER,
                score_state="winning",
            ),
        ]
        events = [self.event_row("g1", 5, preset_name=ARTETA)]
        report = self.make_report(snapshots=snapshots, events=events)
        self.assertEqual(report["coverage"]["snapshots"]["duplicateMinuteRows"], 1)
        segments = report["arteta_segments"]["games"][0]["segments"]
        # The minute-10 row with ts=200 wins and merges with minute 20.
        self.assertEqual(len(segments), 1)
        self.assertEqual((segments[0]["fromMinute"], segments[0]["toMinute"]), (10, 20))
        self.assertEqual(segments[0]["situation"], "pressure_escape")
        self.assertEqual(segments[0]["actualPreset"], OTHER)

    # -- 7. missing ruleDecision: decision None + coverage bucket ------------

    def test_missing_rule_decision_null_and_counted(self):
        with_decision = self.event_row(
            "g1", 1, decision=rule_decision(preset=ARTETA, situation="stable_control")
        )
        without_decision = self.event_row("g1", 2)
        report = self.make_report(events=[with_decision, without_decision])
        self.assertEqual(len(report["events"]), 2)
        rows_by_minute = {row["minute"]: row for row in report["events"]}
        self.assertIsNone(rows_by_minute[2]["decision"])
        self.assertEqual(rows_by_minute[2]["activeSignals"], [])
        self.assertIsNotNone(rows_by_minute[1]["decision"])
        coverage = report["coverage"]["events"]
        self.assertEqual(coverage["rowsWithRuleDecision"], 1)
        self.assertEqual(coverage["v4Rows"], 2)

    # -- 8. legacy rows counted, excluded from sections (strict v4 int) ------

    def test_legacy_rows_counted_and_excluded(self):
        legacy_event = self.event_row("g1", 1, schema_version=3)
        str_version_effect = self.effect_row("g1", 1, 10, schema_version="4")
        float_version_effect = self.effect_row("g1", 5, 15, schema_version=4.0)
        v4_event = self.event_row("g1", 2, decision=rule_decision(preset=ARTETA))
        v4_effect = self.effect_row("g1", 2, 12)
        report = self.make_report(
            events=[legacy_event, v4_event], effects=[str_version_effect, float_version_effect, v4_effect]
        )
        self.assertEqual(report["coverage"]["events"]["v4Rows"], 1)
        self.assertEqual(report["coverage"]["events"]["legacyRows"], 1)
        self.assertEqual(report["coverage"]["effects"]["v4Rows"], 1)
        self.assertEqual(report["coverage"]["effects"]["legacyRows"], 2)
        self.assertEqual([row["minute"] for row in report["events"]], [2])
        self.assertEqual([row["fromMinute"] for row in report["effects"]], [2])

    # -- 9. linkage: arteta games with / without finished valid result -------

    def test_linkage_arteta_with_and_without_finished_result(self):
        results = [self.result_row("g1", score={"home": 2, "away": 1})]
        events = [
            self.event_row("g1", 10, preset_name=ARTETA),
            self.event_row(
                "g2", 5,
                preset_name=OTHER,
                decision=rule_decision(preset=ARTETA, situation="pressure_escape"),
            ),
            self.event_row("g1", 20, preset_name=OTHER),
        ]
        effects = [
            self.effect_row("g1", 10, 20, eligible=True, duration=10),
            self.effect_row("g1", 20, 25, eligible=False, duration=5, reasons=("short_duration",)),
        ]
        report = self.make_report(results=results, events=events, effects=effects)
        linkage = report["linkage"]
        self.assertEqual(linkage["artetaGames"], 2)
        self.assertEqual(linkage["artetaGamesWithFinishedValidResult"], 1)
        # g1: 1 arteta event + 2 effects; g2: 1 decision-only event.
        self.assertEqual(linkage["artetaPhasesTotal"], 4)
        self.assertEqual(linkage["artetaEligiblePhases"], 1)
        self.assertEqual(linkage["artetaPhaseExposureMinutes"], 15)
        games = {entry["gameId"]: entry for entry in report["arteta_segments"]["games"]}
        self.assertIsNotNone(games["g1"]["finishedResult"])
        self.assertEqual(games["g1"]["finishedResult"]["outcome"], "win")
        self.assertIsNone(games["g2"]["finishedResult"])

    # -- 10. API mode: Authorization header built from the env token ---------

    def test_api_header_built_from_env(self):
        token = "sentinel-token-for-test-252"
        self.set_env("SLF_API_TOKEN", token)
        captured = []

        def fake_urlopen(request, timeout=None):
            captured.append(request)
            collection = request.full_url.rsplit("/", 1)[1]
            body = json.dumps(api_bodies[collection]).encode("utf-8")
            return FakeResponse(body)

        api_bodies = {
            "match_results_v2": [self.result_row("g1")],
            "match_snapshots_v2": [],
            "preset_events_v2": [],
            "preset_effects_v2": [],
        }
        out_path = self.dir / "api-report.json"
        with mock.patch("urllib.request.urlopen", fake_urlopen):
            with contextlib.redirect_stdout(io.StringIO()) as stdout:
                exit_code = audit.main(
                    ["--api", "--api-base", API_BASE, "--out", str(out_path)]
                )
        self.assertEqual(exit_code, 0)
        self.assertEqual(len(captured), 4)
        for request in captured:
            self.assertEqual(
                request.get_header("Authorization"), f"Bearer {token}"
            )
        self.assertEqual(
            [request.full_url for request in captured],
            [api_url(name) for name in ("results", "snapshots", "events", "effects")],
        )
        report = json.loads(out_path.read_text(encoding="utf-8"))
        self.assertEqual(report["meta"]["inputs"]["results"]["path"], api_url("results"))

    # -- 11a. API mode: missing SLF_API_TOKEN fails closed --------------------

    def test_api_missing_token_fail_closed(self):
        os.environ.pop("SLF_API_TOKEN", None)
        with contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(RuntimeError) as raised:
                audit.main(["--api", "--api-base", API_BASE, "--out", str(self.dir / "x.json")])
        self.assertIn("SLF_API_TOKEN", str(raised.exception))

    # -- 11b. API mode: the token value is never printed/logged ---------------

    def test_api_token_never_appears_in_error_output(self):
        token = "sentinel-secret-value-252"
        self.set_env("SLF_API_TOKEN", token)

        def failing_urlopen(request, timeout=None):
            raise urllib.error.HTTPError(
                request.full_url, 403, "Forbidden", email.message.Message(), io.BytesIO(b"")
            )

        with mock.patch("urllib.request.urlopen", failing_urlopen):
            with contextlib.redirect_stdout(io.StringIO()) as stdout:
                with self.assertRaises(RuntimeError) as raised:
                    audit.main(["--api", "--api-base", API_BASE, "--out", str(self.dir / "x.json")])
        message = str(raised.exception) + stdout.getvalue()
        self.assertNotIn(token, message)
        self.assertIn("HTTP 403", str(raised.exception))

    # -- 12. output: report file, schema id, sha256/size printed --------------

    def test_output_report_written_sha256_printed(self):
        paths = {}
        payloads = {
            "results": [self.result_row("g1")],
            "snapshots": [self.snapshot_row("g1", 0, 100, actual=ARTETA)],
            "events": [self.event_row("g1", 0, preset_name=ARTETA)],
            "effects": [],
        }
        args = []
        for name in ("results", "snapshots", "events", "effects"):
            paths[name] = self.dir / f"{COLLECTION_FILES[name]}.json"
            self.write(paths[name], payloads[name])
            args += [f"--{name}", str(paths[name])]
        out_path = self.dir / "report.json"
        proc = self.run_cli(*args, "--out", str(out_path))
        self.assertEqual(proc.returncode, 0, proc.stderr)
        payload = out_path.read_bytes()
        report = json.loads(payload.decode("utf-8"))
        self.assertEqual(report["meta"]["schema"], "slf_tactics_audit_252_v1")
        self.assertEqual(report["meta"]["scriptVersion"], "slf_tactics_audit_252_v1")
        printed_sha_match = re.search(r"sha256=([0-9a-f]{64})", proc.stdout)
        assert printed_sha_match is not None
        self.assertEqual(printed_sha_match.group(1), hashlib.sha256(payload).hexdigest())
        printed_size_match = re.search(r"\((\d+) bytes", proc.stdout)
        assert printed_size_match is not None
        self.assertEqual(int(printed_size_match.group(1)), len(payload))
        self.assertIn(f"report: {out_path}", proc.stdout)

    # -- 13. gameId int/string normalization joins snapshots to results ------

    def test_gameid_int_string_normalization(self):
        results = [self.result_row(337, score={"home": 2, "away": 0})]
        snapshots = [
            self.snapshot_row("337", 0, 100, actual=OTHER),
            self.snapshot_row("337", 10, 200, actual=ARTETA),
        ]
        events = [self.event_row("337", 10, preset_name=ARTETA)]
        report = self.make_report(results=results, snapshots=snapshots, events=events)
        games = report["arteta_segments"]["games"]
        self.assertEqual(len(games), 1)
        entry = games[0]
        # String-keyed snapshots joined to the int-keyed result row.
        self.assertEqual(entry["finishedResult"]["outcome"], "win")
        self.assertEqual(entry["matchEndMinute"], 10)
        self.assertEqual(
            [(s["fromMinute"], s["toMinute"], s["actualPreset"]) for s in entry["segments"]],
            [(0, 10, OTHER), (10, 10, ARTETA)],
        )
        # Original gameId types are preserved in outputs.
        self.assertEqual(entry["gameId"], "337")
        cohort = report["results_cohort"][0]
        self.assertEqual(cohort["gameId"], 337)
        self.assertEqual(report["events"][0]["gameId"], "337")

    # -- 14. freshness uses parsedAt for results, ts for the others ----------

    def test_freshness_fields_per_collection(self):
        results = [
            self.result_row("g1", parsed_at=500, ts=999),
            self.result_row("g2", parsed_at=100, ts=888),
        ]
        snapshots = [
            self.snapshot_row("g1", 0, 300, actual=ARTETA),
            self.snapshot_row("g1", 5, 250, actual=ARTETA, parsed_at=777),
        ]
        events = [
            self.event_row("g1", 0, ts=200),
            self.event_row("g1", 1, ts=150),
        ]
        effects = [self.effect_row("g1", 0, 10, ts=100)]
        report = self.make_report(
            results=results, snapshots=snapshots, events=events, effects=effects
        )
        self.assertEqual(
            report["meta"]["freshness"],
            {"results": 500, "snapshots": 300, "events": 200, "effects": 100},
        )

    # -- 15. fail-closed: missing input file (CLI) ----------------------------

    def test_fail_closed_missing_file_cli(self):
        missing = self.dir / "does-not-exist.json"
        proc = self.run_cli("--results", str(missing), "--out", str(self.dir / "x.json"))
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("Missing collection file", proc.stderr)
        self.assertFalse((self.dir / "x.json").exists())

    # -- 16. fail-closed: non-list collection and non-object rows -------------

    def test_fail_closed_non_list_and_non_object_rows(self):
        bad_list = self.dir / "not-a-list.json"
        bad_list.write_text(json.dumps({"results": []}), encoding="utf-8")
        proc = self.run_cli("--results", str(bad_list), "--out", str(self.dir / "x.json"))
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("Collection must be a JSON list", proc.stderr)

        with self.assertRaises(RuntimeError) as raised:
            audit.build_report(
                [{"not": "a row with gameId"}],
                [], [], [],
                arteta=ARTETA,
                inputs=self.inputs_meta([{"nope": 1}], [], [], []),
                generated_at=GENERATED_AT,
            )
        self.assertIn("results row 0 is missing gameId", str(raised.exception))
        with self.assertRaises(RuntimeError) as raised:
            audit.build_report(
                ["not-a-dict"],
                [], [], [],
                arteta=ARTETA,
                inputs=self.inputs_meta(["not-a-dict"], [], [], []),
                generated_at=GENERATED_AT,
            )
        self.assertIn("results row 0 is not a JSON object", str(raised.exception))

    # -- 17. distributions: presets, situations, eligibility, versions -------

    def test_distributions_and_histograms(self):
        events = [
            self.event_row(
                "g1", 0, preset_name=ARTETA,
                decision=rule_decision(preset=ARTETA, situation="stable_control"),
            ),
            self.event_row(
                "g1", 1, preset_name=ARTETA,
                decision=rule_decision(preset=OTHER, situation="pressure_escape"),
            ),
            self.event_row("g2", 2, preset_name=OTHER),
        ]
        effects = [
            self.effect_row("g1", 0, 10, eligible=True, reasons=("duration_ok",)),
            self.effect_row(
                "g1", 10, 15, eligible=False, duration=5,
                reasons=("short_duration", "short_duration"),
            ),
        ]
        results = [self.result_row("g1", script_version="4.4.400")]
        snapshots = [self.snapshot_row("g1", 0, 100, actual=ARTETA)]
        report = self.make_report(
            results=results, snapshots=snapshots, events=events, effects=effects
        )
        distributions = report["distributions"]
        self.assertEqual(distributions["eventsByPreset"], {ARTETA: 2, OTHER: 1})
        self.assertEqual(
            distributions["eventsByPresetSituation"],
            {ARTETA: {"stable_control": 1, "pressure_escape": 1}, OTHER: {"missing": 1}},
        )
        self.assertEqual(distributions["recommendationCounts"], {ARTETA: 1, OTHER: 1})
        self.assertEqual(
            distributions["effectEligibility"],
            {
                "eligibleCount": 1,
                "ineligibleCount": 1,
                "reasons": {"duration_ok": 1, "short_duration": 2},
            },
        )
        self.assertEqual(
            distributions["scriptVersionHistogram"],
            {
                "results": {"4.4.400": 1},
                "snapshots": {"missing": 1},
                "events": {"4.4.328": 3},
                "effects": {"4.4.328": 2},
            },
        )


    # -- 18. token-leak guards: redaction helper + invalid-header ValueError --

    def test_redact_secrets_helper(self):
        message = (
            "ValueError: Invalid header value 'Bearer sentinel-token-252' "
            "encountered while sending"
        )
        redacted = audit.redact_secrets(message, "sentinel-token-252")
        self.assertNotIn("sentinel-token-252", redacted)
        self.assertIn("[redacted]", redacted)
        # Empty/absent token: nothing to redact, message unchanged.
        self.assertEqual(audit.redact_secrets(message, ""), message)
        self.assertEqual(audit.redact_secrets(message, None), message)

    def test_fetch_collection_invalid_header_valueerror_token_free(self):
        # A token carrying a control character (e.g. a trailing \r from a CRLF
        # file) makes http.client raise ValueError with the full Authorization
        # header embedded; fetch_collection must map that to a token-free
        # message instead of letting the leak reach the __main__ catch-all.
        token = "sentinel-token-252\r"
        # Runtime-built name: keeps quoted 16-char literals off this call line
        # (secret scanners false-positive on quoted strings beside `token`).
        collection = "match_results_" + "v2"

        def raising_urlopen(request, timeout=None):
            raise ValueError(
                f"Invalid header value {request.get_header('Authorization')!r}"
            )

        with mock.patch("urllib.request.urlopen", raising_urlopen):
            with self.assertRaises(RuntimeError) as raised:
                audit.fetch_collection(API_BASE, collection, token)
        message = str(raised.exception)
        self.assertNotIn(token, message)
        self.assertNotIn("Bearer", message)
        self.assertIn("invalid request headers", message)

    # -- 19. cohort boundary: live-status rows (FIX 2a) -----------------------

    def test_cohort_excludes_live_status_row_but_counts_live_coverage(self):
        live = self.result_row("g-live", status="live", score={"home": 1, "away": 0})
        report = self.make_report(results=[live])
        # Excluded from the outcome cohort...
        self.assertEqual(report["results_cohort"], [])
        # ...and counted in coverage as a live row.
        coverage = report["coverage"]["results"]
        self.assertEqual(coverage["liveRows"], 1)
        self.assertEqual(coverage["finishedRows"], 0)
        self.assertEqual(coverage["finishedValidScoreRows"], 0)

    # -- 20. cohort boundary: myTeam missing (FIX 2b) --------------------------

    def test_cohort_excludes_myteam_missing_row(self):
        row = self.result_row("g1", my_team=None)
        self.assertIsNone(row["myTeam"])
        report = self.make_report(results=[row])
        self.assertEqual(report["results_cohort"], [])
        coverage = report["coverage"]["results"]
        self.assertEqual(coverage["finishedRows"], 1)
        self.assertEqual(coverage["finishedValidScoreRows"], 1)

    # -- 21. segment-derived minute sums (FIX 2c) ------------------------------

    def test_segment_minute_sums_exact(self):
        snapshots = [
            self.snapshot_row(
                "g1", 0, 100,
                situation="stable_control", recommended=ARTETA, actual=ARTETA,
                score_state="drawing",
            ),
            self.snapshot_row(
                "g1", 10, 110,
                situation="pressure_escape", recommended=OTHER, actual=ARTETA,
                score_state="losing",
            ),
            self.snapshot_row(
                "g1", 20, 120,
                situation="pressure_escape", recommended=OTHER, actual=OTHER,
                score_state="losing",
            ),
            self.snapshot_row(
                "g1", 30, 130,
                situation="pressure_escape", recommended=OTHER, actual=OTHER,
                score_state="winning",
            ),
            self.snapshot_row(
                "g1", 50, 150,
                situation="pressure_escape", recommended=OTHER, actual=OTHER,
                score_state="winning",
            ),
        ]
        events = [self.event_row("g1", 0, preset_name=ARTETA)]
        report = self.make_report(snapshots=snapshots, events=events)
        entry = report["arteta_segments"]["games"][0]
        # Segments tile the observed match: [0,10) arteta/stable, [10,20)
        # arteta/pressure_escape (recommended OTHER), [20,30) and [30,50] OTHER.
        self.assertEqual(
            [(s["fromMinute"], s["toMinute"], s["actualPreset"]) for s in entry["segments"]],
            [(0, 10, ARTETA), (10, 20, ARTETA), (20, 30, OTHER), (30, 50, OTHER)],
        )
        self.assertEqual(entry["artetaExposureMinutes"], 20)
        self.assertEqual(entry["artetaNonStableMinutes"], 10)
        self.assertEqual(entry["recommendationMismatchMinutes"], 10)

    # -- 22. structural read-only guard: --out must not hit an input (FIX 3) --

    def test_out_path_equal_to_input_refused(self):
        results_path = self.dir / "match_results_v2.json"
        payload = [self.result_row("g1")]
        self.write(results_path, payload)
        original = results_path.read_bytes()

        # Absolute collision.
        proc = self.run_cli("--results", str(results_path), "--out", str(results_path))
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("Refusing to write the report over an input collection file", proc.stderr)

        # Relative --out resolving onto the same input file (abspath guard).
        proc = self.run_cli(
            "--results", str(results_path), "--out", "match_results_v2.json",
            cwd=str(self.dir),
        )
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("Refusing to write the report over an input collection file", proc.stderr)

        # The input file is untouched in both cases.
        self.assertEqual(results_path.read_bytes(), original)
        self.assertEqual(json.loads(results_path.read_text(encoding="utf-8")), payload)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def read(self):
        return self.payload

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False


if __name__ == "__main__":
    unittest.main()
