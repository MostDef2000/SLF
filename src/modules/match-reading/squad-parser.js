    // 7. Lineup / Squad Parser
    // ============================================================

    const SquadParser = {
        normalizePosition(raw) {
            if (!raw) return null;

            const p = String(raw).toLowerCase();

            if (p === 'sub') return 'SUB';
            if (p === 'gk') return 'GK';

            if (p === 'ld') return 'DL';
            if (p === 'rd') return 'DR';
            if (p.startsWith('cd')) return 'DC';

            if (p.startsWith('dm')) return 'DM';
            if (p.startsWith('cm')) return 'CM';
            if (p.startsWith('am')) return 'AM';

            if (p === 'lm' || p === 'lw') return 'ML';
            if (p === 'rm' || p === 'rw') return 'MR';

            if (p.startsWith('st')) return 'ST';

            return String(raw).toUpperCase();
        },

        parsePlayerText(text) {
            const clean = String(text || '').trim().replace(/\s+/g, ' ');
            const parts = clean.split(' ');

            const rawPositions = parts.shift() || '';
            const positions = rawPositions
                .split('/')
                .map(p => p.trim().toUpperCase())
                .filter(Boolean);

            const numbers = clean.match(/\d+(?:[.,]\d+)?/g) || [];
            const displayMetric = numbers.length ? toNum(numbers[numbers.length - 1]) : null;

            let displayMetricMode = 'unknown';

            if (displayMetric != null) {
                if (displayMetric <= 10) {
                    displayMetricMode = 'matchRating';
                } else if (displayMetric <= 100) {
                    displayMetricMode = 'fitness';
                } else {
                    displayMetricMode = 'skill';
                }
            }

            // Do not persist match ratings or fitness. Only skill is useful for squad/tactical analytics.
            const skill = displayMetricMode === 'skill' ? displayMetric : null;
            const storedDisplayMetric = displayMetricMode === 'skill' ? displayMetric : null;
            const storedDisplayMetricMode = displayMetricMode === 'skill' ? 'skill' : 'not_logged';

            let namePart = clean;

            if (rawPositions) {
                namePart = namePart.replace(rawPositions, '').trim();
            }

            if (numbers.length) {
                const firstNumberIndex = namePart.search(/\d+(?:[.,]\d+)?/);
                if (firstNumberIndex >= 0) {
                    namePart = namePart.slice(0, firstNumberIndex).trim();
                }
            }

           let finalName = namePart || null;

if (!finalName || /^\d+$/.test(finalName)) {
    const positionPattern = /\b(GK|LD|RD|CD\d*|DM\d*|CM\d*|AM\d*|LW|RW|ST\d*|SUB|LM|RM)\b/gi;

    const cleanedName = clean
        .replace(positionPattern, '')
        .replace(/\d+(?:[.,]\d+)?/g, '')
        .replace(/[^\p{L}.\-\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (cleanedName.length >= 2) {
        finalName = cleanedName;
    }
}

return {
    rawPositions,
    positions,
    primaryPosition: positions[0] || null,
    name: finalName,
    displayMetric: storedDisplayMetric,
    displayMetricMode: storedDisplayMetricMode,
    skill
};
        },

        readExactSlotMap() {
            const map = new Map();
            const slotRe = /^(GK|LD|DL|RD|DR|CD\d*|DC\d*|DM\d*|CM\d*|AM\d*|LM|ML|LW|RM|MR|RW|ST\d*)$/i;
            const candidateSelectors = [
                '[data-position]',
                '[data-pos]',
                '[data-role]',
                '[pos]'
            ];

            const candidates = [...document.querySelectorAll(candidateSelectors.join(','))];

            candidates.forEach(el => {
                if (!el || el.closest('#slf-match-parser-panel, #slf-data-page, #slf-tactics-dropdown, #slf-save-dialog')) return;

                const rawSlot =
                    el.dataset?.position ||
                    el.dataset?.pos ||
                    el.dataset?.role ||
                    el.getAttribute('pos') ||
                    '';

                const slot = String(rawSlot || '').trim().toUpperCase();
                if (!slotRe.test(slot)) return;

                const href = el.querySelector('a[href*="player.php"]')?.getAttribute('href') || '';
                const hrefId = href.match(/[?&]id=(\d+)/)?.[1] || null;
                const idAttr = String(el.id || el.querySelector('[id*="lineup_player_"]')?.id || '');
                const idMatch = idAttr.match(/lineup_player_(\d+)/) || idAttr.match(/player[_-]?(\d+)/i);
                const playerId = toNum(hrefId || idMatch?.[1]);

                if (!playerId) return;

                map.set(String(playerId), {
                    playerId,
                    slot,
                    source: 'grid_data_position',
                    text: (el.innerText || '').trim().replace(/\s+/g, ' ')
                });
            });

            return map;
        },

        readLineupRows() {
            const rows = [...document.querySelectorAll('tr[id^="lineup_player_"]')];
            const exactSlotMap = this.readExactSlotMap();

            return rows.map((row, index) => {
                const playerId = row.id.replace('lineup_player_', '');
                const parsed = this.parsePlayerText(row.innerText);
                const exactSlot = exactSlotMap.get(String(toNum(playerId))) || null;

                const position = exactSlot?.slot || row.dataset.position || parsed.primaryPosition || null;
                const normalizedPosition = this.normalizePosition(position);

                const isStarter = index < 22;
                const side = index < 11
                    ? 'home'
                    : index < 22
                        ? 'away'
                        : 'sub';

                return {
                    index,
                    playerId: toNum(playerId),
                    side,
                    isStarter,
                    position,
                    gridPosition: exactSlot?.slot || null,
                    slotSource: exactSlot?.source || (row.dataset.position ? 'lineup_dataset' : 'lineup_text'),
                    normalizedPosition,
                    positions: parsed.positions,
                    line: toNum(row.dataset.line),
                    name: parsed.name,

                    displayMetric: parsed.displayMetric,
                    displayMetricMode: parsed.displayMetricMode,
                    skill: parsed.skill,

                    text: row.innerText.trim().replace(/\s+/g, ' ')
                };
            });
        },

        buildFormationFromRows(rows) {
            const counts = {};

            rows.forEach(player => {
                const pos = player.normalizedPosition || this.normalizePosition(player.position);

                if (!pos || pos === 'SUB') return;

                counts[pos] = (counts[pos] || 0) + 1;
            });

            const defenders =
                (counts.DL || 0) +
                (counts.DC || 0) +
                (counts.DR || 0);

            const midfielders =
                (counts.DM || 0) +
                (counts.CM || 0) +
                (counts.AM || 0) +
                (counts.ML || 0) +
                (counts.MR || 0);

            const forwards = counts.ST || 0;

            return {
                formation: `${defenders}-${midfielders}-${forwards}`,
                positions: counts
            };
        },

        readFormation() {
            const rows = this.readLineupRows();

            const homeStarters = rows.filter(p => p.side === 'home' && p.isStarter);
            const awayStarters = rows.filter(p => p.side === 'away' && p.isStarter);

            return {
                home: this.buildFormationFromRows(homeStarters),
                away: this.buildFormationFromRows(awayStarters)
            };
        }
    };

   // ============================================================
