# Tactical Lab v1

## Purpose

Tactical Lab treats the SLF match engine as a changing black box. RAG, generator notes and football interpretation are priors for constructing experiments, not ground truth. The evidence source is real match telemetry.

The feature deliberately keeps two independent decision layers:

- **Production Advisor** continues to recommend one tactic from Tactical Suite v7 using the normal production logic.
- **Tactical Lab** assigns one blind experimental challenger for the owned match.

An experiment never enters the production preset registry, production dropdown or production recommendation candidate set.

## Match UI

On an owned live `/game.php` match Tactical Lab is rendered inside the existing SLF Parser recommendation surface, directly under the normal production hint. It is visually secondary to the Production Advisor and is not a separate card beside lineup or preset controls.

Before activation it shows only the experiment ID and population identity. Experimental control values, origin, parent and prior results remain hidden while the match is live.

The challenger has no activation minute window. The user may apply it at any point in the match and after any production or manual tactic. The exact minute and preceding tactic are evidence, not eligibility gates.

One explicit click applies only the experimental tactical controls. Tactical Lab v1 does not move players, change formation slots, invoke lineup preview logic or invoke the native lineup save action. Formation experimentation is a separate problem and is outside this runtime.

There is no background experimental auto-apply and no Tactical Lab polling or monitoring loop after activation. Once the controls are applied and activation telemetry is queued, the Lab remains idle until an explicit user checkpoint: `↻ Подсказка`, selection of a production preset, or `Спарсить завершённый`. The active UI therefore shows the application minute but does not continuously recompute exposure from background snapshots.

Tactical Lab v1 permits one successful experimental activation per match. A control application that cannot be verified against the native page controls is reported as a failure and does not count as activation. After a successful experiment exits, the embedded Lab row records the tested interval instead of offering a second activation. A new challenger is assigned in the next match.

## Population P02

`slf_tactical_lab_561_p02` contains 64 deterministic immutable controls-only genomes:

- 16 mutations around normalized current production tactics;
- 16 orthogonal combinations intended to cover distant parameter regions;
- 16 deterministic pseudo-random combinations;
- 16 extreme combinations across the valid native control boundaries.

P02 supersedes `slf_tactical_lab_561_p01`. P01 could generate values outside the current FM2026 native control domains and coupled the experiment identity/application to formation changes. Existing P01 telemetry remains historical evidence; an in-progress P01 assignment may be replaced by the deterministic P02 assignment for that match.

P02 control domains are restricted to values that exist in the current FM2026 tactic UI:

- `def_line`, `press_line`, `def_width`: `1..3`;
- `press_intense`: `1..5`;
- `build_type`, `build_temp`, `build_long`, `build_fast`: `1..3`;
- `style`, `pass_risk`, `dribble`: `1..5`;
- `cross`: `1..3`;
- `corner`: `1..2`;
- `shot`: `1..3`;
- `priority`: any subset of `left`, `center`, `right`.

Production seeds are normalized into these domains before mutation so a seed cannot silently carry an unsupported legacy value into P02.

The population is generated deterministically in the userscript. Experiment IDs and fingerprints are immutable for P02. Reloading a match cannot reroll its assignment while the population version remains P02.

P02 is a data-collection population, not a claim that any experiment is good.

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

## Explicit checkpoints and exit attribution

Tactical Lab v1 is checkpoint-driven. It does not inspect the active experiment every second and it does not build background Lab snapshots merely to detect a change.

The explicit checkpoints are:

- `↻ Подсказка`: build the user-requested current snapshot, compare the current tactical controls with the active experimental genome, close the experiment if the controls no longer match, and then render the new Production Advisor recommendation. The Lab row is remounted inside the refreshed recommendation surface.
- production preset selection: close the active experiment immediately using the pre-apply snapshot, then apply the chosen production preset.
- `Спарсить завершённый`: use the user-requested finished snapshot as the terminal checkpoint. If the experimental controls still match, close with `match_finished`; if they no longer match, close as a control change observed at the finished checkpoint before sending the result.

A manual tactical control change by itself does not start a Tactical Lab timer, polling loop or background snapshot. If the user changes controls and does nothing else, the Lab remains idle; that divergence is observed at the next explicit checkpoint. Consequently, for such a manual divergence the recorded exit minute is the checkpoint observation minute, not an inferred hidden change time. This is deliberate: v1 records only evidence it actually observes.

Telemetry stores the exit minute, duration, next tactic/source, production recommendation at exit and available phase metric deltas.

The same experiment may therefore later be evaluated separately as an opener, as a transition after a named production tactic, or as a situational exploit.

## Transport and durability

Tactical Lab v1 does not introduce a new raw VPS collection or a hidden API dependency. The current assignment state is attached to ordinary `match_snapshots_v2` records and to the finished `match_results_v2` record. Activation and exit are transported as tagged `match_snapshots_v2` lifecycle records.

Tagged lifecycle snapshot keys are extended with a deterministic Tactical Lab event key, so activation and exit in the same generation window remain distinct and retries stay idempotent. Lab lifecycle snapshots explicitly bypass the player-observation fanout. Ordinary match snapshots keep their existing behavior.

The finished result carries the durable Tactical Lab match state. This is the terminal fallback that records whether the challenger was merely offered, activated, or completed even if an earlier lifecycle snapshot had to remain queued while the API was unavailable.

Production `preset_events_v2` / `preset_effects_v2` remain unchanged and can still be correlated with the Tactical Lab entry/exit context. Tactical Lab does not overload production preset identity with `EXP-*` records.

Failed activation/exit lifecycle writes are retained in a small bounded per-match outbox inside the existing manual-match envelope and retried through `SnapshotEngine.sendSnapshot()` from explicit Lab lifecycle/checkpoint work rather than from a recurring Tactical Lab monitor.

The existing manual-match storage schema name is not migrated by Tactical Lab v1. `tacticalLab` is an additive field in that existing state, and the runtime preserves that field when normal manual-match persistence runs.

## Safety boundary

Tactical Lab v1 does not:

- automatically activate a challenger without a user click;
- poll or monitor an active experiment in the background;
- let the Production Advisor recommend an `EXP-*` identity;
- move players, apply an experimental formation or save a lineup;
- let unsupported control values count as a successful activation;
- automatically promote an experiment into production;
- mutate or generate a next population from live results;
- infer that a football-plausible tactic is superior;
- create a large experiment selector in the match UI.

Evolution, confidence-aware ranking, engine-epoch drift detection, LAB/CHALLENGER/CHAMPION promotion and automatic next-generation creation are deferred to GitHub issue #252 after sufficient real evidence is collected.
