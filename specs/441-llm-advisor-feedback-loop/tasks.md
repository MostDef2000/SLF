# Tasks — LLM advisor Ф2 (#441)

Issue: #441. Branch: `feat/441-llm-first-button` (Ф2a).

## Ф2a — self-sufficient button + one-click apply

- [ ] Explore: map current wiring (LLM button, manual hint flow, snapshot, apply bridge, telemetry path) with file:line evidence.
- [ ] `src/modules/strategy-data-recommendations/llm-second-opinion.js`: self-sufficient payload entry (internal `ruleDecision`, no snapshot dependency).
- [ ] UI wiring: LLM button → new entry; «↻ Подсказка» hidden; «Применить» on answer → `applyPresetAsync` + apply event with `adviceId`.
- [ ] `vps/api/`: `adviceId` in advisor response; apply-event recording (token-gated, stdlib-only).
- [ ] Tests: node (payload without snapshot, apply-by-click, honest failure) + pytest (`adviceId`, apply event); existing suites green.
- [ ] PR → green CI → merge → release (`src`) + deploy (`vps/api`) → live probe.

## Ф2b — server-side context enrichment

- [ ] (not started)

## Ф2c — automatic feedback loop

- [ ] (not started)

## Acceptance traceability

| spec NFR | task | evidence |
|---|---|---|
| Self-sufficiency | Ф2a | node test: payload without snapshot |
| Apply-by-click | Ф2a | node test: click→apply, no auto path |
| Apply telemetry | Ф2a | pytest: apply event keyed by `adviceId` |
| Enrichment budget | Ф2b | pytest: prompt cap |
| Feedback correctness | Ф2c | pytest: per-game linking |

## Definition of Done

All Ф2a boxes checked with observed evidence; release + deploy verified; live probe; JOURNAL entry.
