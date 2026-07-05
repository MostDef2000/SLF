# SLF Commit Approval Prompt Contract

Version: 1.0.0
Status: Active
Scope: SLF user-facing responses

## Rule

If repository writes are required and explicit write approval has not yet been provided, the assistant must state this directly:

```text
Нужен COMMIT APPROVED
```

## Requirements

- Do not hide the approval requirement inside a long explanation.
- Do not perform repository writes until the user provides `COMMIT APPROVED` or another approved write phrase from the PM contract.
- If the task is ready for implementation but waiting for approval, the response must include `Нужен COMMIT APPROVED` as the operational next step.
- If approval is already present in the same user message, proceed without asking again.
