# Official forum claims C7–C169 → tactical experiment programme — integration audit (2026-11)

Status: analytical reassessment only. Tactical Lab P03 continues unchanged; production remains Tactical Suite v12 (13 modes). This document authorizes **no** winner, no promotion, no retune, no deployment, and no population change. It integrates the 2026-11-08 full-forum claim crawl (C7–C169) into the tactical experiment programme as priors, covariates and research directions.

## 1. Scope and evidence ledger

Evidence cutoff: 2026-11-08. Base: `main@ca545f53127f9a122ca7b423792aa1ffe43aa148`. Claims source: `vps/exporter-rag/forum_official_claims.json` (schema `slf_forum_official_claims_v1`, generated 2026-11-08T19:29:31Z; 169 claims C1–C169). C1–C6 are the pre-existing constraint set and stay in their own box — they are **outside** the 163-claim denominator used throughout this audit.

Four evidence classes are kept separate throughout; nothing below mixes them:

| Class | Examples | Standing |
| --- | --- | --- |
| Repository facts | specs, runtime code, exporter logic | verifiable in-repo at the base SHA |
| Official account-reported claims | C1–C169 (Dave = developer, Eywa = forum admin badge) | priors, not independently verified engine laws (`forum_official_claims.json` → `authorityRule`) |
| Observed aggregates | live export snapshot 2026-11-08T19:42Z fetched from production (see below) | descriptive; no causal reading |
| Analyst hypotheses | P04 sketch (§8), read-through-claims (§6) | require prospective testing |

**Provenance note on the live exports.** The three JSON snapshots cited below were captured by the delivery orchestrator from production on 2026-11-08 (~22:37–22:42 UTC, export timestamps 19:42Z). They are **not repository files**; they are cited as *live export snapshot 2026-11-08T19:42Z fetched from production*, always with JSON field paths. They are not reproducible from this repo and carry no commit identity.

- `tactical_lab_summary` (schema `slf_tactical_lab_summary_v2`, `.generatedAt` 2026-11-08T19:42:07Z) — P03 funnel, per-genome effects and outcome associations.
- `tactical_lab_quality` (schema `slf_tactical_lab_quality_v2`, `.generatedAt` 2026-11-08T19:42:07Z) — context completeness, field availability, decision linkage.
- `preset_evidence_561` (schema `slf_preset_evidence_561_v2`, `.generatedAt` 2026-11-08T19:42:04Z) — retune-gate cohort state.

## 2. Architecture and immutable boundaries

Three modules, three different relationships to the new claims:

| Module | Identity | Relationship to claims C7–C169 |
| --- | --- | --- |
| Production selector | Tactical Suite v12, 13 active modes (`specs/361-lead-press-hold-v12/spec.md:9-17`) | **None at runtime.** Claims never touch vectors, vetoes, ladders or the fallback policy `5.61-tactical-suite-v12-hold-current`. |
| Tactical Lab | P03 `slf_tactical_lab_561_p03`, six genomes, frozen weights (`src/modules/tactics-presets/tactical-lab-v1.js:13-20`) | **Frozen.** P02/P03 genomes are immutable historical seeds (`specs/331-tactical-suite-v10/spec.md:15`); claims are interpretation priors only. |
| Knowledge layer | `slf_tactical_knowledge_pack_v1` seed priors, +3 clamped ±5 (`specs/381-tactical-knowledge-pack-hints/spec.md:10`) | **Seam already active.** Official claims stay in the RAG store with provenance, separate from derived heuristics; pack rules remain labeled hypotheses. |

Analytical lifecycle (unchanged): **assigned → activated → observed → linked → resolved**. An assignment without activation is exposure intent, not evidence; a linked result without a resolvable outcome stays in the unresolved counters (`specs/252-tactical-data-quality/spec.md:18`).

Binding constraints referenced by this audit: exact-attribution fail-closed rules (`specs/380-tactical-attribution/spec.md:10-14`), no historical pooling into v11 readiness (`specs/335-fixed-lineup-v11/spec.md:33`), entry-context recovery and count-only availability diagnostics (`specs/252-tactical-data-quality/spec.md:97-114`), seed-prior seam (`specs/381-tactical-knowledge-pack-hints/spec.md:11`, superseding the noop reservation at `specs/325-tactical-suite-v9/spec.md:30` for labeled seed priors only).

## 3. Claims triage C7–C169

Class definitions (mutually exclusive; counts sum to 163; **NOISE ≠ false** — it means out of scope for the match-generation/tactics domain, not wrong):

- **DIRECT** — maps onto a match-level observable the lab/exporter records or must record, an experimental control/confounder, or a boundary on inference from exported metrics. Carries a full table row.
- **CONTEXT** — informs epoch, scope, applicability or background interpretation, but maps to no current observable or control. Classified explicitly in the appendix; several feed §4.
- **NOISE** — outside the match-generation/experiment domain (economy, bank, scouting, transfers, club infrastructure, product UI). Not adjudicated here.

**Triage counts: DIRECT 31, CONTEXT 18, NOISE 114; total 163.** The 31 DIRECT claims are exactly the candidate list from the integration design; each was re-verified against the claim text and none was reclassified. C97 (chaos-cohort statistics) is explicitly **CONTEXT**, not DIRECT: it is a 2024-08 cohort statistic about control users, with no observable in the current pipeline.

### 3.1 DIRECT table (all 31)

"Epoch" = historical applicability of the claim text; none of these is proof about the current engine. "Prohibited inference" = what must not be concluded from the claim alone.

| ID | Source / date / versionTag | Narrow assertion | Epoch / competition applicability | Experiment implication | Observable field or missingness | Prohibited inference |
| --- | --- | --- | --- | --- | --- | --- |
| C8 | Dave 2019-08-19, generator-5.0 | xG↔result correlation 0.67; three-stage shot resolution; no "1 shot = 1 goal" | G5-era official position; direction carried forward, number not re-asserted for 5.61 | Chance quality and outcome are linked but stochastic; xG deltas cannot be read as score deltas | `phaseEffect.averageDelta.myXG/oppXG` (live export snapshot 2026-11-08T19:42Z fetched from production) | "higher xG must produce a win"; "1 shot = 1 goal" |
| C9 | Dave 2019-08-20, generator-5.0 | Leadership acts only as +5% morale; no other channel | G5-era; morale channel exists, magnitude historical | Lineup leadership is constant under fixed lineups; not a tactic channel | Not exported (no morale/leadership field) | attributing phase deltas to leadership differences |
| C10 | Dave 2020-03-05, generator-5.2 | Match generated episode-by-episode; nothing known in advance | 5.2-era; consistent with C1 (2026) | Within-match phases are dependent observations | Phase deltas within one match | treating phases of one match as independent samples |
| C11 | Dave 2020-03-17, generator-5.2 | Tackles arise naturally; success is zone- and position-dependent | 5.2-era numbers; mechanism direction relevant | Defensive metrics are position-relative; defVector deltas are not tackle counts | `myDefVector/oppDefVector` (displayed readbacks) | reading defVector as tackle volume |
| C13 | Dave 2020-07-03, generator-5.3+ | Junk shots removed; shot distribution rebalanced; center/half-flank play encouraged | 5.3+ era (2020-21 rollout) | Shot-count deltas mix volume and quality; central-access hypotheses need xG balance, not shot counts alone | `myShots/oppShots`, `myXG/oppXG` | "more shots = better" without xG balance |
| C14 | Dave 2020-07-03, generator-5.3 | Skill normalization incl. physics recomputed every 5 in-match minutes; previously players only weakened | 5.3-era change; per-segment recalc assumed ongoing | Within-match power drift is expected; myPower deltas are relative-strength readbacks | `myPower/oppPower` deltas | reading myPower as measured stamina or distance |
| C15 | Dave 2020-07-15, generator-5.3 | Pass-into-box completion = position-choice (ВП) probability; ВП=0 always loses the ball | 5.3-era mechanism | Safe passing and chance creation are different margins; completion ≠ penetration | `myBadActionsPct`, `myXG` | "high completion ⇒ dangerous attack" |
| C18 | Dave 2021-01-20, generator-5.3 | "30% randomness" is a derivative of xG↔outcome correlation; no random-regulator code line | 5.3-era official position; cf. C33 history | No hidden variance knob to exploit; variance is intrinsic | outcome spread across resolved phases | "tuning randomness" as an intervention |
| C19 | Dave 2021-07-09, generator-5.4 | Pressing split into defense-line height + pressing height; tempo split; separate dribbling; new defense width | 5.4+ control model (current UI inherits it) | press/def vectors track two distinct settings; vectors ≠ slider values | `myPressVector/myDefVector` (displayed percentages) | inferring slider values from vector deltas |
| C20 | Dave 2021-07-09, generator-5.4 | 5.4 changelog: penalties only for defender fouls; offside rewritten; playmaker reworked; cross comfort zone narrowed | 5.4-era | Crossing/width mechanics changed historically; width hypotheses must be prospective | `myShots`, xG balance | applying pre-5.4 crossing folklore to 5.61 |
| C22 | Dave 2021-07-27, generator-5.4 | Generator input = 220 profile skills only; no team-strength aggregates; +77 skill ≈ +1 goal difference | 5.4-era official position | Opponent strength enters only via skills; strengthBucket is a proxy covariate | `entryContext.strengthBucket` (live export snapshot 2026-11-08T19:42Z fetched from production) | treating nominal/overall skill as generator input |
| C23 | Dave 2021-08-02, generator-5.4 | xG/score divergence and episodic generation will not change; randomness stable across seasons | 5.4-era official position | xG↔outcome divergence is structural; plan for variance, not against it | resolved W/D/L vs xG deltas | "xG should converge to score" |
| C25 | Dave 2021-11-08, generator-5.4 | No mechanic looks beyond the specific match; no adjustments | 5.4-era official position | Cross-match "momentum/debt" covariates are unfounded | — | streak-based adjustment of expectations |
| C26 | Dave 2022-04-15, generator-5.4 | Matches independent; within a match events slightly depend on each other | 5.4-era official position | Phases are dependent within match; matches independent | phase vs match grouping | pooling phases as i.i.d. samples |
| C27 | Dave 2022-07-06, generator-5.5 | 5.5: pass module rework; personal instruction "pressing player"; corners collective; 541+LB/RB defense reduced; long-shot influence ±10%→±25% | 5.5-era | Press-role and set-piece channels exist; shot-setting sensitivity is material | `myPressVector`, shot metrics | assuming pre-5.5 shot-setting magnitudes |
| C28 | Dave 2022-11-07, n/a (manual) | Anchors: ~30% below match level ⇒ anchor behavior; injured and out-of-position players can become anchors; in KT also degrades team indicators | manual-era; mechanism presumably current | Anchor/injury/out-of-position status is a confounder the export does not record | Unavailable (no anchor/injury field in lab export) | reading power drops as tactic effect when an anchor is plausible |
| C30 | Dave 2026-01-13, generator-5.61 | 5.61 live in KT from early Jan 2026, official matches from 2026-01-12 | Current epoch boundary | Patch epoch is a mandatory covariate for any cross-period comparison | exporter periods `pre_5_61` / `transition_5_61` / `stable_5_61` | mixing pre-5.61 and stable cohorts |
| C31 | Dave 2026-01-19, generator-5.61 | Penalties −40% (not removed); physics influence "quite high" in all worlds | Current | Penalty-dependent outcomes are rarer; fitness channel is material | resolved outcomes; unavailable fitness fields | attributing outcome shifts to penalty rate alone |
| C34 | Dave 2026-01-29, generator-5.61 | Duel success = f(skill ratio), 2.5%/point; 0%/100% combinations exist; RNG decides | Current | Duel-type metrics are skill-ratio driven; RNG tail exists | bad-actions/def vectors (indirect) | reading a single duel outcome as skill proof |
| C35 | Dave 2026-02-17, generator-5.61 | Pass accuracy deliberately 90%; safe play inflates pass stats to 95%+ | Current | Pass completion is gameable by risk-aversion; bad-actions% is the safer execution proxy | `myBadActionsPct` | "90% passing ⇒ bad actions should be ~10%" |
| C36 | Dave 2026-07-30, generator-5.61 | 2026-07-13 patch: new rating model, defender/DM bonuses, regressive action value; form dip "reset" 2026-07-22; red cards back (0.13/game); pressing-player role off for CD1/CD3, kept for CD2 | Current epoch boundary | Second epoch boundary inside 5.61; CD1/CD3 press-role exception matters for fixed-lineup reads | exporter `transition_5_61` window 2026-07-13→07-23 | treating transition-period effects as stable-5.61 evidence |
| C53 | Dave 2021-11-17, n/a | Experience: `exp_impact = 1 + exp/100` (1 exp point = 1% skill) | 2022 reform; standing formula | Experience differences feed skill ⇒ power; fixed lineups hold them constant | Not exported | attributing power deltas to experience under fixed lineups |
| C75 | Dave 2016-11-02, n/a | Physics 2.0: overnight recovery to 100 regardless of endurance; endurance affects only in-match drop | 2016 reform; standing per C31 ("physics influence high") | Fitness/recovery is a real channel; myPower is not its measurement | Unavailable (no fitness/recovery field) | deriving fitness slopes from power deltas |
| C76 | Dave 2016-11-03, n/a | Physics drop linear in distance run: 10 km = 20 points | 2016-era arithmetic | Distance/stamina is unobserved; power deltas cannot recover it | Unavailable | "C76 explains the power drop" — prohibited phrasing |
| C77 | Dave 2016-11-03, n/a | Under-recovery needs 12-13+ km, no pool (+25% recovery), no physio | 2016-era | Infrastructure (pool/physio) is a club-level covariate | Unavailable | comparing clubs without infrastructure covariates |
| C89 | Dave 2016-02-03, n/a | 0.45 form = +1% skill | 2016-era magnitude | Form is a skill-level covariate; not exported per phase | Unavailable | reading form swings into phase deltas |
| C95 | Dave 2024-06-10, n/a | Chaos-control slider works only in KT 2.0 and friendlies; official tournaments and KT FIFA/BLACK unchanged; snake principle; accumulated xG does not feed generation | 2024 scope statement | Competition subtype determines whether a chaos covariate even exists | Competition subtype not exported (unavailable) | assuming chaos effects in championship matches |
| C96 | Dave 2024-06-20, n/a | Chaos control calibrated to 3 slider values; default "moderate" | 2024+ | Chaos setting is coarse (3 values), still a covariate in KT/friendlies | Unavailable | fine-grained chaos attribution |
| C98 | Dave 2024-12-02, n/a | Skills do not affect the snake/RNG — only event success probability | Current | Skill effects route through per-event probabilities, not a separate luck channel | event-level outcomes | "skill shifts the RNG" |
| C125 | Dave 2025-01-10, n/a | Control mode: randomness of crosses/passes/dribbles/offsides −50%, shots (xG→goals) −15-20%, xT influence up; in 2024/2 active in KT, friendlies, я/мы | 2025 scope statement | Quantified chaos covariate — but only where C95's scope applies | Unavailable (mode not exported) | applying control-mode numbers to official matches |
| C152 | Dave 2022-01-17, n/a | Secondary position = no penalty when played there | Current | Secondary-position deployment avoids the position penalty (claim text); relevance to anchor-exception confounds (C28) is an analyst inference, not claim content | Unavailable (lineup positions not in lab export) | penalizing secondary-position deployments in interpretation |

### 3.2 Complete appendix C7–C169

One line per claim; class only (definitions above). C1–C6 are pre-existing constraints, outside this appendix.

| ID | Class | ID | Class | ID | Class | ID | Class |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C7 | CONTEXT | C8 | DIRECT | C9 | DIRECT | C10 | DIRECT |
| C11 | DIRECT | C12 | CONTEXT | C13 | DIRECT | C14 | DIRECT |
| C15 | DIRECT | C16 | CONTEXT | C17 | CONTEXT | C18 | DIRECT |
| C19 | DIRECT | C20 | DIRECT | C21 | CONTEXT | C22 | DIRECT |
| C23 | DIRECT | C24 | CONTEXT | C25 | DIRECT | C26 | DIRECT |
| C27 | DIRECT | C28 | DIRECT | C29 | NOISE | C30 | DIRECT |
| C31 | DIRECT | C32 | CONTEXT | C33 | CONTEXT | C34 | DIRECT |
| C35 | DIRECT | C36 | DIRECT | C37 | NOISE | C38 | NOISE |
| C39 | NOISE | C40 | NOISE | C41 | NOISE | C42 | NOISE |
| C43 | NOISE | C44 | NOISE | C45 | NOISE | C46 | NOISE |
| C47 | NOISE | C48 | NOISE | C49 | NOISE | C50 | NOISE |
| C51 | NOISE | C52 | NOISE | C53 | DIRECT | C54 | NOISE |
| C55 | CONTEXT | C56 | NOISE | C57 | NOISE | C58 | NOISE |
| C59 | NOISE | C60 | NOISE | C61 | NOISE | C62 | NOISE |
| C63 | NOISE | C64 | NOISE | C65 | NOISE | C66 | NOISE |
| C67 | NOISE | C68 | NOISE | C69 | NOISE | C70 | NOISE |
| C71 | NOISE | C72 | NOISE | C73 | NOISE | C74 | NOISE |
| C75 | DIRECT | C76 | DIRECT | C77 | DIRECT | C78 | NOISE |
| C79 | NOISE | C80 | NOISE | C81 | NOISE | C82 | NOISE |
| C83 | NOISE | C84 | NOISE | C85 | NOISE | C86 | NOISE |
| C87 | CONTEXT | C88 | CONTEXT | C89 | DIRECT | C90 | NOISE |
| C91 | NOISE | C92 | NOISE | C93 | NOISE | C94 | NOISE |
| C95 | DIRECT | C96 | DIRECT | C97 | CONTEXT | C98 | DIRECT |
| C99 | NOISE | C100 | NOISE | C101 | NOISE | C102 | NOISE |
| C103 | NOISE | C104 | NOISE | C105 | NOISE | C106 | NOISE |
| C107 | NOISE | C108 | NOISE | C109 | NOISE | C110 | NOISE |
| C111 | NOISE | C112 | NOISE | C113 | NOISE | C114 | NOISE |
| C115 | NOISE | C116 | NOISE | C117 | NOISE | C118 | NOISE |
| C119 | NOISE | C120 | NOISE | C121 | CONTEXT | C122 | NOISE |
| C123 | NOISE | C124 | NOISE | C125 | DIRECT | C126 | NOISE |
| C127 | CONTEXT | C128 | NOISE | C129 | NOISE | C130 | NOISE |
| C131 | CONTEXT | C132 | NOISE | C133 | NOISE | C134 | NOISE |
| C135 | NOISE | C136 | NOISE | C137 | NOISE | C138 | CONTEXT |
| C139 | NOISE | C140 | NOISE | C141 | NOISE | C142 | CONTEXT |
| C143 | NOISE | C144 | NOISE | C145 | NOISE | C146 | NOISE |
| C147 | NOISE | C148 | NOISE | C149 | NOISE | C150 | NOISE |
| C151 | NOISE | C152 | DIRECT | C153 | NOISE | C154 | NOISE |
| C155 | NOISE | C156 | NOISE | C157 | NOISE | C158 | NOISE |
| C159 | NOISE | C160 | NOISE | C161 | NOISE | C162 | NOISE |
| C163 | NOISE | C164 | NOISE | C165 | NOISE | C166 | NOISE |
| C167 | NOISE | C168 | NOISE | C169 | CONTEXT |  |  |

## 4. Epoch and apparent-conflict register

The crawl spans 2008–2026. Three epoch anchors matter for the tactical programme, and they line up with the exporter's own period labels:

| Anchor | Claim | Exporter period (`preset_evidence_561` → `.periods`, live export snapshot 2026-11-08T19:42Z fetched from production) |
| --- | --- | --- |
| 5.61 rollout | C30: KT from early Jan 2026, official matches from 2026-01-12 | `pre_5_61` until 2026-07-13 — historical labels, not a claim that pre-Jan-2026 data is 5.61 |
| 2026-07-13 patch | C36: rating model change, CD1/CD3 press-role off, form dip "reset" 2026-07-22 | `transition_5_61` 2026-07-13 → 2026-07-23; `stable_5_61` from 2026-07-23 |
| Roadmap signal | C169: elevated scoring promised fixed before season 2026/1 (roadmap, no mechanic) | motivates the stable-period split; no scoring rule is derived from it |

- **versionTag semantics.** `versionTag: null` means *unversioned* — the claim carries no generator-version assertion; it is neither current nor obsolete by that field alone. Only `versionTag: generator-5.61` claims (e.g. C30, C31, C34, C35, C36) speak to the current epoch, and even those are account-reported.
- **C95 vs C125 vs C4 (side by side, no synthesis).** C95 (2024-06): chaos slider only in KT 2.0 + friendlies. C125 (2025-01): in season 2024/2 control worked in KT, friendlies and я/мы, with quantified randomness reductions. C4 (2026-11, pre-existing set): same generator in KT as championships/cups, no separate KT randomness mode. These are scope statements made at different times about different surfaces. They are **not** merged into a universal competition rule here; in particular C4 alone does not license pooling KT and championship observations (see §10).
- **C30 vs C36 vs exporter labels.** C30 dates the 5.61 rollout (January 2026); C36 dates the in-epoch 2026-07-13 patch and the 2026-07-22 form reset. The exporter's `pre_5_61` / `transition_5_61` / `stable_5_61` split (`vps/exporter-rag/slf_preset_evidence_561.py:23-24`) encodes the July boundary only; January-2026 data sits inside `pre_5_61` by construction. Both facts are recorded; no label is renamed.
- **C142 vs C1.** C142 (2018 dev blog) describes 18 five-minute sections; C1 (2026-11) states 19 segments. Historical applicability: C1 is the current official description; C142 is retained as history. No reconciliation is attempted.
- **Older documents left unchanged.** This audit does **not** adopt as "current": any pre-crawl doc statement that chaos control applies in official tournaments (C95 scope), that pass accuracy is ~80% (C35: 90% by design), that endurance governs overnight recovery (C75), or that the pressing-player role is active for CD1/CD3 (C36). Those documents are not edited by this audit; the register above is the correction of record.

## 5. P03 inventory and quality funnel

Population `slf_tactical_lab_561_p03`: six genomes, exact repeats of P02 parents, frozen weights (`src/modules/tactics-presets/tactical-lab-v1.js:13-20`). All numbers below are from the live export snapshot 2026-11-08T19:42Z fetched from production (`tactical_lab_summary` → `.summary`, `.experiments[]`; `tactical_lab_quality` → `.counts`, `.coverage`).

Funnel with exact denominators:

| Stage | n | Field path | Note |
| --- | ---: | --- | --- |
| Assignments | 279 | `.counts.assignments` | deterministic per match |
| Activations | 143 | `.counts.activations` | rate 0.5125 (`.coverage.activation`) |
| Completed phases | 136 | `.counts.completedPhases` | 0.951 of activations |
| Linked finished results | 41 | `.counts.linkedFinishedResults` | 0.2867 linkage |
| Resolved outcomes | 41 | `.counts.resolvedFinishedResults` | 100% of linked; 0 unresolved |

Six-genome inventory (outcome association per genome; W/D/L over resolved linked results):

| Genome | Parent (P02) | Weight | Assign / Act / Phases | Resolved W-D-L | ppm | Interpretation ceiling |
| --- | --- | ---: | --- | --- | ---: | --- |
| P03-0001 | EXP-561-P02-0012 | 35% | 71 / 32 / 30 | 5-6-5 (n=16) | 1.312 | descriptive only; n=16 dependent-adjacent matches |
| P03-0002 | EXP-561-P02-0018 | 35% | 59 / 34 / 34 | 6-6-4 (n=16) | 1.500 | descriptive only; no ranking vs 0001 |
| P03-0003 | EXP-561-P02-0040 | 10% | 22 / 10 / 10 | 4-1-0 (n=5) | 2.600 | anecdotal; no winner claim |
| P03-0004 | EXP-561-P02-0058 | 10% | 13 / 1 / 1 | 0-0-1 (n=1) | 0.000 | single observation |
| P03-0005 | EXP-561-P02-0011 | 5% | 7 / 4 / 2 | 1-0-1 (n=2) | 1.500 | negative control, unresolved validity (§10) |
| P03-0006 | EXP-561-P02-0055 | 5% | 12 / 4 / 4 | 0-0-1 (n=1) | 0.000 | negative control, unresolved validity (§10) |

**P02 zero-resolved outcomes = missing evidence, not zero wins.** `.populationVersions` shows `slf_tactical_lab_561_p02: 93` assignments exist, but the P02 experiments carry no resolved outcome rows in this export; the correct statement is that P02 outcome evidence is absent (linkage/resolution never completed), not that P02 genomes performed at zero.

Context completeness (`.coverage`, `.entryContextFieldAvailability`, samples = 143 activations): `entryContextComplete` 0.0 — production recommendation available in only 2 of 143 entries (`productionRecommendationAbsenceReasons.noRuleDecisionRecorded` = 141); `exitContextComplete` 0.1985; `knownPreviousTactic` 1.0; `homeAway` 143/143; `previousPreset` 143/143; `scoreState` 46/143; `minuteBucket` 122/143. Decision linkage (`.decisionLinkage`): 211 total match results, 1 attributed (`usage_tracker`), 210 unattributed, 0 entry contexts with decision linkage; generator version distribution: 192 unknown / 19 "5.61".

## 6. Six P03 read-through-claims cards

In genome-ID order — **not** ranked by points per match. Frozen control vectors below were extracted by executing the repo's own deterministic builder (`src/modules/tactics-presets/tactical-lab-v1.js:34-46,146-196`); they are the normalized 14 controls + priority of each P02 parent. Per-metric sample counts = `phaseEffect.samples`; deltas = `phaseEffect.averageDelta` (live export snapshot 2026-11-08T19:42Z fetched from production). Metric semantics: `myPower` is the match-page team power readback at two snapshots (`src/modules/match-reading/match-stats-parser.js:67`), `myPressVector`/`myDefVector` are displayed `press_height`/`def_height` readbacks (`src/modules/match-reading/match-stats-parser.js:76-77`), `myBadActionsPct` is the `defective` readback (`src/modules/match-reading/match-stats-parser.js:75`); the exporter averages after−before deltas over completed phases (`vps/exporter-rag/slf_tactical_lab_v1.py:386,415-417`).

**Shared interpretation matrix (applies to every card):**

- **xG/shots vs W/D/L (C8, C23, C25, C26):** chance generation and final outcome are linked but stochastic; xG/score divergence is structural by official position. Positive xG deltas with mixed W/D/L are consistent with that position, not diagnostic of tactic quality.
- **Power (C14, C22, C28, C75, C76, C77, C89, C31):** `myPower` is a displayed relative-strength readback, **not** measured stamina or distance. C76's fitness arithmetic (distance → physics points) cannot be derived from power deltas; fitness/recovery is a real but unobserved channel.
- **Bad actions (C35, C98):** safe passing improves completion statistics by design (90% baseline); bad-actions% is a different execution margin. "90% passing means bad actions should be 10%" is a prohibited inference.
- **Press/def vectors (C19, C27, C36):** vectors are displayed line-height readbacks, not slider values; the CD1/CD3 press-role exception (C36) changes role behavior, not the vector semantics.
- **Chance balance vs possession safety (C13, C15, C31, C35):** no "safe passing therefore optimal BoxControl" chain exists; safe progression must be judged by chance balance, not by errors alone.

---

**P03-0001** — parent EXP-561-P02-0012 (Pep_BoxControl_bal2 mutation, distance 0.267), weight 35%.
Frozen vector: `def_line 2, press_line 2, def_width 2, press_intense 2, build_type 1, build_temp 1, build_long 1, build_fast 1, style 3, pass_risk 2, dribble 2, cross 1, corner 1, shot 3, priority [left,right]`.
Samples: phases n=30; resolved outcomes n=16 (5-6-5). Exact exported deltas: `myXG +0.691, oppXG +0.6237, myShots +8.4483, oppShots +7.4828, myPower −6.9333, oppPower −19.8333, myPressVector +7.1667, oppPressVector −7.0333, myDefVector +3.8667, oppDefVector −4.6, myBadActionsPct +2.5517, oppBadActionsPct −2.5172`.
Claim-informed alternative explanations: both sides' xG rise (open game) — consistent with C8/C23 divergence rather than tactic effect; oppPower −19.8 with myPower −6.9 is consistent with an opponent-fitness or anchor confounder (C28/C75), unavailable in the export; strengthBucket skews much_stronger (21/32 entries).
What the observation cannot establish: whether the control vector caused any of the deltas; whether the 5-6-5 record differs from 0002's 6-6-4.
Next observation needed: entry-context recovery (score state, recommendation) and outcome linkage growth before any strata comparison.

**P03-0002** — parent EXP-561-P02-0018 (orthogonal genome), weight 35%.
Frozen vector: `def_line 3, press_line 3, def_width 3, press_intense 2, build_type 3, build_temp 3, build_long 3, build_fast 3, style 2, pass_risk 5, dribble 3, cross 3, corner 1, shot 3, priority [right]`.
Samples: phases n=34; resolved outcomes n=16 (6-6-4). Exact exported deltas: `myXG +0.6779, oppXG +0.6121, myShots +7.875, oppShots +6.4839, myPower −1.0882, oppPower −6.4706, myPressVector +21.8125, oppPressVector −2.9688, myDefVector +21.5938, oppDefVector −3.9688, myBadActionsPct +2.5312, oppBadActionsPct +0.5806`.
Claim-informed alternative explanations: the large press/def vector rises are consistent with the displayed readbacks moving after applying a high-line genome (C19: two distinct settings), not with measured pressing success; myBadActionsPct +2.53 alongside pass_risk 5 is consistent with C35's risk/completion trade, not proof of misexecution.
What the observation cannot establish: causality for the 1.500 ppm (n=16); any comparison with 0001 (overlapping contexts, dependent observations).
Next observation needed: same as 0001, plus opponent-context strata (strengthBucket) once entry contexts recover.

**P03-0003** — parent EXP-561-P02-0040 (deterministic_random genome), weight 10%.
Frozen vector: `def_line 1, press_line 2, def_width 1, press_intense 2, build_type 3, build_temp 1, build_long 2, build_fast 2, style 3, pass_risk 5, dribble 1, cross 3, corner 2, shot 1, priority [center,left]`.
Samples: phases n=10; resolved outcomes n=5 (4-1-0). Exact exported deltas: `myXG +1.148, oppXG +0.686, myShots +9.1, oppShots +9.4444, myPower −19.8, oppPower −30.2, myPressVector −1.2, oppPressVector +10.3, myDefVector −12.4, oppDefVector +5.4, myBadActionsPct +0.6, oppBadActionsPct +0.8889`.
Claim-informed alternative explanations: 2.600 ppm on n=5 is compatible with C3/C32-style favorite bias (strengthBucket: much_stronger 7 of 10 entries) — the record is consistent with opponent weakness, not diagnostic of the genome; myDefVector −12.4 with def_line 1 is a readback direction, not a slider reading (C19).
What the observation cannot establish: any superiority over 0001/0002; the n is anecdotal and the phases are dependent (C26).
Next observation needed: more linked resolved outcomes before this genome is discussed at all.

**P03-0004** — parent EXP-561-P02-0058 (extreme genome), weight 10%.
Frozen vector: `def_line 3, press_line 1, def_width 3, press_intense 1, build_type 3, build_temp 1, build_long 3, build_fast 1, style 5, pass_risk 1, dribble 5, cross 1, corner 2, shot 1, priority [center,right]`.
Samples: phases n=1; resolved outcomes n=1 (0-0-1). Exact exported deltas (single phase): `myXG +2.21, oppXG +1.6, myShots +17, oppShots +18, myPower 0.0, oppPower 0.0, myPressVector −25.0, oppPressVector −36.0, myDefVector 0.0, oppDefVector −31.0, myBadActionsPct +3.0, oppBadActionsPct −9.0`.
Claim-informed alternative explanations: one phase proves nothing; the zero power deltas are consistent with missing readbacks (null-preservation in `metricDelta`, `tactical-lab-v1.js:384-390`), not with "no physics change" (C14).
What the observation cannot establish: anything beyond existence of one completed phase.
Next observation needed: activations at all (1 of 13 assignments).

**P03-0005** — parent EXP-561-P02-0011 (Arteta_Control433_bal3 mutation, distance 0.2), weight 5%, designated negative control.
Frozen vector: `def_line 2, press_line 1, def_width 2, press_intense 3, build_type 3, build_temp 2, build_long 1, build_fast 2, style 3, pass_risk 2, dribble 2, cross 2, corner 1, shot 2, priority []`.
Samples: phases n=2; resolved outcomes n=2 (1-0-1). Exact exported deltas: `myXG +0.485, oppXG +0.725, myShots +6.0, oppShots +7.5, myPower 0.0, oppPower 0.0, myPressVector −11.0, oppPressVector −8.0, myDefVector +3.0, oppDefVector −5.0, myBadActionsPct −1.0, oppBadActionsPct 0.0`.
Claim-informed alternative explanations: a negative control "winning" once is exactly what small samples do; no validated control behavior can be claimed (§10). Note this genome is a *mutation* of the Arteta seed, not the production Arteta_SafePossession_v11 identity (which stays manual-only, `specs/335-fixed-lineup-v11/spec.md:15,32`).
What the observation cannot establish: that the control is behaving as a control.
Next observation needed: many more phases before control validity is even discussable.

**P03-0006** — parent EXP-561-P02-0055 (extreme genome), weight 5%, designated negative control.
Frozen vector: `def_line 1, press_line 3, def_width 1, press_intense 5, build_type 1, build_temp 3, build_long 1, build_fast 3, style 1, pass_risk 5, dribble 1, cross 3, corner 1, shot 3, priority [right]`.
Samples: phases n=4; resolved outcomes n=1 (0-0-1). Exact exported deltas: `myXG +0.615, oppXG +0.84, myShots +7.75, oppShots +8.5, myPower +41.5, oppPower +29.0, myPressVector +8.0, oppPressVector +5.0, myDefVector −8.75, oppDefVector +0.25, myBadActionsPct +2.5, oppBadActionsPct +0.25`.
Claim-informed alternative explanations: myPower +41.5 on n=4 is dominated by readback noise and small-sample averaging; with C14's per-5-minute renormalization, power readbacks drift for reasons unrelated to the tactic. strengthBucket: all 4 entries much_weaker.
What the observation cannot establish: any "power boost" effect; control validity.
Next observation needed: linkage and context recovery first; the genome has 12 unactivated assignments.

## 7. What changes in interpretation — covariate register

Availability status against the current export (live export snapshot 2026-11-08T19:42Z fetched from production). **Missing ≠ zero**: an unavailable covariate is absent evidence, never a null effect.

| Covariate | Claims | Status | Where it lives (or would) |
| --- | --- | --- | --- |
| Competition subtype (championship / cup / KT / friendly) | C95, C96, C125 | **unavailable** | not in lab export; needed before any chaos-mode covariate exists |
| Chaos-control setting | C95, C96, C125 | **unavailable** | same; only meaningful in C95's scope |
| Patch epoch (5.61 rollout; 2026-07-13 patch; 07-22 reset) | C30, C36, C169 | **observed** (preset_evidence periods) | `.periods.pre_5_61/transition_5_61/stable_5_61` |
| Fitness / recovery / distance | C14, C75, C76, C77 | **unavailable** | no field; myPower is not a proxy (§6 matrix) |
| Form | C89 (system: C87, C88, C138) | **unavailable** | no per-entry form field |
| Anchor / injury / out-of-position | C28 | **unavailable** | no lineup-status field in lab export |
| Secondary position usage | C152 | **unavailable** | lineup not exported by the lab |
| Opponent strength bucket | C22 (proxy) | **observed** | `entryContext.strengthBucket` per genome |
| Score state at entry | — | **partial** | 46/143 available (`.entryContextFieldAvailability.scoreState`) |
| Minute bucket | — | **partial** | 122/143 |
| Home/away | — | **observed** | 143/143 |
| Previous tactic | — | **observed** | 143/143 (`knownPreviousTactic` 1.0) |
| Production recommendation at entry | — | **partial (near-absent)** | 2/143; `noRuleDecisionRecorded` 141 |
| Substitutions / cards | C55 (subs exist), C36 (red cards 0.13/game) | **unavailable** | not in lab export |
| Decision linkage (which decision produced a result) | — | **partial (near-absent)** | 1/211 results attributed; 0 entry contexts linked |

With n=41 resolved outcomes, the permitted analysis is **descriptive strata + missingness tables only**. No adjusted inference, no regression, no ranking. The register's role is to make future strata honest about what was unavailable.

## 8. P04 research sketch (state 1 of 6 — NOT a population spec)

Transition: **research sketch → approved protocol → frozen population → manual activation → analysis → governed decision.** This document reaches state 1 only. Nothing here may be implemented as a population, weights change, or runtime behavior; freeze-before-activation would be a separate governed task.

Five mechanism-focused directions (claims are priors for mechanism choice, not for expected effect sizes):

1. **Press-line vs defense-line contrast (C19).** The 5.4 control split makes press/def vectors two channels. A future protocol could contrast genomes that move one line while holding the other, judged by displayed vector deltas and chance balance — not by W/D/L.
2. **Safe progression vs sterile possession (C35, C98).** Judge by chance balance (xG/shot balance) rather than errors alone; safe passing inflates completion by design. Hypothesis: low-risk buildups shift bad-actions% down without shifting xG balance — requires prospective testing.
3. **Pressure with fitness context (C14, C75, C76, C77).** Pressing intensity interacts with an unobserved fitness channel; any pressing protocol must record exposure duration and treat power readbacks as non-evidence for fitness.
4. **Width/crossing vs central access (C13, C15, C20).** Cross comfort zones and position-choice mechanics suggest width hypotheses need xG-balance outcomes, not shot counts.
5. **Shot-selection direction secondary (C8, C27).** Shot volume responds to settings (±25% long-shot influence since 5.5) but outcome linkage runs through xG; treat shot-direction effects as secondary endpoints.

Hard constraints for any future protocol: freeze-before-activation in a governed task; repeat/reference controls without declaring P03 champions; blindness rules preserved (controls hidden until activation, `docs/audit/tactical-lab-v1.md`); no adaptation to accumulating results; fixed lineup CD1/CD3 with preselected RW/RM (`specs/335-fixed-lineup-v11/spec.md:8-9`) — C36's CD1/CD3 press-role exception is **not** permission for CD2; no chaos manipulation and no lineup experiments bundled into tactic protocols.

## 9. Tactics rebuild priorities and gates

**Research priority ≠ production recommendation rank.** The stable-5.61 analysis cohort (live export snapshot 2026-11-08T19:42Z fetched from production, `preset_evidence_561` → `.counts`) holds 301 analysis events and 159 analysis effects, of which 100 are stable named effects across 21 presets. The stable-cohort leaders — Pep_BoxControl_bal2 (sample 26) and Arteta_Control433_bal3 (sample 25) — justify investigating safe-progression mechanisms (§8.2), **not** carrying evidence into current presets. Both cohorts are named stable-5.61 effects, **not** v11-confirmed: `v11CurrentScoredConfirmedEffects` = 0 across 0 presets. Arteta remains manual-only diagnostic (`specs/335-fixed-lineup-v11/spec.md:15,32`).

The actual retune gate, verbatim from `vps/exporter-rag/slf_preset_evidence_561.py:504-513` (v12 admission semantics verified: `is_v11_current_phase_effect` at :370-378 requires exact `libraryVersion`/`recommendationSchema` v11 identity, membership in `V11_PRODUCTION_PRESETS`, and `stable_5_61` period; the manual-diagnostic exclusion is `V11_MANUAL_ONLY_DIAGNOSTIC_PRESETS = {"Arteta_SafePossession_v11"}` at :65):

```python
eligible_v11 = [
    row for row in current_v11_phases
    if preset_name(row) not in V11_MANUAL_ONLY_DIAGNOSTIC_PRESETS
    and get_path(row, "eligibility.eligibleForRanking") is True
    and get_path(row, "tacticContext.applicationStatus") == "game_confirmed"
    and score_state(row) in VALID_SCORE_STATES
    and game_id(row) in scored_games
]
eligible_v11_presets = {preset_name(row) for row in eligible_v11}
ready = len(eligible_v11) >= 60 and len(eligible_v11_presets) >= 5
```

Gate components: eligible **current-cohort** (v11 library/schema) phases only; manual-diagnostic presets excluded; `game_confirmed` application (fail-closed, `specs/380-tactical-attribution/spec.md:14`); valid score state ∈ {winning, losing, draw} (:30); linkage to a strict scored finished result (:405); **≥60 eligible phases across ≥5 presets** (:513). Current state: `readyForRetune` = false; readiness cohort label `v11_current_scored_game_confirmed_phase_only`; warning «Нет достаточной выборки подтверждённых и связанных с результатом фаз v11. Смешанная история 5.61 не является основанием для ретюнинга.» Opening the gate would mean the cohort is merely **eligible for a governed retune proposal** — not automatic retuning, which stays blocked (`specs/380-tactical-attribution/spec.md:14`).

## 10. NOT CLAIMED, and follow-up backlog

Explicit denials carried by this audit:

- No optimal slider values follow from official claims; claims are priors, not engine laws (`forum_official_claims.json` → `impactOnExperiment.rule`).
- No causality from n=16, and a fortiori none from n=5, n=2, n=1.
- No P03 winner: 0001 vs 0002 (ppm 1.312 vs 1.500, n=16 each) is not a ranking; 0003's 2.600 is anecdotal.
- No validated negative controls: P03-0005/0006 have 2 and 1 resolved outcomes; "control behaves like a control" is unestablished.
- Official mechanics are not independently proved by our experiments; account-reported claims remain account-reported.
- No P02 superiority or inferiority claims: P02 outcome evidence is missing, not zero (§5).
- `versionTag: null` ≠ current; UI readback ≠ server confirmation (`specs/335-fixed-lineup-v11/spec.md:31`).
- No competition pooling from C4 alone; no historical cohort transfer into v12 identities (`specs/335-fixed-lineup-v11/spec.md:33`).
- "100 stable effects opens the retune gate" is false as stated: the gate counts v11-current, game-confirmed, scored-linked phases (§9), currently 0.
- No new crawling: the owner closed the crawl; the claims file is the fixed corpus.

Follow-up backlog (no owner action requested by this document):

1. **Decision-linkage / entry-context diagnosis** — 141/143 entries lack a recorded rule decision and 210/211 results are unattributed; this is the largest evidence blocker (§5, §7).
2. **Continued unchanged P03 observation** — population, weights, and blindness rules stay frozen; the funnel is the only thing that should grow.
3. **Later protocol design** — only if the owner wants §8 directions promoted to state 2 (approved protocol).
4. **Eventual gated retune proposal** — only after `readyForRetune` = true, and even then as a proposal, not an automatic retune.
