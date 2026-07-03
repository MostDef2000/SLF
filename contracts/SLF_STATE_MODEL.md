# SLF State Machine Definition (Final)

## States

INIT
ROUTING
EXECUTING
BLOCKED
RECOVERING
RETRYING
CONSOLIDATING
BUILDING
RELEASING
COMPLETE
FAILED

## Transitions

INIT -> ROUTING
ROUTING -> EXECUTING
EXECUTING -> BLOCKED
BLOCKED -> RECOVERING
RECOVERING -> RETRYING
RETRYING -> EXECUTING
EXECUTING -> CONSOLIDATING
CONSOLIDATING -> BUILDING
BUILDING -> RELEASING
RELEASING -> COMPLETE

ANY -> FAILED only when recovery is not possible

## Rules

- Only one active state at a time
- Agent-level BLOCKED means the worker cannot continue inside its authority
- Orchestrator-level BLOCKED is a routing state
- When recovery is safe, BLOCKED goes to RECOVERING
- Orchestrator is the only entity allowed to change system state
- Agents return READY_FOR_ROUTING, BLOCKED, or FAILED
- Agents do not set COMPLETE

## Completion Conditions

Runtime or release tasks are COMPLETE only if:
- all required agents executed
- git is synced to main
- build is successful when required
- runtime is validated or marked for manual browser check

Docs or contracts-only tasks are COMPLETE only if:
- approved docs/contracts files are committed to main
- changed files are verified on main
- no runtime build is required

END
