# 001-sdd-adoption — Tasks

## Definition of Done

All tasks complete, PR merged into `main` with green canonical CI, no secrets tracked, docs consistent with active contracts.

| # | Task | Acceptance evidence | Status |
|---|---|---|---|
| 1 | Write `AGENTS.md` (orchestrator rules, resumable delivery, tool routing) | file tracked on task branch | DONE |
| 2 | Write `.opencode/agents/slf-delivery-orchestrator.md` | agent loads in opencode; lifecycle matches contracts | DONE |
| 3 | Write `.specify/memory/constitution.md` + `specs/README.md` | SDD layer documented | DONE |
| 4 | Configure GitHub MCP connector without token in files (`gh auth token` wrapper) + `.gitignore` for `opencode.json` | live connector read of Issues/version manifest succeeded | DONE |
| 5 | Create `specs/001-sdd-adoption/` artifacts (this feature) | spec/plan/tasks tracked | DONE |
| 6 | Branch → commits → PR → canonical CI → exact-green-head merge | PR #263 merged into `main`; exact reviewed head had `SLF CI / ci = SUCCESS` | DONE |
| 7 | Release evaluation: docs-only ⇒ no userscript release | no release commit expected; Tampermonkey update NOT REQUIRED | DONE |
