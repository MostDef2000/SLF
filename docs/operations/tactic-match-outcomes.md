# Tactic match outcome join

## Purpose

`tools/enrich-tactic-match-outcomes.mjs` joins canonical `match_results_v2.json` records into the tactic performance report after tactical-phase aggregation and before advisory proposal generation.

Match outcomes are represented as a separate analysis unit. Final match points or goal difference are not copied into every tactical phase because that would multiply one match result by the number of recorded switches and distort preset rankings.

## Input

Required:

- `tactic-performance-report.json` produced by `aggregate-tactic-performance.mjs`;
- canonical `match_results_v2.json` produced by the authenticated exporter.

The join key is `gameId`.

## Derived fields

For every result with known teams, owned team and final score:

- points: 3 for a win, 1 for a draw, 0 for a loss;
- goal difference from the owned-team perspective;
- home/away context;
- initial and final preset when present in `tacticTelemetry`;
- final tactic fingerprint;
- risk appetite, library version and recommendation schema.

`resultVsExpected` is calculated only when both generator expected-performance channels have numeric actual and expected values:

```text
(attack actual - attack expected) - (defense actual - defense expected)
```

The report identifies this explicit proxy as `generator_xg_channel_delta_v1`. Missing expected-performance channels produce `null`, not zero.

## Coverage

The report includes:

- source result rows;
- valid match outcomes;
- unique result game IDs;
- unique tactical-phase game IDs;
- joined tactical-phase game IDs;
- phase-game join coverage;
- result-versus-expected coverage.

These values are also copied into the analytics run manifest where appropriate.

## Attribution boundary

Match-level outcomes remain under `matchOutcomes`. Tactical phase rankings continue to use phase-local effects. Advisory promotion/demotion proposals remain based on statistically eligible tactical-phase ranking rows and are not changed automatically by the match join.

This separation prevents false attribution of the whole match result to every preset used during the match.

## Deferred metrics

The following remain unavailable until canonical payload fields and attribution rules are defined:

- shots-on-target difference after a switch;
- transition threat conceded;
- cards after switch;
- injuries after switch.

The analytics report must continue to identify these as unavailable. They must not be inferred from ambiguous free-text events or silently represented as observed zeroes.

## Verification

```bash
node tools/test-tactic-match-outcomes.mjs
```

The deterministic test covers win/draw points, goal difference, expected-performance proxy, invalid result exclusion, join coverage and metric implementation metadata.
