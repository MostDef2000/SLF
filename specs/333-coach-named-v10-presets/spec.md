# #333 — Coach names for v10 production presets

Status: AUTHORIZED. Exact `commit approved` was given in the immediately following user turn after the visible Implementation Scope Check, 2026-10-11.

Base: `main@69e6e8047c2e6fdc208bcd40b072b44798c7c925`.
Parent issue: #331 (released v10), related telemetry acceptance: #327.

## Outcome

Every one of the 12 production tactical presets has a real-coach name. Replace the three generic v10 identities:

| Persisted v10 ID (legacy) | Canonical v10 ID | Display label |
|---|---|---|
| `MidBlock_Control4231_neutr` | `Emery_BalancedControl4231_neutr` | Unai Emery — Balanced Control 4-2-3-1 |
| `MidBlock_Counter4411_neutr` | `Mourinho_CompactCounter4411_neutr` | José Mourinho — Compact Counter 4-4-1-1 |
| `Lead_Outlet4141_def1` | `Allegri_LeadManagement4141_def1` | Massimiliano Allegri — Lead Management 4-1-4-1 |

Coach labels indicate tactical inspiration, not a verified exact reproduction of real coaches' mechanics.

## Requirements

1. **Zero tactical behavior drift:** native numeric controls, priority, 11-player formations, role identifiers, allowed situations, risk-class/veto rules, STEP adjacency and selection ranking stay unchanged. Only canonical identity and human-facing text change.
2. **Active production:** 12 coach-named choices, no `MidBlock_*` or `Lead_Outlet*` ID/name in dropdown, browser preset library or menu. Internal non-facing situation keys such as `midblock_safe_control` remain unchanged for stable telemetry semantics and v10 analytics.
3. **Compatibility:** resolve exact three legacy v10 IDs when reading saved selections/progression or explicit application requests; never silently promote arbitrary custom names to production. Discard retired built-in duplicates from current local/server preset selection, preserving unrelated user-defined custom presets. No API data mutation.
4. **Telemetry:** new observed applies are attributed to new canonical ID with unchanged native vector; existing rows retain their original source strings, game ID, phase IDs, score, version and timestamps. v10-only summaries may aggregate exact legacy aliases with canonical IDs, without merging v8/v9 cohorts or inflating unique preset counts.
5. **Publication:** one bounded PR, canonical exact-head `SLF CI / ci` and automatic userscript release, followed by live user update and first-match acceptance. VPS exporter deployment remains separate.

## Source boundary

`src/modules/tactics-presets/**`, related `src/app/tactics-dropdown-ui-policy.js`, `src/modules/strategy-data-recommendations/re-preset-family.js`, `src/modules/manual-match-telemetry/**`, `data/tactics/active-preset-inventory-v3.json`, linked tools/browser tests, `vps/exporter-rag/**`, `specs/333-coach-named-v10-presets/**`.

Excluded: generator algorithm, sliders, formations, historical production rows, API writes, database/storage schema or authentication changes, generated release artifact edits, auto-apply.

## Acceptance

- 12 production labels contain real coach names and numeric/formation vectors are byte-equivalent by alias to previous release.
- All three old names resolve on runtime reads but do not reappear in selector/active registry.
- Exact same recommendation outcomes for identical match contexts after applying the alias mapping.
- v10 old/new rows aggregate under one canonical variant; v9 rows preserve their historical identity and never qualify as v10.
- CI/browser E2E, inventory deterministic parity, automatic release evidence, no additional user decision within scope.
