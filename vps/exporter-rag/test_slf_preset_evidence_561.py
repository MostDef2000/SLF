#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path

# The canonical tactic CI installs VPS API dependencies, not exporter-rag dependencies.
# These regressions exercise pure exporter transformations only, so keep network access
# unavailable and provide the smallest import-time stub instead of installing requests.
requests_stub = types.ModuleType("requests")
def _network_forbidden(*_args, **_kwargs):
    raise AssertionError("network access is forbidden in exporter regression tests")
requests_stub.get = _network_forbidden
sys.modules.setdefault("requests", requests_stub)

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
            result("g-win", score=(3, 0), ts=500),
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

    def test_unknown_and_conflicting_tactics_are_not_in_preset_comparisons(self):
        named_event = phase_event("known", "phase-known", preset="Preset_A")
        unknown_event = phase_event("unknown", "phase-unknown", preset="unknown")
        manual_event = phase_event("manual", "phase-manual", preset="manual_change")
        named_effect = phase_effect("known", "phase-known", preset="Preset_A")
        unknown_effect = phase_effect("unknown", "phase-unknown", preset="unknown")
        manual_effect = phase_effect("manual", "phase-manual", preset="manual_change")
        conflicting_effect = phase_effect("conflict", "phase-conflict", preset="Preset_A")
        conflicting_effect["telemetryContext"]["presetId"] = "Preset_B"
        events = [named_event, unknown_event, manual_event]
        effects = [named_effect, unknown_effect, manual_effect, conflicting_effect]
        report = module.build_report(events, effects)
        effect_summary = module.build_effects_summary(events, effects)
        event_summary = module.build_events_summary(events, effects)
        self.assertEqual({r["presetName"] for r in report["byPeriodPreset"]}, {"Preset_A"})
        self.assertEqual(report["counts"]["excludedComparativeEvents"], 2)
        self.assertEqual(report["counts"]["excludedComparativeEffects"], 3)
        self.assertEqual({r["presetName"] for r in effect_summary["byPreset"]}, {"Preset_A"})
        self.assertEqual(effect_summary["analysisCount"], 4)
        self.assertEqual(effect_summary["excludedComparativeCount"], 3)
        self.assertEqual({r["presetName"] for r in event_summary["byPreset"]}, {"Preset_A"})
        self.assertEqual(event_summary["analysisCount"], 3)
        self.assertEqual(event_summary["excludedComparativeCount"], 2)
        # Unattributed final results still count toward global W/D/L.
        unassigned = result("unassigned", score=(2, 0), preset=None)
        matches = module.build_match_outcomes_summary([unassigned], [])
        self.assertEqual(matches["overall"]["wins"], 1)
        self.assertEqual(matches["byFinalPreset"]["unknown"], 1)

    def test_match_outcome_diagnostics_explain_invalid_rows(self):
        missing_score = result("g-missing-score", score=(1, 0))
        missing_score["score"] = None
        missing_team = result("g-missing-team", score=(1, 0))
        missing_team["myTeam"] = None
        results = [
            result("g-valid", score=(2, 1)),
            missing_score,
            missing_team,
        ]
        summary = module.build_match_outcomes_summary(results, [])
        self.assertEqual(summary["counts"]["sourceRows"], 3)
        self.assertEqual(summary["counts"]["validRows"], 1)
        self.assertEqual(summary["counts"]["validUniqueMatches"], 1)
        self.assertEqual(summary["counts"]["invalidRows"], 2)
        self.assertEqual(summary["counts"]["invalidOrUnjoinableRows"], 2)
        self.assertEqual(summary["invalidResultReasons"], {
            "missing_my_team": 1,
            "missing_score": 1,
        })

        quality = module.build_telemetry_quality_summary([], results, [], [])
        self.assertEqual(quality["resultIntegrity"]["validRows"], 1)
        self.assertEqual(quality["resultIntegrity"]["invalidRows"], 2)
        self.assertEqual(quality["resultIntegrity"]["invalidReasons"], {
            "missing_my_team": 1,
            "missing_score": 1,
        })
        self.assertEqual(quality["coverage"]["resultValidRowRate"], 0.333)

    def test_quality_report_measures_phase_closure_provenance_and_unknowns(self):
        events = [phase_event("g1", "p1"), phase_event("g2", "p2")]
        effects = [phase_effect("g1", "p1"), phase_effect("g3", "orphan")]
        snapshots = [snapshot(game_id="g1"), snapshot(game_id="g2")]
        results = [result("g1", score=(1, 0))]
        quality = module.build_telemetry_quality_summary(snapshots, results, events, effects)
        self.assertEqual(quality["coverage"]["resultCoverageVsObservedGames"], 0.5)
        self.assertEqual(quality["coverage"]["resultValidRowRate"], 1.0)
        self.assertEqual(quality["resultIntegrity"]["invalidRows"], 0)
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


    def test_v9_readiness_ignores_mixed_legacy_and_requires_confirmed_result(self):
        stable_ts = int(module.dt.datetime(2026, 8, 1, tzinfo=module.dt.timezone.utc).timestamp() * 1000)
        legacy = []
        for index in range(80):
            effect = legacy_effect(game_id=f"legacy-{index}", preset=f"Legacy_{index % 8}")
            effect["ts"] = stable_ts
            legacy.append(effect)
        report_legacy = module.build_report([], legacy)
        self.assertEqual(report_legacy["counts"]["stableNamedEffects"], 80)
        self.assertEqual(report_legacy["counts"]["v9CurrentNamedPhaseEffects"], 0)
        self.assertFalse(report_legacy["quality"]["readyForRetune"])

        current = phase_effect("v9-good", "phase-good", preset="Arteta_Control433_bal3")
        current["ts"] = stable_ts
        current["telemetryContext"].update({
            "libraryVersion": module.V9_LIBRARY,
            "recommendationSchema": module.V9_RECOMMENDATION_SCHEMA
        })
        current["tacticContext"] = {"applicationStatus": "game_confirmed"}
        finished = result("v9-good", score=(2, 1))
        report = module.build_report([], legacy + [current], [finished])
        self.assertEqual(report["counts"]["v9CurrentNamedPhaseEffects"], 1)
        self.assertEqual(report["counts"]["v9CurrentScoredConfirmedEffects"], 1)
        self.assertFalse(report["quality"]["readyForRetune"], "one valid phase is not enough")

        missing_result = module.build_report([], [current])
        self.assertEqual(missing_result["counts"]["v9CurrentScoredConfirmedEffects"], 0)
        current["tacticContext"]["applicationStatus"] = "ui_readback_confirmed"
        unverified = module.build_report([], [current], [finished])
        self.assertEqual(unverified["counts"]["v9CurrentScoredConfirmedEffects"], 0)
        self.assertFalse(unverified["quality"]["readyForRetune"])

    def test_v9_readiness_rejects_non_integral_score_and_invalid_finish_record(self):
        current = phase_effect("g-invalid", "p1", preset="Arteta_Control433_bal3")
        current["ts"] = int(module.dt.datetime(2026, 8, 1, tzinfo=module.dt.timezone.utc).timestamp() * 1000)
        current["telemetryContext"].update({
            "libraryVersion": module.V9_LIBRARY,
            "recommendationSchema": module.V9_RECOMMENDATION_SCHEMA,
        })
        current["tacticContext"] = {"applicationStatus": "game_confirmed"}
        scored = result("g-invalid", score=(1, 0))
        scored["score"] = {"home": 1.2, "away": 0}
        self.assertFalse(module.is_strict_scored_finished_result(scored))
        self.assertEqual(module.build_report([], [current], [scored])["counts"]["v9CurrentScoredConfirmedEffects"], 0)
        scored["score"] = {"home": 1, "away": 0}
        scored["resultType"] = "intermediate_snapshot"
        self.assertFalse(module.is_strict_scored_finished_result(scored))
        self.assertEqual(module.build_report([], [current], [scored])["counts"]["v9CurrentScoredConfirmedEffects"], 0)


    def test_v10_readiness_separate_from_v9_and_unverified_browser_edits(self):
        stable_ts = int(module.dt.datetime(2026, 8, 1, tzinfo=module.dt.timezone.utc).timestamp() * 1000)
        def current(game, library, schema, preset):
            phase = phase_effect(game, "p1", preset=preset)
            phase["ts"] = stable_ts
            phase["telemetryContext"].update({"libraryVersion": library, "recommendationSchema": schema})
            phase["tacticContext"] = {"applicationStatus": "game_confirmed"}
            return phase

        v9 = current("history", module.V9_LIBRARY, module.V9_RECOMMENDATION_SCHEMA, "Arteta_Control433_bal3")
        v10 = current("new", module.V10_LIBRARY, module.V10_RECOMMENDATION_SCHEMA, "MidBlock_Counter4411_neutr")
        finished = [result("history", score=(1, 0)), result("new", score=(2, 1))]
        report = module.build_report([], [v9, v10], finished)
        self.assertEqual(report["counts"]["v9CurrentScoredConfirmedEffects"], 1)
        self.assertEqual(report["counts"]["v10CurrentScoredConfirmedEffects"], 1)
        self.assertEqual(report["counts"]["v10CurrentNamedPhaseEffects"], 1)
        self.assertEqual(report["quality"]["readinessCohort"], "v11_current_scored_game_confirmed_phase_only")
        self.assertFalse(report["quality"]["readyForRetune"], "single v10 phase is insufficient")

        v10["tacticContext"]["applicationStatus"] = "ui_readback_confirmed"
        unverified = module.build_report([], [v9, v10], finished)
        self.assertEqual(unverified["counts"]["v10CurrentScoredConfirmedEffects"], 0)
        self.assertFalse(unverified["quality"]["readyForRetune"])


    def test_coach_aliases_group_v10_history_without_mutating_raw_names(self):
        stable_ts = int(module.dt.datetime(2026, 8, 1, tzinfo=module.dt.timezone.utc).timestamp() * 1000)
        old_id = "MidBlock_Counter4411_neutr"
        new_id = "Mourinho_CompactCounter4411_neutr"
        rows = []
        finished = []
        for game, preset in (("legacy-v10", old_id), ("coach-v10", new_id)):
            phase = phase_effect(game, "phase-1", preset=preset)
            phase["ts"] = stable_ts
            phase["telemetryContext"].update({
                "libraryVersion": module.V10_LIBRARY,
                "recommendationSchema": module.V10_RECOMMENDATION_SCHEMA,
            })
            phase["tacticContext"] = {"applicationStatus": "game_confirmed"}
            rows.append(phase)
            finished.append(result(game, score=(1, 0)))
        report = module.build_report([], rows, finished)
        self.assertEqual([module.preset_name(row) for row in rows], [old_id, new_id])
        self.assertEqual([module.analysis_preset_name(row) for row in rows], [new_id, new_id])
        self.assertEqual(report["counts"]["v10CurrentNamedPhaseEffects"], 2)
        self.assertEqual(report["counts"]["v10LegacyAliasPhaseEffects"], 1)
        self.assertEqual(report["counts"]["v10CurrentScoredConfirmedEffects"], 2)
        self.assertEqual(report["counts"]["v10CurrentScoredConfirmedPresetCount"], 1)
        grouped = [x for x in report["byPeriodPreset"] if x["presetName"] == new_id]
        self.assertEqual(len(grouped), 1)
        self.assertEqual(grouped[0]["sample"], 2)
        self.assertFalse(report["quality"]["readyForRetune"])

        historical = phase_effect("v9-record", "v9-phase", preset=old_id)
        historical["ts"] = stable_ts
        historical["telemetryContext"].update({
            "libraryVersion": module.V9_LIBRARY,
            "recommendationSchema": module.V9_RECOMMENDATION_SCHEMA,
        })
        self.assertEqual(module.analysis_preset_name(historical), old_id)
        self.assertFalse(module.is_v10_current_phase_effect(historical))


    def test_fixed_lineup_v11_isolated_from_all_historical_cohorts_and_manual_arteta(self):
        stable_ts = int(module.dt.datetime(2026, 8, 1, tzinfo=module.dt.timezone.utc).timestamp() * 1000)
        def phase(game, preset, library, schema, status="game_confirmed"):
            row = phase_effect(game, "p1", preset=preset)
            row["ts"] = stable_ts
            row["telemetryContext"].update({
                "libraryVersion": library, "recommendationSchema": schema,
            })
            row["tacticContext"] = {"applicationStatus": status}
            return row
        v9 = phase("g-v9", "Arteta_Control433_bal3", module.V9_LIBRARY, module.V9_RECOMMENDATION_SCHEMA)
        v10 = phase("g-v10", "Emery_BalancedControl4231_neutr", module.V10_LIBRARY, module.V10_RECOMMENDATION_SCHEMA)
        v11 = phase("g-v11", "Emery_BalancedBase_v11", module.V11_LIBRARY, module.V11_RECOMMENDATION_SCHEMA)
        diagnostic = phase("g-arteta", "Arteta_SafePossession_v11", module.V11_LIBRARY, module.V11_RECOMMENDATION_SCHEMA)
        unverified = phase("g-unverified", "Guardiola_PressEscape_v11", module.V11_LIBRARY, module.V11_RECOMMENDATION_SCHEMA, "ui_readback_confirmed")
        finished = [result(game, score=(1, 0)) for game in ["g-v9", "g-v10", "g-v11", "g-arteta", "g-unverified"]]
        data = module.build_report([], [v9, v10, v11, diagnostic, unverified], finished)
        self.assertTrue(module.is_v11_current_phase_effect(v11))
        self.assertTrue(module.is_v11_current_phase_effect(diagnostic))
        self.assertFalse(module.is_v11_current_phase_effect(v10))
        self.assertFalse(module.is_v11_current_phase_effect(v9))
        self.assertEqual(data["counts"]["v10CurrentNamedPhaseEffects"], 1)
        self.assertEqual(data["counts"]["v11CurrentNamedPhaseEffects"], 3)
        self.assertEqual(data["counts"]["v11ManualDiagnosticPhaseEffects"], 1)
        self.assertEqual(data["counts"]["v11CurrentScoredConfirmedEffects"], 1)
        self.assertEqual(data["counts"]["v11CurrentScoredConfirmedPresetCount"], 1)
        self.assertEqual(data["quality"]["readinessCohort"], "v11_current_scored_game_confirmed_phase_only")
        self.assertFalse(data["quality"]["readyForRetune"])
        self.assertEqual(module.preset_name(v10), "Emery_BalancedControl4231_neutr")
        self.assertEqual(module.preset_name(v11), "Emery_BalancedBase_v11")
        self.assertEqual(module.analysis_preset_name(v10), "Emery_BalancedControl4231_neutr")
        self.assertEqual(module.analysis_preset_name(v11), "Emery_BalancedBase_v11")


if __name__ == "__main__":
    unittest.main(verbosity=2)
