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
            .map(([key, label]) => ({ key, label: String(label || key), trainer: getTrainerSortKey(key, label) }))
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
        setTimeout(() => { delete select.dataset.slfFlatPresetRewrite; }, 0);
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

function installFinishedResultGuard() {
    if (typeof SnapshotEngine === 'undefined' || SnapshotEngine.__finishedResultGuardInstalled) return;
    const originalSendMatchResult = SnapshotEngine.sendMatchResult.bind(SnapshotEngine);
    SnapshotEngine.sendMatchResult = function sendFinishedMatchResult(snapshot) {
        if (!snapshot || snapshot.status !== 'finished') {
            const error = new Error('Match result can be sent only after the match is finished');
            error.name = 'SLFMatchStateError';
            error.kind = 'invalid_match_state';
            return Promise.reject(error);
        }
        return originalSendMatchResult(snapshot);
    };
    SnapshotEngine.__finishedResultGuardInstalled = true;
}

function installTelemetryObservers() {
    installFinishedResultGuard();
    if (typeof EventTracker !== 'undefined' && EventTracker.startManualTacticWatcher) {
        EventTracker.startManualTacticWatcher();
    }
}

applyTacticsDropdownUiPolicy();
installFinishedResultGuard();

const App = {
    mountUI() {
        UI.addMatchParserPanel();
        // Coach Hint and tactic application remain manual. The manual tactic watcher is
        // telemetry-only: it observes owned-match controls and never applies a tactic,
        // starts the live parser or refreshes recommendations.
        installTelemetryObservers();
        void TacticPresetLibraryPanel;
        TrainingGuidePanel.mount();
        LoanLimitPanel.mount();
        if (!document.getElementById('slf-tactics-dropdown')) {
            UI.addDropdown();
        }
    },

    start() {
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
        // Production exports no page-global API or debug capability.
        // The release builder adds read-only version metadata after App starts.
    }
};

App.start();

})();