# 001-sdd-adoption — Plan

## HOW

Port the sea-speed delivery-orchestrator model onto SLF's existing contract set, adapting terminology instead of replacing contracts:

| sea-speed concept | SLF adaptation |
|---|---|
| `OUTCOME APPROVED` | exact lowercase `commit approved` (per `contracts/SLF_SCOPE_APPROVAL_POLICY.md`) |
| Outcome Contract / 6-field Scope | visible Implementation Scope Check (behavior, files, exclusions, risks, verification, release impact) |
| Sea Speed Delivery Checkpoint v2 | `SLF Delivery Checkpoint v2` |
| VPS + Ubuntu Worker contours | Userscript (`src/**` → Tampermonkey release channel) + VPS (`vps/**`) |
| Standing production delegation | not adopted — SLF releases run via automatic policy on push to `main` |
| GitHub Connector primary route | kept; token sourced at runtime from `gh auth store`, never in files |

## Affected contours

- Control plane only. Userscript and VPS runtime contours untouched.

## Risk profile

`Risk profile: NOT REQUIRED` — docs/control-plane change; no runtime code, no workflow YAML, no generated artifacts, no secrets.

## Test design

- unit: NOT REQUIRED (no executable source changed)
- integration: canonical `SLF CI / ci` is the only merge gate and must succeed on the exact final PR head
- end-to-end: PR → CI → merge lifecycle itself exercises the new pipeline
- runtime-manual: agent selection in opencode loads the new orchestrator definition

## Correct-course

If CI flags governance validators due to new top-level files, narrow the change set rather than weakening validators. If the orchestrator model conflicts with a future contract update, contracts win and AGENTS.md is amended.

## Decisions / rejected alternatives

- **Adapted SLF approval phrase instead of importing `OUTCOME APPROVED`** — keeps single authorization boundary consistent with active governance.
- **`opencode.json` excluded from Git (gitignored)** — machine-local paths and connector wiring are environment state, not repository truth.
- **Token via `gh auth token` wrapper instead of config/env file** — zero secret material in project files; single credential source for git and MCP.
