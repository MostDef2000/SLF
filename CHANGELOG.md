# Changelog

## 4.4.98

### Release notes
- No module release notes provided.

Changed files:
- No changed files provided.

Approved commit:
- 2f228fe102e53edac394edad9fc366cff1fc253f

Compatibility / storage:
- Cache/schema/storage keys changed: UNKNOWN
- Bundle-order/module-registry changes needed: UNKNOWN

## 4.4.97

### core-release
- No module release notes provided.

Changed files:
- src/app/bundle-order.json

Approved commit:
- f17d659529b3b1fe5c6ac61b872304b2d671f600

Compatibility / storage:
- Cache/schema/storage keys changed: NO
- Bundle-order/module-registry changes needed: NO

## 4.4.96

### Release notes
- No module release notes provided.

Changed files:
- No changed files provided.

Approved commit:
- f17d659529b3b1fe5c6ac61b872304b2d671f600

Compatibility / storage:
- Cache/schema/storage keys changed: UNKNOWN
- Bundle-order/module-registry changes needed: UNKNOWN

## 4.4.95

### Release notes
- No module release notes provided.

Changed files:
- No changed files provided.

Approved commit:
- 2bcb3fbad58c5d6da9182f36e0b4b8b5713ce676

Compatibility / storage:
- Cache/schema/storage keys changed: UNKNOWN
- Bundle-order/module-registry changes needed: UNKNOWN

## 4.4.94

### Release notes
- No module release notes provided.

Changed files:
- No changed files provided.

Approved commit:
- 5452983b78789433b7e617ca10e10b935b078109

Compatibility / storage:
- Cache/schema/storage keys changed: UNKNOWN
- Bundle-order/module-registry changes needed: UNKNOWN

## 4.4.93

### Release notes
- No module release notes provided.

Changed files:
- No changed files provided.

Approved commit:
- 7c7ef21d96aaf30f67751788c63d002b39a53c95

Compatibility / storage:
- Cache/schema/storage keys changed: UNKNOWN
- Bundle-order/module-registry changes needed: UNKNOWN

## 4.4.92

- Integrated approved Team Management alter-minutes season/player matching fix.

## 4.4.91

- Integrated approved Team Management alter-minutes season/player matching fix.

## 4.4.90

- Integrated approved Team Management alter-minutes season/player matching fix.

## 4.4.89

- Integrated approved Team Management alter-minutes season/player matching fix.

## 4.4.88

- Integrated approved Team Management alter-minutes season/player matching fix.

## 4.4.87

- Integrated approved Team Management alter-minutes season/player matching fix.

## 4.4.86

- Integrated approved Team Management alter-minutes season/player matching fix.

## 4.4.85

- Integrated approved Team Management alter-minutes season/player matching fix.

## 4.4.84

- Integrated approved Team Management alter-minutes season/player matching fix.

## 4.4.83

- Integrated approved Team Management alter-minutes season/player matching fix.

## 4.4.82

- Integrated approved Team Management alter-minutes season/player matching fix.

## 4.4.81

- Integrated approved Team Management alter-minutes season/player matching fix.

## 4.4.80

- Integrated approved Team Management alter-minutes season/player matching fix.

## 4.4.79

- Integrated approved Team Management alter-minutes season/player matching fix.

## 4.4.78

- Integrated approved Team Management alter-minutes season/player matching fix.

## 4.4.77

- Integrated approved Team Management alter-minutes season/player matching fix.

## 4.4.76

- Integrated approved Team Management alter-minutes season/player matching fix.

## 4.4.75

- Integrated approved team-management module release from `c93da71006691ab93b96b3297f26c04ee35a7d4e`.

## 4.4.74

- Integrated approved Team Management module release from `ddb02d3b587abd0c4e56ece214a8717a58ceaede`.
- Fixed Team4 tooltip linking for alter current-season minutes.
- Added runtime version export so `SLF.scriptVersion` and `SLF.versionInfo` report `4.4.74`.

## 4.4.73

- Integrated approved Team Management module release from `a50700c8ea13a309ef935292f7f3d40f60234b1e`.
- Added alter.php current-season minutes bridge for Team4 tooltip data.
- Preserved approved module business logic without reinterpretation.
- Expected acceptance: alterId/playerId `5024317` shows `MIN 1813` in Team4 tooltip after alter.php cache sync.

## 4.4.72

- Bootstrap GitHub/Tampermonkey release channel.

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
