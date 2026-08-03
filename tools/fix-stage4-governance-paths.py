#!/usr/bin/env python3
from pathlib import Path

path = Path('contracts/branches/strategy-data-recommendations.md')
text = path.read_text(encoding='utf-8')
old = "- `src/modules/match-reading/**'\n      - 'src/modules/manual-match-telemetry/**`"
new = "- `src/modules/match-reading/**`\n- `src/modules/manual-match-telemetry/**`"
if text.count(old) != 1:
    raise SystemExit(f'expected one malformed ownership block, found {text.count(old)}')
text = text.replace(old, new)
text = text.replace(
    'High-frequency product branch for match data, strategy/tactic presets, live parser snapshots, and recommendation logic.',
    'High-frequency product branch for match data, strategy/tactic presets, manual match telemetry, and recommendation logic.'
)
text = text.replace(
    '- live parser snapshots and match result parsing;',
    '- manual match snapshots, tactic telemetry, and match result parsing;'
)
path.write_text(text, encoding='utf-8')
print('[stage4-governance-paths] fixed')
