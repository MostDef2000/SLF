# 001-sdd-adoption — Plan

## HOW

Port the delivery-orchestrator model onto SLF's existing contract set, adapting terminology instead of replacing contracts:

| concept | SLF adaptation |
|---|---|
| approval phrase | exact lowercase `commit approved` per `contracts/SLF_SCOPE_APPROVAL_POLICY.md` |
| scope admission | visible Implementation Scope Check (behavior, files, exclusions, risks, verification, release impact) |
| checkpoint | `SLF Delivery Checkpoint v2` |
| runtime contours | Userscript (`src/**` → Tampermonkey release channel) + VPS (`vps/**`) |
| release authority | automatic release policy on eligible changes; no manual bypass |
| GitHub route | GitHub Connector primary; credentials never stored in repository files |

## Affected contours

- Control plane only. Userscript and VPS runtime contours untouched.

## Risk profile

`Risk profile: NOT REQUIRED` — docs/control-plane change; no runtime code, workflow YAML, generated artifacts, or secrets.

## Test design

- unit: NOT REQUIRED (no executable product source changed)
- integration: canonical `SLF CI / ci` validation remains the merge gate
- end-to-end: PR → CI → merge lifecycle verifies the delivery path
- runtime-manual: agent loading verifies repository-native orchestration

## Correct-course

Contracts remain authoritative. If future agent wording conflicts with active contracts, update the agent/SDD layer rather than weakening governance.

## Decisions / rejected alternatives

- Keep `commit approved` as the only source authorization phrase.
- Keep one Delivery Orchestrator instead of multiple competing agents.
- Keep `SLF CI / ci` as the merge gate; workflow implementation details do not replace canonical context semantics.
- Keep local connector credentials outside Git.
