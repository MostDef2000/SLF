// 15. App Bootstrap
// ============================================================

const App = {
    mountUI() {
    UI.addMatchParserPanel();
    SnapshotEngine.autoResumeIfNeeded();
    DataInspector.addGlobalMenuButton();
    TrainingGuidePanel.mount();
    LoanLimitPanel.mount();
    PlayerStatusPanel.mount();
    EventTracker.startManualTacticWatcher();


    if (!document.getElementById('slf-tactics-dropdown')) {
        UI.addDropdown();
    }
},

    start() {
        // Важно: трансферный анализатор живёт отдельно от общего UI.
        // В 4.4.4 при удалении Team4 Analyzer этот вызов был случайно потерян,
        // поэтому панель на transfers.php не монтировалась.
        TransferMarketAnalyzer.start();

        PresetStorage.loadFromServerAndMerge(() => {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this.mountUI();
                    DomUtils.installObserver(() => this.mountUI());
                });
            } else {
                this.mountUI();
                DomUtils.installObserver(() => this.mountUI());
            }
        });
        const SLF_DEBUG_EXPORT = {
            scriptVersion: '4.4.72',
            versionInfo: {
                scriptVersion: '4.4.72',
                canonicalCollections: CONFIG.COLLECTIONS,
                legacyCollections: CONFIG.LEGACY_COLLECTIONS,
                aliases: CONFIG.COLLECTION_ALIASES
            },
            buildMatchSnapshot: () => SnapshotEngine.build(),
            readFormation: () => SquadParser.readFormation(),
            readLineupRows: () => SquadParser.readLineupRows(),
            getCurrentTactic,
            parsePlayerText: text => SquadParser.parsePlayerText(text),

            MatchStateParser,
            MatchTimingModel,
            MatchStatsParser,
            SquadParser,
            SnapshotEngine,
            EventTracker,
            RecommendationEngine,
            DataInspector,
            YouthExternalMonitor,
            YouthApplicationAutofill,
            TMEnrichmentLayer,
            SLFAlterLayer,
            TransferMarketAnalyzer,
            TrainingGuidePanel,

            readCollection(collection = 'transfer_history', limit = 5) {
                const requestedCollection = collection;
                const actualCollection = CONFIG.COLLECTION_ALIASES?.[collection] || collection;

                if (requestedCollection !== actualCollection) {
                    console.log(`[SLF DEBUG] ${requestedCollection} redirected to ${actualCollection}`);
                }

                return new Promise((resolve, reject) => {
                    Api.get(
                        actualCollection,
                        data => {
                            const count = Array.isArray(data) ? data.length : null;
                            const tail = Array.isArray(data) ? data.slice(-limit) : data;

                            console.log(`[SLF DEBUG] ${actualCollection} count:`, count ?? data);
                            console.log(`[SLF DEBUG] ${actualCollection} last ${limit}:`, tail);

                            resolve(data);
                        },
                        error => {
                            console.warn(`[SLF DEBUG] ${actualCollection} read error:`, error);
                            reject(error);
                        }
                    );
                });
            },

            readLegacyCollection(collection, limit = 5) {
                return new Promise((resolve, reject) => {
                    Api.get(
                        collection,
                        data => {
                            const count = Array.isArray(data) ? data.length : null;
                            const tail = Array.isArray(data) ? data.slice(-limit) : data;

                            console.log(`[SLF DEBUG LEGACY] ${collection} count:`, count ?? data);
                            console.log(`[SLF DEBUG LEGACY] ${collection} last ${limit}:`, tail);

                            resolve(data);
                        },
                        error => {
                            console.warn(`[SLF DEBUG LEGACY] ${collection} read error:`, error);
                            reject(error);
                        }
                    );
                });
            },

            getCanonicalApiStatus() {
                return fetchCanonicalApiStatus().then(status => {
                    console.log('[SLF DEBUG] canonical API status:', status);
                    return status;
                });
            },

            clearLegacyCollections(confirmText = '') {
                if (confirmText !== 'DELETE LEGACY') {
                    console.warn('[SLF DEBUG] Legacy cleanup blocked. Run: SLF_DEBUG.clearLegacyCollections("DELETE LEGACY")');
                    return Promise.resolve({ ok: false, reason: 'confirmation_required' });
                }

                const names = legacyCollectionNames();
                console.warn('[SLF DEBUG] Clearing legacy collections:', names);

                return Promise.all(names.map(name => {
                    return Api.clearCollection(name, `legacy ${name} cleared`)
                        .then(result => ({ collection: name, ok: true, status: result.status }))
                        .catch(error => ({ collection: name, ok: false, error }));
                })).then(results => {
                    console.log('[SLF DEBUG] legacy cleanup results:', results);
                    return results;
                });
            },

            clearLegacy(confirmText = '') {
                return this.clearLegacyCollections(confirmText);
            },

            deleteLegacyCollections(confirmText = '') {
                return this.clearLegacyCollections(confirmText);
            },

            resetLegacyCollections(confirmText = '') {
                return this.clearLegacyCollections(confirmText);
            },

            clearLegacyMatchCollections(confirmText = '') {
                return this.clearLegacyCollections(confirmText);
            },

            readTransferHistory(limit = 5) {
                return this.readCollection('transfer_history', limit);
            },

            checkYouthPlayer: tmId => YouthExternalMonitor.checkSlfExists(tmId)
        };

        window.SLF_DEBUG = SLF_DEBUG_EXPORT;
        window.SLF = SLF_DEBUG_EXPORT;
        window.slf = SLF_DEBUG_EXPORT;

        try {
            if (typeof unsafeWindow !== 'undefined') {
                unsafeWindow.SLF_DEBUG = SLF_DEBUG_EXPORT;
                unsafeWindow.SLF = SLF_DEBUG_EXPORT;
                unsafeWindow.slf = SLF_DEBUG_EXPORT;
            }
        } catch (e) {
            console.warn('[SLF DEBUG] unsafeWindow export failed', e);
        }
    }
};

App.start();

})();
