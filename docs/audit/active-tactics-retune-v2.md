# Active tactics retune v2

## Scope

This stage retunes the exact 11 active runtime presets without changing the recommendation engine, selection thresholds, telemetry schema, VPS behavior, formation mappings, preset identifiers, or manual-application boundary.

The goal is to remove the dense neutral-to-medium cluster documented in `active-tactics-inventory-v1.md` and make each selected preset produce a materially different match plan.

## Quantitative result

Using the same unweighted Manhattan distance over 14 numeric team settings:

- minimum pair distance increased from 3 to 7;
- pairs at distance 8 or lower decreased from 13 to 3;
- near-duplicate pairs decreased from 1 to 0.

The machine-readable post-retune baseline is `data/tactics/active-preset-inventory-v2.json`.

## Profile changes

### Arteta Control 4-3-3

Remains the moderate structural baseline. It is intentionally the least extreme preset and now sits farther from Controlled Push.

### Pep Box Control

Becomes a true low-risk reset: very low press, patient circulation, minimum passing risk, dribbling, crossing and shooting.

### Pep Press Cooldown

No longer duplicates Box Control. It drops the block, widens the outlet structure and uses longer progression to escape pressure while reducing pressing cost.

### Compact Counter

Becomes a genuinely direct transition profile: low engagement, maximum long progression and build speed, increased dribbling and shooting risk.

### Pep Controlled Push

Moves to a higher line and faster progression with increased passing and shooting risk. It is now a clear attacking escalation rather than a small Arteta variation.

### Pep Positional Attack

Becomes a high-line positional siege with wide occupation, high pressing, maximum passing ambition and stronger shot volume.

### Conte Wingback Width

Uses maximum width and crossing with higher dribbling and a three-player build structure. It is now the dedicated flank-overload endpoint.

### Klopp Gegenpress

Uses near-maximum defensive line, pressing line, intensity and build speed. It remains guarded by the existing fatigue, bad-action and transition vetoes.

### Simeone Compact 4-4-2

Becomes a narrow low block with intense local pressure and conservative possession. It separates controlled protection from the emergency Low Block.

### Simeone Low Block

Uses minimum press and risk with maximum long clearance. It is deliberately unsuitable for normal match phases.

### Bielsa Chaos Press

Moves to the maximum available values for line, width, pressing, speed, style, passing risk, dribbling, crossing and shooting. It remains an emergency-only endpoint.

## Safety boundary

The existing recommendation rules and hard guards remain unchanged. This isolates the effect of the preset-value retune from later changes to selection logic.

No generated release artifact or version manifest is edited manually.

## Next stage

After this runtime change is published, stage 3 should adjust application policy and risk appetite so the recommender can select the stronger profiles earlier when evidence and match state support them, while preserving hard safety vetoes.
