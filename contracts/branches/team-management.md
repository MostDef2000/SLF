# Branch Contract: team-management

## Role

Medium/low-frequency product branch for squad and team-management modules.

## Scope

This branch owns:

- SLF Team4 Status Monitor v1;
- real-career player status markers;
- team4 loan limit panel;
- training helper;
- youth scouting / youth monitor / youth autofill;
- small team4 and squad-management UI helpers.

No separate `youth-scouting` branch is used. Youth work belongs here.

## Allowed areas

- `src/modules/team-management/**`
- `src/modules/team4-status-monitor/**`
- `src/modules/team4-loans/**`
- `src/modules/training-helper/**`
- `src/modules/youth-monitor/**`

## Forbidden areas

- transfer analyzer logic;
- strategy-data-recommendations;
- live parser;
- tactics presets;
- release files;
- GitHub/Tampermonkey metadata.

## Output

This branch produces a module release manifest under:

```text
module-releases/team-management/<release-id>.json
```

It does not publish the final userscript.

## Integration

`core-release` may integrate this branch only when the user explicitly requests a specific module release manifest.
