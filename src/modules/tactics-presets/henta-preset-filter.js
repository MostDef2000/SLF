// Henta preset filter
// ============================================================
// Keep only Henta_LeftTrap_att3 as the active Henta preset.
// Deprecated Henta variants are removed from runtime preset maps,
// labels, library metadata and ladder navigation.

(function filterDeprecatedHentaPresets() {
    'use strict';

    const KEEP = 'Henta_LeftTrap_att3';
    const REMOVED = [
        'Henta_Hold_def3',
        'Henta_RightTrap_att3',
        'Henta_WideTrap_att3',
        'Henta_CounterTrap_att4',
        'Henta_CentralTrap_att3'
    ];

    function isRemovedHenta(name) {
        return REMOVED.includes(name) || (String(name || '').startsWith('Henta_') && name !== KEEP);
    }

    function stripMap(map) {
        if (!map || typeof map !== 'object') return map;
        Object.keys(map).forEach(key => {
            if (isRemovedHenta(key)) delete map[key];
        });
        return map;
    }

    stripMap(typeof BASE_PRESETS !== 'undefined' ? BASE_PRESETS : null);
    stripMap(typeof BASE_LABELS !== 'undefined' ? BASE_LABELS : null);
    stripMap(typeof DEFAULT_CUSTOM_PRESETS !== 'undefined' ? DEFAULT_CUSTOM_PRESETS : null);

    if (typeof TacticPresetLibrary !== 'undefined' && TacticPresetLibrary) {
        stripMap(TacticPresetLibrary.meta);
        stripMap(TacticPresetLibrary.presetSchemeState);
        stripMap(TacticPresetLibrary.traits);
    }

    if (typeof PresetStorage !== 'undefined' && PresetStorage) {
        const originalSaveLocalOnly = PresetStorage.saveLocalOnly?.bind(PresetStorage);
        const originalLoadLocalRaw = PresetStorage.loadLocalRaw?.bind(PresetStorage);
        const originalLoadCustom = PresetStorage.loadCustom?.bind(PresetStorage);
        const originalGetAllPresets = PresetStorage.getAllPresets?.bind(PresetStorage);
        const originalGetAllLabels = PresetStorage.getAllLabels?.bind(PresetStorage);

        if (originalSaveLocalOnly) {
            PresetStorage.saveLocalOnly = function saveLocalOnlyWithoutDeprecatedHenta(customPresets) {
                return originalSaveLocalOnly(stripMap(Object.assign({}, customPresets || {})));
            };
        }

        if (originalLoadLocalRaw) {
            PresetStorage.loadLocalRaw = function loadLocalRawWithoutDeprecatedHenta() {
                return stripMap(originalLoadLocalRaw() || {});
            };
        }

        if (originalLoadCustom) {
            PresetStorage.loadCustom = function loadCustomWithoutDeprecatedHenta() {
                return stripMap(originalLoadCustom() || {});
            };
        }

        if (originalGetAllPresets) {
            PresetStorage.getAllPresets = function getAllPresetsWithoutDeprecatedHenta() {
                return stripMap(originalGetAllPresets() || {});
            };
        }

        if (originalGetAllLabels) {
            PresetStorage.getAllLabels = function getAllLabelsWithoutDeprecatedHenta() {
                return stripMap(originalGetAllLabels() || {});
            };
        }
    }

    if (typeof RecommendationEngine !== 'undefined' && RecommendationEngine?.getPresetLadder && !RecommendationEngine.__hentaPresetFilterApplied) {
        const originalGetPresetLadder = RecommendationEngine.getPresetLadder.bind(RecommendationEngine);
        RecommendationEngine.getPresetLadder = function getPresetLadderWithoutDeprecatedHenta(group) {
            return originalGetPresetLadder(group).filter(name => !isRemovedHenta(name));
        };
        RecommendationEngine.__hentaPresetFilterApplied = true;
    }

    try {
        if (typeof localStorage !== 'undefined' && typeof CONFIG !== 'undefined' && CONFIG?.STORAGE_KEY) {
            const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                const cleaned = stripMap(Object.assign({}, parsed || {}));
                localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(cleaned));
            }
        }
    } catch (e) {
        // Ignore local cleanup errors; runtime filtering above is enough.
    }
})();
