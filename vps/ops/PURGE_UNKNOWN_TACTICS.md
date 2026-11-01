# Unknown-identity preset telemetry purge

Repeatable, criterion-based purge of unknown-identity records from the preset
telemetry collections, followed by the standard exporter/RAG rebuild.
Unlike `purge_tactical_data.py` this operation CREATES a verified backup of
all four collections before changing anything, and has no date/cutoff lock.

## Scope

Under `/opt/slf/slf-server/data`:

Rewritten (only these two):

- `preset_events_v2`
- `preset_effects_v2`

Backed up but NEVER written:

- `match_snapshots_v2`
- `match_results_v2`

Apply mode verifies the SHA-256 of both untouched collections before and
after the exporter run and fails loudly on any change. Unknown preset
attribution in `match_results_v2` `byFinalPreset` fields (186/190 unknown)
is a valid match outcome, not garbage — that collection is never rewritten
by this tool.

## Deletion criterion

A record is deleted iff the preset name, extracted exactly like
`preset_name()` in `vps/exporter-rag/slf_preset_evidence_561.py` (same
dotted-path list, same `str(value or "unknown")` fallback), strips to an
empty string or equals `"unknown"` case-insensitively.

Deliberate asymmetry versus the exporter's quarantine set: names such as
`manual`, `manual_change`, `null`, `none` and records with conflicting
explicit identities are NOT deleted — they are different evidence categories
(raw counts and diagnostics in `slf_preset_evidence_561.py`). Records with
no name fields at all fall out of the `"unknown"` fallback and ARE deleted.

## Preview

Safe to run anytime, as any user; performs no writes, service changes,
export or backup:

```bash
python3 /opt/SLF/vps/ops/purge_unknown_tactics.py
```

Prints per-collection `{before, removed, kept, removedBreakdown}` JSON plus
the first 20 sample identifiers of would-be-deleted records. Add
`--list-ids` to print all identifiers.

## Apply

```bash
python3 /opt/SLF/vps/ops/purge_unknown_tactics.py --apply
```

Apply mode must run as root and requires all four collection files to be
present (fails closed otherwise). Sequence:

1. prints the preview JSON;
2. creates a backup directory (default `/var/backups/slf-unknown-purge/<UTC
   timestamp>`, override with `--backup-dir`), copies all four JSON files,
   writes `SHA256SUMS` and verifies every copy against its source — any
   mismatch aborts the apply;
3. stops `slf-server.service` if it is active;
4. re-scans and rewrites ONLY the two purge collections, each collection
   atomically on its own (same-directory temp file, preserved mode,
   `os.replace`, directory fsync) — this is per-collection atomicity, not a
   cross-collection transaction; a collection with zero removals is left
   byte-identical;
5. restarts and verifies the API service, but only if it was active before
   the apply — an initially-stopped service is left stopped;
6. verifies that zero unknown-identity records remain and that both
   untouched collections still match their pre-apply SHA-256;
7. runs the daily exporter/RAG wrapper (`run_daily_export.sh`);
8. verifies again and prints the result JSON
   (`ok`, `backupDir`, `backupCreated: true`, collection stats,
   `postVerification`, `untouchedCollections` with `sha256Verified: true`).

The backup directory must not already exist: the tool refuses to run rather
than overwrite an existing directory.

Note: if fresh unknown-identity telemetry lands between the service restart
and the final verification, the tool exits nonzero after a successful
purge+export (fail-closed; the backup exists) — a benign edge the operator
may see.

## Backup and restore

Backups live in `/var/backups/slf-unknown-purge/<YYYYMMDDTHHMMSSZ>/` and
contain all four collection files plus `SHA256SUMS`. To restore:

```bash
systemctl stop slf-server.service
cp /var/backups/slf-unknown-purge/<TIMESTAMP>/*.json /opt/slf/slf-server/data/
sha256sum -c /var/backups/slf-unknown-purge/<TIMESTAMP>/SHA256SUMS  # from the data dir
systemctl start slf-server.service
/opt/slf_ai_exporter_v2/slf_ai_exporter_v2/run_daily_export.sh
```

## Google Drive

The source `/opt/slf/slf-server/data/*.json` is the cut point:
`run_daily_export.sh` ends with `rclone sync` to `gdrive:"SLF AI RAG/current"`,
so Drive self-cleans on the next nightly run (cron 00:00 +10). Purging Drive
only would be overwritten overnight; always purge the source data.

## Monthly repeat

Unknown-identity приток continues at roughly ~15 events + ~15 effects per
day. Re-run in preview mode monthly and apply when the counts justify it.
No date lock exists — the criterion is identity-based, so the tool stays
correct as new data arrives.

## Operator hygiene (out of scope for this tool)

Two `.bak` files and two quarantine `match_results` files from 06.10 in
`/opt/slf/slf-server/data/` are separate unknown-carriers. They are not
touched by this tool; list and handle them manually if desired.

## Validation

```bash
python3 -m py_compile vps/ops/purge_unknown_tactics.py
python3 -m unittest discover -s vps/ops/tests -p 'test_purge_unknown_tactics.py' -v
python3 -m unittest discover -s vps/ops/tests -v
```
