# SLF Test Design Review Checklist

Use this checklist for changes that affect runtime behaviour, security, persistence, API contracts, release artifacts, deployment, or migrations.

## Change classification

- What user or system behaviour changes?
- Which components are affected?
- Which assets are affected?
  - userscript runtime
  - generated release artifact
  - browser UI
  - API
  - VPS storage
  - deployment automation
  - CI workflow

## Risk review

Document:

- failure modes;
- security risks;
- compatibility risks;
- migration risks;
- rollback strategy;
- observability requirements.

## Test contract

Before approving implementation, reviewers should be able to answer:

1. What behaviour must remain true?
2. What invalid behaviour must be rejected?
3. What boundary conditions exist?
4. Which production regression would this test prevent?
5. Does the test verify the contract or only the current implementation shape?

## Required evidence

Positive cases:

- normal successful flow;
- expected user path;
- expected API/storage interaction.

Negative cases:

- invalid input;
- unavailable dependency;
- corrupted state;
- duplicate operation;
- retry behaviour;
- permission failure.

Boundary cases:

- empty values;
- maximum values;
- transition states;
- old data formats;
- version changes;
- concurrent operations.

## Mock review

Mocks must not introduce methods, fields, or capabilities that production code does not have.

For every mock:

- why is this dependency mocked?
- why is this behaviour realistic?
- can the same failure happen in production?

## Artifact review

For generated releases:

- was the exact artifact tested?
- does the artifact contain the expected version?
- does the artifact preserve bundle order?
- are removed APIs still absent?
- does the artifact execute through bootstrap?

## Security review

Confirm applicable checks for:

- authentication;
- authorization;
- secrets;
- input validation;
- output encoding;
- DOM injection;
- path handling;
- dependency changes;
- workflow permissions.

## Approval rule

A passing automated test suite is evidence, not approval. Human review confirms that the test suite represents the intended security and reliability boundary.
