// Team Management: Team4 championship table swap (issue #385)
// UI-only patch. Fetches the championship table from roster.php and mounts it as a card
// in the left column right below the lineup pitch; the infirmary / disqualified /
// loan-request cards move to the bottom of the right column. After a successful mount
// the legacy #slf-team4-championship-table side panel is removed from the DOM.
// Stable cache keys: no storage/schema version changes.

const SLFTeam4ChampionshipTableSwap = (() => {
    'use strict';

    const LOG_PREFIX = '[SLF Team4 Championship Swap]';
    const STYLE_ID = 'slf-team4-championship-table-swap-style';
    const MOUNT_FLAG = 'slfTeam4ChampionshipSwap';
    const LEGACY_PANEL_ID = 'slf-team4-championship-table';
    const CARD_CLASS = 'slf-champ';
    const MOVED_CONTAINER_CLASS = 'slf-moved';
    const OWN_ROW_CLASS = 'slf-own';
    const ROSTER_URL = '/roster.php';
    const READY_POLL_MS = 300;
    const READY_MAX_TRIES = 40; // ~12s of retries, then keep the native layout
    const MOVE_CARD_TITLES = ['Лазарет клуба', 'Дисквалифицированные игроки', 'Ваши заявки на аренду'];

    const norm = value => String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

    function isTeam4MainPage() {
        const params = new URLSearchParams(location.search || '');
        return /\/team4\.php$/i.test(location.pathname || '') && !params.get('action');
    }

    function isFm2026Design() {
        return document.documentElement.dataset.slfDesign === 'fm2026'
            || Boolean(document.querySelector('.fm-stage .content-ui__wrapper'));
    }

    function isAlreadyMounted() {
        return document.documentElement.dataset[MOUNT_FLAG] === '1'
            || Boolean(document.querySelector(`.${CARD_CLASS}`));
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .slf-champ .roster_champ_table { padding:0; }
            .slf-champ table { width:100%; border-collapse:collapse; font-size:13px; color:#e8eaf3; }
            .slf-champ td { padding:6px 8px; border-bottom:1px solid #353849; }
            .slf-champ tr:nth-child(odd) { background:#232530; }
            .slf-champ tr:nth-child(even) { background:#1e2029; }
            .slf-champ .rstr-thead td { color:#9aa0b5; font-weight:600; }
            .slf-champ .top-head { padding:4px 8px; font-weight:600; }
            .slf-champ tr.slf-own { background:rgba(43,217,124,.14); }
            .slf-moved { margin-top:12px; }
            .slf-moved .pcard { margin-bottom:12px; }
        `;
        document.head.appendChild(style);
    }

    function resolveTeamId() {
        const fromUrl = (location.search.match(/[?&]id=(\d+)/) || [])[1];
        if (fromUrl) return fromUrl;
        // team4.php shows the active club — fall back to the club card link.
        const link = document.querySelector('.fm-card--club a[href*="/roster.php?id="]');
        const href = link?.getAttribute('href') || link?.href || '';
        return (href.match(/[?&]id=(\d+)/) || [])[1] || '';
    }

    function resolveClubName() {
        const card = document.querySelector('.fm-card--club');
        return norm(card?.querySelector('.team-name')?.textContent || card?.querySelector('a')?.textContent || '');
    }

    function findMovedCards(dash) {
        return [...dash.querySelectorAll('.pcard:not(.team-lineup):not(.slf-champ)')].filter(card => {
            const head = card.querySelector('.pcard__head2');
            if (!head) return false;
            const title = norm(head.textContent);
            return MOVE_CARD_TITLES.some(candidate => title.includes(candidate));
        });
    }

    function resolveTeamContent(dash) {
        const teamBody = dash.closest('.team-body');
        return teamBody?.querySelector(':scope > .team-content')
            || document.querySelector('.team-body .team-content');
    }

    function rowLinksToTeam(row, teamId) {
        return [...row.querySelectorAll('a[href]')].some(anchor => {
            try {
                const url = new URL(anchor.getAttribute('href') || '', location.origin);
                // Club links only (roster.php/team.php) — player.php links carry their own id space.
                return /\/(?:roster|team)\.php$/i.test(url.pathname) && url.searchParams.get('id') === teamId;
            } catch (_) {
                return false;
            }
        });
    }

    function rowShowsClubName(row, clubName) {
        if (!clubName) return false;
        const clubNameLower = clubName.toLowerCase();
        return [...row.querySelectorAll('td,th')].some(cell => norm(cell.textContent).toLowerCase() === clubNameLower);
    }

    function markOwnRow(box, teamId, clubName) {
        const rows = [...box.querySelectorAll('tr')];
        let ownRows = teamId ? rows.filter(row => rowLinksToTeam(row, teamId)) : [];
        if (!ownRows.length) {
            // Name fallback only when unambiguous: exactly one row carries the club name
            // (textContent pierces plain and <b>-wrapped name cells alike).
            const byName = rows.filter(row => rowShowsClubName(row, clubName));
            if (byName.length === 1) ownRows = byName;
        }
        ownRows.forEach(row => row.classList.add(OWN_ROW_CLASS));
    }

    function prepareTable(box, teamId, clubName) {
        // Toggle buttons are driven by roster.js and do not work inside the mounted card:
        // drop the buttons themselves, keep the cells, and force every row visible
        // (no compact mode — clear any inline display:none hiding rows).
        box.querySelectorAll('.champ-toggle').forEach(button => button.remove());
        box.querySelectorAll('tr').forEach(row => { row.style.display = ''; });
        if (!box.querySelector('.top-head')) {
            const head = document.createElement('div');
            head.className = 'top-head';
            head.textContent = 'Турнирная таблица';
            box.prepend(head);
        }
        markOwnRow(box, teamId, clubName);
        return box;
    }

    function mount(dash, lineup, box) {
        // Resolve the right column before any mutation so a missing anchor fails
        // without detaching the moved cards from the page.
        const teamContent = resolveTeamContent(dash);
        if (!teamContent) throw new Error('right column .team-content not found');

        const card = document.createElement('div');
        card.className = `pcard ${CARD_CLASS}`;
        card.appendChild(box);
        lineup.insertAdjacentElement('afterend', card);

        const moved = document.createElement('div');
        moved.className = MOVED_CONTAINER_CLASS;
        findMovedCards(dash).forEach(candidate => moved.appendChild(candidate));
        if (moved.children.length) teamContent.appendChild(moved);
    }

    function waitReady(onReady) {
        let settled = false;
        let tries = 0;
        let timer = 0;
        const observer = typeof MutationObserver === 'function' ? new MutationObserver(() => check(false)) : null;

        function stop() {
            if (observer) observer.disconnect();
            if (timer) {
                clearTimeout(timer);
                timer = 0;
            }
        }

        function check(fromTimer) {
            if (settled) return;
            const dash = document.querySelector('.team-body > .team-dash') || document.querySelector('.team-dash');
            const lineup = dash?.querySelector('.pcard.team-lineup');
            if (dash && lineup && findMovedCards(dash).length === MOVE_CARD_TITLES.length) {
                settled = true;
                stop();
                onReady(dash, lineup);
                return;
            }
            if (fromTimer) {
                tries += 1;
                if (tries > READY_MAX_TRIES) {
                    settled = true;
                    stop();
                    console.warn(LOG_PREFIX, 'team4 layout anchors did not appear, page left untouched');
                    return;
                }
            }
            if (!timer) timer = setTimeout(() => { timer = 0; check(true); }, READY_POLL_MS);
        }

        if (observer) observer.observe(document.documentElement, { childList: true, subtree: true });
        check(false);
    }

    function suppressLegacyPanel() {
        const panel = document.getElementById(LEGACY_PANEL_ID);
        if (!panel) return;
        // Disarm the legacy placement controller before detaching: its resize and
        // ResizeObserver closures keep the panel reference alive and re-toggle the
        // external/overflow classes on every resize; the dataset flag is their only
        // guard and keeps working on the detached node.
        panel.dataset.slfRosterSideActive = '0';
        // Mirror the legacy module's own cleanup branch: once the panel is detached,
        // that branch is unreachable (applyLayoutState early-returns on a detached
        // panel), so the 366px grid and overflow classes would otherwise stick.
        const host = document.querySelector('.team-body');
        if (host) {
            host.classList.remove('slf-team4-championship-layout', 'slf-team4-championship-roster-side', 'slf-team4-championship-external');
            if (host.dataset.slfChampGenericContent === '1') host.classList.remove('team_general_content');
            host.closest('.content-ui__wrapper')?.classList.remove('slf-team4-championship-overflow');
        }
        panel.remove();
    }

    async function mountFromRoster(dash, lineup) {
        const teamId = resolveTeamId();
        if (!teamId) throw new Error('team id not found (no ?id= in url, no .fm-card--club roster link)');
        const response = await fetch(`${ROSTER_URL}?id=${teamId}`, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) throw new Error(`roster.php responded with HTTP ${response.status}`);
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const box = doc.querySelector('.roster_champ_table');
        if (!box) throw new Error('.roster_champ_table not found in roster.php response');
        if (isAlreadyMounted()) return;

        prepareTable(box, teamId, resolveClubName());
        ensureStyle();
        mount(dash, lineup, box);
        suppressLegacyPanel();
        document.documentElement.dataset[MOUNT_FLAG] = '1';
    }

    function start() {
        if (!isTeam4MainPage() || !isFm2026Design() || isAlreadyMounted()) return;
        waitReady((dash, lineup) => {
            mountFromRoster(dash, lineup).catch(error => {
                console.warn(LOG_PREFIX, 'mount failed, native layout kept:', error);
            });
        });
    }

    const api = { isTeam4MainPage, isFm2026Design, resolveTeamId, resolveClubName, findMovedCards, prepareTable, mount, start };
    window.SLFTeam4ChampionshipTableSwap = api;
    return api;
})();

SLFTeam4ChampionshipTableSwap.start();
