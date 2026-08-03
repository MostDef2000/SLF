# Manual match state envelope — 2026-08-03

## Purpose

This change extracts the active manual-match persistence contract from the historical live-parser state without deleting the old automatic loop yet.

The current manual workflow needs persisted state for:

- pending preset or manual tactic events;
- effect retry and consumed-event bookkeeping;
- recommendation freeze and preset progression;
- the last rendered recommendation and its metadata.

It does not need the historical interval state, per-bucket suppression or rolling live-segment snapshots.

## New state contract

The active state is stored under:

```text
slf_manual_match_state_v1:<gameId>
```

with schema:

```text
slf_manual_match_state_v1
```

The new payload deliberately excludes:

- `active`;
- `lastSavedBucket`;
- `liveWaitStatus`;
- `liveStartedAt`;
- `liveSegmentSnapshots`.

## Compatibility behavior

During the transition:

1. `loadManualState()` prefers the new key.
2. If the new key does not exist, it reads `slf_live_parser_state_v2:<gameId>`.
3. Valid legacy manual fields are copied into the new envelope on read.
4. The legacy key is not deleted during migration.
5. `persistManualState()` writes the legacy envelope and the new manual envelope.
6. `clearManualState()` clears both keys.
7. The historical `persistLiveState`, `loadLiveState` and `clearLiveState` methods remain as compatibility bridges.

This preserves pending events for users upgrading from an older published userscript and keeps downgrade compatibility during the transition.

## Runtime changes

`manual-match-runtime.js` now exposes:

- `SnapshotEngine.manualMatchState`;
- `SnapshotEngine.persistManualState()`;
- `SnapshotEngine.loadManualState()`;
- `SnapshotEngine.clearManualState()`.

Pending-effect recovery and the active manual tactic watcher use the new method names directly. Other active consumers may continue using the compatibility methods until their own extraction PR.

## Validation

`tools/test-manual-match-state-bridge.mjs` verifies:

- migration from the old key without deletion;
- precedence of the new key over stale legacy data;
- dual writes during the transition;
- preservation of pending-event and recommendation fields;
- exclusion of automatic-loop fields from the new payload;
- clearing both state keys.

The existing manual workflow, runtime integrity, legacy-boundary and reachability tests remain required.

## Non-goals

This PR does not:

- delete `startLive`, `stopLive` or `autoResumeIfNeeded`;
- delete loop-only `STATE` fields;
- rename the `live-parser` directory;
- change recommendation rules or tactical presets;
- change VPS data or API behavior;
- publish or deploy a userscript by itself.

## Next step

After this bridge is merged and published, migrate remaining active callers away from `persistLiveState` and `liveWaitStatus`. The automatic 15-second loop and its state fields can then be removed in a separate PR while retaining legacy-key read fallback for one transition window.
