# VPS API collection locking contract

## Purpose

The VPS API stores collections as JSON files. A collection mutation is a read-modify-write transaction and must remain serializable across both Gunicorn threads and independent worker processes.

## Lock layers

`vps/api/server.py` uses two layers for every collection boundary:

1. a process-local `threading.RLock` serializes threads and preserves reentrant acquisition;
2. a Linux advisory `fcntl.flock(LOCK_EX)` serializes independent processes that share the same `SLF_DATA_DIR`.

The file lock is acquired only for the outermost acquisition in a thread. Nested acquisition of the same collection reuses the outer lock and increments thread-local recursion depth.

## Lock files

Lock files live under:

```text
$SLF_DATA_DIR/.locks/<collection>.lock
```

Properties:

- collection names use the existing allowlist and cannot contain path separators;
- files are created with mode `0600`;
- files remain empty and contain no records, tokens or credentials;
- `.locks` is not a JSON collection and is ignored by collection discovery;
- lock files may remain on disk between requests and process restarts.

## Atomic persistence

The existing persistence sequence remains unchanged:

1. serialize to a process/thread-specific temporary file;
2. flush and `fsync` the temporary file;
3. atomically replace the collection using `os.replace`;
4. attempt to `fsync` the containing directory;
5. remove any leftover temporary file.

Atomic replacement prevents partial JSON. The advisory lock additionally prevents two processes from reading the same prior version and overwriting each other's accepted rows.

## Deployment boundary

This contract targets the Linux VPS and a local filesystem that supports `flock`. The systemd unit remains at one Gunicorn worker in this change. Increasing the worker count is a separate capacity/deployment decision requiring production verification and rollback evidence.

## Regression evidence

`tools/test-api-multiprocess-locking.py` starts independent spawned Python processes against one temporary data directory. It verifies:

- reentrant acquisition in the parent process;
- no lost rows under simultaneous unique append batches;
- exactly one accepted row under a duplicate-key race;
- zero duplicate and missing keys in `/api/analysis`;
- empty, owner-only lock files.

The test intentionally delays duplicate filtering while the collection transaction is active. Without an interprocess lock, processes read the same prior collection and the assertions fail deterministically.

## Rollback

Revert the `fcntl` lock layer and multiprocessing test. Keep `--workers 1` as the operational fallback. Existing JSON data does not require migration in either direction.
