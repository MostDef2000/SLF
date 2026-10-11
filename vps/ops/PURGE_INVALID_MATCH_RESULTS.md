# #327 — Permanent deletion of invalid-score finished results

## Purpose and boundaries

This is **not** the existing broad July-cutoff purge operation.
The owner explicitly requested permanent removal of records with missing/invalid
finished-match scores from only the production file:

    /opt/slf/slf-server/data/match_results_v2.json

It never rewrites match_snapshots_v2, preset_events_v2, preset_effects_v2,
code backup directories, or game knowledge.

**No archive, quarantine file or backup is created for removed records.**
Deletion is irreversible; do not run apply on uncertainty.

## Operator checklist

1. Deploy the exact reviewed Git commit containing this script using the separately approved API/ops deployment process. Confirm the production data path and slf-server.service.
2. Execute the script with **no options** for a read-only current preview. It reports total, invalid, valid, source SHA-256 and survivor digest; it performs no writes.
3. Compare with the historical 2026-10-10 baseline (352 total / 288 invalid / 64 valid). **Do not assume** baseline still equals production: abort unexpected plans.
4. Only the separately approved production operator can run apply as root with all exact current preview guards:

        --apply
        --expected-invalid-count INVALID_COUNT_FROM_LIVE_PREVIEW
        --expected-sha256 SOURCE_SHA256_FROM_LIVE_PREVIEW
        --ack-permanent-deletion

   The script stops the service (if running), reloads the file and checks count and SHA again, atomically rewrites the sole collection file preserving ownership/mode, and restarts the service.
5. Verify the output reports the exact deleted count, unchanged valid survivor digest and zero archive/backup. Run preview again: invalid count must be zero.
6. After separately approved exporter deployment, run the existing exporter/RAG wrapper to refresh cache, public summaries, manifest and Drive mirror. Verify final byte parity.

## Fail-closed behavior

- Invalid count/SHA, non-result rows, malformed JSON, wrong path, missing acknowledgment, or non-root apply: refuse.
- Service restart is attempted even if an apply precondition fails after stopping it.
- Code merge does not itself deploy or erase production data.
- This command is not a game-application confirmation or evidence-readiness shortcut.
