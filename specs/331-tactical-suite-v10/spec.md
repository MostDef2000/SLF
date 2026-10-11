# Tactical Suite v10 — production replacement (#331)

Status: **AUTHORIZED** by immediately following exact `commit approved` from owner (2026-10-11).
Baseline: `main@d704ff8d83be0ba7e2a05e13cbffcbc2aecf18d9`. Prior v9 remains historical cohort and source rollback reference.
Parent context: #252, #325, #327. Design source: `SLF_v10_candidate_presets.json` and full audit, 2026-10-11.

## Product behavior
- Replace v9 with exactly **12** canonical production preset identities: 9 retained/retuned; 3 new `MidBlock_Control4231_neutr`, `MidBlock_Counter4411_neutr`, `Lead_Outlet4141_def1`.
- `Bielsa_ChaosPress_att5` removed from production; a native-valid Bielsa proposal remains LAB-only, not automatically assigned/promoted.
- Zero production vector values outside documented FM2026 native domains. A tactic with unsupported/unavailable DOM controls is rejected **before** the first click. If native handler fails later, attempt full restoration and do not record successful application.
- Every preset identity carries 14 radio settings, priority lanes, role, formation metadata and entry/veto contracts.
- Selector supports controlled mid-block, clean-outlet counter and protect-lead with outlet; no counter recommendation without observed clean exit; Klopp remains late/fatigue-gated; 3-2-5 remains conditional; emergency low block stays temporary.
- Existing manual lineup/formation workflow stays **separate from preset controls**; no automatic formation save. Explicit user action and existing lineup controls are required.
- Persist v10-only suite+recommendation schema in telemetry and distinguish v8/v9 historical data. No fabricated game_server_ack or W/D/L evidence confidence.
- Existing LAB P02/P03 genomes remain immutable (historical seeds fixed), no automatic production promotion.

## Non-functional requirements
- Reliability: all-or-nothing preflight, best-effort rollback with reported outcome, bounded retries and no ghost successful preset event.
- Compatibility: historical match, effect and LAB rows untouched; old custom user presets retain their own identities except explicitly retired SLF built-ins.
- Safety: own-match-only telemetry; no autoApply, autoTrain, server credential/schema/storage mutation.
- Performance: deterministic inventory, lightweight browser DOM reads, no new polling.
- Reversibility: prior v9 source in Git; releases through protected automatic workflow; user updates Tampermonkey separately.
- Observability: rule-score confidence is a heuristic margin, never calibrated match success probability.

## Acceptance
- Exactly 12 valid production controls, 11 distinct positions each, 3 new role scenarios and old 9 guards, retired Bielsa absent from all production candidates/dropdowns.
- Missing target controls -> zero mutation; native failures -> rollback verified or explicitly flagged unverified; no success telemetry on a failed apply.
- Stable P02/P03 seeds; deterministic synced inventory; graph connected; regression browser/Node tests and exact-head SLF CI SUCCESS.
- Source merge and automatic release verification. Live user-owned match/server acceptance remains a separate post-release validation.
