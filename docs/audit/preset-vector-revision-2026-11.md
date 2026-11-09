# Preset vector revision — evidence map (2026-11, issue #405)

Scope: the 13 active presets of `slf_tactic_suite_561_v12` × 15 vector fields.
Inputs: corpus C1–C396 (`vps/exporter-rag/forum_official_claims.json`), 453 posts of 2026;
evidence digest (278 tactics-relevant lines) + worker3 report (`.tmp`-era analysis, 2026-11-09).
Spec: `specs/405-tactics-2026-revision/spec.md` (R1/R2). Base: main `193172e`, work branch `tactics/2026-revision-405`.

## §1 Method and authority rules

- **Truth sources.** Dave and Eywa posts are treated as mechanics truth (developer/engine authorship).
  z1s quotes are taken as-is (experienced player, not authority). Forward posts are **context only, never
  proof** — they may motivate a question, never a value.
- **Evidence class.** Only 2026-dated quotes establish current mechanics. 240 of 396 digest claims are
  dated 2026; prior-era statements are context only and never override a 2026 quote.
- **Conflicts are registered, never resolved** (spec R5). Where two authority sources disagree, both are
  recorded (§6) and the preset keeps its current value.
- **Decision rule per cell.** A numeric value changes only if a 2026 quote establishes an exact optimum for
  that field. No such quote exists for any of the 195 cells → every cell is `retain`, labeled
  `unchanged, not validated`. Claims establish semantics/conditions (directional advice lives in the claim
  text, not only the quote), not slider optima.
- **Retune gate.** The preset-retune evidence gate (≥60 eligible linked phases across ≥5 presets) is unmet:
  41 linked phases, `readyForRetune=false`. No retune is permitted by evidence volume alone.

## §2 The 13×15 matrix — all cells `retain`

> **All numeric values UNCHANGED, NOT VALIDATED — no 2026 quote establishes an exact optimum; retune gate
> unmet (41/60 linked phases, readyForRetune=false).**

Field order: `def_line, press_line, def_width, press_intense, build_type, build_temp, build_long, build_fast, style, pass_risk, dribble, cross, corner, shot, priority`.
Values below are read from the registry (`src/modules/tactics-presets/active-preset-registry.js`, PRESETS) and verified programmatically against this table (13×15 exact match).

| Preset | Vector (15 fields in order above) | Decision |
|---|---|---|
| Emery_BalancedBase_v11 | 2,2,2,2,2,2,2,2,3,2,2,2,1,2,[] | retain (all cells) |
| Mourinho_CleanCounter_v11 | 1,2,2,2,1,3,3,3,3,2,2,2,1,2,[] | retain (all cells) |
| Guardiola_PressEscape_v11 | 2,2,2,2,2,1,1,2,3,2,1,1,1,2,[] | retain (all cells) |
| Arteta_SafePossession_v11 | 2,2,2,2,2,2,1,2,3,2,2,2,1,2,[] | retain (all cells) |
| Guardiola_PressCooldown_v11 | 1,2,2,1,1,2,2,2,2,1,1,1,1,1,[] | retain (all cells) |
| Guardiola_ControlledPush_v11 | 2,3,2,3,2,3,2,3,4,3,3,2,1,3,[] | retain (all cells) |
| Guardiola_PositionalSiege_v11 | 3,3,3,4,2,2,2,3,5,4,3,3,1,3,[] | retain (all cells) |
| Conte_WideChannels_v11 | 2,2,3,3,3,2,2,3,4,3,3,3,1,2,[left,right] | retain (all cells) |
| Klopp_LateGegenpress_v11 | 3,3,2,4,3,3,2,3,4,3,3,3,1,3,[] | retain (all cells) |
| Simeone_CompactLead_v11 | 1,2,1,2,1,2,2,2,2,2,1,2,1,1,[] | retain (all cells) |
| Simeone_EmergencyBlock_v11 | 1,1,1,1,1,1,2,1,1,1,1,1,1,1,[] | retain (all cells) |
| Allegri_LeadOutlet_v11 | 2,2,2,1,2,2,2,2,2,1,1,2,1,1,[] | retain (all cells) |
| Flick_LeadPressHold_v12 | 2,2,2,3,2,1,2,2,3,2,2,2,1,2,[] | retain (all cells) |

Per-cell rationale is shared by field group (§3): no 2026 quote establishes an exact optimum for any
field of any preset; mechanics claims establish semantics and conditions only. Per-preset records: §4.

## §3 Shared semantic evidence per field group

- **def_line / press_line** — C329 (2026-01-17): the physical cost of a high line/pressing vs low is large
  («разница между "низким" и "высоким" достигает 50%» — fitness cost up to 50%). C325 (2026-01-16): a
  passed press with an opponent +1 in attack forces defenders into non-optimal decisions — transition
  exposure is structural, not a slider artifact. Directional: high lines/pressing cost fitness and expose
  transitions; no optimum value is established.
- **press_intense** — C324 (2026-01-16): high press must be accompanied by 1–3 ПИ (pressing-player) roles;
  C379 (2026-08-01): with a CD **pair** the ПИ role does not work for any CD (only CD2 in a CD triple).
  Semantics/conditions only — no intensity optimum is established.
- **def_width ≠ attack width** — C313 (2026-01-13): defensive width/compactness semantics changed
  (positional defense, center overlap); attack width is a separate control. Do not equate `def_width`
  with attacking width when reading presets (conflict C313↔C28 registered, unresolved).
- **pass_risk / dribble / priority** — C316 (2026-01-13): «атаки по центру» no longer affects dribbling
  (center = passes, not dribbling). C326 (2026-01-16): bold play (сумма БВ) affects set pieces and
  immediate-aerial set-piece play. C316/C326 together: center priority and pass risk must not be described
  or scored as dribble controls.
- **cross** — C323 (2026-01-14): «навесы в штрафную» affects **aerial crosses only**; ground crosses are
  driven by острота передач / атаки по центру / диагонали. The `cross` field is aerial-only semantics.
- **Execution is probabilistic** — C344 (2026-01-23): obvious situations follow internal player logic,
  borderline situations follow instructions; C237 (2026-11-09): a strong team executes its plan with higher
  probability, never certainty. No slider value guarantees an outcome.
- **Version context** — C223 (2026-10-28): G6 grew out of generator 5.61 — decision model, tactics, roles
  and balance are the same; preset vectors remain the same tactical model across 5.61/G6 cohorts (C223/C30).

## §4 Per-preset records

Numeric values unchanged, not validated; retune gate unmet (41/60 linked) for all 13.

- **Emery_BalancedBase_v11** — baseline. 8 historical effects, underpowered (preset_evidence_tables.json:112-130);
  no 2026 quote touches any field value. Retain all.
- **Mourinho_CleanCounter_v11** — C366 (2026-04-23) bus/counter context: «автобус» plays «на отбой»/counter,
  it cannot hold possession under press. Compatible with the preset's counter-outlet role; no value evidence.
- **Guardiola_PressEscape_v11** — C323 check: `cross=1` is an **aerial**-cross setting; ground crosses are
  острота/центр/диагонали (C316, C326) — the low `cross` value does not conflict with ground-based escape
  play. 2 historical effects, underpowered. Retain all.
- **Arteta_SafePossession_v11** — manual-only diagnostic (three negative matches). C35 (2026-02-17) caveat:
  generator pass accuracy is fixed at ~90% by design, so pass-accuracy reasoning must not be read as a
  slider effect. No value evidence.
- **Guardiola_PressCooldown_v11** — C329 fitness direction supports the cooldown idea (high press costs up
  to 50%); direction consistent, no optimum. 1 historical effect.
- **Guardiola_ControlledPush_v11** — C316: center priority ≠ dribbling (do not read `priority`/`dribble`
  jointly); C324: press_intense=3 requires ПИ roles 1–3 (C379 CD-pair restriction applies). No value evidence.
- **Guardiola_PositionalSiege_v11** — C324 (ПИ roles conditional), C325 (transition exposure after a passed
  press), C329 (fitness cost) all bear on the high press/line profile; none establishes an optimum. Retain.
- **Conte_WideChannels_v11** — C313: width context; do **not** equate attack width with `def_width` (C313).
  C323: `cross=3` is aerial crosses only; ground width play is острота/центр/диагонали. No value evidence.
- **Klopp_LateGegenpress_v11** — C324/C329 conditional mechanics (ПИ roles, fitness cost); 1 historical
  effect. Direction consistent, no optimum. Retain all.
- **Simeone_CompactLead_v11** — C366 context (bus/compact play fixes results, raises randomness role);
  compatible with the lead-holding role. No preset-specific 2026 value evidence.
- **Simeone_EmergencyBlock_v11** — C366: no-freeze context — the block is a temporary emergency state, not
  a result-freeze mechanism; consistent with the preset's emergency_lock role. No value evidence.
- **Allegri_LeadOutlet_v11** — **no 2026 evidence at all**; no change justified. Retain all.
- **Flick_LeadPressHold_v12** — C324 (ПИ roles 1–3 for high press), C329 (fitness cost direction),
  C379 (CD-pair restriction). Conditional mechanics only; no optimum. Retain all.

## §5 Semantic fixes implemented (R2, each cited)

1. **F1 — cross control label** (`strategy-data-task-a-ui-extension.js`, FINAL_CONTROL_LABELS).
   Before: `cross: 'кроссы'`. After: `cross: 'навесы верхом'`. C323: настройка влияет только на верховые
   кроссы. Note: this label renders in the final-merge vector/Δ lines; `tools/test-dave56-etalon-panel.mjs`
   asserts the old label text and needs a companion 2-line update (outside this order's allowed paths —
   flagged to the orchestrator).
2. **F2 — cross advice qualifies aerial vs ground** (`re-plan-engine.js`, open_play_crosses_bad branch).
   Before: developer «Кроссы с игры не работают: …; не усиливать обычные навесы без нового адресата.» /
   control «Атака: не повышать навесы; искать низовой вход, пас между линиями или полупространства.»
   After: «Кроссы с игры не работают: …; проверьте отдельно верховые и низовые; настройка навесов влияет
   только на верховые (C323).» / «Атака: не повышать навесы верхом; низовой вход — острота передач, атаки
   по центру, диагонали (C323).» The `crosses_bad_total` branch is unchanged.
3. **F3 — «хаос» wording** (`re-plan-engine.js`, strings only, no logic): «убрать хаос»→«снизить риск»
   (winning ≥70' baseline), «снижение хаоса»→«снижение риска» (both-channels reset; baseline default).
   C335 (2026-01-20): «нет никакого "контроля хаоса"» — user-facing text must not imply a controllable
   chaos mechanism. Conflicts C335↔C96/C95/C97/C125 stay registered.
4. **F4 — aerial-cross vs width scoring split** (`preset-fit-scoring.js`, `scorePresetCrossFit`).
   Before: `wideOrCross = /cross|wide|wing/ on strengths || build includes 'wide'` → −3 under bad own
   crosses for width traits too. After: the −3 aerial-cross penalty applies only when a strength/trait
   explicitly says cross; width-only traits no longer take it (C323: ground crosses = острота/центр/
   диагонали, not width). The `own_crosses_bad` avoid-bonus (+2) path is unchanged. **Ranking changes by
   design** — covered by tests/test-tactics-2026-semantics.mjs (F4 section).
5. **F5 — 19×5-minute SEGMENTS model** (`match-state-parser.js`, MatchTimingModel). Additive:
   `SEGMENT_MINUTES=5`, `SEGMENT_COUNT=19`, `getSegmentIndex`, `getSegment` (segment 19 = stoppage 91-95);
   `getTargetWindowAfterChange` now also carries `segmentIndex/From/To/Label/Phase/IsStoppage` targeting
   the **next 5-minute segment** (C1: a tactics change shifts the nearest segment; C234: автозамена
   проверяется раз в пятиминутку). Legacy GENERATION_WINDOWS fields, `getWindow`, and
   `getLegacyTenMinuteBucket` are byte-identical to base — historic telemetry is not reinterpreted.
6. **F6 — generationWindowIndex fallback** (`cah-runtime-context.js`). Before: `Math.floor(minute/10)`
   (implied a 10-minute generation bucket). After: fallback derives from the corrected model via
   `MatchTimingModel.getSegmentIndex(minute)` (5-minute segment index; 0 = unknown); snapshot
   `generationWindow.index` stays preferred.
7. **F7 — high-press ПИ note** (`active-preset-registry.js`, user-facing note text only). For presets with
   `press_intense>=3` (Guardiola_ControlledPush_v11, Guardiola_PositionalSiege_v11, Conte_WideChannels_v11,
   Klopp_LateGegenpress_v11, Flick_LeadPressHold_v12) the usage guidance now carries: «Для высокого
   прессинга назначьте 1–3 ПИ; при паре CD роль ПИ у CD не работает (C324, C379)». It flows into
   recommendation reasons via `meta.use`; it is **not** a veto and does not change entry conditions.
   PRESETS numeric vectors untouched (tripwire test asserts all 13×15 values).

## §5b Acceptance cases (executable)

`tests/test-tactics-2026-semantics.mjs` (node, real modules in a vm sandbox):
F1 label lock; F2/F3 wording locks; F4 aerial-vs-width split incl. ranking impact and unchanged avoid-bonus;
F5 segment model (19×5, boundaries, stoppage clamp, contiguity, next-segment target, legacy windows intact);
F6 fallback derivation + snapshot preference + unknown→0; F7 note present for high-press recommendations
(Conte/Flick), absent for low-press (Emery), not a veto; R1 tripwire over all 13×15 vectors.
RED evidence captured before the fixes (F1 assert fail; F4 wide-only −3; F5 SEGMENT_COUNT undefined;
F6 fallback=1; F7 note absent); GREEN after.

## §6 Registered conflicts touching tactics (unresolved)

C173↔C95/C125/C96/C97; C221↔C95; C264↔C95 (Forward, context); C304↔C95/C96/C97/C125 (Forward);
C313↔C28; C314↔C28; C330↔C28; C333↔C9; C335↔C96/C95/C97/C125; C379↔C36.
All remain **unresolved** by design: this revision registers, never resolves. Forward-authored claims
(C264, C304) are context only.

## §7 P04 pointer and retune gate

- **P04** (experiment population in `tactical-lab-v1.js`: genomes from the hypothesis table — press
  roles/fitness C324/C329; transition exposure C325; aerial vs ground crosses C323; center priority vs
  dribbling C316/C326; application timing C1/C234) is a **separate change** on a follow-up order
  (tactical-lab-v1.js is a forbidden path for this order). Design inputs: worker3 report §P04
  (one factor at a time, pre-registered endpoints, game-confirmed linked phases).
- **Retune gate status:** unmet — 41/60 eligible linked phases across the preset set,
  `readyForRetune=false`. Numeric retuning stays blocked until the gate is met; the matrix above records
  every cell as `unchanged, not validated`.
