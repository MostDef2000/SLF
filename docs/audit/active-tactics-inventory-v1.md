# Active tactics inventory v1

## Scope

This audit freezes the current 11-preset runtime baseline from `src/modules/tactics-presets/active-preset-registry.js` before any retuning.

The machine-readable source is `data/tactics/active-preset-inventory-v1.json`.

No tactic settings, recommendation weights, application behavior, telemetry schema, VPS behavior, generated userscript artifacts, or userscript version are changed by this audit.

## Distance method

The audit uses an unweighted Manhattan distance across these 14 numeric team settings:

- defensive line;
- pressing line;
- defensive width;
- pressing intensity;
- build type;
- build verticality;
- long passing;
- build speed;
- style;
- passing risk;
- dribbling;
- crossing;
- corners;
- shooting.

Formation, priority lanes and semantic metadata are intentionally excluded from the numeric distance. The metric is therefore a baseline overlap detector, not a complete football-quality score.

## Confirmed active set

1. Arteta Control 4-3-3
2. Pep Box Control
3. Pep Press Cooldown
4. Compact Counter
5. Pep Controlled Push
6. Pep Positional Attack
7. Conte Wingback Width
8. Klopp Gegenpress
9. Simeone Compact 4-4-2
10. Simeone Low Block
11. Bielsa Chaos Press

## Main findings

The library contains one clear near-duplicate pair:

- `Pep_BoxControl_bal2` ↔ `Pep_PressCooldown_bal2`: distance 3.

Additional high-overlap pairs:

- `Arteta_Control433_bal3` ↔ `Pep_ControlledPush_att3`: distance 4;
- `Pep_BoxControl_bal2` ↔ `Simeone_Compact442_def4`: distance 5;
- `Pep_ControlledPush_att3` ↔ `Pep_TwoThreeFive_att3`: distance 5;
- `Arteta_Control433_bal3` ↔ `Conte_WingbackWidth_bal4`: distance 6;
- `Pep_ControlledPush_att3` ↔ `Conte_WingbackWidth_bal4`: distance 6;
- `Simeone_Compact442_def4` ↔ `Simeone_LowBlock_def5`: distance 6.

There are 13 preset pairs at distance 8 or lower. This confirms a dense neutral-to-medium cluster.

`Bielsa_ChaosPress_att5` is the most isolated profile. Its nearest neighbor is `Klopp_Gegenpress_att4` at distance 13. It is currently the clearest genuinely extreme attacking endpoint.

## Interpretation

The main issue is not the number of presets. It is insufficient separation between several presets that should represent materially different match plans.

In particular:

- Box Control and Press Cooldown differ too little for separate recommendation identities;
- Arteta Control and Controlled Push are too close despite belonging to different tactical phases;
- Controlled Push, Positional Attack and Conte Width form a dense attacking/balanced cluster;
- Compact 4-4-2 and Low Block do not separate enough between controlled protection and emergency survival;
- Klopp and Bielsa are separated adequately, but both remain late guarded options in the current policy.

## Required redesign constraints

The next stage should:

1. retain exactly 11 active runtime identities unless evidence supports removal;
2. assign each preset one explicit advantage, one explicit cost and one prohibited scenario;
3. increase separation by changing linked parameter groups rather than isolated single values;
4. keep emergency profiles behind hard match-state and physical-cost guards;
5. preserve manual application only;
6. avoid numeric performance claims until clean generator-5.61 samples are sufficient;
7. version telemetry so pre-redesign and post-redesign effects cannot be mixed silently.

## Planned stage 2

Stage 2 will redesign the settings and metadata of the 11 profiles while leaving the recommendation scorer structurally unchanged. This isolates the effect of the tactic-library change before recommendation-policy retuning.

The proposed sequence is:

1. separate Box Control from Press Cooldown;
2. separate Arteta Control from Controlled Push;
3. make Positional Attack a stronger territorial overload profile;
4. make Conte Width a genuine flank-specific profile;
5. separate Compact 4-4-2 from Low Block;
6. strengthen Compact Counter as a direct transition profile;
7. retain Klopp as controlled high-risk press;
8. retain Bielsa as the final all-in endpoint;
9. add a tactic-library version to match telemetry;
10. evaluate the redesigned set before changing scoring weights.
