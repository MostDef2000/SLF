# Branch Contract: transfer-analyzer

## Role

High-frequency product branch for transfer market logic, MKT/TM/SLF alter valuation, transfer recommendations, and transfer UI/details.

## Scope

This branch owns:

- transfer pages analysis;
- MKT current price, p75 baseline, and ratio logic;
- TM enrichment used by transfers;
- SLF alter finalSkill used by transfer valuation;
- transfer verdict logic;
- transfer details/tooltip UI;
- transfer cache and history sync-only page.

## Allowed areas

- `src/modules/transfer-analyzer/**`

## Forbidden areas

- strategy-data-recommendations;
- live parser;
- tactics presets;
- team-management modules;
- release files;
- GitHub/Tampermonkey metadata.

## Output

This branch produces a module release manifest under:

```text
module-releases/transfer-analyzer/<release-id>.json
```

It does not publish the final userscript.

## Integration

`core-release` may integrate this branch only when the user explicitly requests a specific module release manifest.
