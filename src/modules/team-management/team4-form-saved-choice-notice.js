// Team Management: Team4 form saved-choice notice
// UI-only patch. Stable cache keys: no storage/schema version changes.

const SLFTeam4FormSavedChoiceNotice = (() => {
    const NOTICE_ID = 'slf-team4-form-saved-choice-notice';
    const STYLE_ID = 'slf-team4-form-saved-choice-notice-style';
    const FORM_URL = '/team4.php?action=form';
    const FETCH_URL = '/team4.php?action=form&date=1';

    function isTeam4MainPage() {
        const params = new URLSearchParams(location.search || '');
        return /\/team4\.php$/i.test(location.pathname || '') && !params.get('action');
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${NOTICE_ID} {
                grid-column: 1 / -1;
                width: 100%;
                margin: 0 0 6px 0;
                padding: 5px 8px;
                background: #202020;
                border: 1px solid #4d4d4d;
                border-radius: 5px;
                color: #ddd;
                font: 11px Verdana, Arial, sans-serif;
                text-align: center;
                box-sizing: border-box;
            }
            #${NOTICE_ID} a {
                color: #9cff57;
                font-weight: 700;
                text-decoration: underline;
            }
            #${NOTICE_ID} b {
                color: #fff;
            }
        `;
        document.head.appendChild(style);
    }

    function parseSavedChoiceState(html) {
        const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
        const expireBox = doc.querySelector('#player_form #coach_set .coach_expire');
        const expireNode = expireBox?.querySelector('span[data-expire]') || expireBox?.querySelector('span');
        const checked = [...doc.querySelectorAll('#player_form input.coachd:checked')];
        const sourceText =
            expireNode?.textContent?.replace(/\s+/g, ' ').trim() ||
            expireBox?.textContent?.replace(/\s+/g, ' ').trim() ||
            '';
        const savedUntil = sourceText.match(/\b\d{2}[-./]\d{2}[-./]\d{4}\b/)?.[0] || '';

        return {
            savedUntil,
            checkedCount: checked.length
        };
    }

    function buildNoticeHtml(state) {
        let label = 'Форма не выбрана';
        let suffix = '';

        if (state.savedUntil) {
            label = 'Форма сохранена до';
            suffix = `: <b>${state.savedUntil}</b>`;
        } else if (state.checkedCount > 0) {
            label = 'Форма выбрана';
            suffix = ': <b>срок не найден</b>';
        }

        return `<a href="${FORM_URL}">${label}</a>${suffix}`;
    }

    function render(state) {
        ensureStyle();
        document.getElementById(NOTICE_ID)?.remove();

        const target = document.querySelector('.team_general_calendar');
        if (!target) return false;

        const notice = document.createElement('div');
        notice.id = NOTICE_ID;
        notice.innerHTML = buildNoticeHtml(state);
        target.insertAdjacentElement('afterbegin', notice);
        return true;
    }

    async function loadState() {
        const response = await fetch(FETCH_URL, {
            credentials: 'include',
            cache: 'no-store'
        });
        const html = await response.text();
        return parseSavedChoiceState(html);
    }

    async function start() {
        if (!isTeam4MainPage()) return;
        try {
            const state = await loadState();
            render(state);
        } catch (error) {
            console.warn('[SLF Team4 Form Notice] failed', error);
        }
    }

    const api = { FORM_URL, FETCH_URL, parseSavedChoiceState, render, start };
    window.SLFTeam4FormSavedChoiceNotice = api;
    return api;
})();

SLFTeam4FormSavedChoiceNotice.start();

(() => {
    const PANEL_ID = 'slf-team4-championship-table';
    const STYLE_ID = 'slf-team4-championship-table-style';

    function norm(value) {
        return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function isTeam4MainPage() {
        const params = new URLSearchParams(location.search || '');
        return /\/team4\.php$/i.test(location.pathname || '') && !params.get('action');
    }

    function parsePositiveId(value) {
        return /^\d+$/.test(String(value || '')) && Number(value) > 0 ? String(value) : '';
    }

    function getActiveTeam() {
        const rosterLink = document.querySelector('.tf3 a[href*="/roster.php"][href*="id="]');
        const rosterUrl = rosterLink ? new URL(rosterLink.getAttribute('href'), location.origin) : null;
        const rosterId = parsePositiveId(rosterUrl?.searchParams.get('id'));
        const classId = [...(document.querySelector('#globalcontent')?.classList || [])]
            .map(name => name.match(/^user-custom__team-(\d+)$/)?.[1] || '')
            .find(Boolean) || '';
        const teamId = rosterId || classId;
        const teamName = norm(
            document.querySelector('.tf3 .team-name')?.textContent ||
            document.querySelector('.team_general_name')?.textContent ||
            rosterLink?.textContent ||
            ''
        );
        return { teamId, teamName };
    }

    function getChampionshipUrl() {
        const link = document.querySelector('.tf3 .champ-url a[href*="/champ.php"]') ||
            document.querySelector('.tf3 a[href*="/champ.php?action=view"]');
        if (!link) return null;
        const url = new URL(link.getAttribute('href'), location.origin);
        const id = parsePositiveId(url.searchParams.get('id'));
        if (url.origin !== location.origin || !/\/champ\.php$/i.test(url.pathname) || url.searchParams.get('action') !== 'view' || !id) return null;
        return url;
    }

    function headerIndex(headers, patterns, fallback = -1) {
        const index = headers.findIndex(text => patterns.some(pattern => pattern.test(text)));
        return index >= 0 ? index : fallback;
    }

    function parseTableDocument(doc, activeTeam) {
        const tables = [...doc.querySelectorAll('table.tourney_table')];
        if (tables.length !== 1) throw new Error(`expected one tourney table, found ${tables.length}`);
        const table = tables[0];
        const rows = [...table.querySelectorAll('tr')];
        const headerRow = rows.find(row => row.querySelectorAll('th,td').length >= 4 && /команд|team|и\b|игр|очк|points/i.test(norm(row.textContent)));
        if (!headerRow) throw new Error('table header not found');
        const headers = [...headerRow.children].map(cell => norm(cell.textContent).toLowerCase());
        const positionIndex = headerIndex(headers, [/^№$/, /^#$/, /мест/, /^п$/], 0);
        const teamIndex = headerIndex(headers, [/команд/, /team/], 1);
        const playedIndex = headerIndex(headers, [/^и$/, /игр/, /played/, /^p$/], 2);
        const pointsIndex = headerIndex(headers, [/очк/, /points?/, /^о$/], headers.length - 1);

        const dataRows = rows.slice(rows.indexOf(headerRow) + 1).map(row => {
            const cells = [...row.children];
            if (cells.length <= Math.max(teamIndex, playedIndex, pointsIndex)) return null;
            const teamLink = cells[teamIndex]?.querySelector('a[href*="team.php"],a[href*="roster.php"],a[href*="id="]');
            let rowTeamId = '';
            if (teamLink) {
                try {
                    rowTeamId = parsePositiveId(new URL(teamLink.getAttribute('href'), location.origin).searchParams.get('id'));
                } catch (_) {}
            }
            const teamName = norm(teamLink?.textContent || cells[teamIndex]?.textContent || '');
            if (!teamName) return null;
            return {
                position: norm(cells[positionIndex]?.textContent || ''),
                teamName,
                teamId: rowTeamId,
                played: norm(cells[playedIndex]?.textContent || ''),
                points: norm(cells[pointsIndex]?.textContent || ''),
                active: !!(
                    activeTeam.teamId && rowTeamId && activeTeam.teamId === rowTeamId ||
                    !rowTeamId && activeTeam.teamName && norm(activeTeam.teamName).toLowerCase() === teamName.toLowerCase()
                )
            };
        }).filter(Boolean);

        if (!dataRows.length) throw new Error('no championship rows parsed');
        const heading = [...doc.querySelectorAll('h1,h2,.h1,.h2,.title,.header')]
            .map(node => norm(node.textContent))
            .find(text => text && text.length < 120 && /лига|дивизион|чемпионат|league/i.test(text)) || 'Таблица чемпионата';
        const pageText = norm(doc.body?.textContent || '');
        const season = pageText.match(/(?:сезон\s*)?(\d{4}\s*[\/]\s*\d{1,4}|\d{4}\s*[-–]\s*\d{2,4})/i)?.[1] || '';
        return { heading, season, rows: dataRows };
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${PANEL_ID} { display:none; }
            @media (min-width: 1280px) {
                #${PANEL_ID} {
                    display:block;
                    position:fixed;
                    z-index:30;
                    right:12px;
                    top:105px;
                    width:300px;
                    max-height:calc(100vh - 125px);
                    overflow:auto;
                    box-sizing:border-box;
                    padding:8px;
                    border:1px solid #555;
                    border-radius:6px;
                    background:rgba(24,24,24,.96);
                    color:#ddd;
                    box-shadow:0 2px 10px rgba(0,0,0,.35);
                    font:11px Verdana,Arial,sans-serif;
                }
                #${PANEL_ID} .slf-champ-title { margin-bottom:7px; text-align:center; line-height:1.35; }
                #${PANEL_ID} .slf-champ-title a { color:#9cff57; font-weight:700; text-decoration:none; }
                #${PANEL_ID} .slf-champ-season { color:#aaa; font-size:10px; }
                #${PANEL_ID} table { width:100%; border-collapse:collapse; table-layout:fixed; }
                #${PANEL_ID} th, #${PANEL_ID} td { padding:3px 2px; border-bottom:1px solid #383838; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                #${PANEL_ID} th:nth-child(2), #${PANEL_ID} td:nth-child(2) { text-align:left; width:58%; }
                #${PANEL_ID} tr.slf-active-team { background:#34451f; color:#fff; font-weight:700; }
                #${PANEL_ID} .slf-champ-state { padding:12px 5px; text-align:center; color:#aaa; line-height:1.4; }
            }
        `;
        document.head.appendChild(style);
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }

    function ensurePanel(url) {
        ensureStyle();
        let panel = document.getElementById(PANEL_ID);
        if (!panel) {
            panel = document.createElement('aside');
            panel.id = PANEL_ID;
            document.body.appendChild(panel);
        }
        panel.innerHTML = `<div class="slf-champ-title"><a href="${escapeHtml(url?.pathname + url?.search || '#')}">Таблица чемпионата</a></div><div class="slf-champ-state">Загрузка…</div>`;
        return panel;
    }

    function render(panel, url, data) {
        const rows = data.rows.map(row => `
            <tr class="${row.active ? 'slf-active-team' : ''}">
                <td>${escapeHtml(row.position)}</td>
                <td title="${escapeHtml(row.teamName)}">${escapeHtml(row.teamName)}</td>
                <td>${escapeHtml(row.played)}</td>
                <td>${escapeHtml(row.points)}</td>
            </tr>`).join('');
        panel.innerHTML = `
            <div class="slf-champ-title">
                <a href="${escapeHtml(url.pathname + url.search)}">${escapeHtml(data.heading)}</a>
                ${data.season ? `<div class="slf-champ-season">${escapeHtml(data.season)}</div>` : ''}
            </div>
            <table>
                <thead><tr><th>№</th><th>Команда</th><th>И</th><th>О</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    async function start() {
        if (!isTeam4MainPage() || document.getElementById(PANEL_ID)) return;
        const url = getChampionshipUrl();
        if (!url) return;
        const panel = ensurePanel(url);
        try {
            const response = await fetch(url.href, { credentials: 'include', cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const data = parseTableDocument(doc, getActiveTeam());
            render(panel, url, data);
        } catch (error) {
            console.warn('[SLF Team4 Championship Table] failed', error);
            panel.innerHTML = `<div class="slf-champ-title"><a href="${escapeHtml(url.pathname + url.search)}">Открыть чемпионат</a></div><div class="slf-champ-state">Таблица чемпионата недоступна.</div>`;
        }
    }

    start();
})();
