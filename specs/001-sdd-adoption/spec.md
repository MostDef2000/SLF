# 001-sdd-adoption — Spec

Status: Active
Feature ID: `001-sdd-adoption`

## WHAT / WHY

SLF adopts the spec-driven delivery pipeline proven in the sibling sea-speed project: a single **SLF Delivery Orchestrator** role, durable Issue checkpoints, resumable task context, and a lightweight SDD artifact layer (`specs/<feature>/{spec,plan,tasks}.md`), driven locally through opencode with GitHub Connector (MCP) as the primary API route.

Without this, SLF agents rely on chat memory for delivery state, repeat Task Intake after context loss, and lack a durable feature-level record of WHAT/WHY/HOW.

## Intended behaviour (control plane, no product code)

- `AGENTS.md` is the canonical agent entry point with mandatory operating rules, resumable delivery contract, runtime contours and a DENY-BY-DEFAULT tool routing allowlist.
- `.opencode/agents/slf-delivery-orchestrator.md` defines the primary opencode agent implementing the lifecycle: Issue/Resume Probe → Task Intake → visible Implementation Scope Check → exact `commit approved` → authorization receipt + `SLF Delivery Checkpoint v2` → fresh branch → SDD artifacts → implementation/tests → PR → canonical CI → exact-green-head merge → automatic release evaluation → release verification.
- `.specify/memory/constitution.md` configures the SDD artifact layer (11 principles) under existing governance authority.
- `specs/README.md` records the source-of-truth hierarchy and normal flow.
- Local secret hygiene: `opencode.json` stays out of Git; the GitHub MCP connector obtains its token at runtime from the `gh` credential store, never from repository files.

## NFR assessment

| NFR | Target | Evidence method | Status |
|---|---|---|---|
| No secrets in Git | 0 secret-bearing files tracked | `git grep` + review of tracked set | PASS |
| Docs-only change | 0 changed files under `src/**`, `vps/**`, `.github/workflows/**` | PR diff inspection | PASS |
| Governance compatibility | Approval boundary unchanged (`commit approved`) | Cross-check vs `contracts/SLF_SCOPE_APPROVAL_POLICY.md` | PASS |

## Acceptance criteria

1. Tracked tree contains AGENTS.md, agent definition, constitution, specs layer, .gitignore; contains no local config or tokens.
2. Existing CI workflows and generated artifacts untouched.
3. Future tasks can start from a canonical Issue and resume from `SLF Delivery Checkpoint v2`.
