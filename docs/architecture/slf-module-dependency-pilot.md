# SLF module dependency audit pilot

Status: Active pilot
Scope: eight base userscript modules
Runtime behavior impact: None

## Purpose

`src/app/bundle-order.json` remains the only source for deterministic userscript assembly. Its `files` array answers which files are concatenated and in which order, but the array alone does not describe shared globals or semantic dependencies.

The `dependencyAudit` block is a bounded pilot. It adds machine-checkable metadata for eight representative modules without introducing another runtime registry and without changing the assembled file order.

## Pilot modules

| Module | Public interface | Internal dependencies | Host capabilities |
| --- | --- | --- | --- |
| `src/core/domain.js` | `buildSlfUrl` | None | `location` |
| `src/core/config.js` | Shared configuration, state, preset data, logging, and numeric/team helpers | `PresetStorage`, `MatchStateParser`, `TacticPresetLibrary`, `UI` at runtime | `console`, `localStorage` |
| `src/core/token-storage.js` | `getApiToken`, `warnMissingApiTokenOnce` | None | Tampermonkey value/menu APIs, `prompt`, `alert`, `console` |
| `src/core/dom-utils.js` | `DomUtils` | None | DOM observer and timer APIs |
| `src/core/api.js` | `Api` and canonical API status/row helpers | `CONFIG`, logging helpers, and token helpers at runtime | `GM_xmlhttpRequest` |
| `src/modules/live-parser/match-state-parser.js` | `MatchTimingModel`, `MatchStateParser` | `toNum` at runtime | DOM, location, URL query API |
| `src/modules/live-parser/match-stats-parser.js` | `MatchStatsParser` | `CONFIG`, `aliasMatchesTeamName`, `toNum` at runtime | DOM |
| `src/modules/live-parser/squad-parser.js` | `SquadParser` | `toNum` at runtime | DOM |

The current pilot records 14 dependency symbols and 20 host capabilities.

## Metadata contract

Each audited module declares:

- `file`: its canonical bundle path;
- `declares`: every top-level global declaration owned by the file;
- `public`: the subset intended for cross-file use;
- `requires`: provider file, required symbols, and dependency phase;
- `hostCapabilities`: browser or Tampermonkey globals used by the module.

Dependency phases have different ordering rules:

- `evaluation`: the provider must precede the consumer because the symbol is needed while the consumer file is evaluated;
- `runtime`: the symbol is resolved only after the full bundle has loaded, so the provider must be registered but may appear later in the bundle.

## Validation

`node tools/check-bundle-order.mjs` keeps the existing all-bundle checks and additionally verifies the pilot:

1. between five and ten pilot modules are declared and the expected count matches;
2. every audited module and dependency provider is registered in the bundle;
3. audited top-level declarations match the corresponding source file;
4. duplicate audited global declarations are rejected;
5. public symbols are declared by their owner;
6. required symbols are declared by their provider and referenced by their consumer;
7. cross-use of a public symbol between two audited modules has an explicit dependency edge;
8. evaluation dependencies precede their consumers;
9. declared host capabilities are referenced by their module.

Providers outside the eight-module pilot are checked for a matching source declaration and bundle registration. Their full declaration list and public/private boundary are deliberately not inferred until they enter an approved future audit scope.

## Non-goals

This pilot does not:

- change runtime source or business behavior;
- reorder bundle files;
- replace `bundle-order.json`;
- infer every dependency across all 54 modules;
- isolate globals or convert modules to another module system;
- introduce a second standalone registry.

## Expansion decision

Expansion beyond eight modules should be a separate approved task. Before expanding, review whether the pilot:

- catches real dependency drift without frequent false failures;
- remains understandable during normal module edits;
- distinguishes evaluation and runtime dependencies correctly;
- adds enough CI value to justify maintaining more metadata.

If those conditions are met, extend the existing `dependencyAudit.modules` array incrementally by domain. Do not create a parallel manifest.

## Rollback

Rollback is deterministic: revert the `dependencyAudit` block, its validation logic, and this document in one change. The canonical `files` array and runtime source remain unaffected.
