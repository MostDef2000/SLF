# SLF Agent Entry Point

Status: Active

This file is the concise adapter for coding agents. Canonical rules remain:

- `contracts/SLF_GOVERNANCE.md`;
- `contracts/SLF_SCOPE_APPROVAL_POLICY.md`;
- `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`;
- `contracts/SLF_WORKFLOW_LIFECYCLE_POLICY.md`;
- `contracts/runtime/SLF_TASK_RUNTIME.md`;
- `contracts/runtime/RELEASE_READINESS_GATE.md`.

Canonical SDD entry points are `.specify/memory/constitution.md`, `specs/README.md`, and the active `specs/<feature>/{spec,plan,tasks}.md` artifacts.

## Canonical delivery role

The active orchestration role is **SLF Delivery Orchestrator**. It retains one task context from read-only Task Intake through Implementation Scope Check, implementation, integrity validation, PR/CI, exact-green-head merge, automatic release evaluation, release verification, and terminal Issue evidence. For an existing task, that context is resumable from the canonical Issue `SLF Delivery Checkpoint v2`.

`contracts/branches/project-manager.md` is a compatibility path. Domain files under `contracts/branches/` are on-demand review lenses/checklists; they do not create a second orchestrator.

## Mandatory operating rules

1. Treat GitHub `main` as the only long-term source of truth for repository/product state. Published artifacts live on the protected `release` branch.
2. Treat the canonical Issue as durable delivery-control truth for an existing task: admitted scope, authorization receipt, Delivery Checkpoint and exact evidence cursors.
3. Treat the live conversation as transient interaction state used for new source-admission decisions, not as the durable execution cursor.
4. Start new implementation from a canonical Issue and explicit Implementation Scope Check.
5. Before asking for `commit approved`, show the complete visible Implementation Scope Check (behavior, file categories, exclusions, risks, verification, release impact) as the last substantive assistant content; approval is valid only in the immediately following user turn.
6. The only phrase that authorizes repository writes is the exact lowercase phrase `commit approved`. It authorizes only the bounded reversible lifecycle inside the approved scope.
7. After valid approval persist a durable authorization receipt and machine-readable `SLF Delivery Checkpoint v2`; the receipt may continue only the same exact admitted scope and cannot create, widen, or replace source authority.
8. Generated outputs are never editable source: `releases/latest.user.js`, `releases/latest.meta.js`, `data/version.json`, `data/release-evidence.json`, `CHANGELOG.md`.
9. Significant implementation/control-plane work creates or updates linked `spec.md`, `plan.md`, and `tasks.md` under `specs/**`.
10. Use one fresh branch from current `main` and one bounded PR for one canonical task. Material scope changes require fresh source authorization.
11. Keep the PR description synchronized with the exact diff, risk profile, and release impact.
12. Merge requires fresh base/head/scope checks and required CI checks on the exact head.
13. Merge, release, deployment, runtime verification and product acceptance are distinct states. Releases follow `SLF_AUTOMATIC_RELEASE_POLICY.md`; manual workflow dispatch is fallback-only.
14. Never commit secrets, credentials, local runtime state, `.env`, virtual environments, logs or generated output outside canonical generated paths.
15. While a safe authorized next action is executable now, continue automatically; do not return control at deterministic intermediate stages.
16. Tool routing is deny by default. Availability never grants permission.
17. For a known task with a valid checkpoint, perform bounded Resume Probe before any full project recovery.
18. Context compaction, session restart, response truncation or model-memory loss does not itself invalidate source authorization, return an admitted task to discussion, or justify repeated Task Intake. `CONTEXT_LOSS` is not an invalidation reason.
19. Connector reads after task resolution follow `known object -> metadata -> targeted detail -> failure fragment`; equivalent reads are forbidden unless a canonical gate requires a fresh read.
20. Checkpoint updates occur at meaningful lifecycle/evidence transitions, not after every tool call, and always record `Next admissible action`.
21. Lifecycle state is monotonic. Backward/source-reauthorization transition requires a concrete recorded invalidation such as `MATERIAL_SCOPE_CHANGE`, `PROTECTED_BOUNDARY_CHANGE`, `USER_CHANGED_OUTCOME`, `MATERIAL_MAIN_DIVERGENCE`, or `EVIDENCE_CONTRADICTION`.
22. In a synchronous session, when no safe action is executable now and progress depends only on a machine-observable external transition, persist `WAITING_EXTERNAL` in the checkpoint and return control without promising background work. A resumed wait permits one bounded observation of its exact evidence cursor; unchanged evidence returns `WAITING_EXTERNAL` again without replanning.

## Resumable delivery contract

Truth classes are explicit:

- **Repository/product truth** — `main` (source, contracts, specs), the protected `release` branch (published latest-only artifacts), accepted runtime/release evidence.
- **Delivery-control truth** — canonical Issue, authorization receipt, `SLF Delivery Checkpoint v2`, branch/PR/head, completed gates and evidence cursors.
- **Transient interaction state** — current chat used for initial visible Implementation Scope Check -> immediately-following `commit approved` admission.

A known task Resume Probe is bounded to current `main`, the canonical Issue checkpoint, exact referenced PR/head/status or evidence whose cursor may have changed, and the recorded `Next admissible action`. Full project recovery is allowed only when no valid checkpoint exists, task identity cannot be resolved, the checkpoint is invalid, or durable evidence materially contradicts it.

## Runtime contours

SLF has exactly two active production contours:

- **Userscript** — `src/**`, assembled by `tools/build-latest-userscript.mjs` into Tampermonkey artifacts via CI (`build-latest-release.yml`). Release channel: `releases/latest.meta.js` / `releases/latest.user.js` on the `release` branch.
- **VPS** — `vps/api/**`, `vps/exporter-rag/**`, `vps/ops/**`. Live data and environment values stay on the VPS, never in Git (DR-008, DR-009).

## Tool Routing Allowlist — DENY BY DEFAULT

| Task class | Allowed primary route | Allowed fallback |
|---|---|---|
| GitHub repository lifecycle: repo/Issue/PR/comments/branches/source publication/merge | GitHub Connector (MCP) | Local `git`/`gh` only for operations the connector cannot perform |
| CI status/jobs/logs/artifacts | GitHub Connector | One bounded read-only GitHub API command |
| Patch/build/test/hash/static analysis | Ephemeral local tooling | Local checkout for preparation/validation; never publication |
| External technical documentation | Read-only web using primary/official sources only | NONE |
| User-provided logs/screenshots/config/files | Read supplied material directly | NONE |
| Passwords/tokens/credentials | Operator enters locally into intended prompt/secret store | NONE; protected values never enter chat or Git |

Explicit forbidden implicit fallbacks include Gmail, Calendar, Drive, Notion, manual GitHub web publication, ad-hoc SSH exploration, direct database mutation, cloud-console mutation and every other unlisted connector/plugin/service.

Local ephemeral tooling is computation only. It may prepare or validate bytes but never becomes repository publication authority or production mutation evidence by itself.

## Interaction budget

For a normal task:

```text
Visible Implementation Scope Check: mandatory immediately preceding assistant turn
Source authorization: 1 (exact phrase `commit approved`)
Intermediate deterministic confirmations: FORBIDDEN
```

Additional user interaction is justified only by material source reauthorization, protected credentials, irreversible/high-risk choice, or evidence unavailable to safe automation.

## Session disposition and terminal interaction contract

The Orchestrator may return control as nonterminal `WAITING_EXTERNAL`, or as one of exactly three terminal interaction states:

- `DONE`: approved outcome complete with all mandatory source, quality and acceptance evidence.
- `BLOCKED`: a concrete external blocker prevents continuation; record blocker evidence, unblock condition and next admissible action.
- `HUMAN DECISION REQUIRED`: genuine human decision, authorization, protected input/settings administration or irreversible/high-risk choice is required; state the exact action/reply.

`FAILED` is not a terminal interaction state; it is an internal event. PR created, CI running, merge ready, or release built are not terminal while a safe authorized next action is executable now.

## Delivery quality layer

Every linked significant PR carries NFR assessment in `spec.md`; risk profile, risk-based test design and correct-course check in `plan.md`; acceptance traceability and Definition of Done in `tasks.md`.

Quality verdicts are `PASS`, `CONCERNS`, `FAIL`, `WAIVED`. `FAIL` blocks PR admission. A waiver never bypasses source authorization, exact scope, secrets, CI, release gate or acceptance.
