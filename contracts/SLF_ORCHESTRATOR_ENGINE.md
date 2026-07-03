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

User Input → Orchestrator → Agent Graph → Git State → Build → Release → Runtime

## Core Principle

Only Orchestrator controls:
- next agent selection
- failure handling
- retries
- Git recovery
- release triggering

Agents are stateless executors.

## Execution Loop

while state != COMPLETE:

    agent = select_agent(state)
    result = execute(agent)

    if result == READY:
        route_next()

    if result == BLOCKED:
        recover_git()
        retry(agent)

    if result == FAILED:
        if deterministic:
            retry
        else:
            escalate

    if result == COMPLETE:
        build_and_release()
        state = COMPLETE

## Git Model

- main = source of truth
- branches = temporary state
- commits = checkpoints

## Recovery Model

1. fetch main
2. reset branch
3. replay approved actions
4. retry execution

## Agent Model

Agents:
- stateless
- deterministic
- non-authoritative

## Agent Output Contract

READY_FOR_ROUTING
BLOCKED
FAILED

## Release Rule

Release triggers automatically at final stage.

END
