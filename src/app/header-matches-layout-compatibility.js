// ============================================================
// 16a. Header Matches Layout Compatibility
// ============================================================
// Verbatim extraction from src/app/bootstrap.js (issue #278).
// Loaded immediately before the final bootstrap orchestrator.

function installHeaderMatchesLayoutCompatibility() {
    const root = document.documentElement;
    if (!root || root.dataset.slfHeaderMatchesFit === '1') return;
    root.dataset.slfHeaderMatchesFit = '1';

    const styleId = 'slf-header-matches-fit';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            html[data-slf-header-matches-fit="1"] .fm-deck__grid {
                column-gap: 14px !important;
            }
            html[data-slf-header-matches-fit="1"] .fm-card--controls {
                display: grid !important;
                grid-template-columns: none !important;
                grid-auto-flow: column !important;
                grid-auto-columns: minmax(0, 1fr) !important;
                align-items: stretch !important;
                min-width: 0 !important;
                max-width: 100% !important;
                overflow: hidden !important;
            }
            html[data-slf-header-matches-fit="1"] .fm-card--controls > .fm-card {
                width: auto !important;
                min-width: 0 !important;
                max-width: 100% !important;
                overflow: hidden !important;
            }
            html[data-slf-header-matches-fit="1"] .fm-card--controls .fm-card__mid,
            html[data-slf-header-matches-fit="1"] .fm-card--controls .fm-account,
            html[data-slf-header-matches-fit="1"] .fm-card--controls .fm-char,
            html[data-slf-header-matches-fit="1"] .fm-card--controls .fm-md,
            html[data-slf-header-matches-fit="1"] .fm-card--controls .fm-club,
            html[data-slf-header-matches-fit="1"] .fm-card--controls .fm-club__body {
                min-width: 0 !important;
                max-width: 100% !important;
            }
            html[data-slf-header-matches-fit="1"] .fm-deck[data-slf-matches-expanded="1"] {
                height: auto !important;
                max-height: none !important;
                overflow: visible !important;
            }
            html[data-slf-header-matches-fit="1"] .fm-card--matches {
                display: flex !important;
                flex-direction: column !important;
                width: 100% !important;
                min-width: 0 !important;
                max-width: 100% !important;
                height: auto !important;
                max-height: none !important;
                overflow: visible !important;
                visibility: visible !important;
                opacity: 1 !important;
            }
            html[data-slf-header-matches-fit="1"] .fm-card--matches #field-f7 {
                display: flex !important;
                flex-direction: column !important;
                min-height: 0 !important;
                height: auto !important;
                max-height: none !important;
                overflow: visible !important;
                visibility: visible !important;
            }
            html[data-slf-header-matches-fit="1"] .fm-card--matches .fm-matches__scroll {
                display: block !important;
                flex: 0 0 auto !important;
                height: auto !important;
                max-height: none !important;
                overflow-y: visible !important;
                scrollbar-width: none !important;
                visibility: visible !important;
            }
            html[data-slf-header-matches-fit="1"] .fm-card--matches .fm-matches__scroll::-webkit-scrollbar {
                display: none !important;
                width: 0 !important;
                height: 0 !important;
            }
            html[data-slf-header-matches-fit="1"] .fm-card--matches .fm-fixture--mine {
                position: relative !important;
                top: auto !important;
            }
            html[data-slf-header-matches-fit="1"] .fm-card--matches #fm-games-expand {
                display: none !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    const parseFixtureMinute = row => {
        const explicit = row.querySelector('.fm-fixture__time');
        const text = String(explicit?.textContent || row.firstElementChild?.textContent || '').trim();
        const match = text.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return null;
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) return null;
        return hours * 60 + minutes;
    };

    const chronologicalStartMinute = minutes => {
        const unique = Array.from(new Set(minutes)).sort((a, b) => a - b);
        if (unique.length < 2) return unique[0] ?? 0;

        let largestGap = -1;
        let startMinute = unique[0];
        unique.forEach((minute, index) => {
            const next = index + 1 < unique.length ? unique[index + 1] : unique[0] + 24 * 60;
            const gap = next - minute;
            if (gap > largestGap) {
                largestGap = gap;
                startMinute = next % (24 * 60);
            }
        });
        return startMinute;
    };

    const sortFixtureList = list => {
        if (!list || list.dataset.slfChronologicalSortActive === '1') return false;
        const rows = Array.from(list.children).filter(node => node.classList?.contains('fm-fixture'));
        if (rows.length < 2) return false;

        const parsed = rows.map((row, index) => ({ row, index, minute: parseFixtureMinute(row) }));
        const validMinutes = parsed.filter(item => item.minute !== null).map(item => item.minute);
        if (validMinutes.length < 2) return false;

        const startMinute = chronologicalStartMinute(validMinutes);
        const sorted = parsed.slice().sort((left, right) => {
            if (left.minute === null && right.minute === null) return left.index - right.index;
            if (left.minute === null) return 1;
            if (right.minute === null) return -1;
            const leftKey = (left.minute - startMinute + 24 * 60) % (24 * 60);
            const rightKey = (right.minute - startMinute + 24 * 60) % (24 * 60);
            return leftKey - rightKey || left.index - right.index;
        });

        if (sorted.every((item, index) => item.row === rows[index])) {
            list.dataset.slfChronologicalOrder = '1';
            return false;
        }

        list.dataset.slfChronologicalSortActive = '1';
        sorted.forEach(item => list.appendChild(item.row));
        list.dataset.slfChronologicalOrder = '1';
        delete list.dataset.slfChronologicalSortActive;
        return true;
    };

    let sortScheduled = false;
    const normalizeFixtureOrder = () => {
        sortScheduled = false;
        document.querySelectorAll('.fm-card--matches').forEach(card => {
            const deck = card.closest('.fm-deck');
            if (deck) deck.dataset.slfMatchesExpanded = '1';
            card.querySelectorAll('.fm-fixtures').forEach(sortFixtureList);
        });
        root.dataset.slfHeaderMatchesChronological = '1';
    };
    const scheduleFixtureOrder = () => {
        if (sortScheduled) return;
        sortScheduled = true;
        setTimeout(normalizeFixtureOrder, 0);
    };
    const mutationTouchesFixtures = mutation => {
        const target = mutation.target?.nodeType === 1
            ? mutation.target
            : mutation.target?.parentElement;
        if (target?.closest?.('.fm-card--matches')) return true;
        return Array.from(mutation.addedNodes || []).some(node => (
            node?.nodeType === 1
            && (node.matches?.('.fm-card--matches, .fm-fixtures, .fm-fixture')
                || node.querySelector?.('.fm-card--matches, .fm-fixtures, .fm-fixture'))
        ));
    };

    scheduleFixtureOrder();
    const observerRoot = document.body || document.documentElement;
    if (observerRoot) {
        const observer = new MutationObserver(mutations => {
            if (mutations.some(mutationTouchesFixtures)) scheduleFixtureOrder();
        });
        observer.observe(observerRoot, { childList: true, subtree: true, characterData: true });
    }
}

// Fail-open isolation: a compatibility adapter failure must never stop startup.
try {
    installHeaderMatchesLayoutCompatibility();
} catch (error) {
    debugWarn('[SLF] header matches layout compatibility adapter failed; continuing startup', error);
}
