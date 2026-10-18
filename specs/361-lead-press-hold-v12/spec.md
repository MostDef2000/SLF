# SLF Tactical Suite v12 — lead-press-hold preset + protect_lead gate (#361)

**Status:** owner-authorized via Issue #361. Bounded implementation order executed on branch `feat/361-lead-press-hold-v12` from base `main@424cf13`. Authorizing evidence: Issue https://github.com/MostDef2000/SLF/issues/361 (match 33985459, hypothesis H-PH-01, Dave wiki «Игра по счёту» §1/§2, «Тактика: оборона» §Интенсивность).

## Goal and user-visible behaviour

Leading by one goal against an opponent pressing above plan (their press vector ≥ +20%) must not force a deep block. Match 33985459: at 1:0 around 72' the only recommended lead options were deep blocks (`Simeone_CompactLead_v11` scored 78 in `protect_lead`), the team conceded territory, conceded via set plays ("illogical" equalizer at 85'), and only recovered after manually restoring aggression at 87'.

v12 adds a thirteenth tactical mode and three policy gates:

1. **`Flick_LeadPressHold_v12`** (Hansi Flick — real trainer) — a pressing lead option. Fixed 4-2-3-1 (RW/RM), vector `def_line 2, press_line 2, def_width 2, press_intense 3, build_type 2, build_temp 1, build_long 2, build_fast 2, style 3, pass_risk 2, dribble 2, cross 2, corner 1, shot 2, priority []`. Registered in every registry surface: `ACTIVE_PRESET_NAMES`, `PRESETS`, `LABELS` ('Hansi Flick — Lead Press Hold'), `FORMATIONS`, `DISPLAY_META` (trainer 'Flick', style '3', suffix '_neutr'; `DISPLAY_ORDER` derives), `META` (group 'defensive', role 'lead_press_hold', honest Russian use/risk), `TRAITS` (requires `lead_one_goal`+`opponent_press_vector_high`, avoids `transition_threat`+`high_bad_actions`), `ROLE_CONTRACTS` (primarySituation `lead_press_hold`, allowedSituations `['protect_lead']`, riskClass 'medium_high'), `SCHEME_STATES`/`PRESET_SCHEME_STATE` (`lead_press_hold_4231`), `LADDERS.defensive` between Allegri_LeadOutlet_v11 and Simeone_CompactLead_v11, `AUDIT.conditional`, `situations` export (+`lead_press_hold`).
2. **New situation `lead_press_hold`** with priors `Flick 80 / Allegri_LeadOutlet_v11 45 / Simeone_CompactLead_v11 35 / Emery_BalancedBase_v11 30`; classified when `winning && 60 ≤ minute ≤ 85 && opponentPressVector ≥ 20`.
3. **Veto (a)** — Flick is recommended only inside that exact window/vector/lead-state; outside it the gate fires.
4. **Veto (b)** — `Simeone_CompactLead_v11` is gated against an opponent pressing above plan: deep blocks concede territory and set-play chances (wiki §2). Carve-outs honored (see correct-course below).
5. **Veto (c) dribble guard** — in `lead_press_hold`, `protect_lead`, `protect_lead_with_outlet` presets with `dribble ≤ 1` are never recommended (ball retention is a precondition of lead management; wiki «Фолы»: do not let the opponent midfield control the ball). Consequence: Allegri (dribble 1) and Simeone (dribble 1) drop out of lead situations; `Emery_BalancedBase_v11` (dribble 2) carries `protect_lead*` until Flick's window opens.
6. **Named-trainer invariant** — every preset in the recommendation set carries a real trainer in `LABELS`/`DISPLAY_META`. Verified by test; see deviation note below for `standard`.
7. `SUITE_VERSION` → `slf_tactic_suite_561_v12`; `fallbackPolicy` → `5.61-tactical-suite-v12-hold-current`; policy `VERSION` → `5.61-tactical-suite-v12.0`; `EXPECTED_SUITE` guard bumped so a stale v11 registry can never install a mixed stack.

`opponentPressVector` sourcing: the match page's opponent pressing vector (`press_height` → `pressVector`, `match-stats-parser.js`) flows through `cah-runtime-context.js` as `moment.context.oppPressVector` (alias `oppPress` from the coach-hint snapshot layer) into the policy's `engine.run` merge. `normalizedContext` maps `context.opponentPressVector ?? context.oppPressVector ?? context.oppPress ?? 0`. No caller edits required.

## Correct-course notes (deviations decided during implementation)

- **Veto (b) formulation.** The original wording was "Simeone blocked **in protect_lead**". Because `hardVeto` recomputes the situation via `classify()` internally, and the trigger window now classifies as `lead_press_hold`, a literal `situation === 'protect_lead'` guard would be dead code. Implemented against the trigger itself (situation-agnostic), refined with the Issue #361 carve-outs: the gate does **not** fire after 85', at a 2+ goal lead (`scoreDiff ≥ 2`), or in `emergency_lock` (Simeone remains fully valid there, per its role contract).
- **Intensity logic (Issue scope 4) — not implemented.** The "remove static winning-state `press_intense` 3→2 delta" requirement has **no referent in code**: a full `src/` search found no winning-state press-intensity lowering and no dynamic-intensity/`edge_overrides` mechanism (the only `press_intense` delta is `lateDelta {press_intense:1}` in `dave56-etalon-data.js` s4 — a losing-state *increase*, different module, different semantics). No precedent exists to follow ("Simeone win-mode" mechanism does not exist). Situational intensity is achieved structurally: `press_cooldown` classification on fatigue takes precedence over `lead_press_hold`, and veto (a) confines Flick. **Deferred**: an explicit intensity-override subsystem would be new machinery with no consumer; proposed as a follow-up issue if the owner wants in-match intensity staging.
- **`standard` preset (smaller-diff option).** `standard` (label «Стандартная 4-2-3-1_att1», `DISPLAY_META.trainer = ''`) does **not** participate in recommendations: it is absent from `ACTIVE_PRESET_NAMES`/`registry.active`, and the policy ranks `registry.active` only. Keeping behavior and documenting the exclusion (code comment + invariant test) is the smaller diff; assigning a real trainer is deferred until `standard` ever joins the recommendation set. A fake trainer name was explicitly rejected.

## NFR assessment

- **Reliability:** 13/13 active presets with valid native 14-control vectors (inventory tool invariant + diversity test frozen-vector table); policy installs only on the v12 suite identity; hold_current contract unchanged (no implicit fallbacks).
- **Performance:** O(1) additions to `classify`/`hardVeto`; `opponentPressVector` is a single field coalesce.
- **Security/privacy:** no new inputs beyond existing match-page stats; no network, no secrets, no auto-apply (apply-by-user only, unchanged).
- **Telemetry integrity:** `libraryVersion` stamps carry `slf_tactic_suite_561_v12`; `recommendationSchema` intentionally unchanged (`slf_rule_decision_v11_tactical_suite`) — decision schema shape did not change.
- **Verdict:** PASS with documented deviations above.

## Risk profile (summary; details in plan.md)

Highest-risk change is the dribble guard's blast radius: it re-ranks both existing lead situations (Allegri/Simeone → Emery). Accepted per Issue #361 scope item 3; runtime validation via the diversity scenarios and the new dedicated test. CI-orbit files updated in lockstep (inventory tool + JSON, four tool tests) without weakening assertions.

## Exclusions

Game generator, real match data, `releases/**`, `CHANGELOG.md`, `contracts/**`, `.github/**`, formation/lineup changes, automatic preset application, retrospective snapshot analysis.
