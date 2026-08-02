# Tactic telemetry envelope v1

## Scope

This stage enriches existing match snapshots, finished match results, preset events and preset effects without changing VPS collection names or the existing append APIs.

## Envelope

Each enriched record may include `tacticTelemetry` with schema `slf_tactic_telemetry_v1`.

The envelope records:

- tactical library version;
- recommendation schema;
- active risk appetite;
- current preset and complete tactic snapshot;
- deterministic tactic fingerprint;
- initial preset and initial tactic;
- ordered tactic transition timeline;
- score, minute and bucket at each transition;
- recommendation attached to each transition;
- full candidate scores and veto reasons;
- controlled exploration metadata;
- active preset identifiers.

## Transition tracking

A transition is recorded whenever the normalized tactic fingerprint changes for the current `gameId`. The in-memory timeline is capped at 40 entries and is included in finished-match payloads.

The tracker observes both saved preset applications and manual tactic changes because every built match snapshot is fingerprinted.

## Compatibility

- Existing VPS collection names are unchanged.
- Existing snapshot/result/event fields remain present.
- `schemaVersion` is raised to 3 only for enriched preset events and effects.
- Match snapshots and finished results receive the additive `tacticTelemetry` field.
- Tactic application remains manual.

## Evaluation use

The VPS can now evaluate:

- performance by exact tactic snapshot rather than name alone;
- outcomes by risk appetite;
- recommendation versus applied tactic;
- effects before and after every switch;
- exploration outcomes separately from normal recommendations;
- lead protection, comeback and pressing-cost performance by tactical phase.
