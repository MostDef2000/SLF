# SLF Global Rules

Version: 2.0.0
Status: Compatibility contract

This file is not the highest-priority source of truth. Current execution must follow, in order:

1. `contracts/SLF_GOVERNANCE.md`
2. `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`
3. `contracts/runtime/SLF_TASK_RUNTIME.md`
4. the relevant active branch/domain contract

If this compatibility document conflicts with those contracts, the higher-priority contract wins.

## Execution model

- Normal work uses a fresh disposable task branch created from a rechecked current `main`.
- Domain names identify responsibility, not permanent working branches.
- The user interacts with one same-chat orchestration flow; internal agent handoffs do not require manual copying.
- Repository writes require a valid post-scope approval under the active governance contracts.
- Generated release artifacts are not editable implementation source.

## Domain ownership

Active responsibility domains include:

- Task Intake;
- Project Manager / Orchestrator;
- Strategy Data Recommendations;
- Transfer Analyzer;
- Team Management;
- Server/API Operations;
- Knowledge Export/RAG;
- Core Release;
- Review/Integrity Gate.

Detailed ownership is defined in `contracts/branches/*.md` and `contracts/branch-map.json`.

## Release model

- Editable runtime source lives under `src/**`.
- `src/app/bundle-order.json` defines deterministic userscript assembly order.
- Eligible merges or pushes to `main` are validated and released by `.github/workflows/build-latest-release.yml`.
- `workflow_dispatch` is a fallback, not the normal release path.
- The supported publication model is latest-only.
- Generated artifacts include `releases/latest.user.js`, `releases/latest.meta.js`, `data/version.json`, and `CHANGELOG.md`.
- Do not create or require `module-releases/**` manifests or archived per-version userscripts unless a future accepted contract explicitly restores them.

## GitHub and Tampermonkey channel

GitHub repository `MostDef2000/SLF` is the code and release source.

Tampermonkey updates through:

```text
@updateURL   https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.meta.js
@downloadURL https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.user.js
```

`@name` and `@namespace` remain stable unless an explicitly approved migration changes them.
