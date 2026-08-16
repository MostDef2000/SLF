# Tactic telemetry envelope v2

## Purpose

Telemetry v2 makes the tactical phase the canonical attribution unit while preserving the existing VPS collections. A match is represented as a durable session containing ordered tactical phases and one finished outcome. The runtime remains read-only with respect to the game: it observes tactics and match state but never applies a tactic automatically.

## Runtime capture

Only owned `/game.php` matches are eligible for automatic writes. The runtime creates one initial snapshot and then captures bounded snapshots on generation-window changes, tactical changes, score-state changes and match finish. Foreign matches remain read-only and do not upload telemetry.

Automatic tactical snapshots post directly to `match_snapshots_v2` and explicitly do not fan out `player_observations`. Existing manual player-observation flows remain separate.

## Durable phase state

Browser state is stored under `slf_manual_match_state_v2:<gameId>`. It migrates the previous manual state, retains the current open tactical phase and uses a bounded outbox for failed telemetry posts. Phase identity is deterministic from game, phase sequence and tactic fingerprint, so retries and reload recovery do not create a new logical phase.

A phase closes when the tactic changes or the match finishes. Short or incomplete phases are stored for audit but marked ineligible for ranking instead of disappearing.

## Common context

New records carry `slf_telemetry_context_v2` where the source snapshot permits it. The context includes game/session identity, script and generator provenance, library/recommendation metadata, risk appetite, owned-team score state, home/away, strength gap, preset identity, tactic fingerprint and completeness metadata. Missing generator provenance is recorded as `unknown`; it is never guessed.

## Compact event/effect transport

Preset events and effects remain in their existing collections but schema-v4 transport removes duplicated full before/after snapshots. They retain compact phase start/end summaries, correlation identity, decision metadata and measured deltas. Full match snapshots remain in `match_snapshots_v2`.

## Reliability

Failed telemetry writes enter the bounded per-match outbox and are retried in order. Existing deterministic result/effect keys and new deterministic phase keys preserve idempotency. Finished-match submission remains guarded so a live match cannot be uploaded as a result.

## Evaluation boundary

Telemetry collection does not alter preset values, recommendation scoring, risk-appetite defaults or tactic application. Tactical policy changes remain a separate human-approved task after telemetry quality is sufficient.
