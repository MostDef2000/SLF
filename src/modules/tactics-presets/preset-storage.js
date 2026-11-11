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
        // Diagnostics for the last preset-store failure. Reads stay fail-open
        // (cached/pre-migration presets keep working), but failures must not be
        // silent. Native writes (#409) fail loud: they throw a structured
        // SLFPresetWriteError that the UI surfaces, and the read cache is
        // updated only from acknowledged responses.
        lastSyncError: null,
        lastSyncAt: null,
        // Where the last read was served from: 'native' (fresh page-config
        // ingest), 'cache' (validated localStorage fallback), 'unavailable'.
        readSource: 'unavailable',
        nativeStale: true,
        lastSuccessfulRefreshAt: null,
        // Fingerprint of the page-config snapshot consumed by the last
        // ingest. The embedded TACTIC_CFG.items is a page-load snapshot: a
        // re-read that is byte-identical carries no new information and must
        // not wipe acknowledged writes out of the cache (a save is acked by
        // the server but the embedded config only updates on reload).
        lastIngestFingerprint: null,

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
            const source = this.refreshNativeState();

            if (source === 'unavailable') {
                return this.loadLegacyLocalPresets();
            }

            const cached = this.readScopedNativeCache();
            return this.inventoryToPresetMap(cached ? cached.items : []);
        },

        // ---- native site-template store (issue #409) --------------------
        // Native site templates are the canonical preset store. localStorage
        // holds only a read cache under a CONSTANT key: it is scoped by
        // VALIDATION at read time (served as a preset source only when the
        // page global foot_login_id matches the envelope's site user_id —
        // shared-browser account isolation), not by a per-user key. It
        // persists id/name/data/time — never share_token/share_url. The
        // recurring VPS tactics sync (merge / delete-key posts and the GET
        // merge) is retired; the VPS tactics collection config itself is
        // untouched (wave 2 migrates it).

        nativeCacheKey() {
            return `${CONFIG.STORAGE_KEY}_native_v1`;
        },

        nativeApiAvailable() {
            // Standalone-safe guard (same pattern as isTacticObject above):
            // the module must keep loading in test sandboxes that assemble
            // preset-storage.js alone.
            return typeof NativeTemplateApi !== 'undefined'
                && !!NativeTemplateApi
                && typeof NativeTemplateApi.readInventory === 'function';
        },

        readNativeCache() {
            try {
                const raw = localStorage.getItem(this.nativeCacheKey());
                if (!raw) return null;

                const parsed = JSON.parse(raw);
                if (!parsed || parsed.schema !== 'slf_native_preset_cache_v1' || !Array.isArray(parsed.items)) {
                    return null;
                }
                return parsed;
            } catch (e) {
                debugWarn('[SLF] Ошибка чтения кэша нативных шаблонов', e);
                return null;
            }
        },

        readPageUserId() {
            // foot_login_id is the site's page-global login id — present on
            // team4.php?action=tactic AND match pages (verified in saved page
            // dumps). Same unsafeWindow fallback pattern as
            // native-template-api.js resolvePageWindow.
            try {
                if (typeof unsafeWindow !== 'undefined' && unsafeWindow && unsafeWindow.foot_login_id != null) {
                    return String(unsafeWindow.foot_login_id);
                }
            } catch (_) { /* no userscript sandbox */ }
            if (typeof window !== 'undefined' && window && window.foot_login_id != null) {
                return String(window.foot_login_id);
            }
            return null;
        },

        readScopedNativeCache() {
            // The cache key is constant, so the envelope is scoped by
            // VALIDATION at read time: it may serve presets only when the
            // page's current user (foot_login_id) matches the envelope's
            // user. Without the page global, or on a mismatch, the cache is
            // not a valid source (shared-browser account isolation) — reads
            // treat it as unavailable. Internal reads that overwrite the
            // cache with fresh page data (persistNativeInventory) use the
            // raw readNativeCache instead.
            const cached = this.readNativeCache();
            if (!cached) return null;

            const pageUserId = this.readPageUserId();
            if (pageUserId == null) return null;
            if (cached.userId == null || cached.userId === 'null') return null;
            if (pageUserId !== String(cached.userId)) return null;
            return cached;
        },

        persistNativeInventory(items, userId, managedNames) {
            const previous = this.readNativeCache();
            const sameScope = !!(previous
                && previous.userId != null
                && previous.userId !== 'null'
                && previous.userId === userId);

            const envelope = {
                schema: 'slf_native_preset_cache_v1',
                userId: userId,
                fetchedAt: Date.now(),
                // Persist only id/name/data/time — never share_token/share_url.
                items: (items || []).map(item => ({
                    id: item.id,
                    userId: item.userId,
                    name: item.name,
                    data: item.data,
                    time: item.time
                })),
                managedNames: Array.isArray(managedNames)
                    ? managedNames.slice()
                    : (sameScope && Array.isArray(previous.managedNames) ? previous.managedNames.slice() : [])
            };

            const fingerprint = JSON.stringify({
                userId: envelope.userId,
                items: envelope.items,
                managedNames: envelope.managedNames
            });
            const previousFingerprint = previous
                ? JSON.stringify({
                    userId: previous.userId,
                    items: previous.items,
                    managedNames: previous.managedNames || []
                })
                : null;

            if (fingerprint !== previousFingerprint) {
                localStorage.setItem(this.nativeCacheKey(), JSON.stringify(envelope));
            }
            return envelope;
        },

        nativeItemIsNewer(a, b) {
            // The site allows same-name templates (verified: ids 5143+5144).
            // Reads resolve duplicates to the freshest item (latest time,
            // then highest id); writes reconcile EVERY copy of the name —
            // saveCustom deletes all same-name copies on update/delete, so
            // an older duplicate can never resurface after the next read.
            const timeA = Number(a && a.time) || 0;
            const timeB = Number(b && b.time) || 0;
            if (timeA !== timeB) return timeA > timeB;
            const na = Number(a && a.id) || 0;
            const nb = Number(b && b.id) || 0;
            if (na !== nb) return na > nb;
            return String(a && a.id) > String(b && b.id);
        },

        inventoryToPresetMap(items) {
            const byName = {};
            (Array.isArray(items) ? items : []).forEach(item => {
                if (!item || !item.name || !item.data) return;
                if (!byName[item.name] || this.nativeItemIsNewer(item, byName[item.name])) {
                    byName[item.name] = item;
                }
            });

            const map = {};
            Object.keys(byName).forEach(name => {
                const data = byName[name].data;
                const preset = {};
                Object.keys(data).forEach(key => {
                    if (key === 'priority') return;
                    preset[key] = String(data[key]);
                });
                preset.priority = Array.isArray(data.priority) ? data.priority.slice() : [];
                map[name] = preset;
            });
            return filterDeprecatedPresetMap(map);
        },

        pluginVectorsEqual(a, b) {
            if (typeof NativeTemplateMapping === 'undefined' || !NativeTemplateMapping) return false;
            return NativeTemplateMapping.pluginVectorsEqual(a, b);
        },

        refreshNativeState() {
            let read = null;
            if (this.nativeApiAvailable()) {
                try {
                    read = NativeTemplateApi.readInventory();
                } catch (error) {
                    this.recordSyncFailure('native inventory read', error);
                    read = null;
                }
            }

            if (read && read.ok) {
                if (read.malformed && read.malformed.length) {
                    // Malformed native items are skipped and reported — they
                    // are malformed, never silently treated as zero values.
                    debugWarn('[SLF] PresetStorage:', read.message);
                }
                // A valid-empty inventory is canonical: it clears the cache.
                // An all-malformed read keeps the previous cache instead of
                // canonically wiping known-good state on a transient parse
                // surprise.
                if (read.items.length || !(read.malformed && read.malformed.length)) {
                    const fingerprint = JSON.stringify(read.items);
                    if (fingerprint !== this.lastIngestFingerprint) {
                        // Scope: the items' owner, or — for a valid-empty
                        // inventory, which carries no user_id — the page
                        // user, so the read-time scope validation can serve
                        // the (empty) envelope for this account.
                        const userId = read.items.length
                            ? String(read.items[0].userId || '')
                            : this.readPageUserId();
                        this.persistNativeInventory(read.items, userId, null);
                        this.lastIngestFingerprint = fingerprint;
                        this.readSource = 'native';
                        this.nativeStale = false;
                        this.lastSuccessfulRefreshAt = Date.now();
                        return 'native';
                    }
                    // Unchanged page snapshot. The fingerprint is per-tab
                    // in-memory state while the cache lives in shared
                    // localStorage: another tab of the same browser under a
                    // DIFFERENT account may have overwritten the constant-key
                    // cache since our ingest. Validate the cache scope before
                    // serving it: a valid scoped envelope still reflects this
                    // ingest plus acknowledged writes — keep serving it (the
                    // anti-wipe purpose of the fingerprint check). A foreign
                    // envelope, a missing page user or a wiped cache is never
                    // served — re-persist the fresh same-page snapshot (our
                    // own session's data) and report a native read.
                    if (this.readScopedNativeCache()) {
                        this.readSource = 'cache';
                        this.nativeStale = false;
                        return 'cache';
                    }
                    const userId = read.items.length
                        ? String(read.items[0].userId || '')
                        : this.readPageUserId();
                    this.persistNativeInventory(read.items, userId, null);
                    this.readSource = 'native';
                    this.nativeStale = false;
                    this.lastSuccessfulRefreshAt = Date.now();
                    return 'native';
                }
            }

            const cached = this.readScopedNativeCache();
            if (cached) {
                this.readSource = 'cache';
                this.nativeStale = true;
                return 'cache';
            }

            this.readSource = 'unavailable';
            this.nativeStale = true;
            return 'unavailable';
        },

        loadLegacyLocalPresets() {
            // Pre-migration continuity only: with no native config and no
            // native cache, the pre-migration local presets stay readable until the
            // wave-2 migration coordinator moves them into native templates.
            const local = this.loadLocalRaw();

            if (!local) {
                this.saveLocalOnly(DEFAULT_CUSTOM_PRESETS);
                return normalizePresets(DEFAULT_CUSTOM_PRESETS);
            }

            return local;
        },

        getManagedPresetNames() {
            const envelope = this.readScopedNativeCache();
            return envelope && Array.isArray(envelope.managedNames) ? envelope.managedNames.slice() : [];
        },

        recordMigratedTemplate(ackedTactic) {
            // Migration seam (#409 wave 2): record ONE acknowledged
            // NativeTemplateApi.saveTemplate ack into the scoped cache —
            // no re-ingest, no deletes (the migration coordinator must never
            // delete anything). The name joins managedNames so file-import
            // replacement semantics keep covering migrated presets.
            if (!ackedTactic || !ackedTactic.id || !ackedTactic.name) return null;

            const previous = this.readNativeCache();
            const items = previous && Array.isArray(previous.items)
                ? previous.items.filter(item => item && item.id !== ackedTactic.id)
                : [];
            items.push({
                id: ackedTactic.id,
                userId: ackedTactic.userId,
                name: ackedTactic.name,
                data: ackedTactic.data,
                time: ackedTactic.time
            });

            const managedNames = new Set(previous && Array.isArray(previous.managedNames)
                ? previous.managedNames
                : []);
            managedNames.add(ackedTactic.name);

            // Scope: the acked item carries the server-side user_id; an
            // emptied cache keeps the previous scope (same rule as
            // saveCustom's persistProgress).
            const userId = String(ackedTactic.userId || (previous && previous.userId) || this.readPageUserId() || '');
            return this.persistNativeInventory(items, userId, Array.from(managedNames));
        },

        async saveCustom(customPresets, options) {
            const opts = options || {};
            // Strict option validation before any state change: an unknown
            // delete mode is a caller bug and must fail loud, not fall
            // through to a silent default.
            if (opts.deleteMissing != null && ['all', 'managed', 'none'].indexOf(opts.deleteMissing) === -1) {
                const error = new Error(`неизвестный режим удаления «${String(opts.deleteMissing)}» (допустимо: all, managed, none); ничего не сохранено`);
                error.name = 'SLFPresetWriteError';
                error.code = 'invalid_option';
                this.recordSyncFailure('native save (invalid option)', error);
                throw error;
            }
            // 'all' (default): replacement semantics for the full map (save /
            // delete callers pass complete maps). 'managed': deletes only
            // previously plugin-managed names (file import must never delete
            // native templates it does not own — full reconciliation is wave
            // 2). 'none': add/update only.
            const deleteMode = opts.deleteMissing || 'all';

            if (!this.nativeApiAvailable()) {
                const error = new Error('хранилище нативных шаблонов недоступно (модуль не загружен); ничего не сохранено');
                error.name = 'SLFPresetWriteError';
                error.code = 'native_unavailable';
                this.recordSyncFailure('native save (store unreachable)', error);
                throw error;
            }

            const source = this.refreshNativeState();
            // Depth defense: the write plan must be built from a scoped
            // envelope only. After refreshNativeState the scoped read always
            // succeeds on writable paths (a fresh ingest just wrote our
            // envelope; the unchanged-snapshot path validated scope); null
            // here means no valid source — the !envelope check below fails
            // loud instead of planning against a foreign envelope.
            const envelope = this.readScopedNativeCache();

            if (source === 'unavailable' || !envelope) {
                const error = new Error('хранилище нативных шаблонов недоступно (нет конфигурации страницы и кэша); ничего не сохранено');
                error.name = 'SLFPresetWriteError';
                error.code = 'native_unavailable';
                this.recordSyncFailure('native save (store unreachable)', error);
                throw error;
            }

            // Stale-write gate: writes must happen only against a fresh or
            // unchanged-snapshot inventory. A stale cache (page config
            // unreadable, fallback served) may not reflect the server state —
            // writing blind against it is wrong even though deleting an
            // already-dead id is idempotent. Fail loud, write nothing.
            if (this.nativeStale) {
                const error = new Error('состояние шаблонов устарело — обновите страницу; ничего не сохранено');
                error.name = 'SLFPresetWriteError';
                error.code = 'native_stale';
                this.recordSyncFailure('native save (stale state)', error);
                throw error;
            }

            const normalized = normalizePresets(customPresets);
            const managedNames = new Set(Array.isArray(envelope.managedNames) ? envelope.managedNames : []);
            // The site allows same-name templates (verified ids 5143+5144):
            // group ALL copies by name. Writes must reconcile every copy —
            // deleting only the freshest would leave older duplicates that
            // resurface in the facade after the next read.
            const previousByName = {};
            const previousIdsByName = {};
            envelope.items.forEach(item => {
                if (!previousIdsByName[item.name]) previousIdsByName[item.name] = [];
                previousIdsByName[item.name].push(item);
                if (!previousByName[item.name] || this.nativeItemIsNewer(item, previousByName[item.name])) {
                    previousByName[item.name] = item;
                }
            });

            // Pre-validate every vector before touching the network: a batch
            // containing an incomplete vector must fail without writing.
            const plannedSaves = [];
            const normalizedNames = Object.keys(normalized);
            for (const name of normalizedNames) {
                const site = NativeTemplateMapping.pluginVectorToSiteData(normalized[name]);
                if (!site.ok) {
                    const error = new Error(`пресет «${name}» отклонён: ${site.message}`);
                    error.name = 'SLFPresetWriteError';
                    error.code = site.code;
                    this.recordSyncFailure('native save (invalid vector)', error);
                    throw error;
                }

                const existing = Object.prototype.hasOwnProperty.call(previousByName, name)
                    ? previousByName[name]
                    : null;
                if (existing && this.pluginVectorsEqual(existing.data, normalized[name])) continue;

                plannedSaves.push({
                    name,
                    vector: normalized[name],
                    oldIds: (previousIdsByName[name] || []).map(item => item.id)
                });
            }

            const plannedDeletes = [];
            if (deleteMode !== 'none') {
                Object.keys(previousIdsByName).forEach(name => {
                    if (Object.prototype.hasOwnProperty.call(normalized, name)) return;
                    if (deleteMode === 'managed' && !managedNames.has(name)) return;
                    // Retired built-in names stay display-filtered but are
                    // never auto-deleted from the native store.
                    if (isDeprecatedHentaPreset(name)) return;
                    // Every id of every name being deleted — same-name
                    // duplicates must not survive a delete.
                    previousIdsByName[name].forEach(item => plannedDeletes.push(item));
                });
            }

            const inventoryById = {};
            envelope.items.forEach(item => { inventoryById[item.id] = item; });
            const applied = [];
            const removed = [];
            const removedNames = new Set();
            const replacedOldIds = [];

            const persistProgress = () => {
                const items = Object.keys(inventoryById).map(id => inventoryById[id]);
                // Keep the envelope scoped: acked items carry the server-side
                // user_id; an emptied inventory keeps the previous scope.
                const userId = items.length
                    ? String(items[0].userId || '')
                    : envelope.userId;
                this.persistNativeInventory(items, userId, Array.from(managedNames));
            };

            try {
                for (const step of plannedSaves) {
                    const ack = await NativeTemplateApi.saveTemplate(step.name, step.vector, opts);
                    if (!ack.ok) {
                        const error = new Error(`не удалось сохранить шаблон «${step.name}»: ${ack.message || ack.code}`);
                        error.name = 'SLFPresetWriteError';
                        error.code = ack.code || 'save_failed';
                        error.serverCode = ack.serverCode != null ? ack.serverCode : null;
                        error.partial = { applied: applied.slice(), removed: removed.slice() };
                        throw error;
                    }

                    // Record the acknowledged save BEFORE reconciling old
                    // copies: a partial_replace below must still leave the
                    // acked new template in the persisted cache (at that
                    // point the server holds new + old).
                    inventoryById[ack.tactic.id] = {
                        id: ack.tactic.id,
                        userId: ack.tactic.userId,
                        name: step.name,
                        data: ack.tactic.data,
                        time: ack.tactic.time,
                        order: ack.tactic.order
                    };
                    managedNames.add(step.name);
                    applied.push(step.name);

                    if (step.oldIds.length) {
                        for (const oldId of step.oldIds) {
                            const del = await NativeTemplateApi.deleteTemplate(oldId, opts);
                            if (!del.ok) {
                                const error = new Error(`шаблон «${step.name}» сохранён (id ${ack.tactic.id}), но старая копия (id ${oldId}) не удалена: ${del.message || del.code}`);
                                error.name = 'SLFPresetWriteError';
                                error.code = 'partial_replace';
                                error.serverCode = del.serverCode != null ? del.serverCode : null;
                                error.partial = { applied: applied.slice(), removed: removed.slice() };
                                throw error;
                            }
                            delete inventoryById[oldId];
                            replacedOldIds.push(oldId);
                        }
                    }

                    persistProgress();
                }

                for (const item of plannedDeletes) {
                    const del = await NativeTemplateApi.deleteTemplate(item.id, opts);
                    if (!del.ok) {
                        const error = new Error(`не удалось удалить шаблон «${item.name}» (id ${item.id}): ${del.message || del.code}`);
                        error.name = 'SLFPresetWriteError';
                        error.code = del.code || 'delete_failed';
                        error.serverCode = del.serverCode != null ? del.serverCode : null;
                        error.partial = { applied: applied.slice(), removed: removed.slice() };
                        throw error;
                    }
                    delete inventoryById[item.id];
                    managedNames.delete(item.name);
                    // A name with several same-name copies is reported once.
                    if (!removedNames.has(item.name)) {
                        removedNames.add(item.name);
                        removed.push(item.name);
                    }
                    persistProgress();
                }
            } catch (error) {
                // Persist acknowledged progress, then rethrow loudly — the
                // caller (ui-layer) surfaces the message; never console-only.
                persistProgress();
                if (!error || error.name !== 'SLFPresetWriteError') {
                    this.recordSyncFailure('native save', error);
                }
                throw error;
            }

            return { ok: true, applied, removed, replacedOldIds };
        },

        loadFromServerAndMerge(callback) {
            // Compatibility alias (#409): the VPS tactics collection is
            // retired as a transport. "Server sync" is now a fresh read of
            // the page-embedded native inventory (cache fallback off-page).
            // The callback fires EXACTLY once on every outcome, including
            // failure — bootstrap.js depends on that contract.
            let fired = false;
            const once = () => {
                if (fired) return;
                fired = true;
                // A throwing callback must not escape (the old Api.get
                // promise chain absorbed callback throws); it is recorded
                // and swallowed. The callback still fires exactly once.
                try {
                    if (callback) callback();
                } catch (error) {
                    this.recordSyncFailure('preset refresh callback', error);
                }
            };

            try {
                this.refreshNativeState();
            } catch (error) {
                this.recordSyncFailure('native refresh failed', error);
            }

            once();
            return Promise.resolve(undefined);
        },

        getAllPresets() {
            // Native cutover (#409): the native inventory owns the vectors.
            // Built-in registry vectors remain seed definitions and are NOT
            // overlaid anymore — native absence is canonical. The pre-migration
            // composite (local + BASE_PRESETS) is served only while the
            // native store is entirely unreachable (no page config and no
            // cache), so pre-migration sessions keep working.
            const source = this.refreshNativeState();

            if (source !== 'unavailable') {
                const cached = this.readScopedNativeCache();
                return this.inventoryToPresetMap(cached ? cached.items : []);
            }

            return filterDeprecatedPresetMap(Object.assign({}, this.loadLegacyLocalPresets(), BASE_PRESETS));
        },

        getAllLabels() {
            const source = this.refreshNativeState();
            let labels;

            if (source !== 'unavailable') {
                const cached = this.readScopedNativeCache();
                const presets = this.inventoryToPresetMap(cached ? cached.items : []);
                labels = {};
                Object.keys(presets).forEach(key => {
                    labels[key] = BASE_LABELS[key] || key;
                });
            } else {
                const customPresets = this.loadLegacyLocalPresets();
                labels = Object.assign({}, BASE_LABELS);

                for (let key in customPresets) {
                    labels[key] = BASE_LABELS[key] || key;
                }
            }

            return filterDeprecatedPresetMap(labels);
        }
    };

    // ============================================================
