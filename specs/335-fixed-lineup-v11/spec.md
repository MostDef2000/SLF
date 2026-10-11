# SLF Tactical Suite v11 — one fixed match lineup (#335)

**Status:** owner-authorized. The exact `commit approved` immediately followed visible Implementation Scope Check for the corrected fixed-lineup v11 plan. User confirmed **CD1 and CD3**, not CD2. Authorizing base: `main@0ff8cd8953527d73d3bdc1e7087e0c6e865082d6`.

## Goal and user-visible behaviour

A football team does not change formation when its manager selects a tactical mode. The SLF lineup has exactly eleven slots:
`GK — LD — CD1 — CD3 — RD — DM2 — CM2 — LW — AM1 — RW/RM — ST2`.
The manager chooses **RW or RM before kickoff**, and that choice stays unchanged when changing tactical modes. Other changes to lineup/substitutions are explicit exceptional manual game actions, never implied by a preset. Every mode may change **only fourteen native numeric tactical controls and priority lanes**.

Replace 12 v10 production presets with 12 coach-branded modes:
`Emery_BalancedBase_v11` (default start),
`Mourinho_CleanCounter_v11` (outlet-confirmed counter),
`Guardiola_PressEscape_v11` (under pressure),
`Arteta_SafePossession_v11` (manual-only diagnostic),
`Guardiola_PressCooldown_v11` (fatigue),
`Guardiola_ControlledPush_v11` (controlled chase),
`Guardiola_PositionalSiege_v11` (conditional high attack),
`Conte_WideChannels_v11` (LW + RW/RM),
`Klopp_LateGegenpress_v11` (late/fresh/low errors only),
`Simeone_CompactLead_v11` (late protection),
`Simeone_EmergencyBlock_v11` (temporary lock),
`Allegri_LeadOutlet_v11` (late lead and safe first pass).

Canonical design artifact (reviewed by owner): `fixed_lineup_v11_blueprint.json` with all 12 full vectors; latest approval explicitly corrects center back to CD1/CD3. The project candidate is a **hypothesis**, not a proven stronger tactic. User experienced three bad matches including game `33696558` with old Arteta; auto-defaulting to Arteta is rejected.

## Acceptance / NFR

1. All 12 presets carry identical 11 slots including CD1/CD3, never CD2; one profile permits RW or RM, with no mode-driven swap. The user-facing title describes a **tactical mode**, not a 3-2-5/4-4-2 etc formation.
2. Preset application calls no lineup mutation/save API, only strict-native-controlled 14 settings+priority; any unexpected native lineup change fails success attribution. No auto-apply, auto learning or silent formation save.
3. All 14 inputs in documented native FM2026 domains; checked pre-mutation; preserve rollback and UI-readback-only provenance. Never call UI readback game-server confirmation.
4. Policy normally ranks Emery first; Arteta can be applied explicitly by user but cannot be automatically proposed. Counter requires witnessed first pass, siege only with controlled transitions, Klopp late/fatigue gated, emergency temporary.
5. Historical v10 IDs remain readable as closed aliases for saved selections, but are absent from active dropdown; historical result and phase rows keep their original cohort. New v11 library and schema never pool historical v9/v10 evidence for readyForRetune.
6. Exact-head canonical `SLF CI / ci` success including Node/browser/Python regression, protected-main squash merge, automatic latest-only release with matching version/provenance. User-owned in-game acceptance follows publication.

Measurable reliability NFR: 12/12 native vectors valid; 12/12 fixed profiles match; both RW and RM recognized; 0 formation-side-effect calls; historical v10 excluded from v11 eligible sample; exact-head CI SUCCESS.

## Exclusions

Game generator, real match data, existing VPS raw results, credentials and secrets, user lineup assignments, production VPS deployment, historical cohort rewrite, automatic tactical adaptation, direct edits of generated `releases/latest.user.js`, `data/version.json` and other publication outputs. Exceptional manual lineup editing remains available through the separate game UI.
