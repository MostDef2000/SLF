# #357 — executable acceptance checklist

- [x] [A1] `dave56_supplement.json` (schema `dave56_wiki_supplement_v1`) ships 10 full-text records (postIds 238, 241, 243, 244, 245, 246, 249, 252, 254, 255; 204,902 chars total) with test-only chunk pins; sources are the fresh `wiki_scraper_v2_static_export` docs mirrored to the Drive wiki/ folder.
- [x] [A2] `get_doc_text` recognizes `articleText` (May-era body key), `markdown` keeps priority.
- [x] [A3] `_load_supplement_docs` is module-adjacent, fail-open (`[]` + stderr WARN on missing/unreadable/bad-JSON/wrong-schema/malformed/empty-markdown; utf-8-sig tolerant); converts records to the exact key set the doc getters read; never reads the pins.
- [x] [A4] `_merge_supplement_docs` dedups on raw id + first digit run; supplement replaces stubs in place; supplement-only appended sorted by numeric postId; idempotent; inputs unmutated.
- [x] [A5] Single merge point in `main()` after the collection loop (covers API fetch, cache fallback, `--skip-api`); merged list feeds only the wiki export; analytics/`collectionCounts` stay fetched-only.
- [x] [A6] Tests `vps/exporter-rag/test_slf_ai_export.py` (7): articleText RED-first, valid load (10 records, key set, pins consistent), fail-open matrix (9 cases), merge dedup + prefixed/float ids + idempotency, end-to-end build (10 docs, 129 chunks, per-chunk charCounts vs pins, byte-exact md on disk), supplement ids in index.
- [x] [A7] `vps/ops/deploy-code.sh` exporter-rag: staged-file assert (schema, 10 records, non-empty markdown), `dave56_supplement.json` in FILES + explicit install into `$EXPORT_DIR`; post-run gate asserts the 10 postIds in `/var/www/html/slf_ai/wiki/index.json` with charCount ≥ 2000.
- [x] [A8] `vps/ops/rollback-code.sh`: `dave56_supplement.json` added to FILES at the same position (rollback invariant test green).
- [x] [A9] Verification green: 7/7 supplement tests, 31/31 ops tests (incl. deploy-files completeness and rollback invariant), 6/6 manifest-integrity/RAG-build siblings, 11/11 tactical-lab/preset siblings, `py_compile`, `bash -n` both scripts. (Local-only suite; CI does not run exporter tests.)
- [ ] [A10] External acceptance after deploy: `/var/www/html/slf_ai/wiki/manifest.json` shows 107 docs / 794 chunks; all 10 postIds present with full-length text; Drive mirror wiki/ carries the regenerated docs + 129 supplement chunks.

## Operational, external and not implied

- [ ] Lane-A deploy of `exporter-rag` via DEPLOY-TRIGGER (owner confirmation is the deploy gate); external acceptance probes from the sandbox.
- [ ] Post-fix cleanup (deferred, separate task): orphan `wiki/dave56-supplement.json` and junk files (`replace-probe.txt`, `rt-test.txt`) in the Drive wiki/ folder; bridge v3 Apps Script deployment stays optional/undeployed.
- [ ] Merge/PR/CI lifecycle handled by the delivery orchestrator; this task ships source changes only.
