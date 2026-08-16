#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("slf_preset_evidence_561.py")
spec = importlib.util.spec_from_file_location("slf_preset_evidence_561_under_test", MODULE_PATH)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def snapshot(*, game_id="g1", minute=10, score=(0, 0), my_team=1, preset="Preset_A", script="4.4.304", generator="5.61"):
    return {
        "gameId": game_id,
        "minute": minute,
        "bucket": "01-15" if minute < 16 else "16-30",
        "score": {"home": score[0], "away": score[1]},
        "teams": [1, 2],
        "myTeam": my_team,
        "telemetryContext": {
            "gameId": game_id,
            "scoreState": "draw" if score[0] == score[1] else None,
            "presetId": preset,
            "scriptVersion": script,
            "generatorVersion": generator,
        },
    }


def phase_event(game_id="g1", phase_id="p1", preset="Preset_A", minute=10):
    snap = snapshot(game_id=game_id, minute=minute, preset=preset)
    return {
        "ts": 1_760_000_000_000,
        "recordType": "preset_event",
        "schemaVersion": 4,
        "parserVersion": "tactical_phase_start_v4",
        "type": "tactical_phase_start",
        "eventType": "tactical_phase_start",
        "gameId": game_id,
        "phaseId": phase_id,
        "presetName": preset,
        "minute": minute,
        "bucket": snap["bucket"],
        "phaseStart": snap,
        "telemetryContext": snap["telemetryContext"],
        "source": {"scriptVersion": "4.4.304"},
    }


def phase_effect(game_id="g1", phase_id="p1", preset="Preset_A", minute=10, to_minute=20, score=(0, 0), eligible=True):
    start = snapshot(game_id=game_id, minute=minute, score=score, preset=preset)
    end = snapshot(game_id=game_id, minute=to_minute, score=score, preset=preset)
    return {
        "ts": 1_760_000_100_000,
        "recordType": "preset_effect",
        "schemaVersion": 4,
        "parserVersion": "tactical_phase_effect_v4",
        "eventType": "tactical_phase",
        "gameId": game_id,
        "phaseId": phase_id,
        "presetName": preset,
        "fromMinute": minute,
        "toMinute": to_minute,
        "phaseStart": start,
        "phaseEnd": end,
        "telemetryContext": {
            "gameId": game_id,
            "scoreState": module.score_state(start),
            "presetId": preset,
            "scriptVersion": "4.4.304",
            "generatorVersion": "5.61",
        },
        "delta": {
            "myXG": 0.4,
            "oppXG": 0.2,
            "myShots": 3,
            "oppShots": 1,
            "myBadActionsPct": -1,
        },
        "eligibility": {
            "eligibleForRanking": eligible,
            "durationMinutes": to_minute - minute,
            "completeness": 0.9,
            "reasons": [] if eligible else ["phase_too_short"],
        },
        "source": {"scriptVersion": "4.4.304"},
    }


def legacy_effect(game_id="g1", preset="Legacy_Preset"):
    before = snapshot(game_id=game_id, minute=10, preset=preset)
    after = snapshot(game_id=game_id, minute=20, preset=preset)
    return {
        "ts": 1_760_000_050_000,
        "recordType": "preset_effect",
        "schemaVersion": 3,
        "parserVersion": "preset_effect_generation_v4_tactic_telemetry",
        "gameId": game_id,
        "presetName": preset,
        "before": before,
        "after": after,
        "delta": {"myXG": 0.1, "oppXG": 0.4, "myShots": 1, "oppShots": 4, "myBadActionsPct": 2},
        "source": {"scriptVersion": "4.4.303"},
    }


def result(game_id, *, score, my_team=1, ts=1_760_000_200_000, preset="Preset_A"):
    return {
        "gameId": game_id,
        "recordType": "match_result",
        "resultType": "finished_match",
        "parsedAt": ts,
        "score": {"home": score[0], "away": score[1]},
        "teams": [1, 2],
        "myTeam": my_team,
        "source": {"scriptVersion": "4.4.304"},
        "telemetryContext": {"generatorVersion": "5.61", "riskAppetite": "standard"},
        "tacticTelemetry": {
            "initialPreset": "Preset_A",
            "currentPreset": preset,
            "riskAppetite": "standard",
            "transitionCount": 2,
        },
        "generatorExpectedPerformance": {
            "attack": {"actual": 1.4, "expected": 1.0},
            "defense": {"actual": 0.8, "expected": 1.0},
        },
    }


class TelemetryAnalyticsTest(unittest.TestCase):
    def test_score_state_ignores_bucket_and_uses_owned_team_score(self):
        home_losing = snapshot(score=(0, 2), my_team=1)
        home_losing["bucket"] = "46-60"
        home_losing["telemetryContext"]["scoreState"] = None
        self.assertEqual(module.score_state(home_losing), "losing")

        away_winning = snapshot(score=(0, 2), my_team=2)
        away_winning["bucket"] = "46-60"
        away_winning["telemetryContext"]["scoreState"] = None
        self.assertEqual(module.score_state(away_winning), "winning")

        unknown = {"bucket": "46-60", "context": {"bucket": "46-60"}}
        self.assertEqual(module.score_state(unknown), "unknown")

    def test_v4_phase_effects_replace_legacy_for_same_game_only(self):
        events = [phase_event("g1", "p1")]
        effects = [
            phase_effect("g1", "p1", "Preset_A"),
            legacy_effect("g1", "Legacy_Same_Game"),
            legacy_effect("g2", "Legacy_Old_Game"),
        ]
        _, selected, cohort = module.select_analysis_cohort(events, effects)
        self.assertEqual(len(selected), 2)
        self.assertEqual({module.preset_name(row) for row in selected}, {"Preset_A", "Legacy_Old_Game"})
        self.assertEqual(cohort["gamesUsingPhaseEffects"], 1)

    def test_match_outcomes_are_deduplicated_private_and_owned_team_oriented(self):
        results = [
            result("g-win", score=(2, 0), ts=100),
            result("g-draw", score=(1, 1), ts=200),
            result("g-away-win", score=(0, 3), my_team=2, ts=300, preset="Preset_B"),
            result("g-loss", score=(0, 1), ts=400),
            result("g-win", score=(3, 0), ts=500),  # latest duplicate wins the dedupe
        ]
        effects = [phase_effect("g-win", "p-win"), phase_effect("g-away-win", "p-away")]
        summary = module.build_match_outcomes_summary(results, effects)
        overall = summary["overall"]
        self.assertEqual(summary["counts"]["validUniqueMatches"], 4)
        self.assertEqual((overall["wins"], overall["draws"], overall["losses"]), (2, 1, 1))
        self.assertEqual(overall["points"], 7)
        self.assertEqual(overall["pointsPerMatch"], 1.75)
        self.assertEqual(overall["goalsFor"], 7)
        self.assertEqual(overall["goalsAgainst"], 2)
        self.assertEqual(overall["goalDifference"], 5)
        self.assertAlmostEqual(overall["avgResultVsExpected"], 0.6)
        self.assertEqual(summary["away"]["wins"], 1)
        self.assertEqual(summary["home"]["matches"], 3)
        self.assertEqual(summary["privacy"]["rawGameIdsIncluded"], False)
        self.assertTrue(summary["recentMatches"])
        for row in summary["recentMatches"]:
            self.assertNotIn("gameId", row)
            self.assertRegex(row["matchRef"], r"^[0-9a-f]{12}$")

    def test_quality_report_measures_phase_closure_provenance_and_unknowns(self):
        events = [phase_event("g1", "p1"), phase_event("g2", "p2")]
        effects = [phase_effect("g1", "p1"), phase_effect("g3", "orphan")]
        snapshots = [snapshot(game_id="g1"), snapshot(game_id="g2")]
        results = [result("g1", score=(1, 0))]
        quality = module.build_telemetry_quality_summary(snapshots, results, events, effects)
        self.assertEqual(quality["coverage"]["resultCoverageVsObservedGames"], 0.5)
        self.assertEqual(quality["coverage"]["phaseClosureRate"], 0.5)
        self.assertEqual(quality["phaseIntegrity"]["orphanPhaseEffects"], 1)
        self.assertEqual(quality["phaseIntegrity"]["unclosedPhaseStarts"], 1)
        self.assertEqual(quality["coverage"]["knownScoreStateRate"], 1.0)
        self.assertEqual(quality["coverage"]["scriptVersionCoverage"], 1.0)
        self.assertEqual(quality["coverage"]["generatorVersionCoverage"], 1.0)
        self.assertIsNone(quality["reliability"]["serverSideRetryCount"])
        self.assertEqual(quality["reliability"]["clientOutboxLimit"], 12)

    def test_enrichment_writes_safe_files_and_manifest_read_order(self):
        events = [phase_event("g1", "p1")]
        effects = [phase_effect("g1", "p1")]
        snapshots = [snapshot(game_id="g1")]
        results = [result("g1", score=(2, 1))]
        report = module.build_report(events, effects)
        outcomes = module.build_match_outcomes_summary(results, effects)
        quality = module.build_telemetry_quality_summary(snapshots, results, events, effects)

        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            (out / "rag").mkdir(parents=True)
            (out / "data").mkdir(parents=True)
            (out / "rag" / "catalog.json").write_text(json.dumps({"sources": []}), encoding="utf-8")
            (out / "rag" / "search_index.json").write_text(json.dumps({"items": []}), encoding="utf-8")
            (out / "ai_context.md").write_text("# test\n", encoding="utf-8")
            (out / "manifest.json").write_text(json.dumps({"files": {}, "recommendedReadOrder": ["data/analytics_summary.json"]}), encoding="utf-8")

            module.write_json(out / "data" / "preset_evidence_561.json", report)
            module.write_json(out / "data" / "match_outcomes_summary.json", outcomes)
            module.write_json(out / "data" / "telemetry_quality_summary.json", quality)
            module.enrich_catalog(out, report, outcomes, quality)
            module.enrich_search_index(out, report, outcomes, quality)
            module.enrich_ai_context(out, report, outcomes, quality)
            module.enrich_manifest(out)

            manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["recommendedReadOrder"][:3], [
                "data/telemetry_quality_summary.json",
                "data/match_outcomes_summary.json",
                "data/preset_evidence_561.json",
            ])
            self.assertTrue(manifest["files"]["matchOutcomesSummary"]["exists"])
            catalog = json.loads((out / "rag" / "catalog.json").read_text(encoding="utf-8"))
            source_ids = {row["id"] for row in catalog["sources"]}
            self.assertTrue({"preset_evidence_561", "match_outcomes_summary", "telemetry_quality_summary"}.issubset(source_ids))


if __name__ == "__main__":
    unittest.main(verbosity=2)
