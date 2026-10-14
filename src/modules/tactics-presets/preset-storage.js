    // 3. Preset Storage
    // ============================================================

    const ALLOWED_HENTA_PRESET = 'Henta abuse';

    function isDeprecatedHentaPreset(name) {
        const key = String(name || '');
        return [
            'Compact_Counter_def3',
            'Bielsa_ChaosPress_att5',
            'MidBlock_Control4231_neutr',
            'MidBlock_Counter4411_neutr',
            'Lead_Outlet4141_def1',
            'Arteta_Control433_bal3',
            'Pep_BoxControl_bal2',
            'Pep_PressCooldown_bal2',
            'Pep_ControlledPush_att3',
            'Pep_TwoThreeFive_att3',
            'Conte_WingbackWidth_bal4',
            'Klopp_Gegenpress_att4',
            'Simeone_Compact442_def4',
            'Simeone_LowBlock_def5',
            'Emery_BalancedControl4231_neutr',
            'Mourinho_CompactCounter4411_neutr',
            'Allegri_LeadManagement4141_def1',
            'Mourinho_WeakSide_def3',
            'Henta_Hold_def3',
            'Pep_StandardControl_bal3',
            'Xabi_VerticalBox_att3',
            'Xabi_BoxMidfield_bal3',
            'DeZerbi_BaitPress_bal3',
            'DeZerbi_Release_att4',
            'Klopp_WideTrap_att4',
            'Henta_LeftTrap_att3',
            'Henta_RightTrap_att3',
            'Henta_WideTrap_att3',
            'Henta_CounterTrap_att4',
            'Henta_CentralTrap_att3',
            'Nagelsmann_WidePress_att4'
        ].includes(key);
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
            // Canonical 14 control keys live in config.js (TACTIC_CONTROL_KEYS);
            // inline fallback keeps this module standalone-safe in test sandboxes.
            // Previously this list omitted 'corner'; it now matches the canon.
            ...(typeof TACTIC_CONTROL_KEYS !== 'undefined' ? TACTIC_CONTROL_KEYS : [
                'def_line', 'press_line', 'def_width', 'press_intense',
                'build_type', 'build_temp', 'build_long', 'build_fast',
                'style', 'pass_risk', 'dribble', 'cross', 'corner', 'shot'
            ]),
            'priority'
        ].some(k => Object.prototype.hasOwnProperty.call(obj, k));
    }

    function normalizePresets(data) {
        data = unwrapServerData(data);

        if (!data || typeof data !== 'object' || Array.isArray(data)) return {};

        const result = {};

        for (let key in data) {
            if (isDeprecatedHentaPreset(key)) continue;

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
        // Diagnostics for the last server-sync failure. Sync stays fail-open
        // (local presets keep working), but failures must not be silent.
        lastSyncError: null,
        lastSyncAt: null,

        recordSyncFailure(context, error) {
            const message = error && error.message ? error.message : String(error || 'unknown error');
            this.lastSyncError = `${context}: ${message}`;
            this.lastSyncAt = Date.now();
            console.warn('[SLF] PresetStorage: preset sync failure —', this.lastSyncError);
        },

        resolvePresetId(name) {
            const key = String(name || '');
            const registry = typeof window !== 'undefined' ? window.SLFActivePresetRegistry : null;
            return registry?.resolvePresetId?.(key) || key;
        },

        isRetiredBuiltInPreset(name) {
            return isDeprecatedHentaPreset(name);
        },

        getRetiredBuiltInPresetNames() {
            return [
                'Compact_Counter_def3',
                'Bielsa_ChaosPress_att5',
                'MidBlock_Control4231_neutr',
                'MidBlock_Counter4411_neutr',
                'Lead_Outlet4141_def1',
                'Arteta_Control433_bal3',
                'Pep_BoxControl_bal2',
                'Pep_PressCooldown_bal2',
                'Pep_ControlledPush_att3',
                'Pep_TwoThreeFive_att3',
                'Conte_WingbackWidth_bal4',
                'Klopp_Gegenpress_att4',
                'Simeone_Compact442_def4',
                'Simeone_LowBlock_def5',
                'Emery_BalancedControl4231_neutr',
                'Mourinho_CompactCounter4411_neutr',
                'Allegri_LeadManagement4141_def1',
                'Mourinho_WeakSide_def3',
                'Henta_Hold_def3',
                'Pep_StandardControl_bal3',
                'Xabi_VerticalBox_att3',
                'Xabi_BoxMidfield_bal3',
                'DeZerbi_BaitPress_bal3',
                'DeZerbi_Release_att4',
                'Klopp_WideTrap_att4',
                'Henta_LeftTrap_att3',
                'Henta_RightTrap_att3',
                'Henta_WideTrap_att3',
                'Henta_CounterTrap_att4',
                'Henta_CentralTrap_att3',
                'Nagelsmann_WidePress_att4'
            ];
        },

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
            deleteKeys.forEach(key => {
                void Api.post(`${CONFIG.COLLECTIONS.TACTICS}?mode=delete-key`, { key }, 'tactics delete').catch(error => {
                    this.recordSyncFailure(`tactics delete-key (${key})`, error);
                });
            });
            void Api.post(`${CONFIG.COLLECTIONS.TACTICS}?mode=merge`, normalized, 'tactics merge').catch(error => {
                this.recordSyncFailure('tactics merge', error);
            });
        },

        loadFromServerAndMerge(callback) {
            let failureRecorded = false;
            return Api.get(
                CONFIG.COLLECTIONS.TACTICS,
                data => {
                    const serverData = normalizePresets(data);
                    const localData = this.loadLocalRaw() || {};
                    this.saveLocalOnly(Object.assign({}, localData, serverData));

                    if (callback) callback();
                },
                (error, response) => {
                    // Api.get calls onError(error, response) and then the
                    // promise still rejects; record the server-rejection
                    // context here and keep the fail-open callback contract.
                    failureRecorded = true;
                    this.recordSyncFailure('tactics load (server error)', error);
                    if (callback) callback();
                }
            ).catch(error => {
                // Transport-level failures reject without ever reaching onError.
                if (!failureRecorded) this.recordSyncFailure('tactics load failed', error);
                return undefined;
            });
        },

        getAllPresets() {
            // Built-in canonical library wins over older locally/server-saved copies with the same names.
            // Exact retired SLF built-in IDs are removed at the storage boundary; unique user presets remain.
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
