# Dave 5.6 wiki supplement in the daily RAG exporter (#357)

**Status:** orchestrator-dispatched work order (edit-only; no commit/push from the implementing agent). Branch: `feat/357-dave56-wiki-supplement`, base `1e58d38`.

## Goal and user-visible behaviour

The daily VPS RAG export (wiki/index.json, wiki/chunks.json, wiki/docs/**, Drive mirror) natively includes the 10 Dave 5.6 tactical wiki posts (postIds 238, 241, 243, 244, 245, 246, 249, 252, 254, 255) with FULL article texts. Today the external `wiki_docs` scrape misses the «Об игре» cluster entirely (10 posts, 0 present) and carries May-era stubs for others (139–2246 chars under `articleText`). A repo-tracked supplement (`dave56_supplement.json`, schema `dave56_wiki_supplement_v1`, full texts + test-only chunk pins) ships with the exporter and is merged into the `wiki_docs` records before `build_wiki_export`: supplement records replace fetched stubs by id (in place), supplement-only posts are appended deterministically. Acceptance after the next exporter deploy: 107 docs / 794 chunks (97+10 / 665+129) and all 10 postIds present with full-length text.

This makes the Dave 5.6 RAG knowledge self-sustaining: the previous external merge (into the Drive mirror only) was proven to be wiped by the next daily run (KB JOURNAL 2026-10-17); with the merge inside `slf_ai_export.py` the exporter regenerates the same content every day.

## Acceptance / NFR

- Deterministic, idempotent merge (raw id + first digit run dedup keys; prefixed `wiki_241` and float `238.0` fetched ids still dedup; unrelated ids pass through; neither input list mutated).
- Fail-open loader: missing/unreadable/bad-JSON/wrong-schema/malformed/empty-markdown supplement → stderr WARN + `[]`; the daily export never breaks because of the supplement. All-or-nothing by design (one bad record drops the whole supplement) to keep acceptance deterministic.
- `get_doc_text` recognizes the May-era `articleText` body key (defensive; `markdown` keeps priority).
- Regression tests pin the supplement: 10 records, 129 chunks total, per-chunk charCount sequences produced by the exporter's own chunker, byte-exact doc markdown on disk; 7 tests, local-only (CI does not run exporter tests).
- Deploy gates: staged supplement asserted (schema + 10 non-empty records) before install; installed into `$EXPORT_DIR` (not only staged); post-run wiki-index gate asserts all 10 postIds present with charCount ≥ 2000 in `/var/www/html/slf_ai/wiki/index.json`.
- No secrets; generated outputs untouched; live data stays on the VPS (DR-008/DR-009).

## Exclusions

`run_daily_export.sh`, `slf_rag_build.py`, `slf_manifest_integrity.py` (read-only consumers of the merged flow), CI workflows, userscript contour (`src/**`), contracts, Drive filter. The already-uploaded external Dave docs in the Drive wiki/ mirror are superseded by the exporter's own output at the next daily run; no Drive-side manual action is part of this task.
