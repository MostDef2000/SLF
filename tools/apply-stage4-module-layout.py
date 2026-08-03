#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

MAPPINGS = {
    "src/modules/live-parser/match-state-parser.js": "src/modules/match-reading/match-state-parser.js",
    "src/modules/live-parser/match-stats-parser.js": "src/modules/match-reading/match-stats-parser.js",
    "src/modules/live-parser/squad-parser.js": "src/modules/match-reading/squad-parser.js",
    "src/modules/live-parser/snapshot-engine.js": "src/modules/manual-match-telemetry/snapshot-engine.js",
    "src/modules/live-parser/event-tracker.js": "src/modules/manual-match-telemetry/event-tracker.js",
    "src/modules/live-parser/runtime-telemetry-integrity.js": "src/modules/manual-match-telemetry/manual-match-runtime.js",
    "tools/test-runtime-telemetry-integrity.mjs": "tools/test-manual-match-runtime.mjs",
}


def move_files() -> None:
    for old, new in MAPPINGS.items():
        source = ROOT / old
        target = ROOT / new
        if not source.exists():
            raise RuntimeError(f"missing source path: {old}")
        if target.exists():
            raise RuntimeError(f"target already exists: {new}")
        target.parent.mkdir(parents=True, exist_ok=True)
        source.rename(target)


def rewrite_text_references() -> None:
    replacements = dict(MAPPINGS)
    replacements["src/modules/live-parser/**"] = "src/modules/match-reading/**'\n      - 'src/modules/manual-match-telemetry/**"
    replacements["test-runtime-telemetry-integrity.mjs"] = "test-manual-match-runtime.mjs"
    replacements["runtime-telemetry-integrity.js"] = "manual-match-runtime.js"

    for path in ROOT.rglob("*"):
        if not path.is_file() or ".git" in path.parts:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        updated = content
        for old, new in replacements.items():
            updated = updated.replace(old, new)
        if updated != content:
            path.write_text(updated, encoding="utf-8")


def update_audit_contracts() -> None:
    review_path = ROOT / "data/audit/manual-match-symbol-review-v1.json"
    review = json.loads(review_path.read_text(encoding="utf-8"))
    review["stage4"] = {
        "issue": 151,
        "status": "implemented",
        "exitCriterion": "Active match-reading and manual telemetry modules no longer live under the live-parser path.",
        "moduleLayout": {
            "matchReading": "src/modules/match-reading",
            "manualTelemetry": "src/modules/manual-match-telemetry",
        },
    }
    review_path.write_text(json.dumps(review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    contract_path = ROOT / "data/audit/manual-state-envelope-v1.json"
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    contract["activeModuleLayout"] = {
        "status": "renamed",
        "stage": 4,
        "trackingIssue": 151,
        "matchReading": "src/modules/match-reading",
        "manualTelemetry": "src/modules/manual-match-telemetry",
    }
    contract["nextRemovalGate"] = [
        "Verify a published userscript contains the manual-state envelope and renamed module layout.",
        "Verify one production manual event-to-effect path after upgrade.",
        "Remove legacy-key dual-write and compatibility APIs in the sunset PR.",
    ]
    contract_path.write_text(json.dumps(contract, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_stage_doc() -> None:
    path = ROOT / "docs/audit/legacy-live-parser-stage4-2026-08-03.md"
    path.write_text(
        """# Legacy live-parser removal — Stage 4\n\nTracking issue: #151.\n\n## New active layout\n\n### Match reading\n\n- `src/modules/match-reading/match-state-parser.js`;\n- `src/modules/match-reading/match-stats-parser.js`;\n- `src/modules/match-reading/squad-parser.js`.\n\n### Manual match telemetry\n\n- `src/modules/manual-match-telemetry/snapshot-engine.js`;\n- `src/modules/manual-match-telemetry/event-tracker.js`;\n- `src/modules/manual-match-telemetry/manual-match-runtime.js`.\n\nThe runtime integrity regression is now `tools/test-manual-match-runtime.mjs`.\n\n## Updated contracts\n\nBundle order, dependency audit, workflow path filters, test source paths, audit records, documentation references and release source markers use the new paths.\n\n## Exit criterion\n\nNo active source module is stored under `src/modules/live-parser/`. Remaining `live` names are transition-only storage compatibility APIs scheduled for Stage 5.\n""",
        encoding="utf-8",
    )


def validate_layout() -> None:
    old_dir = ROOT / "src/modules/live-parser"
    leftovers = sorted(str(path.relative_to(ROOT)) for path in old_dir.rglob("*.js")) if old_dir.exists() else []
    if leftovers:
        raise RuntimeError(f"active files remain under live-parser: {leftovers}")

    required = [ROOT / path for path in MAPPINGS.values()]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.exists()]
    if missing:
        raise RuntimeError(f"renamed files missing: {missing}")


move_files()
rewrite_text_references()
update_audit_contracts()
write_stage_doc()
validate_layout()
print("[stage4-module-layout] applied")
