# DR-006 — Review gate verdicts

Status: Active
Date: 2026-06-25
Decision: Review and release gate agents must end with one standard verdict.
Scope: Review & Release Gate, Core Release intake, module review tasks.

## Context

SLF release decisions need a clear final state. Ambiguous review language creates uncertainty about whether Core Release may proceed.

## Decision

Every review/release gate response must end with exactly one verdict:

```text
APPROVED FOR RELEASE
CHANGES REQUIRED
BLOCKED
```

The verdict must include:

```text
Verdict:
Reason:
Scope checked:
Changed files checked:
Checks/evidence:
Required next action:
```

## Consequences

- Release readiness is explicit.
- Fixable implementation issues use `CHANGES REQUIRED`.
- Missing context, unavailable API/source data, contract violations, or unsafe operations use `BLOCKED`.
- Approved work can move to Core Release without another interpretation pass.

## Related contracts

- `contracts/SLF_GOVERNANCE.md`
- `contracts/branches/core-release.md`
