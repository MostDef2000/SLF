## Change summary

<!-- Describe the behavioural or operational change. Do not list files only. -->

## Requirement and risk

- Requirement / issue:
- Risk class: low / normal / critical
- Affected boundaries: browser / API / storage / release / deployment / workflow / documentation
- Failure consequence:

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

## Human review

- [ ] Test oracle and expected failures were reviewed by a human.
- [ ] Critical-path changes have an independent reviewer.
- [ ] Reviewers confirmed that passing tests would detect the stated regression.
- [ ] Any accepted risk has an owner and review date.
