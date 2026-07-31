# Rule-based match decision engine — 4.4.246

## Scope

Version 4.4.246 replaces first-match tactical selection with a scored rule policy while keeping Coach Mode strictly advisory. The userscript does not apply tactics automatically.

The decision pipeline is:

1. `MatchDecisionSignals` builds one normalized match state.
2. `PresetRuleScorer` evaluates all 11 active presets.
3. Hard vetoes remove unsafe candidates.
4. Emergency overrides handle red cards and final-minute states.
5. Hysteresis, minimum hold and cooldown prevent tactical ping-pong.
6. Confidence is derived from candidate gap, signal completeness and conflicting objectives.
7. Coach Mode renders the recommendation, explanation and leading candidates.

## Match signals

The policy uses score, minute, xG, xT, shots, possession, bad actions, current on-field power, strength gap and transition risk.

Dynamic on-field strength is read from the existing match statistic `power2` through `MatchStatsParser.readFullStats().power`. The first requested hint in a match session becomes the power baseline. Later hints calculate changes from that baseline and from the previous hint.

The following normalized needs are produced:

- `attackNeed`
- `controlNeed`
- `pressureRisk`
- `preservationNeed`
- `widthOpportunity`
- `pressingOpportunity`
- `pressingCost`
- `defensiveStability`
- `pressingResponse`

The resulting game modes are:

- `front_foot_squeeze`
- `active_control`
- `compact_counter_control`
- `controlled_chase`
- `emergency_lock`

## Defense and pressing vectors

The match page exposes `def_height` and `press_height`; the existing parser records them as `defVector` and `pressVector` for both teams.

Version 4.4.246 stores raw vector values and their deltas in snapshots and preset effects. The sign is not assigned a tactical meaning before post-5.61 evidence establishes that meaning. Rule scoring couples vector movement with xG, xT, shots, bad actions and power loss. Vector movement confirms that the tactical state changed; outcome metrics determine whether that change was useful.

## Hard vetoes

The conservative initial policy includes these constraints:

- Bielsa Chaos Press only after minute 86 while losing, with low bad actions and acceptable pressing cost.
- Klopp Gegenpress only in a late chase after minute 78, with low bad actions and no pressing-fatigue veto.
- Simeone Low Block only for late lead protection under material pressure, red-card risk or power collapse.
- Conte Wingback Width only when a safe wide opportunity is verified.
- Expensive pressing is vetoed after an own red card, critical power loss, high bad actions or unsafe transition exposure.

## Stability controls

A new candidate must normally beat the current preset by 12 points. The threshold rises to 14 during cooldown and 15 before two generation windows of minimum hold have elapsed. Emergency overrides bypass these controls.

## Telemetry

Manual hint snapshots include:

- selected preset and score;
- confidence and candidate gap;
- all candidate scores;
- vetoed presets and veto reasons;
- normalized match signals;
- on-field power and power deltas;
- defense and pressing vectors for both teams;
- current tactic and detected preset.

Preset events and effects include the compact rule decision, tactic context, power-drop percentages and vector deltas. The existing effect-score formula is retained for continuity; the new expert weights are provisional and can later be adjusted from clean `preset_effects_v2` evidence without introducing ML.

## Validation

Executed locally:

```bash
node --check /tmp/slf44246/current-action-hint-engine.js
node --check /tmp/slf44246/tactic-preset-direction-policy.js
node --check /tmp/slf44246/strategy-data-task-a-ui-extension.js
node --check /tmp/slf44246/event-tracker.js
node /tmp/slf44246/test-rule-decision.js
node /tmp/slf44246/test-direction-policy.js
```

Smoke scenarios cover early pressure by a stronger side, compact play against a stronger opponent, late lead protection, controlled and emergency chasing, high-bad-action reset, power-drop cooldown, all 11 candidate scores, veto telemetry, removed-preset protection and the no-auto-apply contract.
