# Dave 5.6 etalon recommendation in the hint panel (#348)

**Status:** orchestrator-dispatched work order (edit-only; no commit/push from the implementing agent). Branch: `feat/348-dave56-etalon-hint`, base `db6b5da`. The authoritative etalon tables were supplied in the work order (transcribed from the Dave 5.6 generator knowledge diagrams); the source JPGs are not available in the implementation sandbox, so the work-order transcription is embedded verbatim.

## Goal and user-visible behaviour

The game.php «Подсказка» hint panel gains a Dave 5.6 etalon recommendation block as its primary line: matched defense/buildup situation labels, the etalon control words, priority lanes, active score-play scenario notes, and confidence/insufficient-data markers. Next to it the panel shows a one-click **«Применить»** button. Clicking it applies the etalon vector to the tactic controls through the strict tactic-control bridge (`source: 'etalon:dave56:*'`) with visible applying/applied/failed/rolled-back states and stale-token invalidation.

The etalon recommendation **complements, never replaces**, the v11 preset engine: `autoApply` stays `false`, the button is the only trigger, and the etalon layer never mutates `result.action` of the recommendation engine.

## Acceptance / NFR

All 24 etalon situations (defense-12, buildup-12) plus 6 score-play scenarios are embedded verbatim as versioned data (`slf_dave56_etalon_v1`) in `dave56-etalon-data.js`, mirrored to `data/tactics/dave56-etalon-v1.json` and kept in sync by `tools/sync-dave56-etalon.mjs --check` (CI-checkable, deterministic). Vector resolution is deterministic and conservative by default: slash pairs resolve to the lower ordinal on the domain's defensive axis (conservative), the aggressive alternate stays available in the mapper; ordinals clamp to their domain. Scenario handling is mutually exclusive with fixed precedence (s2→s1→s4→s5→s3→s6); the s2 d5/b5 override applies only from minute 60. When no situation matches, defaults d1/b1 are used with `insufficientData` reporting (`b10_lane_play` is always reported — the «столба» game has no reliable signal in v1). The etalon layer installs only under the v11 tactic suite registry and, together with the UI state machine, performs zero automatic apply calls; every apply is a deliberate user action with rollback-aware status reporting. No regression in existing recommendation/tactic behaviour (bundle-order audit, preset inventory, bridge and fallback tests stay green).

## Exclusions

Generated release artifacts (`releases/**`, `CHANGELOG.md`, `data/version.json`, `data/release-evidence.json`), tactics-preset control-plane modules (registry/policy/bridge/engine — read-only consumers), VPS code, secrets, the game generator. CI workflows (quality-integration.yml, build-latest-release.yml) are IN scope: test invocations only, no workflow-logic changes. Lineup editing and preset selection remain unchanged.
