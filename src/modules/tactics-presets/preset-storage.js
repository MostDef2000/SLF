    // 3. Preset Storage
    // ============================================================

    const ALLOWED_HENTA_PRESET = 'Henta_LeftTrap_att3';

    function isDeprecatedHentaPreset(name) {
        const key = String(name || '');
        return key.startsWith('Henta_') && key !== ALLOWED_HENTA_PRESET;
    }

    function filterDeprecatedPresetMap(map) {
        const result = {};
        Object.entries(map || {}).forEach(([key, value]) => {
            if (!isDeprecatedHentaPreset(key)) result[key] = value;
        });
        return result;
    }

    function unwrapServerData(data) {
        if (data && typeof data === 'object') {
            if (data.data && typeof data.data === 'object') return data.data;
            if (data.value && typeof data.value === 'object') return data.value;
            if (data.presets && typeof data.presets === 'object') return data.presets;
            if (data.tactics && typeof data.tactics === 'object') return data.tactics;
        }

        return data;
    }

    function isTacticObject(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;

        return [
            'def_line', 'press_line', 'def_width', 'press_intense',
            'build_type', 'build_temp', 'build_long', 'build_fast',
            'style', 'pass_risk', 'dribble', 'cross', 'shot', 'priority'
        ].some(k => Object.prototype.hasOwnProperty.call(obj, k));
    }

    function normalizePresets(data) {
        data = unwrapServerData(data);

        if (!data || typeof data !== 'object' || Array.isArray(data)) return {};

        const result = {};

        for (let key in data) {
            const preset = data[key];
            if (!isTacticObject(preset)) continue;

            result[key] = Object.assign({}, preset);
            delete result[key]['dark-theme'];

            for (let field in result[key]) {
                if (field !== 'priority' && result[key][field] != null) {
                    result[key][field] = String(result[key][field]);
                }
            }

            if (typeof result[key].priority === 'string') {
                result[key].priority = [result[key].priority];
            }

            if (!Array.isArray(result[key].priority)) {
                result[key].priority = [];
            }
        }

        return filterDeprecatedPresetMap(result);
    }

    const PresetStorage = {
        loadLocalRaw() {
            try {
                const data = localStorage.getItem(CONFIG.STORAGE_KEY);
                if (!data) return null;

                const parsed = JSON.parse(data);
                const normalized = normalizePresets(parsed);
                const before = Object.keys(parsed || {}).sort().join('|');
                const after = Object.keys(normalized || {}).sort().join('|');
                if (before !== after) {
                    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(normalized));
                }
                return normalized;
            } catch (e) {
                debugWarn('[SLF] Ошибка чтения localStorage', e);
                return null;
            }
        },

        saveLocalOnly(customPresets) {
            localStorage.setItem(
                CONFIG.STORAGE_KEY,
                JSON.stringify(normalizePresets(customPresets))
            );
        },

        loadCustom() {
            const local = this.loadLocalRaw();

            if (!local) {
                this.saveLocalOnly(DEFAULT_CUSTOM_PRESETS);
                return normalizePresets(DEFAULT_CUSTOM_PRESETS);
            }

            return local;
        },

        saveCustom(customPresets) {
            const previous = this.loadLocalRaw() || {};
            const normalized = normalizePresets(customPresets);
            const deleteKeys = Object.keys(previous).filter(key => !Object.prototype.hasOwnProperty.call(normalized, key));
            this.saveLocalOnly(normalized);
            const payload = {
                schema: 'slf_tactics_merge_v1',
                upsert: normalized,
                deleteKeys
            };
            void Api.post(`${CONFIG.COLLECTIONS.TACTICS}?mode=merge`, payload, 'tactics merge').catch(() => {});
        },

        loadFromServerAndMerge(callback) {
            return Api.get(
                CONFIG.COLLECTIONS.TACTICS,
                data => {
                    const serverData = normalizePresets(data);
                    const localData = this.loadLocalRaw() || {};
                    this.saveLocalOnly(Object.assign({}, localData, serverData));

                    if (callback) callback();
                },
                () => {
                    if (callback) callback();
                }
            ).catch(() => undefined);
        },

        getAllPresets() {
            // Built-in canonical library wins over older locally/server-saved copies with the same names.
            // User custom presets with unique names are still preserved.
            return filterDeprecatedPresetMap(Object.assign({}, this.loadCustom(), BASE_PRESETS));
        },

        getAllLabels() {
            const customPresets = this.loadCustom();
            const labels = Object.assign({}, BASE_LABELS);

            for (let key in customPresets) {
                labels[key] = BASE_LABELS[key] || key;
            }

            return filterDeprecatedPresetMap(labels);
        }
    };

    // ============================================================
