#!/usr/bin/env python3
import json
from pathlib import Path

path = Path('src/app/bundle-order.json')
data = json.loads(path.read_text(encoding='utf-8'))
module = next(
    entry for entry in data['dependencyAudit']['modules']
    if entry['file'] == 'src/modules/manual-match-telemetry/snapshot-engine.js'
)
module['hostCapabilities'] = [
    capability for capability in module.get('hostCapabilities', [])
    if capability != 'localStorage'
]
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('[stage5-manifest] removed stale localStorage capability')
