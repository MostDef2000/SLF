## Change summary

<!-- Describe the behavioural or operational change. Do not list files only. -->

## Requirement and risk

- Requirement / issue:
- Risk class: low / normal / critical
- Affected boundaries: browser / API / storage / release / deployment / workflow / documentation
- Failure consequence:

## Scope approval

- Repository mutation: yes / no
- Approved behavioural scope:
- Approved changed files:
- Out of scope:
- Scope check presented before approval: yes / no
- Repository approval phrase: `commit approved` / not applicable
- Pre-approval technical detail: not shown / user explicitly requested
- Contract bootstrap from current `main`:
  - [ ] `contracts/SLF_GOVERNANCE.md`
  - [ ] `contracts/branches/project-manager.md`
  - [ ] `contracts/runtime/SLF_TASK_RUNTIME.md`
  - [ ] relevant domain contract under `contracts/branches/`

- [ ] No repository write occurred before `commit approved`.
- [ ] No code, diff, selectors, commands, implementation recipe, or speculative patch was shown before approval unless the user explicitly requested technical detail.
- [ ] Changed files and behavior remain inside the approved scope.

## Deliberate execution

- Reasoning mode: direct / structured / critical
- Classification reason:
- Plan:
- Material assumptions:
- Acceptance criteria:
- Counterexample or adversarial check:
- Observable evidence expected:
- Stop conditions:
- Residual risks:

- [ ] No hidden chain-of-thought or private scratchpad is included.
- [ ] Facts, assumptions, and inferences are separated.
- [ ] Success claims are backed by observable evidence.
- [ ] Generation and verification were performed as separate passes for structured or critical work.
- [ ] Critical work includes explicit operational approval and rollback evidence where applicable.

## Test design

- Behavioural contract being verified:
- Positive cases:
- Negative cases:
- Boundary cases:
- Production defect regression reference, if applicable:
- Mocks or fixtures used and why they match production:

## Validation evidence

- [ ] Syntax and static checks pass.
- [ ] Relevant unit, property, contract, integration, or browser tests pass.
- [ ] Exact generated artifact was tested when release output can change.
- [ ] Security checks pass or findings are linked to an approved risk record.
- [ ] Generated files were not edited manually.
- [ ] Release provenance is valid when publication can occur.

Commands, workflow runs, or evidence artifacts:

```text

```

## Compatibility and migration

- Schema or storage keys changed: yes / no
- Unique-key semantics changed: yes / no
- Migration required: yes / no
- Legacy read/write behaviour:
- Rollback compatibility:

## Security review

- Authentication or authorization changed: yes / no
- Secrets or token handling changed: yes / no
- Input, DOM, path, or command handling changed: yes / no
- GitHub Actions permissions or external actions changed: yes / no
- New external dependency or network destination: yes / no

## Release and deployment

- Userscript release required: yes / no
- VPS deployment required: yes / no
- Exact commit or artifact digest:
- Pre-deploy backup plan:
- Post-deploy verification plan:
- Rollback command and verification:

## Owner review

- Independent reviewer available: yes / no
- [ ] Repository owner reviewed the test oracle and expected failures.
- [ ] Repository owner confirmed that passing tests would detect the stated regression.
- [ ] CI evidence was checked and unresolved failures or skipped checks are documented.
- [ ] Critical-path work without an independent reviewer is covered by an accepted risk and compensating controls.
- [ ] Any accepted risk has an owner and review date.

Do not mark a change as independently reviewed unless a separate qualified reviewer actually reviewed it.
