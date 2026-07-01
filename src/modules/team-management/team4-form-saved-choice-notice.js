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