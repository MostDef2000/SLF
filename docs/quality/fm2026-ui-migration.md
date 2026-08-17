# FM 2026 UI migration

## Source design contract

The redesigned game shell is detected structurally rather than by theme name or page text. The supported shell markers are:

- `.fm-topbar` and `.fm-topbar-spacer` for the fixed global header;
- `.fm-deck` and `.fm-deck__grid` for manager, club, character, and match cards;
- `.fm-stage` for the page workspace;
- `.fm-slots` for the team rail;
- `.content-ui__wrapper` for page-owned content and SLF module mounts;
- CSS custom properties prefixed with `--fm-` for palette, typography, borders, and radius.

SLF modules must not mount interactive panels into `.fm-topbar`, `.fm-deck`, or `.fm-slots` unless a module has a separately documented header or rail integration contract.

## Migration architecture

The app-level design adapter is intentionally placed in `src/app/version-badge.js`, immediately after `src/app/ui-layer.js` in the existing bundle. This keeps the 56-module bundle order unchanged and avoids adding a new dependency edge.

The adapter:

1. detects the FM 2026 shell;
2. marks the document with `data-slf-design="fm2026"` or `legacy`;
3. injects common SLF component styles backed by `--fm-*` variables;
4. decorates existing match, tactics, and save-dialog controls;
5. relocates a body-mounted match panel into `.content-ui__wrapper` when required;
6. mounts the runtime version badge in the manager status area with legacy fallback;
7. keeps existing IDs and behavioural handlers unchanged.

## Migration batches

### Batch 1: foundation, match, and tactics

- common design adapter;
- match parser and recommendation panel;
- tactic preset dropdown and save dialog;
- manual hint button and foreign-match selector through shared ID-based styling;
- version badge;
- exact-artifact Chromium fixture for the new shell.

### Batch 2: transfer modules

- transfer analyzer toolbar and row badges;
- purchase forecast panel;
- history hydration status and filters;
- responsive layouts inside `.content-ui__wrapper`;
- no fixed 720/430 pixel split without an overflow contract.

### Batch 3: team and training modules

- training reference guide;
- loan-limit helper;
- saved-form notice;
- championship table;
- team page layout wrappers.

The former leadership-upgrade indicator is retired in favor of FM2026's native leadership control. It no longer scans player pages or renders an SLF badge.

### Batch 4: visual and security closure

- malicious-string fixtures for rendered server/page text;
- responsive browser fixtures;
- duplicate mount checks after AJAX and shell mutations;
- removal of remaining old palette literals where they affect FM 2026 pages;
- review of every SLF `innerHTML` sink used by migrated panels.

## Acceptance rules

A migrated module must:

- preserve its API, storage, and telemetry contracts unless separately versioned;
- mount within the page-owned content root;
- use common SLF classes and FM variables instead of copying the site stylesheet;
- retain legacy fallbacks until legacy support is explicitly removed;
- prevent duplicate UI after repeated mount calls and DOM mutations;
- pass exact candidate artifact browser tests;
- provide failure screenshots and traces through the quality integration workflow.

## Integration sequencing

Stage 1 was merged before Stage 2 was retargeted to `main`. The Stage 2 branch records this sequencing change with a new head commit so every source-sensitive workflow reruns against the current integration base before merge.

Stage 2 was merged before Stage 3 was retargeted to `main`. The Stage 3 branch carries forward the prior sequencing evidence and records a new head commit so team and training fixtures rerun against the integrated transfer UI.
