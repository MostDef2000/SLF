# Plan — Tactical Suite v12 lead-press-hold (#361)

## Risk-based test design

Risk ranking (highest first) and the tests that mitigate each risk:

| # | Risk | Mitigation (test) |
|---|---|---|
| R1 | Dribble guard re-ranks existing lead situations (behavioral blast radius beyond the new preset) | `tools/test-tactical-situation-diversity.mjs` scenarios updated to observed v12 outcomes (`protect_lead` → Emery, `protect_lead_with_outlet` → Emery, new `lead press hold` → Flick); `tests/test-tactic-suite-v12-lead-press-hold.mjs` asserts top picks + dribble reasons per situation |
| R2 | Veto (a) boundary errors (off-by-one on minute/vector) would wrongly enable or suppress Flick | Boundary matrix in the new test: minute 59/60/70/85/86, vector 19/20/33, draw/losing states — asserted against real `hardVeto` output |
| R3 | Veto (b) over-blocking (Simeone must stay valid after 85', at 2+ goal lead, in `emergency_lock`) | Carve-out asserts: gate reason absent at `scoreDiff 2`, at minute 86, in `emergency_lock` (fully un-vetoed there), vs press at/below plan |
| R4 | Registry drift (a registration point missed → broken inventory/dropdown/contracts) | `tools/sync-active-preset-inventory.mjs --check` (13 presets, invariants incl. roleContracts↔presets deep-equal, situation coverage), diversity test count asserts (13/13/13/14/14) |
| R5 | Mixed-stack install (stale v11 registry + v12 policy) | `EXPECTED_SUITE` install-guard bump; fallback-hold test installs policy on a v12-identity stub |
| R6 | Transition graph inconsistency (STEP not mirrored → progression dead ends) | `tools/test-tactic-transition-graph.mjs` static mirror + live `shortestStep` adjacency/non-adjacent/connectivity checks incl. Flick node |
| R7 | Alias/legacy regression (old saved names must keep resolving) | `tools/test-coach-preset-aliases.mjs` (counts 12→13, assertions otherwise unchanged) |
| R8 | Named-trainer invariant silently violated by future presets | Invariant loop over `registry.active` in the new test (non-empty `DISPLAY_META.trainer`), `'standard'` exclusion assert |

All tests assert against the **real** registry/policy loaded in a vm sandbox (no mocks of the code under test); veto assertions check the actual Russian gate-reason strings, so removing any veto makes the corresponding test fail (RED authenticity).

## Correct-course check

- Original order said "add vetoes (a)(b)(c)"; implementation discovered veto (b) as literally specified would be dead code (situation rerouting) → refined to trigger-based with the Issue's own carve-outs; documented in spec.md.
- Original order item 3 (remove winning-state `press_intense` lowering) had no referent in code → reported as finding, deferred; no speculative machinery invented.
- `standard` invariant → smaller-diff option chosen (exclusion documented, no fake trainer).
- CI-orbit updates kept count/string-only; no assertion weakening anywhere (count 12→13, version strings v11→v12, trainer regex extended with `|Flick`, frozen-vector table gained the owner-approved Flick row).

## Verification strategy

`node --check` both modules; full test matrix (see tasks.md DoD); inventory `--write` idempotency re-run; `--check` mode as CI parity; `check-bundle-order.mjs` for bundle integrity. No build of `releases/` artifacts in the work session (generated, git-tracked — CI builds them).
