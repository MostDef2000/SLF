# SLF Orchestrator Engine (Final Architecture)

## Purpose

The Orchestrator Engine is the single control system of SLF.

It is responsible for:
- task routing
- agent selection
- state transitions
- Git recovery
- execution continuity
- release orchestration

## System Model

User Input -> Orchestrator -> Agent Graph -> Git State -> Build -> Release -> Runtime

## Core Principle

Only Orchestrator controls:
- next agent selection
- failure handling
- retries
- Git recovery
- release triggering
- final task state

Agents are stateless executors.

## Execution Loop

while state not in [COMPLETE, FAILED]:

    agent = select_agent(state)
    result = execute(agent)

    if result == READY_FOR_ROUTING:
        route_next()

    if result == BLOCKED:
        recover_git_or_context()
        retry(agent)

    if result == FAILED:
        if deterministic:
            recover_and_retry_once()
        else:
            state = FAILED

    if final_stage_reached:
        validate_completion_conditions()
        state = COMPLETE

## Git Model

- main = source of truth
- branches = temporary state
- commits = checkpoints

## Recovery Model

1. fetch main
2. reset or recreate branch when needed
3. replay approved actions idempotently
4. retry execution once

## Agent Model

Agents:
- stateless
- deterministic
- non-authoritative

## Agent Output Contract

Agents may return only:

READY_FOR_ROUTING
BLOCKED
FAILED

Agents must not return COMPLETE as a system-level final state.

Only the Orchestrator may set COMPLETE or FAILED as terminal task states.

## BLOCKED Meaning

Agent-level BLOCKED means the worker cannot continue inside its authority.

Orchestrator-level BLOCKED is a recoverable routing state and should move to RECOVERING when recovery is safe.

## Completion Rules

Runtime or release tasks are COMPLETE only when:
- required agents executed
- git is synced to main
- build is successful when required
- runtime is validated or marked for manual browser check

Docs or contracts-only tasks are COMPLETE when:
- approved docs/contracts files are committed to main
- changed files are verified on main
- no runtime build is required

## Release Rule

Release triggers automatically only for runtime or release-tooling tasks.

Docs/contracts-only changes do not trigger userscript build.

END
