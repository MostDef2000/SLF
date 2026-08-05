    // 0. SLF domain helpers
    // ============================================================

    const SLF_GAME_DOMAINS = new Set([
        'slf.fm',
        'www.slf.fm',
        'soccerlife.ru',
        'www.soccerlife.ru'
    ]);

    function getSlfGameOrigin() {
        const host = String(location.hostname || '').toLowerCase();

        if (SLF_GAME_DOMAINS.has(host)) {
            return location.origin;
        }

        return 'https://slf.fm';
    }

    function buildSlfUrl(path) {
        const cleanPath = String(path || '');

        if (/^https?:\/\//i.test(cleanPath)) {
            return cleanPath;
        }

        return getSlfGameOrigin() + (cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath);
    }

// Capture the legacy Team4 upcoming-matches table before the FM 2026 adapter
// replaces the source DOM. The snapshot is rendered only after the canonical
// championship panel completes its final FM 2026 placement.
(function installTeam4UpcomingSnapshotBridge() {
    const params = new URLSearchParams(location.search || '');
    if (!/\/team4\.php$/i.test(location.pathname || '') || params.get('action')) return;
    if (!matchMedia('(min-width: 1280px)').matches) return;

    const PANEL_ID = 'slf-team4-championship-table';
    const UPCOMING_ID = 'slf-team4-upcoming-matches';
    const MAX_ATTEMPTS = 160;
    const INTERVAL_MS = 50;
    const norm = value => String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

    function safeTeamHref(link) {
        try {
            const raw = link?.getAttribute?.('href') || '';
            if (!raw) return '';
            const url = new URL(raw, location.origin);
            if (url.origin !== location.origin || !/^\/(?:roster|team|team4)\.php$/i.test(url.pathname)) return '';
            return url.pathname + url.search;
        } catch (_) {
            return '';
        }
    }

    function headerIndex(headers, patterns, fallback) {
        const index = headers.findIndex(text => patterns.some(pattern => pattern.test(text)));
        return index >= 0 ? index : fallback;
    }

    function formTokens(cell) {
        if (!cell) return [];
        const leafTokens = [...cell.querySelectorAll('*')]
            .filter(node => node.children.length === 0)
            .map(node => norm(node.textContent).toUpperCase())
            .filter(value => /^[WLD]$/.test(value));
        const source = leafTokens.length ? leafTokens : (norm(cell.textContent).toUpperCase().match(/[WLD]/g) || []);
        return source.slice(0, 5);
    }

    function findSourceTable() {
        const preferred = document.querySelector('table.team-games__near');
        if (preferred) return preferred;
        return [...document.querySelectorAll('table')].find(table => {
            if (table.classList.contains('tourney_table') || table.closest(`#${PANEL_ID}`)) return false;
            return [...table.querySelectorAll('tr')].some(row => {
                const cells = [...row.children].map(cell => norm(cell.textContent).toLowerCase());
                return cells.some(text => /дата|date/.test(text))
                    && cells.some(text => /соперник|opponent/.test(text))
                    && cells.some(text => /форма|form/.test(text));
            });
        }) || null;
    }

    function captureRows() {
        const table = findSourceTable();
        if (!table) return [];
        const sourceRows = [...table.querySelectorAll('tr')];
        const headerRow = sourceRows.find(row => {
            const cells = [...row.children].map(cell => norm(cell.textContent).toLowerCase());
            return cells.some(text => /дата|date/.test(text))
                && cells.some(text => /соперник|opponent/.test(text))
                && cells.some(text => /форма|form/.test(text));
        });
        if (!headerRow) return [];
        const headers = [...headerRow.children].map(cell => norm(cell.textContent).toLowerCase());
        const dateIndex = headerIndex(headers, [/дата/, /date/], 0);
        const opponentIndex = headerIndex(headers, [/соперник/, /opponent/], 1);
        const formIndex = headerIndex(headers, [/форма/, /form/], headers.length - 1);
        const detailCandidates = headers.map((_, index) => index).filter(index => index > opponentIndex && index < formIndex);

        return sourceRows.slice(sourceRows.indexOf(headerRow) + 1).map(row => {
            const cells = [...row.children];
            if (cells.length <= Math.max(dateIndex, opponentIndex, formIndex)) return null;
            const date = norm(cells[dateIndex]?.textContent || '');
            if (!/\b\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}\b/.test(date)) return null;
            const opponentCell = cells[opponentIndex];
            const opponentLink = opponentCell?.querySelector('a[href]') || null;
            const opponent = norm(opponentLink?.textContent || opponentCell?.textContent || '');
            if (!opponent) return null;
            const detailIndex = detailCandidates.find(index => /^\d{1,3}$/.test(norm(cells[index]?.textContent || '')));
            return {
                date,
                opponent,
                opponentHref: safeTeamHref(opponentLink),
                detail: detailIndex == null ? '' : norm(cells[detailIndex]?.textContent || ''),
                form: formTokens(cells[formIndex])
            };
        }).filter(Boolean).slice(0, 5);
    }

    function appendTextCell(row, className, text) {
        const cell = document.createElement('td');
        cell.className = className;
        cell.textContent = text;
        row.appendChild(cell);
        return cell;
    }

    function renderSnapshot(panel, rows) {
        const section = document.createElement('section');
        section.id = UPCOMING_ID;
        section.dataset.slfUpcomingSource = 'legacy-pre-migration-snapshot';

        const title = document.createElement('div');
        title.className = 'slf-upcoming-title';
        title.textContent = 'Ближайшие матчи лиги';

        const table = document.createElement('table');
        table.className = 'slf-upcoming-table';
        const head = document.createElement('thead');
        const headRow = document.createElement('tr');
        ['Дата', 'Соперник', '', 'Форма'].forEach((label, index) => {
            const cell = document.createElement('th');
            cell.className = ['slf-upcoming-date', 'slf-upcoming-opponent', 'slf-upcoming-detail', 'slf-upcoming-form'][index];
            cell.textContent = label;
            headRow.appendChild(cell);
        });
        head.appendChild(headRow);

        const body = document.createElement('tbody');
        rows.forEach(item => {
            const row = document.createElement('tr');
            appendTextCell(row, 'slf-upcoming-date', item.date);
            const opponentCell = document.createElement('td');
            opponentCell.className = 'slf-upcoming-opponent';
            const opponentNode = item.opponentHref ? document.createElement('a') : document.createElement('span');
            if (item.opponentHref) opponentNode.setAttribute('href', item.opponentHref);
            opponentNode.setAttribute('title', item.opponent);
            opponentNode.textContent = item.opponent;
            opponentCell.appendChild(opponentNode);
            row.appendChild(opponentCell);
            appendTextCell(row, 'slf-upcoming-detail', item.detail);
            const formCell = document.createElement('td');
            formCell.className = 'slf-upcoming-form';
            item.form.forEach(value => {
                const chip = document.createElement('span');
                chip.className = `slf-form-chip slf-form-${value.toLowerCase()}`;
                chip.textContent = value;
                formCell.appendChild(chip);
            });
            row.appendChild(formCell);
            body.appendChild(row);
        });

        table.append(head, body);
        section.append(title, table);
        panel.appendChild(section);
        panel.dataset.slfUpcomingSnapshot = 'rendered';
        document.documentElement.dataset.slfTeamUpcomingSnapshot = 'rendered';
    }

    const snapshot = captureRows();
    if (!snapshot.length) return;
    document.documentElement.dataset.slfTeamUpcomingSnapshotRows = String(snapshot.length);

    let attempts = 0;
    const sync = () => {
        if (!/\/team4\.php$/i.test(location.pathname || '')) return true;
        if (document.getElementById(UPCOMING_ID)) return true;
        const panel = document.getElementById(PANEL_ID);
        const teamBody = document.querySelector('.team-body');
        if (panel && teamBody && panel.parentElement === teamBody
            && panel.dataset.slfTeamLayout === 'fm2026-roster-side'
            && panel.dataset.slfUpcomingPromotion === 'ready'
            && panel.querySelector('.slf-champ-standings')) {
            renderSnapshot(panel, snapshot);
            return true;
        }
        attempts += 1;
        return attempts >= MAX_ATTEMPTS;
    };

    if (sync()) return;
    const timer = setInterval(() => {
        if (sync()) clearInterval(timer);
    }, INTERVAL_MS);
})();

// ============================================================
