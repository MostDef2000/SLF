// Team Management: Team4 contract-date classification fix
// Stable cache keys: this patch does not introduce storage/schema versions.

const SLFTeam4ContractDateFix = (() => {
    const PATCH_FLAG = '__slfTeam4ContractDateFixPatched';

    function norm(value) {
        return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function dateOnly(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    function parseContractDate(text) {
        const raw = norm(text);
        if (!raw || (!/\d{4}/.test(raw) && /^(?:-|—|\?|unknown|n\/a)$/i.test(raw))) return null;

        let match = raw.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/);
        if (match) {
            const day = Number(match[1]);
            const month = Number(match[2]);
            const year = Number(match[3]);
            const date = new Date(year, month - 1, day);
            return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
        }

        match = raw.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
        if (match) {
            const year = Number(match[1]);
            const month = Number(match[2]);
            const day = Number(match[3]);
            const date = new Date(year, month - 1, day);
            return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
        }

        const months = {
            jan: 0, january: 0,
            feb: 1, february: 1,
            mar: 2, march: 2,
            apr: 3, april: 3,
            may: 4,
            jun: 5, june: 5,
            jul: 6, july: 6,
            aug: 7, august: 7,
            sep: 8, sept: 8, september: 8,
            oct: 9, october: 9,
            nov: 10, november: 10,
            dec: 11, december: 11
        };
        match = raw.match(/\b([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/);
        if (match) {
            const month = months[String(match[1] || '').toLowerCase()];
            const day = Number(match[2]);
            const year = Number(match[3]);
            if (Number.isInteger(month)) {
                const date = new Date(year, month, day);
                return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
            }
        }

        return null;
    }

    function formatDate(date) {
        if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return '';
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${day}/${month}/${date.getFullYear()}`;
    }

    function getContractState(text) {
        const raw = norm(text);
        const date = parseContractDate(raw);
        if (!date) return { key: 'unknown', raw, date: null, label: 'contract not found' };

        const today = dateOnly(new Date());
        const expiry = dateOnly(date);
        if (expiry.getTime() >= today.getTime()) {
            return { key: 'active', raw, date, label: 'active contract' };
        }
        if (expiry.getFullYear() === today.getFullYear()) {
            return { key: 'expired_current_year', raw, date, label: 'expired this year' };
        }
        return { key: 'expired_old', raw, date, label: 'expired contract' };
    }

    function getContractMarker(state) {
        const dateText = formatDate(state?.date);
        if (state?.key === 'active') {
            return { label: 'CTR ✓', level: 'good', score: 2, text: `Contract active until ${dateText}.` };
        }
        if (state?.key === 'expired_current_year') {
            return { label: 'CTR !', level: 'watch', score: -1, text: `Contract expired in the current year (${dateText}). Check manually.` };
        }
        if (state?.key === 'expired_old') {
            return { label: 'CTR ✗', level: 'risk', score: -2, redFlag: true, text: `Contract expired on ${dateText}. Check manually.` };
        }
        return { label: 'CTR none', level: 'risk', score: -2, redFlag: true, text: 'Контракт не найден, проверь вручную.' };
    }

    function getContractText(state) {
        const dateText = formatDate(state?.date);
        if (state?.key === 'active') return `${dateText} · действующий`;
        if (state?.key === 'expired_current_year') return `${dateText} · истек в текущем году, проверить`;
        if (state?.key === 'expired_old') return `${dateText} · истек, проверить`;
        return 'контракт не найден · проверь вручную';
    }

    function patchPanel() {
        const panel = typeof PlayerStatusPanel !== 'undefined' ? PlayerStatusPanel : null;
        if (!panel || panel[PATCH_FLAG]) return false;
        panel[PATCH_FLAG] = true;

        panel.parseContractDate = parseContractDate;
        panel.getContractState = getContractState;

        const originalGetTransferMarkers = panel.getTransferMarkers;
        if (typeof originalGetTransferMarkers === 'function') {
            panel.getTransferMarkers = function patchedGetTransferMarkers(profile, data) {
                const markers = originalGetTransferMarkers.call(this, profile, data) || [];
                const rawContract = profile?.contractExpires || data?.tmContractRow || '';
                const state = getContractState(rawContract);
                const contractMarker = this.serializeMarker(getContractMarker(state), 'contract');
                if (data) data.contractState = state;
                if (data?.tmProfile) data.tmProfile.contractState = state;
                return this.filterRealMarkers([
                    ...markers.filter(marker => String(marker?.category || '') !== 'contract'),
                    contractMarker
                ]);
            };
        }

        const originalBuildTipHtml = panel.buildTipHtml;
        if (typeof originalBuildTipHtml === 'function') {
            panel.buildTipHtml = function patchedBuildTipHtml(data) {
                const html = originalBuildTipHtml.call(this, data);
                const rawContract = data?.tmProfile?.contractExpires || data?.tmContractRow || '';
                const state = data?.contractState || data?.tmProfile?.contractState || getContractState(rawContract);
                const contractText = this.escapeHtml(getContractText(state));
                return String(html || '').replace(
                    /<div class="row"><b>Контракт:<\/b>[\s\S]*?<\/div>/,
                    `<div class="row"><b>Контракт:</b> ${contractText}</div>`
                );
            };
        }

        try {
            if (panel.sessionCache?.values) {
                [...panel.sessionCache.values()].forEach(record => {
                    const rawContract = record?.tmProfile?.contractExpires || record?.tmContractRow || '';
                    const state = getContractState(rawContract);
                    record.contractState = state;
                    if (record.tmProfile) record.tmProfile.contractState = state;
                    if (record.slfPlayerId && panel.cacheTooltipHtml) panel.cacheTooltipHtml(record);
                });
                panel.saveToLocalStorage?.();
                panel.render?.(false);
            }
        } catch (error) {
            console.warn('[SLF Team4 CTR] hydrate failed', error);
        }
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
                console.error('[SLF Team4 CTR] boot failed', error);
            }
        };

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
        else run();
    }

    const api = { parseContractDate, getContractState, getContractMarker, getContractText, start };
    window.SLFTeam4ContractDateFix = api;
    return api;
})();

SLFTeam4ContractDateFix.start();
