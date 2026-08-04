# Property, fuzz, mutation, and reliability baseline

This stage extends example-based regression tests with generated cases and selected fault injection.

## Deterministic execution

All generated cases use the seed stored in `data/quality/reliability-budget-v1.json`. A failing run can therefore be reproduced exactly.

Changing the seed does not replace the previous regression evidence. A production defect that depends on a generated case must be preserved as an explicit fixed regression case before the seed changes.

## Property coverage

The telemetry property suite verifies:

- snapshot identity ignores transport timestamps and retry metadata;
- snapshot identity changes with game, status, minute, generation bucket, score, or teams;
- finished-result identity ignores runtime timing but changes with game, score, or teams;
- preset-effect identity is derived from the game and source event key;
- effect identity ignores observation time and measured deltas;
- legacy manual state migrates only to `slf_manual_match_state_v1`;
- legacy-only fields are not copied into active state;
- invalid schema and cross-game migration are rejected.

## Mutation sentinels

Selected mutations are applied to the actual source text and evaluated against the property suite. The baseline requires tests to kill mutations that:

- alter the snapshot key prefix;
- omit minute from snapshot identity;
- omit score from snapshot identity;
- omit score from final-result identity;
- alter the deterministic effect prefix;
- preserve the legacy state schema during migration.

Mutation sentinels are not a replacement for a full mutation-testing platform. They provide merge-blocking evidence for the highest-risk identity and migration guards without introducing a large dependency stack.

## API fuzz coverage

The Python suite generates bounded malformed collection names, JSON values, tactical records, and duplicate patterns. It verifies:

- collection-path confinement exactly matches the server allowlist;
- duplicate filtering agrees with an independent reference model;
- accepted tactical identities remain unique;
- malformed JSON does not produce an internal server failure;
- bounded random valid JSON does not produce a 5xx response;
- authentication secrets do not appear in responses;
- corrupt files are rejected as `CollectionCorruptError`;
- a simulated failure before atomic replacement preserves the previous collection and removes temporary files.

## Reliability budgets

The versioned budget currently limits:

- generated userscript size;
- JavaScript parse time on the CI runner;
- bundle module count;
- static `setInterval` inventory;
- static `MutationObserver` inventory;
- manual watcher installation cadence and maximum attempts;
- minimum number of killed mutation sentinels.

Budgets are upper bounds, not targets. Increasing a budget requires review and a concrete reason. Stable measurements should result in a downward ratchet rather than permanent unused headroom.

## Exclusions

This stage does not claim exhaustive browser fuzzing, complete semantic mutation coverage, or proof against resource-exhaustion attacks. Browser-specific malformed DOM and XSS cases extend the Stage 4 fixture suite. Request-size enforcement and strict tactical-key rejection remain security behaviour changes.
