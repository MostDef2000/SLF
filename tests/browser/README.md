# Exact userscript browser E2E

This suite executes the published `releases/latest.user.js` artifact in headless Chromium. It does not reconstruct the userscript from source modules.

## Covered fixtures

- owned live match;
- owned live match with VPS API offline;
- foreign live match;
- finished match;
- incomplete match DOM;
- team tactic page;
- transfer page.

All fixtures are synthetic and contain no production user, player, or match data.

## Assertions

The harness fails when:

- the exact artifact raises a top-level browser exception;
- an unhandled promise rejection occurs;
- runtime version metadata differs from `data/version.json`;
- the parser panel, manual hint button, or tactic dropdown does not mount where required;
- repeated DOM mutations create duplicate SLF controls;
- an owned manual hint does not emit a versioned snapshot;
- a foreign manual hint emits owned-match telemetry;
- the finished-match button emits live telemetry or fails to emit a final result;
- an unavailable API prevents the UI from mounting.

Failure screenshots and Playwright traces are uploaded by the workflow.

## Runtime boundary

Tampermonkey APIs and the VPS transport are represented by narrow browser stubs. Internal SLF modules are not mocked. The script under test remains the exact generated artifact.

The browser dependency is pinned in `tests/browser/requirements.txt`; Chromium is installed by the matching Playwright CLI in CI.
