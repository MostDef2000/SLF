# SLF System Contract v1

Version: 1.4.0

Status: Active

Owner: SLF Project Manager Agent

Scope: VPS API, export, RAG build, Google Drive mirror, runtime knowledge boundaries

Source of truth: `main` for deployable source and contracts, VPS for live data and generated artifacts

## 1. Purpose

This document records the current SLF runtime architecture across the repository and VPS.

It exists so that the Project Manager Agent can start any future SLF conversation with the correct assumptions about:

- where SLF data is collected and stored;
- how RAG artifacts are derived;
- how Google Drive is used;
- what is allowed for runtime userscript access;
- which layers are authoritative and which layers are mirrors.

This is an architecture and operations contract. It is not a runtime source file and does not require a Tampermonkey release build when updated.

## 2. Current architecture

```text
SLF System = 4 layers

1. Data Collection Layer (VPS)
   - Flask API server and JSON storage
   - source collections for matches, presets, players, transfers, wiki, tactics

2. Enrichment Layer (RAG Builder)
   - deterministic export-time derivation
   - creates rule extracts, forum notes, match evidence, tactical cases, search index, runtime knowledge pack

3. Storage Layer
   - public static export under /var/www/html/slf_ai
   - browser/API readable by stable HTTP paths

4. Distribution Layer
   - Google Drive mirror via rclone
   - AI-readable external mirror for ChatGPT connector access
```

Canonical flow:

```text
SLF userscript / parser
→ VPS API storage
→ slf_ai_export.py
→ /var/www/html/slf_ai/data/*
→ slf_rag_build.py
→ /var/www/html/slf_ai/rag/* and /tactics/*
→ rclone sync
→ Google Drive / SLF AI RAG / current
```

## 3. Source ownership and VPS paths

`MostDef2000/SLF` is the source of truth for deployable VPS code. The VPS is the source of truth for live SLF data, environment values, operational scheduler state, and generated export artifacts.

Canonical source mapping:

| Repository path | Current VPS path |
|---|---|
| `vps/api/server.py` | `/root/slf-server/server.py` |
| `vps/api/requirements.txt` | API virtual environment dependencies |
| `vps/exporter-rag/slf_ai_export.py` | `/opt/slf_ai_exporter_v2/slf_ai_exporter_v2/slf_ai_export.py` |
| `vps/exporter-rag/slf_rag_build.py` | `/opt/slf_ai_exporter_v2/slf_ai_exporter_v2/slf_rag_build.py` |
| `vps/exporter-rag/run_daily_export.sh` | `/opt/slf_ai_exporter_v2/slf_ai_exporter_v2/run_daily_export.sh` |
| `vps/exporter-rag/slf_drive_filter.txt` | `/opt/slf_ai_exporter_v2/slf_ai_exporter_v2/slf_drive_filter.txt` |
| `vps/exporter-rag/requirements.txt` | exporter virtual environment dependencies |
| `vps/ops/slf-server.service` | `/etc/systemd/system/slf-server.service` |

Known active paths:

```text
/root/slf-server/server.py
/root/slf-server/data/*.json
/root/slf-server/forum_faq/
/root/slf-server/slf_api.env
/opt/slf_ai_exporter_v2/slf_ai_exporter_v2/slf_ai_export.py
/opt/slf_ai_exporter_v2/slf_ai_exporter_v2/slf_rag_build.py
/opt/slf_ai_exporter_v2/slf_ai_exporter_v2/run_daily_export.sh
/opt/slf_ai_exporter_v2/slf_ai_exporter_v2/slf_drive_filter.txt
/var/www/html/slf_ai/
```

The imported repository files are a verified `legacy pre-git baseline`. They do not yet identify the deployed Git revision because no Git-backed deployment has been performed. Deployment and rollback are manual and require separate operational approval; their current boundaries are defined in `contracts/branches/server-api-operations.md`, `contracts/branches/knowledge-export-rag.md`, and proposed DR-008.

The PM must treat the mapping and paths above as the active architecture unless a newer inventory proves otherwise. `slf_api.env`, live data, forum content, virtual environments, cron configuration, rclone credentials, logs, backups, and generated exports must remain outside Git.

## 4. API and storage contract

The API server is the storage/API backend. Data sensitivity is determined by endpoint behavior and authorization, not by the presence of the current public client key.

Current model:

```text
Flask API server:
  /root/slf-server/server.py

Data storage:
  /root/slf-server/data/{collection}.json

Forum FAQ storage:
  /root/slf-server/forum_faq/index.json
  /root/slf-server/forum_faq/active/*.md
```

Known collections:

```text
match_results_v2
match_snapshots_v2
preset_events_v2
preset_effects_v2
player_observations
player_status_cache
tactics
transfer_history
wiki_docs
```

Operational rule:

```text
local API access: localhost preferred
remote key-only API endpoints: effectively public
public data: sanitized /slf_ai export only
```

The exporter should read from `http://127.0.0.1:5000/api` when running on the VPS.

### 4.1 Public client-key boundary

For the current SLF threat model, the API token is a **public client key**, not a secret credential.

The key may be embedded in userscript and server source and may appear in repository source, generated runtime output, terminal output, or chat. Its presence there is not credential compromise and does not, by itself, require rotation, protected environment storage, removal from client artifacts, or Tampermonkey-only storage.

Any endpoint that relies only on this key must be treated as publicly callable. The key may identify the expected SLF client population or reject accidental unauthenticated traffic, but it is not a security boundary for sensitive capabilities.

Separate real authentication and authorization become mandatory before an endpoint exposes:

- private data;
- destructive or administrative operations;
- material external cost;
- any capability the owner does not intend to expose to arbitrary callers.

Plain HTTP is a separate confidentiality and integrity risk because traffic can be observed or modified in transit. That transport risk is currently accepted and must be tracked independently from token handling. HTTPS is not a prerequisite for continued use of the current public-client-key model.

Production builds must not export userscript API closures, internal engines, or mutation methods to page globals through `window` or `unsafeWindow`. Legacy collection cleanup must not be callable from the page context.

The only permitted production page-global diagnostic surface is build-generated read-only version metadata:

```text
SLF.scriptVersion
SLF.versionInfo
```

It must contain no API methods, collection readers, cleanup entrypoints, or internal module references. Source validation must reject any return of privileged debug exports. Browser acceptance must verify that `SLF_DEBUG`, lowercase `slf`, and mutating methods are absent from production page globals.

This debug-surface boundary is independent from public client-key handling. Removing privileged page capabilities does not rotate or conceal the client key.

### 4.2 API transport error contract

All userscript API requests use one normalized transport contract:

- only HTTP `2xx` responses resolve;
- HTTP `4xx` and `5xx` responses reject before response-body parsing;
- successful GET responses with invalid JSON reject as `parse`;
- network, timeout, and abort failures reject as `network`, `timeout`, and `abort`;
- request timeout is `15000 ms`;
- rejected writes must never be logged or displayed as saved;
- callers must handle rejected background writes so they do not create unhandled promise rejections;
- server-side submission markers may advance only after confirmed write success.

Normalized errors expose only:

```text
name: SLFApiError
kind: http | parse | network | timeout | abort
method
collection
operation
status
statusText
response: safe status metadata
```

Errors and logs must not contain the Authorization header, the public client key, raw request objects, or raw response bodies. This is log/data minimization and is independent from whether the client key is classified as secret.

## 5. Static export contract

The public AI export is:

```text
/var/www/html/slf_ai/
```

Expected structure:

```text
/var/www/html/slf_ai/
  manifest.json
  ai_context.md
  data/
  rag/
  tactics/
  forum_faq/
  wiki/
```

Expected data summary files:

```text
data/analytics_summary.json
data/match_data_summary.json
data/player_observations_summary.json
data/preset_effects_summary.json
data/preset_events_summary.json
data/transfer_market_summary.json
```

Expected RAG files:

```text
rag/catalog.json
rag/search_index.json
rag/rule_extracts.jsonl
rag/forum_notes.jsonl
rag/match_evidence.jsonl
rag/tactical_cases.jsonl
```

Expected runtime pack:

```text
tactics/knowledge-pack.latest.json
```

## 6. RAG contract

RAG artifacts are derived and rebuildable. They are not primary data.

Source priority:

```text
1. game rules / wiki docs / hard mechanics
2. match evidence / observed completed match data
3. forum notes / soft heuristics and experience
4. tactical cases / derived synthesis
```

Artifact authority:

```text
rule_extracts:
  authority: hard_or_doc_rule
  source: wiki chunks / wiki docs

forum_notes:
  authority: soft_heuristic
  source: /root/slf-server/forum_faq

match_evidence:
  authority: observed_data
  source: exported match/preset summaries

tactical_cases:
  authority: mixed
  source: seed rules + match evidence + forum notes

search_index:
  authority: retrieval helper only
  source: derived from RAG artifacts

knowledge-pack.latest.json:
  authority: sanitized_runtime
  source: selected tactical cases/rules
```

RAG build rules:

```text
- deterministic export-time generation;
- rebuildable from VPS data;
- no external API dependency for local forum_faq;
- no secret credential exposure in public artifacts; the accepted public client key is not a secret, although unnecessary copies should still be omitted;
- no private raw API exposure to ChatGPT;
- no LLM-generated hidden state required for rebuild.
```

## 7. Google Drive mirror contract

Google Drive is a mirror only.

```text
Google Drive folder:
  SLF AI RAG/current

Role:
  AI-readable external mirror for ChatGPT connector access

Not allowed:
  using Drive as primary data storage
  letting userscript read Google Drive directly
  storing secret credentials, logs, or unnecessary public client-key copies in Drive mirror
```

Allowed mirror contents:

```text
manifest.json
ai_context.md
data/**
rag/**
tactics/**
forum_faq/**
```

Optional mirror contents:

```text
wiki/manifest.json
wiki/index.json
wiki/chunks.json
wiki/rules.json
wiki/docs/**
```

Disallowed mirror contents:

```text
wiki.bak/**
cache/**
*.log
*token*
*secret*
raw private API dumps
private env files
```

The filename filters above are data-minimization hygiene. They do not classify the current public client key as a secret or make its prior exposure a credential incident.

## 8. rclone sync contract

All Drive sync must use a filter file.

Required rule:

```text
Use --filter-from only.
Do not mix --include and --exclude in the same sync command.
```

Canonical filter file:

```text
/opt/slf_ai_exporter_v2/slf_ai_exporter_v2/slf_drive_filter.txt
```

Current minimal filter:

```text
+ /manifest.json
+ /ai_context.md
+ /data/**
+ /rag/**
+ /tactics/**
+ /forum_faq/**
- **
```

Archive sync is not part of the default stable pipeline unless explicitly re-enabled.

## 9. Daily export wrapper contract

The daily wrapper is:

```text
/opt/slf_ai_exporter_v2/slf_ai_exporter_v2/run_daily_export.sh
```

Expected steps:

```text
1. load /root/slf-server/slf_api.env
2. export from API via slf_ai_export.py
3. build RAG via slf_rag_build.py
4. sync current mirror to Google Drive via rclone --filter-from
```

The wrapper should load the public client key from the existing environment file rather than duplicating it in the crontab line. This is operational configuration hygiene, not secret storage.

Cron should call only the wrapper, not duplicate the raw exporter command.

## 10. Userscript runtime contract

The userscript must not read the full RAG corpus.

Allowed runtime knowledge endpoint:

```text
/slf_ai/tactics/knowledge-pack.latest.json
```

Not allowed for userscript runtime by default:

```text
/slf_ai/wiki/chunks.json
/slf_ai/rag/search_index.json
/slf_ai/rag/forum_notes.jsonl
/slf_ai/rag/rule_extracts.jsonl
/slf_ai/rag/match_evidence.jsonl
full Google Drive mirror
```

The large RAG corpus is for ChatGPT/Strategy Agent reasoning, not in-browser runtime by default.

## 11. Transfer Analyzer invariants

These invariants remain active and must not be violated by future RAG/storage work:

```text
- ZERO CACHE / LIVE ONLY.
- No persistent player-state cache in userscript.
- No localStorage player cache.
- Analyze players only after the user presses the visible analysis action.
- Button "Сброс cache" may clear old transfer-analysis layers only.
- Google Drive and RAG must not reintroduce Transfer Analyzer persistent state.
```

## 12. Tactical engine contract

Current tactical direction:

```text
moment-based coaching, not a full simulation engine
```

Expected output style:

```text
I observed metrics for the current match segment.
Recommendation: [single tactic/preset]
Reason:
- [signal 1]
- [signal 2]
- [signal 3]
Review again: [next snapshot / if game changes]
```

Inputs may include:

```text
score state
minute
pressure proxy
bad actions rate
fatigue/form if available
preset effects history
opponent weak zones
forum_notes soft heuristics
rule_extracts hard/doc rules
```

Do not turn this into a top-3 ranking, hidden simulation layer, or autonomous planner unless the user explicitly approves a new architecture.

## 13. PM bootstrap contract

When the SLF Project Manager Agent starts a task involving architecture, VPS, RAG, Drive, data exports, or tactical reasoning, it must treat this document as mandatory context.

PM must load or assume:

```text
1. docs/architecture/slf-system-contract.md
2. /var/www/html/slf_ai/manifest.json if VPS/Drive data is being inspected
3. rag/catalog.json if RAG reasoning is needed
4. tactics/knowledge-pack.latest.json if userscript runtime knowledge is being discussed
```

PM must assume:

```text
- VPS is source of truth for live data and generated artifacts.
- GitHub main is source of truth for userscript and deployable VPS source.
- Google Drive is mirror only.
- RAG is derived, rebuildable, and non-authoritative over source data.
- Userscript runtime must stay small and sanitized.
- Transfer Analyzer remains stateless/live-only.
```

PM must not:

```text
- reintroduce persistent player memory;
- treat Drive as a primary database;
- expose secret credentials in public artifacts or misrepresent the accepted public client key as strong authentication;
- add runtime dependency on the full RAG corpus;
- request GitHub Actions for docs-only architecture updates.
```

## 14. Safe change rules

Architecture/docs-only updates to this document:

```text
runtime/build changes: NO
GitHub Actions: NO
```

Server/VPS script changes:

```text
runtime/build changes in GitHub userscript: NO
GitHub Actions: NO unless repository runtime/build files are also changed
```

Userscript runtime changes:

```text
must follow normal PM → module branch → Core Release → Actions gate
```

## 15. Current status snapshot

Last known stable state:

```text
VPS source baseline in Git: imported, not yet deployed from Git
Exact deployed Git revision: unknown
VPS exporter: OK
RAG builder: OK
forum_faq: OK
rclone remote: OK
Drive current sync: OK
Daily wrapper: OK after filter-file fix
ChatGPT Drive connector: may require correct Google account and direct file/folder access
```

The PM must verify current state before making operational claims if the task depends on live VPS/Drive data.
