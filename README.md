# SLF

SLF userscript project.

This repository is the source of truth for SLF module contracts, module release manifests, and the final Tampermonkey userscript release files.

## Branch workflow

Development is split by workflow branches:

- `strategy-data-recommendations`
- `transfer-analyzer`
- `team-management`
- `core-release`

Module branches produce module release manifests. `core-release` integrates explicitly requested module releases into one bundled Tampermonkey userscript.

## Release channel

Tampermonkey reads:

- `releases/latest.meta.js`
- `releases/latest.user.js`

The initial GitHub update-channel migration is manual. After that, Tampermonkey updates through `@updateURL` and `@downloadURL`.
