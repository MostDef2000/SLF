# Tactic telemetry envelope v1

## Scope

This stage enriches existing match snapshots, finished match results, preset events and preset effects without changing VPS collection names or the existing append APIs.

Tactic application and Coach Hint generation remain manual. The runtime integrity layer observes tactical control changes for telemetry only; it does not apply tactics, start the live parser or refresh recommendations.

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

## Upload triggers

A page visit by itself does not upload tactical telemetry.

Records are produced by explicit or observed events:

- pressing `Подсказка` builds a current snapshot and uploads a deduplicated own-match snapshot;
- applying a preset through the existing manual control creates a preset event;
- changing an owned-match tactical radio or checkbox creates one debounced `manual_change` event;
- reaching the target generation window after a pending change can create a preset effect;
- pressing `Спарсить завершённый` uploads a match result only when the parsed status is `finished`;
- an explicitly running live parser may upload generation-window snapshots and effects.

Foreign-match analysis does not upload manual-change telemetry.

## Transition tracking

A transition is recorded whenever the normalized tactic fingerprint changes for the current `gameId`. The in-memory timeline is capped at 40 entries and is included in finished-match payloads.

The timeline is observation-based rather than a continuous browser event log. A transition becomes visible when a snapshot is built. The runtime layer normalizes transition sources to stable values:

- `manual_change`;
- `preset_apply`;
- `snapshot_observation`;
- `snapshot_upload`;
- `finished_result`;
- `live_state`.

Repeated builds with the same tactic fingerprint do not create additional transitions.

## Manual tactical changes

The manual watcher:

- runs only on owned `/game.php` matches;
- waits for match ownership and tactical controls to become available;
- groups related control events with a debounce;
- respects the existing preset-application suppression window;
- creates an additive `preset_event` with type `manual_change`;
- stores the event as the pending baseline for a later effect;
- does not freeze or rebuild the recommendation UI;
- does not click or modify any tactical control.

Preset application remains handled by the existing preset event flow and is not duplicated as a manual-change event.

## Pending effect reliability

`EventTracker.buildPresetEffect()` consumes the pending event when an eligible later snapshot is reached. The runtime integrity layer retains a non-serialized reference to that pending event while the effect POST is in flight.

If the POST fails and no newer event has replaced it, the pending event is restored and persisted for a later retry. Successful POSTs leave it consumed. Server-side `effectKey` idempotency prevents a retry from creating a duplicate effect if the first response was lost after storage.

Pending events remain scoped by `gameId`; they must not be applied to another match.

## Finished-result integrity

`SnapshotEngine.sendMatchResult()` rejects snapshots whose status is not `finished`. The guard is inside the runtime method, so callers cannot bypass it by invoking the method outside the current UI button.

The VPS also deduplicates finished results by `resultKey`.

## Compatibility

- Existing VPS collection names are unchanged.
- Existing snapshot/result/event fields remain present.
- `schemaVersion` remains 3 for enriched preset events and effects.
- Match snapshots and finished results receive the additive `tacticTelemetry` field.
- The integrity layer is a separately registered runtime module in `bundle-order.json`.
- Tactic application remains manual.
- Automatic policy mutation remains prohibited.

## Evaluation use

The VPS can evaluate:

- performance by exact tactic snapshot rather than name alone;
- outcomes by risk appetite;
- recommendation versus applied tactic;
- effects before and after preset and manual switches;
- exploration outcomes separately from normal recommendations;
- lead protection, comeback and pressing-cost performance by tactical phase.
