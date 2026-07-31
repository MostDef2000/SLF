# Generator 5.61 tactic rebuild — 2026-07

Status: implemented conservatively; numeric retune pending a clean stable-5.61 cohort.

## Scope

This pass combines the official generator 5.61 rule pack with the latest public aggregate exports:

- 369 match snapshots across 53 games;
- 158 match results;
- 262 preset events;
- 102 preset effects.

The aggregate history is not a clean generator 5.61 experiment. It mixes older generator behavior, the 2026-07-13 through 2026-07-22 form-transition period, manual changes, unknown preset names, and older userscript versions.

## Current aggregate evidence

The current effect-score formula is:

`4 * delta.myXG - 5 * delta.oppXG + 0.5 * delta.myShots - 0.5 * delta.oppShots - 0.3 * delta.myBadActionsPct`.

Directional findings from the mixed history:

| Preset | Effects | Approx. score | Interpretation |
| --- | ---: | ---: | --- |
| Pep Positional Attack | 7 | +1.05 | strongest observed controlled attacking candidate; still a small sample |
| Conte Wingback Width | 13 | +0.20 | mildly positive, but 5.61 makes generic wide forcing less reliable |
| Pep Box Control | 14 | +0.04 | neutral chance balance, best observed reduction in bad actions |
| Xabi Box Midfield | 6 | -0.29 | insufficient support for a dedicated center-only runtime preset |
| Klopp Gegenpress | 11 | -0.35 | restrict to late, clean, non-fatigued chase states |
| Bielsa Chaos Press | 5 | -0.66 | emergency only |

Data-quality issues:

- 81 of 262 preset events have `presetName=unknown`;
- 18 of 102 effects are `manual_change`;
- existing `byPresetContext.scoreState` is unreliable because old exporter logic could use a minute bucket as a score state;
- current snapshots are predominantly from userscript 4.4.72; manual Coach Mode was not sending fresh snapshots/effects.

## Generator 5.61 implications

1. Improved LD/RD flank coverage means a closed center alone is not sufficient evidence for forced wide attack.
2. Wide attack requires an observed flank advantage, a weak/booked opposing fullback, or current attacking momentum, plus acceptable crossing evidence.
3. Red cards are hard tactical triggers, but current snapshot parsing does not yet expose a reliable structured red-card count. This remains a follow-up parser task rather than an inferred signal.
4. Pressing-player role for CD and ST set-piece magnetism must not be used as hidden tactical assumptions.
5. The temporary defensive dominance before the 2026-07-22 expectation reset is excluded from stable evidence.

## Runtime policy changes

- remove Xabi Box Midfield from active storage and recommendation surfaces;
- neutralize forced attack lanes for generic presets;
- keep forced width only for Conte Wingback Width;
- promote Pep Positional Attack as the primary controlled attacking escalation;
- keep Box Control as the high-bad-actions reset;
- require stronger evidence for Conte;
- delay Klopp until the late chase window with low bad actions and no fatigue/transition threat;
- delay Bielsa until the final emergency window;
- never use fatigue as a reason to preserve or automatically enter chaos press.

## Telemetry repair

Manual Coach Mode previously cleared `STATE.pendingPresetEvent` before evaluating the next snapshot. This prevented `preset_effects_v2` from receiving current effects. The rebuild:

- preserves pending preset events;
- evaluates effects when the manual hint is refreshed;
- sends deduplicated own-match snapshots;
- tags new records with generator version 5.61;
- does not upload foreign-match analysis snapshots.

## New exporter evidence contract

`data/preset_evidence_561.json` separates:

- `pre_5_61` — before 2026-07-13;
- `transition_5_61` — 2026-07-13 through 2026-07-22;
- `stable_5_61` — from 2026-07-23;
- `unknown` — records without a usable timestamp.

Numeric retuning is marked ready only after at least 60 named stable-5.61 effects across at least five presets. Until then, the runtime policy remains conservative.

## Follow-up acceptance criteria

After deployment and additional matches:

1. confirm snapshots use the current userscript version;
2. confirm stable-5.61 named effects increase after each applied preset;
3. reduce unknown preset events below 10%;
4. review per-preset results only when core metric completeness is adequate;
5. perform a separate numeric balance PR when `readyForRetune=true`.
