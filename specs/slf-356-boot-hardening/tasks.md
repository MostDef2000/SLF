# Tasks — #356 boot hardening (per-step init isolation)

Checklist with Definition of Done. All items verified by the implementing agent before handoff; see spec.md acceptance criteria and plan.md test design.

- [x] [A1] Recon: read `bootstrap.js` (mountUI strict sequence, zero guards), `config.js` (debugWarn signature), `training-reference-guide.js` (eval-time self-start, body-null crash line), `team4-leadership-upgrade-indicator.js` (decorate marker overwrite), `check-bundle-order.mjs` (dependency audit + debug boundary), `test-loan-limit-fm2026.mjs` (stub conventions), both workflow files, spec format. — done (facts in delivery report)
- [x] [A2] `bootstrap.js` `mountUI()`: per-step try/catch ×6 in the existing order; failures log `'[SLF] <step> failed; continuing startup'` with the original error and the chain continues; observer mechanism, step order and dropdown existence check untouched. — done
- [x] [A3] Resolved debugWarn conflict per the order's fallback clause: `debugWarn` is in bundle scope but any reference fails the dependency audit ("uses undeclared audited dependency debugWarn — src/core/config.js", observed empirically; remedy = bundle-order.json edit, which is no-touch). Logging via `console.warn`, identical message format; deviation recorded in source comment + spec. — done
- [x] [A4] `training-reference-guide.js`: eval-time self-start defers `mount()` to `DOMContentLoaded` (`{ once: true }`) when `document.body` is null; idempotence semantics kept; one-line comment referencing the 2026-10-16 sweep. — done
- [x] [A5] `team4-leadership-upgrade-indicator.js` `decorate()`: `if (mount && !node.dataset.slfMount)` — single owner, bootstrap's `fm2026-training-before-champ` wins; one-line behavioural change + comment. — done
- [x] [A6] No touch: `bundle-order.json`, other modules, generated files, mount order, placement logic — verified via `git diff --stat`.
- [x] [A7] New test `tools/test-boot-continuation.mjs` (T1; T2 ×6 per-step variants; T3a/T3b; T4a/T4b; self-contained, vm + minimal DOM shim, env overrides for the base RED run, header documents the pre-fix failure map). — done
- [x] [A8] CI registration: `node tools/test-boot-continuation.mjs` in `build-latest-release.yml` validate step; `node --check` + run lines in `quality-integration.yml` — adjacent to the existing #353 test registrations, only those lines changed. — done
- [x] [A9] Specs (this set): `spec.md`, `plan.md`, `tasks.md` under `specs/slf-356-boot-hardening/`. — done
- [x] [A10] Governance follow-up flagged (outside this task's allowed paths): `src/app/bundle-order.json` audit metadata for `src/app/bootstrap.js` should eventually record the new direct `console` host-capability usage (the audit check is one-directional and stays green without it, mirroring the #353 [A10] precedent). — done

## Definition of Done

- [x] `node tools/check-bundle-order.mjs` → exit 0 (observed OK, 90 modules).
- [x] `node --check src/modules/team-management/training-reference-guide.js` and `node --check src/modules/team-management/team4-leadership-upgrade-indicator.js` → exit 0.
- [x] `node tools/test-boot-continuation.mjs` → all cases pass, exit 0 (observed output recorded in delivery report).
- [x] RED proof against base e775f72 sources (env overrides, `git show` copies): exit 1 with the observed map — T1 + T2(×6) + T3a + T4a FAIL, T3b/T4b pass (missing-tail / body-null-crash / marker-clobber semantics).
- [x] `git diff --stat` → only allowed paths changed (3 modules, 1 new test, 2 workflows, 3 spec files).
- [x] No build scripts run, no commit, no push, no git lifecycle operations.
