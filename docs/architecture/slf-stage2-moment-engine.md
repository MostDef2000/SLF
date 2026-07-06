# SLF Stage 2 — Moment-Based Tactical Engine

## Overview
Stage 2 introduces a rule-based, explainable tactical reasoning layer on top of SLF RAG infrastructure.

It does NOT replace Stage 1 pipeline.
It operates as a derived analytics layer over VPS-exported and RAG-built datasets.

---

## Core Idea

Transform raw match snapshots into:

- moment events
- tactical recommendations
- preset decisions
- weak zone signals

Each output must be:
- explainable
- deterministic
- rebuildable from VPS data

---

## Input Sources

### VPS Export Layer (Source of Truth)
- match_snapshots_v2
- match_results_v2
- player_observations
- preset_effects
- preset_events

### RAG Layer (Derived)
- match_evidence.jsonl
- rule_extracts.jsonl
- forum_notes.jsonl
- tactical_cases.jsonl

### Summary Layer
- match_data_summary.json
- preset_*_summary.json

---

## Processing Model

### Step 1 — Moment Detection
Each snapshot is mapped into a time window (generation bucket).

Signals extracted:
- score state
- xG / xT delta
- press intensity
- bad actions ratio
- developer hints

---

### Step 2 — Moment Classification

Moments:
- collect_data
- need_goal
- late_need_goal
- protect_lead
- under_pressure
- attacking_momentum
- opponent_low_block
- opponent_high_press
- balanced_control

---

### Step 3 — Tactical Mapping

Each moment maps to a preset recommendation:

Example:
- need_goal → controlled attacking preset
- under_pressure → stabilizing defensive preset
- late_need_goal → vertical risk preset

---

### Step 4 — Explainability Layer

Each recommendation includes:

- signals
- reasons
- source references
- confidence score

No black-box logic allowed.

---

## Output Artifacts

### 1. moment_events.jsonl
Describes detected game moments

### 2. tactical_recommendations.jsonl
Explainable tactical suggestions

### 3. preset_decisions.jsonl
Tracks transitions between tactical states

### 4. weak_zones.jsonl
Identifies opponent vulnerabilities

---

## Runtime Constraint Model

- VPS = source of truth
- RAG = derived layer
- Drive = mirror only
- userscript = lightweight pack only

No ML training. No simulation engine.

---

## Integration Point

Stage 2 runs after Stage 1 export pipeline:

VPS → export → RAG build → Stage 2 build → Drive sync

---

## Success Criteria

- deterministic rebuild
- explainable outputs
- no runtime dependency on external APIs
- no modification of userscript core

---

## Status

Stage 2 MVP: ACTIVE
