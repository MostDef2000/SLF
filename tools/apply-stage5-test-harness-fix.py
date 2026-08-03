#!/usr/bin/env python3
from pathlib import Path

path = Path('tools/test-manual-match-workflow.mjs')
text = path.read_text(encoding='utf-8')

def replace(old: str, new: str, expected: int = 1) -> None:
    global text
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f'expected {expected} occurrence(s), found {count}: {old!r}')
    text = text.replace(old, new)

replace(
    """  let currentSnapshot = makeSnapshot();
  let storedPending = persistedPending;

  const localStorageData = new Map();
""",
    """  let currentSnapshot = makeSnapshot();
  let storedPending = persistedPending;

  const localStorageData = new Map();
  if (persistedPending) {
    localStorageData.set('slf_live_parser_state_v2:game-1', JSON.stringify({
      schema: 'slf_live_parser_state_v2',
      gameId: 'game-1',
      pendingPresetEvent: clone(persistedPending)
    }));
  }
"""
)
replace(
    """      setItem(key, value) {
        localStorageData.set(key, String(value));
      },
""",
    """      setItem(key, value) {
        localStorageData.set(key, String(value));
        if (key.startsWith('slf_manual_match_state_v1:')) {
          const parsed = JSON.parse(String(value));
          persisted.push(clone(parsed));
          storedPending = clone(parsed.pendingPresetEvent || null);
        }
      },
"""
)
replace("      liveParserTimer: null,\n", "")
replace(
    """      freezeRecommendationsAfterTacticChange() {},
      persistLiveState(value) {
        const copy = clone(value);
        persisted.push(copy);
        if (Object.prototype.hasOwnProperty.call(value, 'pendingPresetEvent')) {
          storedPending = clone(value.pendingPresetEvent);
        } else if (context.STATE.pendingPresetEvent) {
          storedPending = clone(context.STATE.pendingPresetEvent);
        }
      },
      loadLiveState(gameId) {
        if (!storedPending) return null;
        return {
          schema: 'slf_live_parser_state_v2',
          gameId,
          pendingPresetEvent: clone(storedPending)
        };
      }
""",
    """      freezeRecommendationsAfterTacticChange() {}
"""
)
path.write_text(text, encoding='utf-8')
print('[stage5-manual-workflow-harness] adapted')
