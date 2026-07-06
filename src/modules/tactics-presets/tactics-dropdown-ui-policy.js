// Tactics Dropdown UI Policy
// ============================================================
// UI-only normalization for the quick tactic selector.
// - remove stale saved Henta_* custom presets except Henta_LeftTrap_att3;
// - hide trainer/custom optgroup headers;
// - show one flat list sorted by trainer/name.

(function tacticsDropdownUiPolicy() {
    'use strict';

    const ALLOWED_HENTA = 'Henta_LeftTrap_att3';
    const POLICY_MARKER = '__slfTacticsDropdownUiPolicyApplied';

    function isDeprecatedHentaPreset(name) {
        const key = String(name || '');
        return key.startsWith('Henta_') && key !== ALLOWED_HENTA;
    }

    function cloneFilteredMap(map) {
        const result = {};
        Object.entries(map || {}).forEach(([key, value]) => {
            if (!isDeprecatedHentaPreset(key)) result[key] = value;
        });
        return result;
    }

    function cleanupLocalCustomPresets() {
        try {
            if (typeof localStorage === 'undefined' || typeof CONFIG === 'undefined' || !CONFIG?.STORAGE_KEY) return;
            const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (!raw) return;

            const parsed = JSON.parse(raw);
            const filtered = cloneFilteredMap(parsed);
            const before = Object.keys(parsed || {}).sort().join('|');
            const after = Object.keys(filtered || {}).sort().join('|');

            if (before !== after) {
                localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(filtered));
            }
        } catch (e) {}
    }

    function patchPresetStorage() {
        if (typeof PresetStorage === 'undefined' || !PresetStorage || PresetStorage[POLICY_MARKER]) return;

        const wrapMapMethod = methodName => {
            const original = PresetStorage[methodName]?.bind(PresetStorage);
            if (!original) return;

            PresetStorage[methodName] = function filteredPresetMapMethod() {
                return cloneFilteredMap(original.apply(PresetStorage, arguments) || {});
            };
        };

        const originalSaveLocalOnly = PresetStorage.saveLocalOnly?.bind(PresetStorage);
        if (originalSaveLocalOnly) {
            PresetStorage.saveLocalOnly = function saveFilteredLocalPresets(customPresets) {
                return originalSaveLocalOnly(cloneFilteredMap(customPresets || {}));
            };
        }

        const originalSaveCustom = PresetStorage.saveCustom?.bind(PresetStorage);
        if (originalSaveCustom) {
            PresetStorage.saveCustom = function saveFilteredCustomPresets(customPresets) {
                return originalSaveCustom(cloneFilteredMap(customPresets || {}));
            };
        }

        wrapMapMethod('loadLocalRaw');
        wrapMapMethod('loadCustom');
        wrapMapMethod('getAllPresets');
        wrapMapMethod('getAllLabels');

        PresetStorage[POLICY_MARKER] = true;
    }

    function getTrainerSortKey(key, label) {
        const text = `${label || ''} ${key || ''}`.toLowerCase();

        if (text.includes('arteta')) return 'arteta';
        if (text.includes('bielsa')) return 'bielsa';
        if (text.includes('compact counter')) return 'compact';
        if (text.includes('conte')) return 'conte';
        if (text.includes('de zerbi') || text.includes('dezerbi')) return 'de zerbi';
        if (text.includes('henta')) return 'henta';
        if (text.includes('klopp')) return 'klopp';
        if (text.includes('mourinho')) return 'mourinho';
        if (text.includes('nagelsmann')) return 'nagelsmann';
        if (text.includes('pep')) return 'pep';
        if (text.includes('simeone')) return 'simeone';
        if (text.includes('xabi')) return 'xabi';
        if (text.includes('стандарт') || text.includes('standard')) return 'standard';

        return String(label || key || '').toLowerCase();
    }

    function getSortedTacticItems() {
        const labels = typeof PresetStorage !== 'undefined' && PresetStorage.getAllLabels
            ? PresetStorage.getAllLabels()
            : {};

        return Object.entries(labels)
            .filter(([key]) => !isDeprecatedHentaPreset(key))
            .map(([key, label]) => ({
                key,
                label: String(label || key),
                trainer: getTrainerSortKey(key, label)
            }))
            .sort((a, b) => {
                const trainerCmp = a.trainer.localeCompare(b.trainer, 'ru', { sensitivity: 'base' });
                if (trainerCmp !== 0) return trainerCmp;
                return a.label.localeCompare(b.label, 'ru', { sensitivity: 'base' });
            });
    }

    function hasSameFlatOptions(select, items) {
        if (!select || select.children.length !== items.length) return false;
        return items.every((item, index) => {
            const opt = select.children[index];
            return opt && opt.tagName === 'OPTION' && opt.value === item.key && opt.textContent === item.label;
        });
    }

    function rewriteSelectFlat(select) {
        if (!select || select.dataset.slfFlatPresetRewrite === '1') return;

        const items = getSortedTacticItems();
        const current = select.value;

        if (hasSameFlatOptions(select, items)) return;

        select.dataset.slfFlatPresetRewrite = '1';
        select.innerHTML = '';

        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.key;
            opt.textContent = item.label;
            select.appendChild(opt);
        });

        if (items.some(item => item.key === current)) {
            select.value = current;
        } else if (items.length) {
            select.value = items[0].key;
        }

        setTimeout(() => {
            delete select.dataset.slfFlatPresetRewrite;
        }, 0);
    }

    function normalizeDropdown() {
        cleanupLocalCustomPresets();
        patchPresetStorage();

        const select = document.querySelector('#slf-tactics-dropdown select');
        if (!select) return;

        rewriteSelectFlat(select);

        if (select.dataset.slfFlatPresetObserver === '1') return;

        const observer = new MutationObserver(() => {
            if (select.dataset.slfFlatPresetRewrite === '1') return;
            setTimeout(() => rewriteSelectFlat(select), 0);
        });

        observer.observe(select, { childList: true, subtree: false });
        select.dataset.slfFlatPresetObserver = '1';
    }

    cleanupLocalCustomPresets();
    patchPresetStorage();

    if (typeof UI !== 'undefined' && UI?.addDropdown && !UI.__flatSortedTacticDropdownApplied) {
        const originalAddDropdown = UI.addDropdown.bind(UI);

        UI.addDropdown = async function addFlatSortedTacticDropdown() {
            const result = await originalAddDropdown.apply(UI, arguments);
            normalizeDropdown();
            return result;
        };

        UI.__flatSortedTacticDropdownApplied = true;
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', normalizeDropdown, { once: true });
        } else {
            setTimeout(normalizeDropdown, 0);
        }
    }
})();
