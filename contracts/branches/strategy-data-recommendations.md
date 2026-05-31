# Branch Contract: strategy-data-recommendations

## Role

High-frequency product branch for match data, strategy/tactic presets, live parser snapshots, and recommendation logic.

## Scope

This branch owns:

- uploaded or parsed match data workflows;
- live parser snapshots and match result parsing;
- strategy and tactic preset library;
- recommendation engine and tactical decision model;
- game.php recommendation UI;
- logic that makes recommendations account for available tactics/strategy presets.

## Allowed areas

- `src/modules/strategy-data-recommendations/**`
- `src/modules/live-parser/**`
- `src/modules/tactics-presets/**`

## Forbidden areas

- transfer analyzer logic;
- team-management modules;
- release files;
- GitHub/Tampermonkey metadata.

## Output

This branch produces a module release manifest under:

```text
module-releases/strategy-data-recommendations/<release-id>.json
```

It does not publish the final userscript.

## Integration

`core-release` may integrate this branch only when the user explicitly requests a specific module release manifest.
