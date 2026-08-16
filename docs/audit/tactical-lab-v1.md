# Tactical Lab v1

## Purpose

Tactical Lab treats the SLF match engine as a changing black box. RAG, generator notes and football interpretation are priors for constructing experiments, not ground truth. The evidence source is real match telemetry.

The feature deliberately keeps two independent decision layers:

- **Production Advisor** continues to recommend one tactic from Tactical Suite v7 using the normal production logic.
- **Tactical Lab** assigns one blind experimental challenger for the owned match.

An experiment never enters the production preset registry, production dropdown or production recommendation candidate set.

## Match UI

On an owned live `/game.php` match the Tactical Lab card is available beside the normal match controls. It shows only the experiment ID and population identity before activation. Controls, formation, origin, parent and prior results remain hidden while the match is live.

The challenger has no activation minute window. The user may apply it at any point in the match and after any production or manual tactic. The exact minute and preceding tactic are evidence, not eligibility gates.

One explicit click applies the experimental tactic controls, applies its formation and invokes the page's native lineup save action. There is no background experimental auto-apply. The Production Advisor remains live while the experiment is active.

Tactical Lab v1 permits one successful experimental activation per match. After exit, the card records the tested interval instead of offering a second activation. A new challenger is assigned in the next match.

## Population P01

`slf_tactical_lab_561_p01` contains 64 deterministic immutable genomes:

- 16 mutations around current production tactics;
- 16 orthogonal combinations intended to cover distant parameter regions;
- 16 deterministic pseudo-random combinations;
- 16 extreme combinations intentionally unconstrained by football aesthetics.

The population is generated deterministically in the userscript. Experiment IDs and fingerprints are immutable for P01. Reloading a match cannot reroll its assignment.

P01 is a data-collection population, not a claim that any experiment is good.

## Assignment

Each owned match receives one deterministic assignment derived from the match identity and population version. The assignment is stored as an additive `tacticalLab` field inside the existing durable manual-match envelope so page reloads recover the same experiment.

The assignment is carried by the normal bounded match snapshot stream instead of forcing an extra snapshot at page mount. Activation and exit use explicit lifecycle records. A match where the challenger is offered but never activated therefore remains visible through the normal snapshot/final-result state, but it is not counted as a tactical result for that genome.

## Entry attribution

When the user activates the experiment, telemetry captures the actual entry context, including where available:

- exact minute and generation bucket;
- owned-team score state and score difference;
- home/away and strength gap;
- preceding preset identity or manual tactic fingerprint;
- observed preceding transition/phase sequence and duration;
- pressure/attack-need/fatigue-quality context exposed by the current recommendation decision;
- the Production Advisor recommendation, runner-up, margin and confidence at entry.

This is intentionally context-first. Tactical Lab does not label a genome as an opener, chase tactic or protect-lead tactic in advance. Those roles may be discovered later from observed cohorts.

## Exit attribution

The experimental phase closes when the user selects a production tactic, manually changes tactic controls/formation, or the match finishes. Telemetry stores the exit minute, duration, next tactic/source, production recommendation at exit and available phase metric deltas.

The same experiment may therefore later be evaluated separately as an opener, as a transition after a named production tactic, or as a situational exploit.

## Transport and durability

Tactical Lab v1 does not introduce a new raw VPS collection or a hidden API dependency. The current assignment state is attached to ordinary `match_snapshots_v2` records and to the finished `match_results_v2` record. Activation and exit are transported as tagged `match_snapshots_v2` lifecycle records.

Tagged lifecycle snapshot keys are extended with a deterministic Tactical Lab event key, so activation and exit in the same generation window remain distinct and retries stay idempotent. Lab lifecycle snapshots explicitly bypass the player-observation fanout. Ordinary match snapshots keep their existing behavior.

The finished result carries the durable Tactical Lab match state. This is the terminal fallback that records whether the challenger was merely offered, activated, or completed even if an earlier lifecycle snapshot had to remain queued while the API was unavailable.

Production `preset_events_v2` / `preset_effects_v2` remain unchanged and can still be correlated with the Tactical Lab entry/exit context. Tactical Lab does not overload production preset identity with `EXP-*` records.

Failed activation/exit lifecycle writes are retained in a small bounded per-match outbox inside the existing manual-match envelope and retried through `SnapshotEngine.sendSnapshot()` rather than calling the API transport directly.

The existing manual-match storage schema name is not migrated by Tactical Lab v1. `tacticalLab` is an additive field in that existing state, and the runtime preserves that field when normal manual-match persistence runs.

## Safety boundary

Tactical Lab v1 does not:

- automatically activate a challenger without a user click;
- let the Production Advisor recommend an `EXP-*` identity;
- automatically promote an experiment into production;
- mutate or generate a next population from live results;
- infer that a football-plausible tactic is superior;
- create a large experiment selector in the match UI.

Evolution, confidence-aware ranking, engine-epoch drift detection, LAB/CHALLENGER/CHAMPION promotion and automatic next-generation creation are deferred to GitHub issue #252 after sufficient real evidence is collected.
