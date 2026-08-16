---
name: SLF Backlog Task
description: Convert a raw idea into an agent-ready SLF backlog task
title: "[SLF] "
labels: ["status:needs-triage"]
body:
  - type: markdown
    attributes:
      value: |
        Use this template for SLF backlog tasks created from raw user ideas.
        Preserve the original idea in Author note and normalize the task separately.

  - type: textarea
    id: author-note
    attributes:
      label: Author note
      description: Paste the raw user idea verbatim. Do not rewrite it.
      placeholder: "Original raw idea..."
    validations:
      required: true

  - type: dropdown
    id: backlog-decision
    attributes:
      label: Backlog decision
      options:
        - NEW TASK
        - DUPLICATE
        - EXTENSION
        - NEEDS CLARIFICATION
    validations:
      required: true

  - type: textarea
    id: duplicate-extension-check
    attributes:
      label: Duplicate / extension check
      description: Link related issues if this is a duplicate or extension.
      placeholder: |
        Result:
        Related issue(s):
    validations:
      required: false

  - type: textarea
    id: pm-summary
    attributes:
      label: PM summary
      description: Short normalized summary.
      placeholder: "What this task is about."
    validations:
      required: true

  - type: textarea
    id: problem
    attributes:
      label: Problem
      description: What is wrong or missing now?
      placeholder: "Current behavior / gap."
    validations:
      required: true

  - type: textarea
    id: expected-behavior
    attributes:
      label: Expected behavior
      description: What should happen?
      placeholder: "Desired behavior."
    validations:
      required: true

  - type: dropdown
    id: responsible-agent
    attributes:
      label: Responsible agent
      options:
        - Team Management Agent
        - Transfer Analyzer Agent
        - Strategy Data Agent
        - Core Release Agent
        - Server/API/Security
        - Governance/Contracts
    validations:
      required: true

  - type: textarea
    id: scope
    attributes:
      label: Scope
      description: What may be changed?
      placeholder: |
        Allowed modules/files:
        Allowed behavior changes:
    validations:
      required: true

  - type: textarea
    id: out-of-scope
    attributes:
      label: Out of scope
      description: What must not be changed?
      placeholder: |
        Do not change:
        - release artifacts
        - unrelated modules
    validations:
      required: true

  - type: dropdown
    id: implementation-mode
    attributes:
      label: Suggested implementation mode
      options:
        - DISCUSSION ONLY first
        - Ready for commit approved after plan
        - Governance-only
        - Manual fallback
    validations:
      required: true

  - type: textarea
    id: acceptance-checks
    attributes:
      label: Acceptance checks
      description: Browser/runtime checks or validation steps.
      placeholder: |
        1.
        2.
        3.
    validations:
      required: true

  - type: textarea
    id: risks
    attributes:
      label: Risks
      placeholder: |
        -
    validations:
      required: false

  - type: dropdown
    id: cache-schema-storage-impact
    attributes:
      label: Cache/schema/storage impact
      options:
        - Unknown
        - NO
        - YES
    validations:
      required: true

  - type: dropdown
    id: bundle-order-impact
    attributes:
      label: Bundle-order impact
      options:
        - Unknown
        - NO
        - YES
    validations:
      required: true

  - type: textarea
    id: changelog-notes-draft
    attributes:
      label: Changelog notes draft
      placeholder: |
        User-visible/runtime changes:
        -

        Technical changes:
        -

        Storage/cache/schema impact:
        -

        Compatibility/safety:
        -
    validations:
      required: true

  - type: textarea
    id: agent-prompt
    attributes:
      label: Agent prompt
      description: Direct prompt to send to the responsible agent.
      placeholder: |
        DISCUSSION ONLY.

        Active Task:

        Problem:

        Do not commit yet.
        First return root cause, implementation plan, intended changed files, risks, checks.
    validations:
      required: true

  - type: textarea
    id: release-traceability
    attributes:
      label: Release traceability
      description: Fill during implementation/release.
      placeholder: |
        Module approved commit/range:
        Core Release integration commit:
        Release version:
        GitHub Actions result:
        Browser test result:
        Follow-up tasks:
    validations:
      required: false
