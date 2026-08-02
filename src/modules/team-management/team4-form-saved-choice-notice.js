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
            #${NOTICE_ID} { grid-column:1/-1; width:100%; margin:0 0 6px; padding:5px 8px; background:#202020; border:1px solid #4d4d4d; border-radius:5px; color:#ddd; font:11px Verdana,Arial,sans-serif; text-align:center; box-sizing:border-box; }
            #${NOTICE_ID} a { color:#9cff57; font-weight:700; text-decoration:underline; }
            #${NOTICE_ID} b { color:#fff; }
        `;
        document.head.appendChild(style);
    }

    function parseSavedChoiceState(html) {
        const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
        const expireBox = doc.querySelector('#player_form #coach_set .coach_expire');
        const expireNode = expireBox?.querySelector('span[data-expire]') || expireBox?.querySelector('span');
        const checked = [...doc.querySelectorAll('#player_form input.coachd:checked')];
        const sourceText = expireNode?.textContent?.replace(/\s+/g, ' ').trim() || expireBox?.textContent?.replace(/\s+/g, ' ').trim() || '';
        return { savedUntil: sourceText.match(/\b\d{2}[-./]\d{2}[-./]\d{4}\b/)?.[0] || '', checkedCount: checked.length };
    }

    function render(state) {
        ensureStyle();
        document.getElementById(NOTICE_ID)?.remove();
        const target = document.querySelector('.team_general_calendar');
        if (!target) return false;
        const notice = document.createElement('div');
        notice.id = NOTICE_ID;
        const label = state.savedUntil ? 'Форма сохранена до' : state.checkedCount > 0 ? 'Форма выбрана' : 'Форма не выбрана';
        const suffix = state.savedUntil ? `: <b>${state.savedUntil}</b>` : state.checkedCount > 0 ? ': <b>срок не найден</b>' : '';
        notice.innerHTML = `<a href="${FORM_URL}">${label}</a>${suffix}`;
        target.insertAdjacentElement('afterbegin', notice);
        return true;
    }

    async function start() {
        if (!isTeam4MainPage()) return;
        try {
            const response = await fetch(FETCH_URL, { credentials: 'include', cache: 'no-store' });
            render(parseSavedChoiceState(await response.text()));
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
    const norm = value => String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const positiveId = value => /^\d+$/.test(String(value || '')) && Number(value) > 0 ? String(value) : '';

    function isTeam4MainPage() {
        const params = new URLSearchParams(location.search || '');
        return /\/team4\.php$/i.test(location.pathname || '') && !params.get('action');
    }

    function getActiveTeam() {
        const rosterLink = document.querySelector('.tf3 a[href*="/roster.php"][href*="id="]');
        let rosterId = '';
        try { rosterId = positiveId(new URL(rosterLink?.getAttribute('href') || '', location.origin).searchParams.get('id')); } catch (_) {}
        const classId = [...(document.querySelector('#globalcontent')?.classList || [])].map(name => name.match(/^user-custom__team-(\d+)$/)?.[1] || '').find(Boolean) || '';
        return { teamId: rosterId || classId, teamName: norm(document.querySelector('.tf3 .team-name')?.textContent || document.querySelector('.team_general_name')?.textContent || rosterLink?.textContent || '') };
    }

    function getChampionshipContext() {
        const link = document.querySelector('.tf3 .champ-url a[href*="/champ.php"]') || document.querySelector('.tf3 a[href*="/champ.php?action=view"]');
        if (!link) return null;
        const url = new URL(link.getAttribute('href'), location.origin);
        const id = positiveId(url.searchParams.get('id'));
        if (url.origin !== location.origin || !/\/champ\.php$/i.test(url.pathname) || url.searchParams.get('action') !== 'view' || !id) return null;
        return { url, title: norm(link.textContent) || 'Таблица чемпионата' };
    }

    function headerIndex(headers, patterns, fallback) {
        const index = headers.findIndex(text => patterns.some(pattern => pattern.test(text)));
        return index >= 0 ? index : fallback;
    }

    function parseTableDocument(doc, activeTeam) {
        const tables = [...doc.querySelectorAll('table.tourney_table')];
        if (tables.length !== 1) throw new Error(`expected one tourney table, found ${tables.length}`);
        const sourceRows = [...tables[0].querySelectorAll('tr')];
        const headerRow = sourceRows.find(row => row.querySelectorAll('th,td').length >= 4 && /команд|team|и\b|игр|очк|points/i.test(norm(row.textContent)));
        if (!headerRow) throw new Error('table header not found');
        const headers = [...headerRow.children].map(cell => norm(cell.textContent).toLowerCase());
        const positionIndex = headerIndex(headers, [/^поз\.?$/, /^позиц/, /^№$/, /^#$/, /мест/], 0);
        const teamIndex = headerIndex(headers, [/команд/, /team/], 1);
        const playedIndex = headerIndex(headers, [/^и$/, /игр/, /played/, /^p$/], 2);
        const pointsIndex = headerIndex(headers, [/очк/, /points?/, /^о$/], headers.length - 1);
        const rows = sourceRows.slice(sourceRows.indexOf(headerRow) + 1).map(row => {
            const cells = [...row.children];
            if (cells.length <= Math.max(teamIndex, playedIndex, pointsIndex)) return null;
            const teamLink = cells[teamIndex]?.querySelector('a[href*="team.php"],a[href*="roster.php"],a[href*="id="]');
            let teamId = '';
            try { teamId = positiveId(new URL(teamLink?.getAttribute('href') || '', location.origin).searchParams.get('id')); } catch (_) {}
            const teamName = norm(teamLink?.textContent || cells[teamIndex]?.textContent || '');
            if (!teamName) return null;
            return {
                position: norm(cells[positionIndex]?.textContent || ''), teamName, teamId,
                played: norm(cells[playedIndex]?.textContent || ''), points: norm(cells[pointsIndex]?.textContent || ''),
                active: !!((activeTeam.teamId && teamId && activeTeam.teamId === teamId) || (!teamId && activeTeam.teamName && activeTeam.teamName.toLowerCase() === teamName.toLowerCase()))
            };
        }).filter(Boolean);
        if (!rows.length) throw new Error('no championship rows parsed');
        const season = norm(doc.body?.textContent || '').match(/(?:сезон\s*)?(\d{4}\s*[\/]\s*\d{1,4}|\d{4}\s*[-–]\s*\d{2,4})/i)?.[1] || '';
        return { season, rows };
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .team_general_content.slf-team4-championship-layout { display:flex; align-items:flex-start; gap:12px; width:max-content; max-width:none; overflow:visible; }
            .team_general_content.slf-team4-championship-layout > #general { flex:0 0 auto; min-width:700px; }
            #${PANEL_ID} { flex:0 0 300px; width:300px; box-sizing:border-box; padding:8px; border:1px solid #555; border-radius:6px; background:#181818; color:#ddd; box-shadow:0 2px 10px rgba(0,0,0,.35); font:11px Verdana,Arial,sans-serif; }
            #${PANEL_ID} .slf-champ-title { margin-bottom:7px; text-align:center; line-height:1.35; }
            #${PANEL_ID} .slf-champ-title a { color:#9cff57; font-weight:700; text-decoration:none; }
            #${PANEL_ID} .slf-champ-season { color:#aaa; font-size:10px; }
            #${PANEL_ID} table { width:100%; border-collapse:collapse; table-layout:fixed; }
            #${PANEL_ID} th, #${PANEL_ID} td { padding:3px 2px; border-bottom:1px solid #383838; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            #${PANEL_ID} th:nth-child(2), #${PANEL_ID} td:nth-child(2) { text-align:left; width:58%; }
            #${PANEL_ID} tr.slf-active-team { background:#34451f; color:#fff; font-weight:700; }
            #${PANEL_ID} .slf-champ-state { padding:12px 5px; text-align:center; color:#aaa; line-height:1.4; }
        `;
        document.head.appendChild(style);
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
    }

    function ensurePanel(context) {
        ensureStyle();
        const content = document.querySelector('.team_general_content');
        const general = content?.querySelector(':scope > #general') || document.getElementById('general');
        if (!content || !general || general.parentElement !== content) return null;
        content.classList.add('slf-team4-championship-layout');
        let panel = document.getElementById(PANEL_ID);
        if (!panel) {
            panel = document.createElement('aside');
            panel.id = PANEL_ID;
            general.insertAdjacentElement('afterend', panel);
        }
        panel.innerHTML = `<div class="slf-champ-title"><a href="${escapeHtml(context.url.pathname + context.url.search)}">${escapeHtml(context.title)}</a></div><div class="slf-champ-state">Загрузка…</div>`;
        return panel;
    }

    function render(panel, context, data) {
        const rows = data.rows.map(row => `<tr class="${row.active ? 'slf-active-team' : ''}"><td>${escapeHtml(row.position)}</td><td title="${escapeHtml(row.teamName)}">${escapeHtml(row.teamName)}</td><td>${escapeHtml(row.played)}</td><td>${escapeHtml(row.points)}</td></tr>`).join('');
        panel.innerHTML = `<div class="slf-champ-title"><a href="${escapeHtml(context.url.pathname + context.url.search)}">${escapeHtml(context.title)}</a>${data.season ? `<div class="slf-champ-season">${escapeHtml(data.season)}</div>` : ''}</div><table><thead><tr><th>№</th><th>Команда</th><th>И</th><th>О</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    async function start() {
        if (!isTeam4MainPage() || !matchMedia('(min-width: 1280px)').matches || document.getElementById(PANEL_ID)) return;
        const context = getChampionshipContext();
        if (!context) return;
        const panel = ensurePanel(context);
        if (!panel) return;
        try {
            const response = await fetch(context.url.href, { credentials:'include', cache:'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            render(panel, context, parseTableDocument(doc, getActiveTeam()));
        } catch (error) {
            console.warn('[SLF Team4 Championship Table] failed', error);
            panel.innerHTML = `<div class="slf-champ-title"><a href="${escapeHtml(context.url.pathname + context.url.search)}">${escapeHtml(context.title)}</a></div><div class="slf-champ-state">Таблица чемпионата недоступна.</div>`;
        }
    }

    start();
})();
