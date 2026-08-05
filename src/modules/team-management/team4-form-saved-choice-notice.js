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

    function getMountTarget() {
        return document.querySelector('.team_general_calendar')
            || document.querySelector('.team-body > .team-dash');
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${NOTICE_ID} { grid-column:1/-1; width:100%; margin:0 0 6px; padding:5px 8px; background:#202020; border:1px solid #4d4d4d; border-radius:5px; color:#ddd; font:11px Verdana,Arial,sans-serif; text-align:center; box-sizing:border-box; }
            #${NOTICE_ID} a { color:#9cff57; font-weight:700; text-decoration:underline; }
            #${NOTICE_ID} b { color:#fff; }
            html[data-slf-design="fm2026"] .team-body > .team-dash > #${NOTICE_ID} { order:-1; margin:0; }
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
        const target = getMountTarget();
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

    const api = { FORM_URL, FETCH_URL, getMountTarget, parseSavedChoiceState, render, start };
    window.SLFTeam4FormSavedChoiceNotice = api;
    return api;
})();

SLFTeam4FormSavedChoiceNotice.start();

(() => {
    const PANEL_ID = 'slf-team4-championship-table';
    const UPCOMING_ID = 'slf-team4-upcoming-matches';
    const STYLE_ID = 'slf-team4-championship-table-style';
    const PROMOTION_ATTEMPTS = 100;
    const PROMOTION_INTERVAL_MS = 50;
    const norm = value => String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const positiveId = value => /^\d+$/.test(String(value || '')) && Number(value) > 0 ? String(value) : '';

    function isTeam4MainPage() {
        const params = new URLSearchParams(location.search || '');
        return /\/team4\.php$/i.test(location.pathname || '') && !params.get('action');
    }

    function resolvePageLayout() {
        const teamBody = document.querySelector('.team-body');
        const dashboard = teamBody?.querySelector(':scope > .team-dash');
        const teamContent = teamBody?.querySelector(':scope > .team-content');
        const currentGeneral = teamContent?.querySelector('#general');
        if (teamBody && dashboard && teamContent && currentGeneral && currentGeneral.querySelector('#generallist')) {
            return {
                mode: 'fm2026-roster-side',
                host: teamBody,
                dashboard,
                teamContent,
                general: currentGeneral
            };
        }

        const legacyContent = document.querySelector('.team_general_content');
        const legacyGeneral = legacyContent?.querySelector(':scope > #general') || document.getElementById('general');
        if (legacyContent && legacyGeneral && legacyGeneral.parentElement === legacyContent) {
            return { mode: 'legacy-content', host: legacyContent, general: legacyGeneral };
        }
        return null;
    }

    function getActiveTeam() {
        const rosterLink = document.querySelector('.tf3 a[href*="/roster.php"][href*="id="]')
            || document.querySelector('.team .t_name a[href*="/roster.php"][href*="id="]');
        let rosterId = '';
        try { rosterId = positiveId(new URL(rosterLink?.getAttribute('href') || '', location.origin).searchParams.get('id')); } catch (_) {}
        const classId = [...(document.querySelector('#globalcontent')?.classList || [])].map(name => name.match(/^user-custom__team-(\d+)$/)?.[1] || '').find(Boolean) || '';
        return {
            teamId: rosterId || classId,
            teamName: norm(document.querySelector('.tf3 .team-name')?.textContent
                || document.querySelector('.team .t_name')?.textContent
                || document.querySelector('.team_general_name')?.textContent
                || rosterLink?.textContent
                || '')
        };
    }

    function getChampionshipContext() {
        const link = document.querySelector('.tf3 .champ-url a[href*="/champ.php"]')
            || document.querySelector('.tf3 a[href*="/champ.php?action=view"]')
            || document.querySelector('.team-head__links a[href*="/champ.php?action=view"]');
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

    function formTokens(cell) {
        if (!cell) return [];
        const leafTokens = [...cell.querySelectorAll('*')]
            .filter(node => node.children.length === 0)
            .map(node => norm(node.textContent).toUpperCase())
            .filter(value => /^[WLD]$/.test(value));
        const source = leafTokens.length ? leafTokens : (norm(cell.textContent).toUpperCase().match(/[WLD]/g) || []);
        return source.slice(0, 5);
    }

    function findUpcomingTable(doc) {
        const candidates = [...doc.querySelectorAll('table')].filter(table => {
            if (table.classList.contains('tourney_table')) return false;
            if (doc === document && table.closest(`#${PANEL_ID}`)) return false;
            return true;
        });
        return candidates.map(table => {
            const rows = [...table.querySelectorAll('tr')];
            const headerRow = rows.find(row => {
                const cells = [...row.children].map(cell => norm(cell.textContent).toLowerCase());
                return cells.some(text => /дата|date/.test(text))
                    && cells.some(text => /соперник|opponent/.test(text))
                    && (cells.some(text => /форма|form/.test(text)) || row.children.length >= 3);
            });
            return headerRow ? { table, rows, headerRow } : null;
        }).find(Boolean) || null;
    }

    function parseUpcomingMatchesDocument(doc) {
        const found = findUpcomingTable(doc);
        if (!found) return [];
        const headers = [...found.headerRow.children].map(cell => norm(cell.textContent).toLowerCase());
        const dateIndex = headerIndex(headers, [/дата/, /date/], 0);
        const opponentIndex = headerIndex(headers, [/соперник/, /opponent/], 1);
        const formIndex = headerIndex(headers, [/форма/, /form/], headers.length - 1);
        const detailCandidates = headers.map((_, index) => index).filter(index => index > opponentIndex && index < formIndex);
        const sourceRows = found.rows.slice(found.rows.indexOf(found.headerRow) + 1);
        return sourceRows.map(row => {
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

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .team_general_content.slf-team4-championship-layout:not(.team-body) { display:flex; align-items:flex-start; gap:12px; width:max-content; max-width:none; overflow:visible; }
            .team_general_content.slf-team4-championship-layout:not(.team-body) > #general { flex:0 0 auto; min-width:700px; }
            html[data-slf-design="fm2026"] #globalcontent .team-body.team_general_content.slf-team4-championship-layout { display:grid!important; grid-template-columns:minmax(240px,366px) minmax(0,1fr)!important; align-items:start!important; gap:16px!important; width:100%!important; max-width:100%!important; min-width:0!important; overflow:visible!important; }
            html[data-slf-design="fm2026"] #globalcontent .team-body.team_general_content.slf-team4-championship-layout > .team-dash { grid-column:1!important; grid-row:1 / span 2!important; min-width:0!important; }
            html[data-slf-design="fm2026"] #globalcontent .team-body.team_general_content.slf-team4-championship-layout > .team-content { grid-column:2!important; grid-row:1!important; min-width:0!important; }
            html[data-slf-design="fm2026"] #globalcontent .team-body.team_general_content.slf-team4-championship-layout > #${PANEL_ID} { grid-column:2!important; grid-row:2!important; justify-self:end!important; width:min(320px,100%)!important; max-width:320px!important; min-width:0!important; margin:0!important; }
            @media (min-width:1440px) {
                html[data-slf-design="fm2026"] #globalcontent .team-body.team_general_content.slf-team4-championship-layout { grid-template-columns:clamp(240px,18vw,280px) minmax(0,1fr) minmax(260px,290px)!important; gap:14px!important; }
                html[data-slf-design="fm2026"] #globalcontent .team-body.team_general_content.slf-team4-championship-layout > .team-dash { grid-column:1!important; grid-row:1!important; }
                html[data-slf-design="fm2026"] #globalcontent .team-body.team_general_content.slf-team4-championship-layout > .team-content { grid-column:2!important; grid-row:1!important; }
                html[data-slf-design="fm2026"] #globalcontent .team-body.team_general_content.slf-team4-championship-layout > #${PANEL_ID} { grid-column:3!important; grid-row:1!important; justify-self:stretch!important; width:100%!important; max-width:100%!important; }
            }
            #${PANEL_ID} { flex:0 0 300px; width:300px; box-sizing:border-box; padding:8px; border:1px solid #555; border-radius:6px; background:#181818; color:#ddd; box-shadow:0 2px 10px rgba(0,0,0,.35); font:11px Verdana,Arial,sans-serif; overflow:hidden; }
            #${PANEL_ID} .slf-champ-title { margin-bottom:7px; text-align:center; line-height:1.35; }
            #${PANEL_ID} .slf-champ-title a { color:#9cff57; font-weight:700; text-decoration:none; }
            #${PANEL_ID} .slf-champ-season { color:#aaa; font-size:10px; }
            #${PANEL_ID} table { width:100%; border-collapse:collapse; table-layout:fixed; }
            #${PANEL_ID} th, #${PANEL_ID} td { padding:3px 2px; border-bottom:1px solid #383838; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            #${PANEL_ID} .slf-champ-standings th:nth-child(2), #${PANEL_ID} .slf-champ-standings td:nth-child(2) { text-align:left; width:58%; }
            #${PANEL_ID} tr.slf-active-team { background:#34451f; color:#fff; font-weight:700; }
            #${PANEL_ID} .slf-champ-state { padding:12px 5px; text-align:center; color:#aaa; line-height:1.4; }
            #${UPCOMING_ID} { margin-top:12px; padding-top:10px; border-top:1px solid var(--slf-border,#38415f); }
            #${UPCOMING_ID} .slf-upcoming-title { margin:0 0 7px; color:var(--slf-accent2,#9cff57); font-weight:700; text-align:left; }
            #${UPCOMING_ID} .slf-upcoming-table { font-size:10px; }
            #${UPCOMING_ID} .slf-upcoming-table th { color:var(--slf-muted,#aaa); font-weight:500; }
            #${UPCOMING_ID} .slf-upcoming-date { width:66px; text-align:left; font-weight:700; }
            #${UPCOMING_ID} .slf-upcoming-opponent { text-align:left; }
            #${UPCOMING_ID} .slf-upcoming-opponent a { color:#8dc0ff; text-decoration:none; }
            #${UPCOMING_ID} .slf-upcoming-detail { width:24px; }
            #${UPCOMING_ID} .slf-upcoming-form { width:78px; text-align:right; }
            #${UPCOMING_ID} .slf-form-chip { display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; margin-left:1px; border-radius:2px; color:#fff; font:700 9px/1 var(--slf-font,Verdana,Arial,sans-serif); }
            #${UPCOMING_ID} .slf-form-w { background:#1f9d55; }
            #${UPCOMING_ID} .slf-form-l { background:#c9373e; }
            #${UPCOMING_ID} .slf-form-d { background:#6f7787; }
        `;
        document.head.appendChild(style);
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
    }

    function mountPanel(panel, layout) {
        layout.host.classList.add('slf-team4-championship-layout');
        if (layout.mode === 'fm2026-roster-side') {
            layout.host.classList.add('team_general_content', 'slf-team4-championship-roster-side');
            if (panel.parentElement !== layout.host) layout.host.appendChild(panel);
        } else if (panel.parentElement !== layout.host) {
            layout.general.insertAdjacentElement('afterend', panel);
        }
        panel.dataset.slfTeamLayout = layout.mode;
        return panel;
    }

    function ensurePanel(context) {
        ensureStyle();
        const layout = resolvePageLayout();
        if (!layout) return null;
        let panel = document.getElementById(PANEL_ID);
        const created = !panel;
        if (!panel) {
            panel = document.createElement('aside');
            panel.id = PANEL_ID;
        }
        mountPanel(panel, layout);
        if (created || !panel.hasChildNodes()) {
            panel.innerHTML = `<div class="slf-champ-title"><a href="${escapeHtml(context.url.pathname + context.url.search)}">${escapeHtml(context.title)}</a></div><div class="slf-champ-state">Загрузка…</div>`;
        }
        return panel;
    }

    function renderUpcoming(upcoming) {
        if (!upcoming.length) return '';
        const rows = upcoming.map(row => {
            const opponent = row.opponentHref
                ? `<a href="${escapeHtml(row.opponentHref)}" title="${escapeHtml(row.opponent)}">${escapeHtml(row.opponent)}</a>`
                : `<span title="${escapeHtml(row.opponent)}">${escapeHtml(row.opponent)}</span>`;
            const form = row.form.map(value => `<span class="slf-form-chip slf-form-${value.toLowerCase()}">${escapeHtml(value)}</span>`).join('');
            return `<tr><td class="slf-upcoming-date">${escapeHtml(row.date)}</td><td class="slf-upcoming-opponent">${opponent}</td><td class="slf-upcoming-detail">${escapeHtml(row.detail)}</td><td class="slf-upcoming-form">${form}</td></tr>`;
        }).join('');
        return `<section id="${UPCOMING_ID}"><div class="slf-upcoming-title">Ближайшие матчи лиги</div><table class="slf-upcoming-table"><thead><tr><th class="slf-upcoming-date">Дата</th><th class="slf-upcoming-opponent">Соперник</th><th class="slf-upcoming-detail"></th><th class="slf-upcoming-form">Форма</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    }

    function render(panel, context, data) {
        const rows = data.rows.map(row => `<tr class="${row.active ? 'slf-active-team' : ''}"><td>${escapeHtml(row.position)}</td><td title="${escapeHtml(row.teamName)}">${escapeHtml(row.teamName)}</td><td>${escapeHtml(row.played)}</td><td>${escapeHtml(row.points)}</td></tr>`).join('');
        const upcoming = panel.dataset.slfTeamLayout === 'fm2026-roster-side' ? renderUpcoming(data.upcoming || []) : '';
        panel.innerHTML = `<div class="slf-champ-title"><a href="${escapeHtml(context.url.pathname + context.url.search)}">${escapeHtml(context.title)}</a>${data.season ? `<div class="slf-champ-season">${escapeHtml(data.season)}</div>` : ''}</div><table class="slf-champ-standings"><thead><tr><th>№</th><th>Команда</th><th>И</th><th>О</th></tr></thead><tbody>${rows}</tbody></table>${upcoming}`;
    }

    function promotePanelWhenReady(context, data) {
        let attempts = 0;
        const sync = () => {
            if (!isTeam4MainPage()) return true;
            const panel = document.getElementById(PANEL_ID);
            if (!panel) return attempts >= PROMOTION_ATTEMPTS;
            const layout = resolvePageLayout();
            if (layout?.mode === 'fm2026-roster-side') {
                mountPanel(panel, layout);
                render(panel, context, data);
                panel.dataset.slfUpcomingPromotion = 'ready';
                document.documentElement.dataset.slfTeamUpcomingPromotion = 'ready';
                return true;
            }
            attempts += 1;
            return attempts >= PROMOTION_ATTEMPTS;
        };

        if (sync()) return;
        const timer = setInterval(() => {
            if (sync()) clearInterval(timer);
        }, PROMOTION_INTERVAL_MS);
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
            const upcoming = parseUpcomingMatchesDocument(doc);
            const data = {
                ...parseTableDocument(doc, getActiveTeam()),
                upcoming: upcoming.length ? upcoming : parseUpcomingMatchesDocument(document)
            };
            render(panel, context, data);
            promotePanelWhenReady(context, data);
        } catch (error) {
            console.warn('[SLF Team4 Championship Table] failed', error);
            panel.innerHTML = `<div class="slf-champ-title"><a href="${escapeHtml(context.url.pathname + context.url.search)}">${escapeHtml(context.title)}</a></div><div class="slf-champ-state">Таблица чемпионата недоступна.</div>`;
        }
    }

    start();
})();
