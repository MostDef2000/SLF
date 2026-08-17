# FM 2026 UI migration audit

## Status

The migration is implemented as a staged, unmerged pull-request stack. Repository tests build a temporary candidate userscript from each reviewed revision. No candidate has been published, merged to `main`, or deployed to production by this work.

## Design boundary

The redesigned shell is detected through `.fm-stage`, `.fm-topbar`, `.fm-deck`, and `.content-ui__wrapper`.

SLF-owned page modules belong inside `.content-ui__wrapper`. They must not be mounted inside the global topbar, manager deck, or team-slot rail. Native game tables and forms remain in their existing page-owned sub-layouts; the adapters decorate them without changing business handlers.

FM styling consumes the host `--fm-*` variables through SLF aliases. Existing component IDs are preserved so module behavior and tests remain stable.

## Implemented stages

### Stage 1 — match and tactics

- match parser panel;
- manual coach hint and recommendation content;
- tactics dropdown and save dialog;
- runtime version badge;
- classic-DOM fallback.

### Stage 2 — transfers

- analyzer toolbar and status;
- candidate scanner;
- purchase forecast;
- transfer history;
- row-analysis cells, chips, and tooltip portals.

### Stage 3 — team and training

- training reference guide;
- loan-limit helper;
- saved-form notice;
- championship table.

The former read-only leadership-upgrade badge is retired because FM2026 now provides the native leadership control. SLF no longer scans player pages or renders a duplicate leadership indicator.

### Stage 4 — responsive and accessibility gates

- desktop, 1024 px, and 820 px browser contexts;
- content containment and horizontal-overflow checks;
- keyboard focus and Enter activation;
- visible focus assertion;
- reduced-motion assertion;
- computed contrast threshold of 4.5:1 for tested panels.

## Rendered-content review

The migration does not treat `innerHTML` as safe by itself. Each reviewed external-data surface has a specific encoding or validation boundary:

| Surface | External source | Required control |
| --- | --- | --- |
| Purchase forecast rows | VPS `transfer_history` records | Encode rendered text and attributes; accept only safe same-origin player links or rebuild the link from a numeric player ID |
| Championship table | fetched championship HTML | Encode team names, season, cells, titles, and href values |
| Training benchmark table | VPS cache and fetched league pages | Encode roles, source names, title attributes, and rendered values |
| Manual recommendation | parsed match state | Encode context, action, decision, and candidate text |
| Saved-form notice | fetched form page | Insert only the date token selected by the numeric date regex |

The permanent hostile-string browser scenarios use encoded markup as source data and assert that no executable element or event handler appears in the destination DOM. The transfer scenario also rejects `javascript:` player links.

## Retained classic selectors

Classic selectors are compatibility boundaries, not evidence that the FM migration is incomplete. Their removal requires production evidence for every supported route.

The machine-readable inventory is `data/quality/fm2026-ui-migration-v1.json`. It records each selector, its owner, current purpose, and removal condition.

Important retained contracts include:

- `.match_content` for classic match pages;
- `.team_general_content` for native Team4 and tactic sub-layouts;
- `.pad2` for classic training pages;
- `#head` as the legacy match-panel insertion anchor;
- `#generallist` as the native Team4 roster table contract;
- `.team_general_calendar` as the native form-status target.

None may be removed solely because an FM fixture passes. Removal requires observed production coverage and an owner-approved compatibility decision.

## Evidence and rollout

A stage is repository-complete only when its final head passes the exact candidate artifact, Chromium, security, reliability, provenance, reachability, and aggregate gates applicable to its diff.

Repository evidence is not production evidence. Merge, release publication, production deployment, and classic-fallback removal remain separate owner-approved actions.
