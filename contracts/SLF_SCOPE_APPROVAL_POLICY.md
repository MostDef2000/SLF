# SLF Scope Approval Policy

Version: 1.0.0
Status: Active
Applies to: all SLF agents and every repository mutation
Source of truth: GitHub `main`

## 1. Purpose

This policy defines the user-facing approval boundary for SLF development.

Its purpose is to keep the user focused on product behaviour while the agent owns technical implementation, testing, pull requests, CI, merge, and release handling.

Where an older contract accepts broader approval wording or permits technical implementation detail before scope approval, this policy has priority.

## 2. Mandatory contract bootstrap

Before presenting a new implementation scope, the responsible agent must reread the current versions from `main` of:

- `contracts/SLF_GOVERNANCE.md`;
- `contracts/branches/project-manager.md`;
- `contracts/runtime/SLF_TASK_RUNTIME.md`;
- the relevant active domain contract under `contracts/branches/`.

The agent must not rely on remembered or stale chat wording when the repository contracts are available.

## 3. Scope-first interaction

Before any repository write, the agent must present:

```text
Implementation Scope Check
```

The scope check must use plain product and behavioural language and include:

- intended behaviour;
- intended changed-file set or file categories;
- out-of-scope areas;
- material risks;
- verification plan;
- release impact.

The scope check must not expose code, diffs, selectors, commands, implementation recipes, or speculative patches unless the user explicitly asks for technical detail.

## 4. Canonical approval phrase

The only phrase that authorizes repository writes is:

```text
commit approved
```

The phrase is valid only after the current `Implementation Scope Check` has been presented.

No other wording is repository-write approval. In particular, `делай`, `продолжай`, `внедряй`, `готовь ветку`, `делай реализацию`, uppercase variants, silence, and general satisfaction remain discussion context until the exact canonical phrase is provided.

## 5. Post-approval execution

After `commit approved`, the authorization persists for the exact approved scope through all deterministic safe phases:

```text
implementation
→ branch commit
→ pull request
→ CI validation
→ merge into main
→ automatic release when applicable
→ release verification
→ terminal user handoff
```

The agent must not ask the user to approve internal technical choices, individual files, commits, PR creation, CI, merge, or automatic release when those actions remain inside the approved scope.

## 6. Reapproval boundary

A new `Implementation Scope Check` and a new `commit approved` are required before:

- expanding behavioural scope;
- changing files outside the approved set or categories;
- introducing a destructive or irreversible action;
- changing secrets, credentials, storage keys, schema, migration, or protected files beyond the approved plan;
- redesigning behaviour after validation failure;
- performing a separately governed production operation not included in the approved scope.

Tool changes, retries, interruptions, CI waiting, connector fallback, or continuation in a later message do not invalidate approval.

## 7. User-facing reporting

Before approval, report only scope, assumptions, risks, and acceptance criteria unless the user requests technical detail.

After approval, routine progress updates should remain concise. The terminal response should report:

- behaviour delivered;
- verification evidence;
- branch, commit, PR, CI, merge, and release status as applicable;
- remaining user action, if any.

Do not hand the user speculative code as a substitute for implementation when repository execution is available.
