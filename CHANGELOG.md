# Changelog

## 4.4.72 - canonical baseline import

- Imported `SLF_Tactics_Helper_4_4_72_tactics_release.txt` as the canonical baseline.
- Created GitHub/Tampermonkey release files:
  - `releases/latest.user.js`
  - `releases/latest.meta.js`
  - `releases/SLF_4_4_72.user.js`
- Added `data/version.json`.
- Split baseline source into `src/core`, `src/app`, and `src/modules` according to the SLF branch contracts.
- Added build-based fallback flow through `tools/build-userscript.mjs` and `.github/workflows/build-release.yml`.
- No module business logic changed.
- Baseline SHA-256: `018d49a3e71d7e0ce3d154ff01ce9ced8eaa737cd475046ed5ba6152b7feb2f3`.

## Repository setup

- Added stable branch contracts.
- Added module release manifest folders.
- Added GitHub/Tampermonkey release-channel structure.
