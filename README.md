# SLF

SLF userscript project.

This repository is the source of truth for SLF contracts, editable module source, and generated Tampermonkey release artifacts.

## Development workflow

The canonical workflow is:

```text
Issue → fresh disposable task/domain branch → pull request → CI validation → merge into main → automatic release when required
```

`main` is the only long-term source of truth after integration. Domain contracts define ownership and forbidden areas; they do not define permanent workflow branches.

GitHub operations are connector-first. When the connected GitHub app supports the required read or write action, agents must use it directly for repository inspection, branch creation, file updates, pull requests, CI status checks, reviews, and merges. A missing local checkout, GitHub CLI, or authenticated `gh` session is not a blocker for connector-supported work. Local `git` and `gh` are fallback tools only for operations that the connector cannot perform, such as gaps in local-worktree handling or unavailable log access.

Domain agents hand completed work to PM/Core Release internally in the same chat. They must not create module release manifests, bump the userscript version, or edit generated release artifacts. Routine manual GitHub Actions execution is not part of the normal workflow.

## Release channel

Tampermonkey reads:

- `releases/latest.meta.js`
- `releases/latest.user.js`

Eligible source or release-workflow changes merged into `main` trigger the Automatic Release Policy. Documentation-only changes do not create an empty userscript release. Manual workflow dispatch is fallback-only.

## VPS source baseline

Deployable VPS source is versioned under `vps/api/`, `vps/exporter-rag/`, and `vps/ops/`. Live data, environment values, credentials, generated export artifacts, and virtual environments remain outside Git. See `docs/decision_records/DR-008-vps-source-control-and-deployment-model.md`; DR-008 remains Proposed until an exact Git revision is deployed and rollback is verified.
