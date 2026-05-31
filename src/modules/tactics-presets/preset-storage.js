    // 3. Preset Storage
    // ============================================================

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

        return result;
    }

    const PresetStorage = {
        loadLocalRaw() {
            try {
                const data = localStorage.getItem(CONFIG.STORAGE_KEY);
                return data ? normalizePresets(JSON.parse(data)) : null;
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
                return Object.assign({}, DEFAULT_CUSTOM_PRESETS);
            }

            return local;
        },

        saveCustom(customPresets) {
            const normalized = normalizePresets(customPresets);
            this.saveLocalOnly(normalized);
            Api.post(CONFIG.COLLECTIONS.TACTICS, normalized, 'tactics');
        },

        loadFromServerAndMerge(callback) {
            Api.get(
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
            );
        },

        getAllPresets() {
            // Built-in canonical library wins over older locally/server-saved copies with the same names.
            // User custom presets with unique names are still preserved.
            return Object.assign({}, this.loadCustom(), BASE_PRESETS);
        },

        getAllLabels() {
            const customPresets = this.loadCustom();
            const labels = Object.assign({}, BASE_LABELS);

            for (let key in customPresets) {
                labels[key] = BASE_LABELS[key] || key;
            }

            return labels;
        }
    };

    // ============================================================
