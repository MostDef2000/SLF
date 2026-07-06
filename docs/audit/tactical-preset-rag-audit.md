# Tactical Preset RAG Audit

Status: DRAFT / READ-ONLY AUDIT
Branch: `stage2-moment-engine`
Scope: tactical preset library + RAG/export evidence + on-demand hint decision model
Runtime changes: none

---

## 1. Purpose

This document audits the current SLF tactical preset library against the available RAG/export evidence.

The goal is not to redesign the tactical system. The goal is to decide which presets should be:

- allowed in the on-demand `Подсказка` button flow;
- restricted to narrow situations;
- treated as experimental;
- removed from primary hint selection until more evidence exists.

The current UX model is:

```text
User presses "Подсказка"
  -> current page/snapshot is parsed
  -> one current action hint is generated
  -> no live parser loop
  -> no drift/history/adaptation model
```

Therefore the audit is focused on **current-state action quality**, not long-term live inference.

---

## 2. Source material

### 2.1 RAG / Drive context

Drive `ai_context.md` defines the expected read order for the Strategy Agent:

1. `rag/catalog.json`
2. `rag/search_index.json`
3. `rag/tactical_cases.jsonl`
4. `rag/rule_extracts.jsonl`
5. `rag/forum_notes.jsonl`
6. `rag/match_evidence.jsonl`
7. `wiki/chunks.json`
8. `data/preset_effects_summary.json`

Runtime userscript should read only:

```text
tactics/knowledge-pack.latest.json
```

### 2.2 Export summaries used

Current evidence snapshot:

| File | Generated / modified | Notes |
|---|---:|---|
| `match_data_summary.json` | `2026-07-06T03:31:24Z` | match snapshots/results summary |
| `preset_events_summary.json` | `2026-07-06T03:31:23Z` | preset application events |
| `preset_effects_summary.json` | `2026-07-06T03:31:23Z` | preset effect windows |
| `player_observations_summary.json` | `2026-07-06T03:31:24Z` | player observations summary |

### 2.3 Code sources used

- `src/modules/tactics-presets/tactic-preset-library.js`
- `src/modules/strategy-data-recommendations/current-action-hint-engine.js`
- `tools/vps/slf_stage2_moment_build.py` as Stage 2 offline context, not as runtime hint logic

---

## 3. Evidence quality notes

### 3.1 Dataset size

Current observed dataset:

```text
match_snapshots_v2: 323
match_results_v2: 117
preset_events_v2: 151
preset_effects_v2: 85
```

### 3.2 Attribution problem

Preset event attribution is incomplete:

```text
preset_events_v2 total: 151
unknown preset events: 71
known preset events: 80
unknown share: ~47.0%
```

This is the most important audit limitation.

Until `unknown` preset attribution is fixed, all effect conclusions are provisional.

### 3.3 Manual changes

`preset_effects_summary.json` contains `manual_change` as an effect group.

`manual_change` is not a preset from `TacticPresetLibrary` and must not be treated as a tactical preset.

It should be used only as a data quality signal:

```text
manual_change means the system observed a tactical change but cannot map it to a canonical preset.
```

---

## 4. Preset evidence summary

### 4.1 Event counts

| Preset | Events |
|---|---:|
| `unknown` | 71 |
| `Conte_WingbackWidth_bal4` | 13 |
| `Pep_BoxControl_bal2` | 10 |
| `Pep_StandardControl_bal3` | 9 |
| `Klopp_Gegenpress_att4` | 9 |
| `Xabi_BoxMidfield_bal3` | 9 |
| `Bielsa_ChaosPress_att5` | 6 |
| `Pep_PressCooldown_bal2` | 6 |
| `Compact_Counter_def3` | 6 |
| `Xabi_VerticalBox_att3` | 3 |
| `Pep_TwoThreeFive_att3` | 3 |
| `Pep_ControlledPush_att3` | 2 |
| `Henta_LeftTrap_att3` | 2 |
| `Henta_WideTrap_att3` | 1 |
| `DeZerbi_Release_att4` | 1 |

### 4.2 Effect sample counts and key deltas

| Preset | Effect sample | dMyShots | dMyXG | dOppShots | dOppXG | dMyXT | dBadActions | Evidence read |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `Pep_BoxControl_bal2` | 12 | +0.83 | +0.09 | +0.75 | +0.06 | +0.14 | -0.67 | stable mild positive |
| `Conte_WingbackWidth_bal4` | 11 | +1.36 | +0.18 | +1.18 | +0.10 | +0.18 | +0.27 | productive but opens risk |
| `Klopp_Gegenpress_att4` | 9 | +0.67 | +0.08 | +0.67 | +0.10 | n/a | +0.11 | not clearly positive, high risk |
| `Compact_Counter_def3` | 7 | +1.71 | n/a | n/a | n/a | n/a | +0.29 | useful but data incomplete |
| `Xabi_BoxMidfield_bal3` | 6 | +0.50 | +0.03 | +0.83 | +0.05 | +0.02 | 0.00 | weak/neutral evidence |
| `Pep_TwoThreeFive_att3` | 6 | +2.00 | +0.34 | +1.17 | +0.10 | +0.27 | -0.17 | strongest attacking evidence |
| `Bielsa_ChaosPress_att5` | 5 | +0.60 | +0.03 | +0.80 | +0.11 | n/a | +0.40 | emergency only |
| `Pep_ControlledPush_att3` | 5 | n/a | n/a | n/a | n/a | n/a | n/a | generator attack delta negative |
| `Pep_StandardControl_bal3` | 4 | +0.50 | +0.06 | +1.25 | +0.21 | +0.05 | +1.00 | weak as primary default |
| `Pep_PressCooldown_bal2` | 4 | n/a | n/a | n/a | n/a | n/a | n/a | positive attack generator delta, late windows |
| `Henta_LeftTrap_att3` | 2 | n/a | n/a | n/a | n/a | n/a | n/a | too little data |
| `Xabi_VerticalBox_att3` | 2 | n/a | n/a | n/a | n/a | n/a | n/a | too little data |
| `Simeone_Compact442_def4` | 1 | 0.00 | 0.00 | 0.00 | 0.00 | n/a | -1.00 | too little data |

Interpretation rules:

- `dMyShots`, `dMyXG`, `dMyXT` positive = attacking output improved.
- `dOppShots`, `dOppXG` positive = opponent also improved / risk increased.
- `dBadActions` positive = more bad actions / worse control.
- Small sample sizes are not enough for strong conclusions.

---

## 5. Preset library audit

### Legend

| Verdict | Meaning |
|---|---|
| `keep` | allowed as normal candidate for `Подсказка` |
| `keep_with_guard` | allowed only with explicit condition/guard |
| `restrict` | do not use as default; narrow usage only |
| `emergency_only` | only for late or critical match state |
| `experimental_only` | can exist in library, but not primary button recommendation |
| `needs_more_data` | keep in library, but do not promote until more effects exist |
| `remove_from_hint` | do not select from on-demand hint engine |

---

## 6. Full preset verdict table

| Preset | Group | Rank | Evidence | Verdict | Reason | Hint usage |
|---|---:|---:|---|---|---|---|
| `Pep_BoxControl_bal2` | balance | 2 | 10 events / 12 effects | `keep` | best stable baseline; lowers bad actions; mild positive attack output | default stabilizer / control reset |
| `Compact_Counter_def3` | defensive | 3 | 6 events / 7 effects | `keep_with_guard` | useful defensive reset, but effect metrics incomplete | under pressure, transition risk, high press response |
| `Pep_TwoThreeFive_att3` | attack | 3 | 3 events / 6 effects | `keep_with_guard` | strongest attacking evidence, but opponent output also rises | attacking momentum, low counter risk |
| `Conte_WingbackWidth_bal4` | balance | 4 | 13 events / 11 effects | `keep_with_guard` | good attacking lift, but increases opponent activity and bad actions | center closed, wide quality, no own-crosses-bad |
| `Pep_PressCooldown_bal2` | balance | 2 | 6 events / 4 effects | `keep_with_guard` | useful late stabilizer / cooldown candidate | fatigue, high press cost, high bad actions |
| `Pep_ControlledPush_att3` | attack | 3 | 2 events / 5 effects | `restrict` | conceptually useful, but evidence is not yet strong | need goal without under-pressure, defense working |
| `Xabi_BoxMidfield_bal3` | balance | 3 | 9 events / 6 effects | `restrict` | weak/neutral output; should be center-specific | center weak/open, low bad actions |
| `Xabi_VerticalBox_att3` | attack | 3 | 3 events / 2 effects | `needs_more_data` | too little evidence; generator attack delta not convincing | central vertical entry only when center available |
| `Pep_StandardControl_bal3` | balance | 3 | 9 events / 4 effects | `remove_from_hint` | worse than `Pep_BoxControl_bal2` as on-demand default; opponent xG rises more | keep as metadata/baseline only |
| `Klopp_Gegenpress_att4` | attack | 4 | 9 events / 9 effects | `restrict` | not clearly positive; high risk and bad actions can rise | urgent pressure only, no fatigue/high bad actions |
| `Bielsa_ChaosPress_att5` | attack | 5 | 6 events / 5 effects | `emergency_only` | high-risk all-in; opponent xG rises more than own xG in current sample | 80+ minute, losing, no safer option |
| `Simeone_Compact442_def4` | defensive | 4 | 0 events / 1 effect | `needs_more_data` | conceptually valid, insufficient observed data | protect lead / late under pressure only |
| `Simeone_LowBlock_def5` | defensive | 5 | 0 events / 0 effects | `emergency_only` | no evidence; very narrow concept | late protect lead, heavy pressure only |
| `Mourinho_WeakSide_def3` | defensive | 3 | 0 events / 0 effects | `needs_more_data` | no observed evidence | opponent pressure + space behind only |
| `DeZerbi_BaitPress_bal3` | balance | 3 | 0 events / 0 effects | `needs_more_data` | no observed evidence despite useful concept | opponent high press + passing quality only |
| `DeZerbi_Release_att4` | attack | 4 | 1 event / 0 effects | `needs_more_data` | almost no evidence | opponent high line/press, space behind |
| `Klopp_WideTrap_att4` | attack | 4 | 0 events / 0 effects | `needs_more_data` | no observed evidence, high risk | center closed + wide advantage only |
| `Henta_Hold_def3` | defensive | 3 | 0 events / 0 effects | `experimental_only` | no observed evidence | not primary hint |
| `Henta_LeftTrap_att3` | henta | 3 | 2 events / 2 effects | `experimental_only` | narrow concept, tiny sample | weak opponent right side only |
| `Henta_RightTrap_att3` | henta | 3 | 0 events / 0 effects | `experimental_only` | no evidence | weak opponent left side only |
| `Henta_WideTrap_att3` | henta | 3 | 1 event / 0 effects | `experimental_only` | no effect evidence | center closed + wide available only |
| `Henta_CounterTrap_att4` | henta | 4 | 0 events / 0 effects | `experimental_only` | no evidence | space behind only, not primary hint |
| `Henta_CentralTrap_att3` | henta | 3 | 0 events / 0 effects | `experimental_only` | no evidence | opponent DM/CM/DC weak only |

---

## 7. Recommended hint tiers

### Tier 1 — primary allowed presets

These can be selected by the button-driven hint engine.

```text
Pep_BoxControl_bal2
Compact_Counter_def3
Pep_TwoThreeFive_att3
Conte_WingbackWidth_bal4
Pep_PressCooldown_bal2
```

### Tier 2 — restricted presets

These are allowed only when their explicit guard is true.

```text
Pep_ControlledPush_att3
Xabi_BoxMidfield_bal3
Klopp_Gegenpress_att4
```

### Tier 3 — emergency only

```text
Bielsa_ChaosPress_att5
Simeone_LowBlock_def5
```

### Tier 4 — needs more evidence

```text
Xabi_VerticalBox_att3
Simeone_Compact442_def4
Mourinho_WeakSide_def3
DeZerbi_BaitPress_bal3
DeZerbi_Release_att4
Klopp_WideTrap_att4
```

### Tier 5 — experimental only

```text
Henta_Hold_def3
Henta_LeftTrap_att3
Henta_RightTrap_att3
Henta_WideTrap_att3
Henta_CounterTrap_att4
Henta_CentralTrap_att3
```

---

## 8. Recommended on-demand decision table

This table is for the `CurrentActionHintEngine` button flow.

The engine should return one action only.

| Current signal | Recommended preset | Guard | Reason |
|---|---|---|---|
| high bad actions, no urgent goal | `Pep_BoxControl_bal2` | any minute except emergency | safest stabilizer |
| opponent pressure / transition threat | `Compact_Counter_def3` | not losing late by 2+ | defensive reset without full low block |
| attacking momentum | `Pep_TwoThreeFive_att3` | opponent counter threat not high | best attacking evidence |
| center closed + wide quality | `Conte_WingbackWidth_bal4` | own crosses not bad; flanks not weak | attack width, but guarded |
| fatigue / press cost / rising bad actions | `Pep_PressCooldown_bal2` | not emergency chase | cooldown and structure reset |
| need goal 55-79 | `Pep_ControlledPush_att3` | not under pressure; bad actions not high | controlled attacking step |
| center weak / low bad actions | `Xabi_BoxMidfield_bal3` | center available | center-specific overload |
| need pressure but not all-in | `Klopp_Gegenpress_att4` | no fatigue, no high bad actions | urgent pressure only |
| losing 80+ | `Bielsa_ChaosPress_att5` | emergency only | last-window risk |
| winning late under heavy pressure | `Simeone_LowBlock_def5` | 80+ or heavy xGA pressure | emergency defensive survival |

---

## 9. Presets to avoid as default button hints

### `Pep_StandardControl_bal3`

Reason:

- overlaps with `Pep_BoxControl_bal2`;
- current observed effect is weaker;
- opponent shots/xG rise more than desired;
- not needed as an explicit button recommendation.

Keep in library as a conceptual baseline, but remove from primary `Подсказка` selection.

### Henta presets

Reason:

- mostly experimental;
- very small or zero effect sample;
- useful for future niche rules, but not for general on-demand hints.

Keep as library presets, but keep out of the primary decision table.

---

## 10. Data quality tasks before next audit

### P0 — Fix unknown attribution

Problem:

```text
unknown preset events: 71 / 151
```

Action:

- ensure button/manual preset application stores canonical `presetName`;
- ensure effect records inherit canonical `presetName`;
- do not store only display label or manual-change marker when preset id is known.

### P1 — Separate manual changes from presets

`manual_change` must remain an event/effect category, not a preset candidate.

### P2 — Add effect score normalization

Current raw deltas are useful but inconsistent across contexts.

Recommended derived fields:

```text
effectScore
attackDeltaScore
defenseDeltaScore
riskDeltaScore
badActionsDeltaScore
contextMinuteBucket
scoreState
```

### P3 — Add preset family metadata to exports

For every event/effect:

```text
presetName
presetGroup
presetRank
presetTier
triggerSignal
minuteBucket
scoreState
```

---

## 11. Implementation recommendation

Do not expand Stage 2 back into live/drift architecture.

The correct next implementation is small:

```text
Refactor CurrentActionHintEngine decision table according to this audit.
```

Recommended change set:

1. Add a small constant table:
   - `PRESET_AUDIT_TIER`
   - `PRESET_GUARDS`
2. Replace ad-hoc `decide()` branches with guarded rule order.
3. Prevent selection of:
   - `Pep_StandardControl_bal3`
   - Henta presets
   - `Bielsa_ChaosPress_att5` before emergency
4. Keep output one action only.

---

## 12. Final audit verdict

Current tactical library is usable, but the on-demand hint engine must be stricter.

Main conclusions:

1. `Pep_BoxControl_bal2` should be the default stabilizer.
2. `Pep_TwoThreeFive_att3` is the best observed attacking preset but needs transition guard.
3. `Conte_WingbackWidth_bal4` is useful but must be guarded by flank/cross quality.
4. `Compact_Counter_def3` remains the main defensive reset.
5. `Pep_StandardControl_bal3` should not be a primary on-demand hint.
6. `Klopp_Gegenpress_att4` and `Bielsa_ChaosPress_att5` must be restricted.
7. Henta presets should remain experimental only.
8. Unknown preset attribution is the biggest blocker for high-confidence audit.

---

## 13. Next step

Recommended next task:

```text
[P20] Refactor CurrentActionHintEngine using tactical-preset-rag-audit.md
```

Scope:

```text
Update only the button-driven on-demand hint rules.
No live parser.
No drift/adaptation.
No RAG in browser.
No runtime storage.
```
