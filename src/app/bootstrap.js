// 15. App Bootstrap
// ============================================================

function applyTacticsDropdownUiPolicy() {
    if (typeof UI === 'undefined' || !UI?.addDropdown || UI.__flatSortedTacticDropdownApplied) return;

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
            const option = select.children[index];
            return option && option.tagName === 'OPTION' && option.value === item.key && option.textContent === item.label;
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
            const option = document.createElement('option');
            option.value = item.key;
            option.textContent = item.label;
            select.appendChild(option);
        });

        if (items.some(item => item.key === current)) select.value = current;
        else if (items.length) select.value = items[0].key;

        setTimeout(() => {
            delete select.dataset.slfFlatPresetRewrite;
        }, 0);
    }

    function normalizeDropdown() {
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

    const originalAddDropdown = UI.addDropdown.bind(UI);
    UI.addDropdown = async function addFlatSortedTacticDropdown() {
        const result = await originalAddDropdown.apply(UI, arguments);
        normalizeDropdown();
        return result;
    };
    UI.__flatSortedTacticDropdownApplied = true;
}

applyTacticsDropdownUiPolicy();

const App = {
    mountUI() {
    UI.addMatchParserPanel();
    // Manual-only Coach Hint mode:
    // - no live parser auto-resume;
    // - no manual tactic watcher freeze/status loop;
    // - tactical blocks are rebuilt only when the user presses "Подсказка".
    TacticPresetLibraryPanel.mount();
    TrainingGuidePanel.mount();
    LoanLimitPanel.mount();


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
            scriptVersion: SLF_VERSION_INFO.scriptVersion,
            versionInfo: {
                scriptVersion: SLF_VERSION_INFO.scriptVersion,
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
            TacticPresetLibraryPanel,
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
            }
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
