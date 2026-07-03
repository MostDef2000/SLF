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

INIT → ROUTING
ROUTING → EXECUTING
EXECUTING → BLOCKED
BLOCKED → RECOVERING
RECOVERING → RETRYING
RETRYING → EXECUTING
EXECUTING → CONSOLIDATING
CONSOLIDATING → BUILDING
BUILDING → RELEASING
RELEASING → COMPLETE

ANY → FAILED (only non-recoverable)

## Rules

- Only one active state at a time
- BLOCKED always goes to RECOVERING
- Orchestrator is only entity allowed to change state

## Completion Condition

COMPLETE only if:
- all agents executed
- git synced to main
- build successful
- runtime validated

END
