// API token storage via Tampermonkey local storage.
// Do not log or expose the token value.

const SLF_API_TOKEN_STORAGE_KEY = 'slf_api_token';
let SLF_API_TOKEN_MISSING_WARNED = false;
let SLF_API_TOKEN_MENU_INSTALLED = false;

function getApiToken() {
    try {
        if (typeof GM_getValue === 'function') {
            return String(GM_getValue(SLF_API_TOKEN_STORAGE_KEY, '') || '').trim();
        }
    } catch (error) {
        console.warn('[SLF] API token read failed', error);
    }

    return '';
}

function warnMissingApiTokenOnce() {
    if (SLF_API_TOKEN_MISSING_WARNED) return;
    SLF_API_TOKEN_MISSING_WARNED = true;
    console.warn('[SLF] API token is not configured');
}

function hasApiToken() {
    return getApiToken().length > 0;
}

function installApiTokenMenuCommands() {
    if (SLF_API_TOKEN_MENU_INSTALLED) return;
    if (typeof GM_registerMenuCommand !== 'function') return;

    SLF_API_TOKEN_MENU_INSTALLED = true;

    GM_registerMenuCommand('SLF: Set API token', () => {
        try {
            if (typeof GM_setValue !== 'function') {
                console.warn('[SLF] GM_setValue is unavailable');
                return;
            }

            const current = hasApiToken() ? 'configured' : 'not configured';
            const value = prompt(`SLF API token (${current}). Enter new token:`, '');
            if (value == null) return;

            const token = String(value || '').trim();
            if (!token) {
                console.warn('[SLF] Empty API token was not saved');
                return;
            }

            GM_setValue(SLF_API_TOKEN_STORAGE_KEY, token);
            SLF_API_TOKEN_MISSING_WARNED = false;
            console.info('[SLF] API token saved');
        } catch (error) {
            console.warn('[SLF] API token save failed', error);
        }
    });

    GM_registerMenuCommand('SLF: Clear API token', () => {
        try {
            if (typeof GM_deleteValue !== 'function') {
                console.warn('[SLF] GM_deleteValue is unavailable');
                return;
            }

            GM_deleteValue(SLF_API_TOKEN_STORAGE_KEY);
            SLF_API_TOKEN_MISSING_WARNED = false;
            console.info('[SLF] API token cleared');
        } catch (error) {
            console.warn('[SLF] API token clear failed', error);
        }
    });

    GM_registerMenuCommand('SLF: Show API token status', () => {
        const status = hasApiToken() ? 'configured' : 'not configured';
        alert(`SLF API token: ${status}`);
    });
}

installApiTokenMenuCommands();
