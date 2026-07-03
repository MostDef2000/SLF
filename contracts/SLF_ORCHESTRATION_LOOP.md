# SLF Orchestration Loop

## Principle

All agents are stateless executors.
Only the Orchestrator manages flow, routing, retries, and recovery.

## Execution model

- User submits task once
- Orchestrator controls full lifecycle
- Agents only return:
  - READY_FOR_ROUTING
  - BLOCKED
  - FAILED

## Routing rules

- READY_FOR_ROUTING → next agent automatically selected
- BLOCKED → automatic recovery attempt:
    - re-fetch main
    - re-apply patch
    - retry same agent once
    - if still blocked → escalate
- FAILED → escalate only if non-deterministic

## No user-driven routing

User does not select next agent.

User only:
- submits task
- approves COMMIT APPROVED when required

## Git handling

All Git conflicts are handled inside orchestration layer:
- stale SHA → auto rebase + retry
- diverged branch → auto reset from main + replay approved commits

## Completion rule

System completes only when:
- Core Release + Build finished
- main updated
- runtime verified

END
