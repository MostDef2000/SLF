# Irreversible tactical telemetry purge

This operation is intentionally destructive and creates no data backup.

## Scope

The purge touches only these API collections under `/root/slf-server/data`:

- `match_snapshots_v2`
- `match_results_v2`
- `preset_events_v2`
- `preset_effects_v2`

It deletes every record whose recognized UTC timestamp is earlier than
`2026-07-22T00:00:00Z`. It also deletes records whose timestamp is absent or
cannot be parsed. Records exactly at the cutoff are retained.

The following collections are not touched:

- `tactics`
- `player_observations`
- `transfer_history`
- `wiki_docs`

After successful source-data verification, exporter/RAG rebuild and Google Drive
sync, the operation empties `/var/backups/slf-code/`. It does not create a new
backup before changing data.

## Preview

Run from an exact approved repository commit:

```bash
python3 /root/SLF-dr008/vps/ops/purge_tactical_data.py \
  --cutoff 2026-07-22T00:00:00Z
```

Preview mode prints per-collection counts and performs no writes, service
changes, export, sync or backup deletion.

## Apply

```bash
python3 /root/SLF-dr008/vps/ops/purge_tactical_data.py \
  --cutoff 2026-07-22T00:00:00Z \
  --apply \
  --delete-code-backups
```

Apply mode must run as root. It performs the following sequence:

1. prints the preview counts;
2. stops `slf-server.service` if it is active;
3. reloads and validates all four JSON collections;
4. writes filtered JSON through same-directory temporary files and `os.replace`;
5. restarts and verifies the API service;
6. verifies that no pre-cutoff or unknown-date records remain;
7. runs the existing daily exporter/RAG wrapper and Google Drive sync;
8. verifies the source collections again;
9. empties `/var/backups/slf-code/` only after all preceding steps succeed.

The migration is locked to the exact cutoff above. A different cutoff is
rejected. The backup root is locked to `/var/backups/slf-code` to prevent an
unexpected recursive deletion target.

## Validation

```bash
python3 -m py_compile vps/ops/purge_tactical_data.py
python3 -m unittest discover -s vps/ops/tests -p 'test_purge_tactical_data.py' -v
```

The final JSON output must report `backupCreated: false`, zero removable records
in `postVerification`, and the number of deleted code-backup entries.
