// Team Management: Team4 update button performance/locking fix
// Stable cache keys: this patch does not introduce storage/schema versions.

const SLFTeam4UpdateButtonPerformanceFix = (() => {
    const PATCH_FLAG = '__slfTeam4UpdateButtonPerformanceFixPatched';
    const DEBOUNCE_MS = 900;

    function getHeader(panel) {
        return document.querySelector(`th.${panel?.HEAD_CLASS || 'slf-player-status-head'}`);
    }

    function setHeaderLabel(panel, label) {
        const head = getHeader(panel);
        const title = head?.querySelector?.('.slf-status-title');
        if (title) title.textContent = label;
    }

    function restoreHeaderLabel(panel, delayMs) {
        window.setTimeout(() => {
            if (!panel?.__slfTeam4RefreshRunning) setHeaderLabel(panel, 'обновить');
        }, delayMs);
    }

    async function runGuardedRefresh(panel) {
        if (!panel || panel.__slfTeam4RefreshRunning) return;

        const now = Date.now();
        if (now - Number(panel.__slfTeam4RefreshClickAt || 0) < DEBOUNCE_MS) return;
        panel.__slfTeam4RefreshClickAt = now;
        panel.__slfTeam4RefreshRunning = true;

        try {
            setHeaderLabel(panel, 'обновление...');
            panel.hideTip?.();
            panel.render?.(true);
            const promise = panel.__slfTeam4RefreshPromise || Promise.resolve();
            await promise;
            setHeaderLabel(panel, 'готово');
            restoreHeaderLabel(panel, 1400);
        } catch (error) {
            console.warn('[SLF Team4 Update] refresh failed', error);
            setHeaderLabel(panel, 'ошибка');
            restoreHeaderLabel(panel, 2500);
        } finally {
            panel.__slfTeam4RefreshRunning = false;
        }
    }

    function patchPanel() {
        const panel = typeof PlayerStatusPanel !== 'undefined' ? PlayerStatusPanel : null;
        if (!panel || panel[PATCH_FLAG]) return false;
        panel[PATCH_FLAG] = true;
        panel.__slfTeam4RefreshRunning = false;
        panel.__slfTeam4RefreshClickAt = 0;
        panel.__slfTeam4RefreshPromise = null;

        const originalRunLimited = panel.runLimited;
        if (typeof originalRunLimited === 'function') {
            panel.runLimited = async function patchedRunLimited(items, limit, worker) {
                const promise = originalRunLimited.call(this, items, limit, worker);
                this.__slfTeam4RefreshPromise = promise;
                try {
                    return await promise;
                } finally {
                    if (this.__slfTeam4RefreshPromise === promise) this.__slfTeam4RefreshPromise = null;
                }
            };
        }

        const originalEnsureHeader = panel.ensureHeader;
        if (typeof originalEnsureHeader === 'function') {
            panel.ensureHeader = function patchedEnsureHeader() {
                originalEnsureHeader.call(this);
                const head = getHeader(this);
                if (!head) return;
                head.onclick = event => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
                    runGuardedRefresh(this);
                };
            };
        }

        panel.ensureHeader?.();
        return true;
    }

    function start() {
        const run = () => {
            try {
                if (patchPanel()) return;
                const timer = setInterval(() => {
                    if (patchPanel()) clearInterval(timer);
                }, 250);
                setTimeout(() => clearInterval(timer), 10000);
            } catch (error) {
                console.error('[SLF Team4 Update] boot failed', error);
            }
        };

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
        else run();
    }

    const api = { runGuardedRefresh, start };
    window.SLFTeam4UpdateButtonPerformanceFix = api;
    return api;
})();

SLFTeam4UpdateButtonPerformanceFix.start();