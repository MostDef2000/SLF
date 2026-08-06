# Userscript external dependency policy

## Current policy

The SLF userscript has no external `@require` dependencies.

All runtime JavaScript is assembled from repository-controlled modules listed in `src/app/bundle-order.json`. The userscript may still make reviewed network requests through its explicit `@connect` allowlist, but it does not download and execute a third-party JavaScript library before startup.

## Why jQuery was removed

The metadata header previously loaded jQuery 3.6.0 from `code.jquery.com`. No registered runtime module uses `jQuery` or the `$` alias. Keeping the directive therefore added a supply-chain execution boundary without providing runtime functionality.

The dependency was removed rather than vendored because no dependency is required.

## Enforcement

`tools/test-security-boundaries.mjs` verifies:

- the source header contains zero `@require` directives;
- every file registered by `src/app/bundle-order.json` has no executable `jQuery` identifier;
- every registered module has no `$` invocation, property, declaration, global access, or function-parameter alias associated with jQuery usage.

`tools/test-userscript-artifact-boundary.mjs` verifies after the exact candidate build:

- generated metadata contains zero `@require` directives;
- generated userscript contains zero `@require` directives;
- neither artifact contains `code.jquery.com`.

The exact browser E2E suite then executes the candidate without an injected external library.

## Change policy

A future external runtime dependency requires all of the following in a separate review:

1. a documented runtime requirement that cannot be satisfied by existing platform APIs;
2. license and source provenance review;
3. content-addressed or repository-controlled bytes;
4. exact-artifact verification of the dependency identity;
5. browser regression evidence with failure behavior documented;
6. an explicit update to the risk register and rollback procedure.

A versioned URL alone is not sufficient.

## Deployment and rollback

This repository change does not publish a userscript release. Publication remains a separate approved release action.

Rollback is a direct revert, but restoring an external `@require` must not occur without the dependency review above.
