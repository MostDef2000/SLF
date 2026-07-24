// Team Management: Team4 leadership-upgrade indicator
// Read-only helper. It never invokes the leadership upgrade action.

const SLFTeam4LeadershipUpgradeIndicator = (() => {
    const CACHE_KEY = 'slf_team4_leadership_upgrade_cache_v1';
    const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
    const MAX_CONCURRENCY = 3;
    const STYLE_ID = 'slf-team4-leadership-upgrade-style';
    const BADGE_CLASS = 'slf-team4-leadership-upgrade-badge';
    const PLAYER_LINK_SELECTOR = 'a[href*="/player.php"][href*="action=view"][href*="id="]';
    let scanRunning = false;
    let rescanRequested = false;
    let scanTimer = 0;

    function norm(value) {
        return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function isTeam4MainPage() {
        const params = new URLSearchParams(location.search || '');
        return /\/team4\.php$/i.test(location.pathname || '') && !params.get('action');
    }

    function readCache() {
        try {
            const parsed = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    function writeCache(cache) {
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache || {})); } catch (_) {}
    }

    function getFreshCacheEntry(cache, playerId, now = Date.now()) {
        const entry = cache?.[String(playerId || '')];
        const checkedAt = Number(entry?.checkedAt || 0);
        if (!entry || !checkedAt || now - checkedAt > CACHE_TTL_MS) return null;
        return {
            playerId: String(entry.playerId || playerId),
            available: entry.available === true,
            targetLeadership: norm(entry.targetLeadership || ''),
            checkedAt
        };
    }

    function parsePlayerId(value) {
        try {
            const id = new URL(String(value || ''), location.origin).searchParams.get('id');
            return /^\d+$/.test(String(id || '')) ? String(id) : '';
        } catch (_) {
            return String(value || '').match(/[?&]id=(\d+)/i)?.[1] || '';
        }
    }

    function buildPlayerUrl(playerId) {
        return `/player.php?action=view&id=${encodeURIComponent(playerId)}`;
    }

    function isVisible(row) {
        if (!row?.isConnected) return false;
        const style = getComputedStyle(row);
        return style.display !== 'none' && style.visibility !== 'hidden' && !row.hidden;
    }

    function getPlayerRows(doc = document) {
        return [...doc.querySelectorAll('tr[id^="pltr-"]')]
            .map(row => {
                const link = row.querySelector(PLAYER_LINK_SELECTOR);
                const playerId = String(row.id || '').match(/^pltr-(\d+)$/)?.[1]
                    || parsePlayerId(link?.getAttribute('href') || link?.href || '');
                return playerId && link ? { row, link, playerId } : null;
            })
            .filter(Boolean);
    }

    function getVisiblePlayerRows(doc = document) {
        return getPlayerRows(doc).filter(item => isVisible(item.row));
    }

    function parseLeadershipUpgradeDocument(doc, playerId = '') {
        const leadershipRow = [...(doc?.querySelectorAll?.('tr') || [])].find(row => {
            const firstCell = row.querySelector('td');
            return /^лидерство$/i.test(norm(firstCell?.textContent || ''));
        });
        const upgradeLink = leadershipRow?.querySelector('a[href*="up14=ok"]') || null;
        const sourceText = norm(`${upgradeLink?.getAttribute('title') || ''} ${leadershipRow?.textContent || ''}`);
        const targetLeadership = sourceText.match(/до\s+(\d+(?:[.,]\d+)?)/i)?.[1]?.replace(',', '.') || '';
        return { playerId: String(playerId || ''), available: !!upgradeLink, targetLeadership };
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .${BADGE_CLASS} {
                display:inline-block; margin-left:5px; padding:1px 4px;
                border:1px solid #91c94a; border-radius:3px; background:#426d1f;
                color:#f2ffd8 !important; font-size:9px; font-weight:700;
                line-height:1.2; text-decoration:none !important; vertical-align:middle;
                white-space:nowrap;
            }
            .${BADGE_CLASS}:hover { background:#5b8d2e; color:#fff !important; }
        `;
        document.head.appendChild(style);
    }

    function renderBadge(item, entry) {
        if (!item?.row || !item.link) return;
        let badge = item.row.querySelector(`.${BADGE_CLASS}`);
        if (!entry?.available) {
            badge?.remove();
            return;
        }
        ensureStyle();
        if (!badge) {
            badge = document.createElement('a');
            badge.className = BADGE_CLASS;
            badge.textContent = 'ЛИД ↑';
            item.link.insertAdjacentElement('afterend', badge);
        }
        badge.href = buildPlayerUrl(item.playerId);
        badge.dataset.playerId = item.playerId;
        badge.title = entry.targetLeadership
            ? `Можно поднять лидерство до ${entry.targetLeadership}`
            : 'Можно поднять лидерство';
    }

    async function fetchPlayerState(playerId) {
        const response = await fetch(buildPlayerUrl(playerId), { credentials: 'include', cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        return parseLeadershipUpgradeDocument(doc, playerId);
    }

    async function scanVisibleRows() {
        if (!isTeam4MainPage()) return { checked: 0, cached: 0, available: 0, failed: 0 };
        if (scanRunning) {
            rescanRequested = true;
            return null;
        }
        scanRunning = true;
        const cache = readCache();
        const pending = [];
        const stats = { checked: 0, cached: 0, available: 0, failed: 0 };
        try {
            getVisiblePlayerRows().forEach(item => {
                const cached = getFreshCacheEntry(cache, item.playerId);
                if (cached) {
                    stats.cached++;
                    if (cached.available) stats.available++;
                    renderBadge(item, cached);
                } else {
                    pending.push(item);
                }
            });

            let cursor = 0;
            async function worker() {
                while (cursor < pending.length) {
                    const item = pending[cursor++];
                    if (!isVisible(item.row)) continue;
                    try {
                        const entry = { ...(await fetchPlayerState(item.playerId)), checkedAt: Date.now() };
                        cache[item.playerId] = entry;
                        writeCache(cache);
                        stats.checked++;
                        if (entry.available) stats.available++;
                        renderBadge(item, entry);
                    } catch (error) {
                        stats.failed++;
                        console.warn('[SLF Team4 Leadership] player check failed', {
                            playerId: item.playerId,
                            error: String(error?.message || error)
                        });
                    }
                }
            }
            await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, pending.length) }, () => worker()));
            return stats;
        } finally {
            scanRunning = false;
            if (rescanRequested) {
                rescanRequested = false;
                scheduleScan(50);
            }
        }
    }

    function scheduleScan(delay = 100) {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(() => scanVisibleRows().catch(error => {
            console.warn('[SLF Team4 Leadership] scan failed', error);
        }), delay);
    }

    function bindTabs() {
        document.addEventListener('click', event => {
            if (event.target?.closest?.('.tpanel-a, .tpanel-b')) scheduleScan(100);
        }, true);
    }

    function observeRows() {
        const root = document.querySelector('#generallist') || document.body;
        const observer = new MutationObserver(mutations => {
            if (mutations.some(mutation => mutation.type === 'childList'
                || ['class', 'style', 'hidden'].includes(mutation.attributeName))) {
                scheduleScan(100);
            }
        });
        observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden']
        });
    }

    function start() {
        if (!isTeam4MainPage()) return;
        const run = () => {
            bindTabs();
            observeRows();
            scheduleScan(0);
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
        else run();
    }

    const api = {
        CACHE_KEY,
        CACHE_TTL_MS,
        MAX_CONCURRENCY,
        getPlayerRows,
        getVisiblePlayerRows,
        getFreshCacheEntry,
        parseLeadershipUpgradeDocument,
        fetchPlayerState,
        scanVisibleRows,
        renderBadge,
        start
    };
    window.SLFTeam4LeadershipUpgradeIndicator = api;
    return api;
})();

SLFTeam4LeadershipUpgradeIndicator.start();
