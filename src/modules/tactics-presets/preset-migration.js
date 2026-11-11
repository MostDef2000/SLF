    // 3b. Preset Migration Coordinator (issue #409, wave 2)
    // ============================================================

    // One-time, owner-triggered migration of pre-migration preset sources
    // into native site templates. Sources, in precedence order (later wins
    // on a name collision for the vector to import):
    //   built-in seeds (BASE_PRESETS — 'standard' + the active registry suite
    //   installed at load) < legacy localStorage customs (CONFIG.STORAGE_KEY)
    //   < VPS tactics collection (one-time read of the retired transport's
    //   data archive; read failure is non-fatal) < DEFAULT_CUSTOM_PRESETS.
    // DESTINATION-WINS: a name that already exists in the native inventory is
    // NEVER overwritten — the site template is canonical and the user's
    // manual edits must not be clobbered (skipped with reason 'exists').
    //
    // The persisted receipt (slf_preset_migration_receipt_v1) is the identity
    // sidecar: applied[] maps preset name → site template id, so telemetry
    // and the tactical lab keep working by name while the id map stays
    // reconcilable. A name already in the receipt is skipped on re-run
    // (idempotency); a server save-limit rejection aborts the remaining
    // queue loudly and a re-run resumes from the receipt. An AMBIGUOUS save
    // outcome (network/timeout/unknown_outcome/empty_response/not_json — the
    // server may have created the template) is recorded in receipt.unknown
    // and the receipt is persisted after EVERY ack (incremental persistence:
    // an interruption cannot lose acked progress); a re-run skips unknown
    // names conservatively (unknown_outcome_previous — never risk a duplicate
    // + quota burn; the owner clears the receipt after checking the site).
    //
    // Safety invariants (pinned by tests/test-preset-migration.mjs):
    // - writes go through NativeTemplateApi.saveTemplate directly — migration
    //   NEVER deletes (no tactic_delete call is ever issued);
    // - deprecated names are never imported;
    // - NO automatic trigger: run() executes only from the ui-layer button
    //   (site mutations stay owner-controlled; never on page load).

    const PresetMigration = (() => {

        const RECEIPT_KEY = 'slf_preset_migration_receipt_v1';
        const RECEIPT_SCHEMA = 'slf_preset_migration_receipt_v1';

        const SOURCE_LABELS = {
            seed: 'встроенный пресет',
            legacy_local: 'локальный пресет (до миграции)',
            vps_tactics: 'VPS-коллекция tactics',
            default_custom: 'встроенный пользовательский пресет'
        };

        function emptyReceipt() {
            return {
                schema: RECEIPT_SCHEMA,
                ts: 0,
                applied: [],
                skipped: [],
                // Ambiguous-outcome saves (network/timeout/unknown_outcome/
                // empty_response/not_json): the server MAY have created the
                // template — recorded here (never in applied, no id exists);
                // a re-run skips these names (unknown_outcome_previous).
                unknown: [],
                vectorFingerprints: {}
            };
        }

        function readReceipt() {
            try {
                const raw = localStorage.getItem(RECEIPT_KEY);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                if (!parsed || parsed.schema !== RECEIPT_SCHEMA || !Array.isArray(parsed.applied)) return null;
                return parsed;
            } catch (error) {
                debugWarn('[SLF] PresetMigration: не удалось прочитать квитанцию миграции', error);
                return null;
            }
        }

        function writeReceipt(receipt) {
            try {
                localStorage.setItem(RECEIPT_KEY, JSON.stringify(receipt));
            } catch (error) {
                debugWarn('[SLF] PresetMigration: не удалось сохранить квитанцию миграции', error);
            }
        }

        // Compact stable fingerprint of the imported vector (canonical
        // site-data form, keys in SITE_DATA_KEYS order) — lets a future audit
        // compare what was imported without storing full vectors in the
        // receipt. djb2 over the serialized 17 fields; no crypto dependency.
        function fingerprintVector(vector) {
            if (typeof NativeTemplateMapping === 'undefined' || !NativeTemplateMapping) return null;
            const site = NativeTemplateMapping.pluginVectorToSiteData(vector);
            if (!site.ok) return null;
            const canonical = NativeTemplateMapping.SITE_DATA_KEYS
                .map(key => `${key}:${site.siteData[key]}`)
                .join('|');
            let hash = 5381;
            for (let i = 0; i < canonical.length; i++) {
                hash = ((hash << 5) + hash + canonical.charCodeAt(i)) >>> 0;
            }
            return `fp${hash.toString(16)}`;
        }

        // One source merged into the candidate map. The map arrives RAW:
        // normalizePresets does the shape coercion (decimal strings, priority
        // array) and drops non-tactic objects and deprecated names at the
        // boundary — deprecated names are scanned from the RAW keys first and
        // reported as skipped (never silently dropped, never imported).
        // Returns the number of entries the source contributed.
        function mergeSource(map, source, merged, skipped) {
            Object.keys(map || {}).forEach(name => {
                if (PresetStorage.isRetiredBuiltInPreset(name) && !skipped.some(entry => entry.name === name)) {
                    skipped.push({ name, reason: 'deprecated' });
                }
            });
            const normalized = normalizePresets(map);
            Object.keys(normalized).forEach(name => {
                merged[name] = { vector: normalized[name], source };
            });
            return Object.keys(normalized).length;
        }

        function readLegacyLocalRaw() {
            // Raw read of the pre-migration localStorage customs: deprecated
            // keys must survive to the merge so they are REPORTED as skipped
            // (normalizePresets would silently drop them). Read-only — the
            // migration never rewrites the legacy key.
            try {
                const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
            } catch (error) {
                return null;
            }
        }

        async function readVpsTactics() {
            // One-time read of the retired VPS tactics collection (data
            // archive — the collection stays on the VPS, the code stops
            // using it after this read). The RAW body is returned and
            // normalized at merge time (same parse as the pre-#409 sync:
            // normalizePresets over the response body) so deprecated keys
            // are reported, not silently dropped.
            const result = await Api.getPromise(CONFIG.COLLECTIONS.TACTICS, 'preset migration: vps tactics read');
            return result && result.data;
        }

        async function run(options) {
            const opts = options || {};
            const dryRun = opts.dryRun === true;
            const created = [];
            const skipped = [];
            const failed = [];
            const sources = [];

            // Write discipline (same gates as saveCustom): migration writes
            // only against a fresh or unchanged-snapshot scoped inventory.
            if (!PresetStorage.nativeApiAvailable()) {
                return failUnavailable('native_unavailable', 'хранилище нативных шаблонов недоступно (модуль не загружен)');
            }
            const sourceState = PresetStorage.refreshNativeState();
            if (sourceState === 'unavailable') {
                return failUnavailable('native_unavailable', 'хранилище нативных шаблонов недоступно (нет конфигурации страницы и кэша); откройте страницу тактики');
            }
            if (PresetStorage.nativeStale) {
                return failUnavailable('native_stale', 'состояние шаблонов устарело — обновите страницу тактики и повторите миграцию');
            }
            const envelope = PresetStorage.readScopedNativeCache();
            if (!envelope) {
                return failUnavailable('native_unavailable', 'хранилище нативных шаблонов недоступно (нет валидного кэша для текущего пользователя)');
            }

            // Read-time consistency check: mark receipt entries whose site
            // template disappeared (deleted externally). Informational only —
            // no background jobs; a stale name is still skipped on re-run
            // (receipt idempotency) until the receipt is cleared.
            const reconciliation = reconcileReceipt(!dryRun);
            const receipt = reconciliation.receipt || emptyReceipt();

            const appliedNames = new Set(receipt.applied.map(entry => entry.name));
            const inventoryNames = new Set(envelope.items.map(item => item.name));

            // Sources in precedence order — later wins on a name collision.
            const merged = {};
            mergeSource(BASE_PRESETS, 'seed', merged, skipped);
            const legacyLocal = readLegacyLocalRaw();
            if (legacyLocal) mergeSource(legacyLocal, 'legacy_local', merged, skipped);
            try {
                const vpsPresets = await readVpsTactics();
                const vpsCount = mergeSource(vpsPresets, 'vps_tactics', merged, skipped);
                sources.push({ source: 'vps_tactics', ok: true, count: vpsCount });
            } catch (error) {
                // Non-fatal: the collection is an archive; migration proceeds
                // with the remaining sources and reports the skip.
                sources.push({
                    source: 'vps_tactics',
                    ok: false,
                    reason: error && error.message ? error.message : String(error || 'unknown error')
                });
            }
            mergeSource(DEFAULT_CUSTOM_PRESETS, 'default_custom', merged, skipped);

            let aborted = false;

            // Incremental receipt state (review fix B): applied/unknown/fingerprints
            // are mutable accumulators persisted after EVERY ack and every
            // unknown-outcome recording — an interruption can no longer lose
            // acked progress. `unknown` carries names whose save outcome is
            // ambiguous (the server MAY have created the template; no id is
            // known, so they are NOT applied).
            const appliedOut = receipt.applied.slice();
            const unknownOut = Array.isArray(receipt.unknown)
                ? receipt.unknown.filter(entry => entry && entry.name).slice()
                : [];
            const fingerprintsOut = Object.assign({}, receipt.vectorFingerprints);
            const unknownNames = new Set(unknownOut.map(entry => entry.name));

            const persistReceipt = () => {
                const snapshot = {
                    schema: RECEIPT_SCHEMA,
                    ts: Date.now(),
                    applied: appliedOut.slice(),
                    skipped: skipped.slice(),
                    unknown: unknownOut.slice(),
                    vectorFingerprints: Object.assign({}, fingerprintsOut)
                };
                if (reconciliation.stale && reconciliation.stale.length) {
                    snapshot.stale = reconciliation.stale.slice();
                    snapshot.reconciledAt = Date.now();
                }
                writeReceipt(snapshot);
                return snapshot;
            };

            let outReceipt = null;
            try {
                for (const name of Object.keys(merged)) {
                    // Deprecated names are never imported (defense in depth —
                    // normalizePresets already filters them at the source).
                    if (PresetStorage.isRetiredBuiltInPreset(name)) {
                        skipped.push({ name, reason: 'deprecated' });
                        continue;
                    }
                    // Idempotency: a name already in the receipt is never
                    // re-imported (a re-run after full success issues zero saves).
                    if (appliedNames.has(name)) {
                        skipped.push({ name, reason: 'already_migrated' });
                        continue;
                    }
                    // Conservative unknown-outcome skip: a previous run recorded
                    // an ambiguous save outcome for this name (the server MAY
                    // have created the template). Never re-save blindly — that
                    // risks a duplicate + quota burn; the owner checks the site
                    // template list and clears the receipt if it was not created.
                    if (unknownNames.has(name)) {
                        skipped.push({ name, reason: 'unknown_outcome_previous' });
                        continue;
                    }
                    // DESTINATION-WINS: the site template is canonical; a name
                    // that already exists in the native inventory is never
                    // overwritten and the existing vector is never touched.
                    if (inventoryNames.has(name)) {
                        skipped.push({ name, reason: 'exists' });
                        continue;
                    }
                    if (aborted) {
                        // Loud quota/transport abort: the receipt reports exactly
                        // what remains; a re-run resumes these names.
                        skipped.push({ name, reason: 'aborted_after_rejection' });
                        continue;
                    }

                    // Pre-validate the vector before touching the network (same
                    // discipline as saveCustom): an invalid vector fails its own
                    // entry without aborting the rest of the queue.
                    const site = NativeTemplateMapping.pluginVectorToSiteData(merged[name].vector);
                    if (!site.ok) {
                        failed.push({ name, code: site.code, message: `${name}: ${site.message}` });
                        continue;
                    }

                    if (dryRun) {
                        created.push({ name, id: null, source: merged[name].source });
                        continue;
                    }

                    const ack = await NativeTemplateApi.saveTemplate(name, merged[name].vector, opts);
                    if (!ack.ok) {
                        const code = ack.code || 'save_failed';
                        if (code === 'server_rejected') {
                            // DEFINITE rejection: nothing was created, a re-run
                            // retries this name correctly.
                            failed.push({
                                name,
                                code,
                                message: `не удалось создать шаблон «${name}»: ${ack.message || code}`
                            });
                        } else {
                            // AMBIGUOUS outcome (network/timeout/unknown_outcome/
                            // empty_response/not_json): the request MAY have
                            // reached the server and the template MAY exist.
                            // Record it as unknown (never applied — no id is
                            // known), persist the receipt immediately, abort.
                            // A re-run skips the name (unknown_outcome_previous):
                            // never risk a duplicate + quota burn; the owner
                            // reloads the page, checks the site template list
                            // and clears the receipt if it was not created.
                            unknownOut.push({ name, source: merged[name].source, ts: Date.now() });
                            failed.push({
                                name,
                                code,
                                message: 'исход сохранения неизвестен — шаблон мог создаться; проверьте список шаблонов на сайте после обновления страницы'
                            });
                            persistReceipt();
                        }
                        aborted = true;
                        continue;
                    }

                    // Acknowledged save → record into the scoped cache through
                    // the facade seam (envelope + managedNames), never a delete.
                    // A cache-write failure (localStorage quota) must NOT lose
                    // the acked save: the name still lands in applied/created;
                    // the cache re-ingests on the next page load.
                    try {
                        PresetStorage.recordMigratedTemplate(ack.tactic);
                    } catch (cacheError) {
                        debugWarn('[SLF] PresetMigration: шаблон создан, но локальный кэш не обновился (перечитается при загрузке страницы)', cacheError);
                    }
                    inventoryNames.add(name);
                    appliedNames.add(name);
                    appliedOut.push({
                        name,
                        id: ack.tactic.id,
                        source: merged[name].source
                    });
                    const fp = fingerprintVector(merged[name].vector);
                    if (fp) fingerprintsOut[name] = fp;
                    created.push({ name, id: ack.tactic.id, source: merged[name].source });
                    // Incremental persistence: the receipt survives an
                    // interruption after every acknowledged save.
                    persistReceipt();
                }
            } finally {
                // Guarantee: the receipt reflects the acked state on ANY exit
                // path (the loop completes normally today; the finally covers
                // future exception paths).
                if (!dryRun) outReceipt = persistReceipt();
            }

            if (dryRun) {
                return {
                    ok: failed.length === 0,
                    code: failed.length ? 'invalid_vector' : 'ok',
                    message: failed.length ? 'некоторые векторы некорректны' : '',
                    created,
                    skipped,
                    failed,
                    receipt: null,
                    sources,
                    aborted,
                    staleNames: reconciliation.stale || []
                };
            }

            // outReceipt was persisted by the finally above (incremental
            // persistence: after every ack/unknown recording AND on loop exit —
            // the receipt survives any interruption with the acked state).
            return {
                ok: failed.length === 0,
                code: failed.length ? (aborted ? 'aborted' : 'completed_with_errors') : 'ok',
                message: failed.length ? (failed[0].message || failed[0].code) : '',
                created,
                skipped,
                failed,
                receipt: outReceipt,
                sources,
                aborted,
                staleNames: reconciliation.stale || []
            };
        }

        function failUnavailable(code, message) {
            return {
                ok: false,
                code,
                message,
                created: [],
                skipped: [],
                failed: [],
                receipt: null,
                sources: [],
                aborted: false,
                staleNames: []
            };
        }

        function reconcileReceipt(persist) {
            const receipt = readReceipt();
            if (!receipt) return { receipt: null, stale: [] };

            const envelope = PresetStorage.readScopedNativeCache();
            if (!envelope) {
                // Nothing to reconcile against (off-page / foreign scope):
                // report without marking — never guess staleness.
                return { receipt, stale: [], unavailable: true };
            }

            const ids = new Set(envelope.items.map(item => String(item.id)));
            const stale = [];
            receipt.applied.forEach(entry => {
                if (entry && entry.id && !ids.has(String(entry.id)) && stale.indexOf(entry.name) === -1) {
                    stale.push(entry.name);
                }
            });

            if (stale.length && persist) {
                receipt.stale = stale.slice();
                receipt.reconciledAt = Date.now();
                writeReceipt(receipt);
            }
            return { receipt, stale };
        }

        return {
            RECEIPT_KEY,
            run,
            reconcileReceipt,
            sourceLabel: source => SOURCE_LABELS[source] || String(source || '')
        };
    })();

    // ============================================================
