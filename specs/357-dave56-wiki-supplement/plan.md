# Plan — Dave 5.6 wiki supplement (#357)

## Contour

VPS (`vps/exporter-rag/**`, `vps/ops/**`). No userscript changes.

## Decisions

1. **Repo-tracked full-text supplement, merged inside the exporter** (variant (c), precedent `generator_updates.json`): the daily export is the only writer of `wiki/docs/**`, so the fix must live in the export path; external Drive-side merges are wiped by design. Data file carries full article texts (376 KB) plus per-record chunk pins (`expectedChunkCharCounts`) used by tests only — production code never reads them.
2. **Dedup by raw id + first digit run** (`_supplement_id_keys`): handles `241`, `wiki_241`, `238.0` id shapes seen across scrape eras; `wiki_2410` correctly does NOT match `241`. Supplement record replaces the fetched stub in place (fetched position kept), supplement-only records appended sorted by numeric postId.
3. **All-or-nothing fail-open**: any malformed record drops the whole supplement with a WARN. Chosen over per-record skipping to keep the acceptance counts deterministic (107/794) and partial-state invisible.
4. **Chunk pins from the exporter's own chunker**: the initial pins were regenerated from `chunk_text` after the hand-replica produced 131 vs the real chunker's 129 (boundary drift). Pins give regression value against future chunker changes; the byte-exact md-on-disk check independently protects the data file.
5. **Deploy gates over trust**: staged-file schema assert (mirror of the `generator_updates.json` assert), explicit install line (the file must reach `$EXPORT_DIR`, not only staging), and a post-run wiki-index gate (10 postIds, charCount ≥ 2000) that is count-drift-immune (no hardcoded 107/794, which would break as the wiki grows).

## Risk profile

- Main risk was silent purpose loss (green deploy, supplement never installed, fail-open WARN) — closed by the deploy gates above (adversarial review finding, fixed).
- Residual: live `wiki_docs` id shapes unknown in full; digit-run dedup covers realistic prefixed/float variants; post-deploy acceptance probe (107 docs / 794 chunks) is the final detector.
- Test design: RED-first `articleText` test (verified against base `1e58d38`: returns `''` there), fail-open matrix, merge idempotency + non-mutation, digit-run dedup cases, end-to-end build with pinned chunk counts.

## Correct-course impact

None on the recommendation/tactics control plane; RAG rows gain the 10 posts via the existing `slf_rag_build.py` read of `wiki/chunks.json` (no changes needed there).
