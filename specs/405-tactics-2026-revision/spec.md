# Spec — Tactics 2026 revision (issue #405)

Status: approved scope (owner `commit approved` 2026-11-09). Base: main `193172e`.
Canonical issue: #405. Evidence inputs: corpus C1–C396 (`vps/exporter-rag/forum_official_claims.json`), 453 posts of 2026, analysis report `.tmp`-era (worker3) + validator verdict (accept_with_conditions).

## Problem

Owner asked to revise tactics presets and experiment/hint logic against 2026 forum data. Analysis of 278 tactics-relevant claims (240 dated 2026) shows: **no claim establishes an exact optimal value for any of the 15 vector fields of any of the 13 active presets.** Claims establish mechanics semantics and directional advice. The preset-retune evidence gate (≥60 eligible linked phases across ≥5 presets) is unmet (41 linked, `readyForRetune=false`).

## Decision

The «full revision of all 13 preset vectors» is an **evidence-map revision**:

- R1. Numeric vector values: **retain all**, each cell recorded as `unchanged, not validated` with per-field rationale and claim citations. The revision output is the 13×15 matrix, not new numbers.
- R2. Semantic/engine fixes where code interpretation contradicts 2026 mechanics (each fix cites its claim):
  - high press presets (`press_intense>=3`) must require ПИ role coverage in entry conditions / explanations (C324, C379: ПИ works for CD2 only in a CD triple, not for a CD pair);
  - `cross` field semantics = aerial crosses only (C323); ground crosses are driven by острота/центр/диагонали (C316, C326);
  - center attack priority must not be described or scored as a dribble control (C316);
  - anchor-player reasoning must not appear as current mechanics (C313, conflict C28 registered — do not resolve);
  - user-facing wording must not present «контроль хаоса» as an existing mechanism (C335, C173; conflicts stay registered).
- R3. P04 experiment population in `tactical-lab-v1.js`: genomes from the hypothesis table (press roles/fitness cost C324/C329; transition exposure C325; aerial vs ground crosses C323; center priority vs dribbling C316/C326; application timing C1/C234). Switch **after P03**; in-flight P03 assignments stay pinned until completed; legacy genomes remain resolvable; late-event attribution preserved; transition covered by tests before switch.
- R4. Knowledge pack: tactical cases for the 2026 gap topics; schema extension (if needed) must fail closed on unsupported conditions, preserve +3 / non-stacking / ±5 clamp / no auto-apply (spec 381 contract intact).
- R5. Retired presets stay retired (ChaosPress, Compact_Counter_def3). Registered corpus conflicts are reported, never resolved. Forward claims are context, never proof.

## Non-goals

- No numeric retuning of preset vectors.
- No behavior change to `preset-fit-scoring.js` chaos heuristic without a traceable quote contradicting it (validator condition 3: separate demonstrated contradictions from speculative heuristic cleanup).
- No changes to C1–C169 corpus bytes; no conflict resolution.

## Acceptance

1. `docs/audit/preset-vector-revision-2026-11.md` contains the full 13×15 matrix: current value, relevant claims (id + year), semantic compatibility, directional evidence, decision (retain/change/defer), rationale. Retained numbers labeled `unchanged, not validated`.
2. Owner-visible before/after summary of actual improvements, each backed by an executable acceptance case (test file) — case titles alone are insufficient.
3. P03→P04 transition tests pass: reload, active assignment pinning, completed-state preservation, attribution integrity.
4. Seam contract tests still pass: +3, non-stacking, ±5 clamp, fail-closed loader, no auto-apply.
5. Real lint/typecheck/test/build green; independent review on the diff.

## Contours

- Userscript (`src/**`): this PR → `release` → `build-latest-release.yml` artifacts.
- Exporter pack content (`vps/exporter-rag/**`): separate PR + exporter-rag deploy lane (same approved chain).
