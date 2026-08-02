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

function installTacticsTelemetryEnvelope() {
    if (typeof SnapshotEngine === 'undefined' || !SnapshotEngine || SnapshotEngine.__tacticsTelemetryEnvelopeInstalled) return;

    const TELEMETRY_SCHEMA = 'slf_tactic_telemetry_v1';
    const LIBRARY_VERSION = 'active_presets_v2_bold_policy_v3';
    const MAX_TRANSITIONS = 40;
    const sessions = new Map();

    function clone(value) {
        if (value == null) return null;
        try { return JSON.parse(JSON.stringify(value)); }
        catch (_) { return null; }
    }

    function tacticFingerprint(tactic) {
        if (!tactic || typeof tactic !== 'object') return '';
        const keys = ['def_line','press_line','def_width','press_intense','build_type','build_temp','build_long','build_fast','style','pass_risk','dribble','cross','corner','shot','priority'];
        return keys.map(key => `${key}:${JSON.stringify(tactic[key] ?? null)}`).join('|');
    }

    function detectPreset(tactic) {
        if (!tactic || typeof tactic !== 'object') return null;
        const presets = typeof BASE_PRESETS !== 'undefined' && BASE_PRESETS ? BASE_PRESETS : {};
        const target = tacticFingerprint(tactic);
        return Object.keys(presets).find(name => tacticFingerprint(presets[name]) === target) || null;
    }

    function getRiskAppetite(snapshot, decision) {
        const explicit = decision?.riskAppetite || decision?.action?.riskAppetite || snapshot?.riskAppetite;
        if (explicit) return String(explicit);
        try {
            return localStorage.getItem('slf:tactics:risk-appetite') || window.SLFTacticDirectionPolicy?.defaultRiskAppetite || 'bold';
        } catch (_) {
            return window.SLFTacticDirectionPolicy?.defaultRiskAppetite || 'bold';
        }
    }

    function compactDecision(decision) {
        if (!decision?.action) return null;
        return {
            schema: decision.schema || null,
            generatedAt: decision.generatedAt || Date.now(),
            riskAppetite: decision.riskAppetite || decision.action.riskAppetite || null,
            action: {
                preset: decision.action.preset || null,
                decision: decision.action.decision || null,
                risk: decision.action.risk || null,
                score: Number(decision.action.score || 0),
                reason: decision.action.reason || '',
                guardType: decision.action.guardType || null,
                guardReason: decision.action.guardReason || '',
                emergency: !!decision.action.emergency,
                exploration: !!decision.action.exploration
            },
            confidence: clone(decision.confidence),
            margin: Number(decision.margin || 0),
            exploration: clone(decision.exploration),
            candidates: (decision.candidates || []).map(item => ({
                preset: item.preset,
                score: Number(item.score || 0),
                rawScore: Number(item.rawScore || 0),
                vetoed: !!item.vetoed,
                vetoReasons: Array.isArray(item.vetoReasons) ? item.vetoReasons.slice() : []
            })),
            vetoedPresets: clone(decision.vetoedPresets) || {}
        };
    }

    function getSession(snapshot) {
        const gameId = String(snapshot?.gameId || 'unknown');
        if (!sessions.has(gameId)) {
            sessions.set(gameId, {
                gameId,
                startedAt: Date.now(),
                initialTactic: null,
                initialPreset: null,
                lastFingerprint: '',
                lastPreset: null,
                transitions: []
            });
        }
        if (sessions.size > 8) {
            const oldest = sessions.keys().next().value;
            if (oldest !== gameId) sessions.delete(oldest);
        }
        return sessions.get(gameId);
    }

    function recordTransition(snapshot, source = 'snapshot_observation') {
        if (!snapshot?.gameId || !snapshot.currentTactic) return getSession(snapshot);
        const session = getSession(snapshot);
        const fingerprint = tacticFingerprint(snapshot.currentTactic);
        const preset = detectPreset(snapshot.currentTactic);
        if (!session.initialTactic) {
            session.initialTactic = clone(snapshot.currentTactic);
            session.initialPreset = preset;
        }
        if (fingerprint && fingerprint !== session.lastFingerprint) {
            const decision = compactDecision(snapshot.ruleDecision || STATE?.lastRuleDecision || null);
            session.transitions.push({
                ts: Date.now(),
                minute: snapshot.minute ?? null,
                bucket: snapshot.bucket || null,
                score: clone(snapshot.score),
                source,
                fromPreset: session.lastPreset,
                toPreset: preset,
                tactic: clone(snapshot.currentTactic),
                tacticFingerprint: fingerprint,
                riskAppetite: getRiskAppetite(snapshot, decision),
                recommendation: decision
            });
            session.transitions = session.transitions.slice(-MAX_TRANSITIONS);
            session.lastFingerprint = fingerprint;
            session.lastPreset = preset;
        }
        return session;
    }

    function buildEnvelope(snapshot, source = 'snapshot') {
        const session = recordTransition(snapshot, source);
        const decision = compactDecision(snapshot?.ruleDecision || STATE?.lastRuleDecision || null);
        return {
            schema: TELEMETRY_SCHEMA,
            libraryVersion: LIBRARY_VERSION,
            recommendationSchema: decision?.schema || window.SLFActivePresetRegistry?.ruleDecisionSchema || null,
            riskAppetite: getRiskAppetite(snapshot, decision),
            currentPreset: detectPreset(snapshot?.currentTactic),
            currentTactic: clone(snapshot?.currentTactic),
            currentTacticFingerprint: tacticFingerprint(snapshot?.currentTactic),
            initialPreset: session?.initialPreset || null,
            initialTactic: clone(session?.initialTactic),
            transitionCount: session?.transitions?.length || 0,
            transitions: clone(session?.transitions) || [],
            latestDecision: decision,
            activePresetIds: Array.isArray(window.SLFActivePresetRegistry?.active)
                ? window.SLFActivePresetRegistry.active.slice()
                : [],
            capturedAt: Date.now()
        };
    }

    function enrich(snapshot, source) {
        if (!snapshot || typeof snapshot !== 'object') return snapshot;
        snapshot.tacticTelemetry = buildEnvelope(snapshot, source);
        return snapshot;
    }

    const originalBuild = SnapshotEngine.build.bind(SnapshotEngine);
    SnapshotEngine.build = function buildWithTacticTelemetry() {
        return enrich(originalBuild(), 'snapshot_build');
    };

    const originalBuildSnapshotRecord = SnapshotEngine.buildSnapshotRecord.bind(SnapshotEngine);
    SnapshotEngine.buildSnapshotRecord = function buildSnapshotRecordWithTactics(snapshot) {
        return originalBuildSnapshotRecord(enrich(snapshot, 'match_snapshot'));
    };

    const originalSendMatchResult = SnapshotEngine.sendMatchResult.bind(SnapshotEngine);
    SnapshotEngine.sendMatchResult = function sendMatchResultWithTactics(snapshot) {
        return originalSendMatchResult(enrich(snapshot, 'match_result'));
    };

    const originalCompactStorage = SnapshotEngine.compactSnapshotForStorage.bind(SnapshotEngine);
    SnapshotEngine.compactSnapshotForStorage = function compactSnapshotWithTactics(snapshot) {
        const compact = originalCompactStorage(enrich(snapshot, 'live_state'));
        if (compact) compact.tacticTelemetry = clone(snapshot.tacticTelemetry);
        return compact;
    };

    if (typeof EventTracker !== 'undefined' && EventTracker) {
        const originalCompactRuleDecision = EventTracker.compactRuleDecision.bind(EventTracker);
        EventTracker.compactRuleDecision = function compactRuleDecisionWithBoldTelemetry(decision) {
            return compactDecision(decision) || originalCompactRuleDecision(decision);
        };

        const originalSavePresetEvent = EventTracker.savePresetEvent.bind(EventTracker);
        EventTracker.savePresetEvent = function savePresetEventWithTelemetry(name, preset, beforeSnapshot) {
            enrich(beforeSnapshot, 'preset_apply');
            const result = originalSavePresetEvent(name, preset, beforeSnapshot);
            if (STATE?.pendingPresetEvent) {
                STATE.pendingPresetEvent.schemaVersion = 3;
                STATE.pendingPresetEvent.parserVersion = 'preset_event_generation_v4_tactic_telemetry';
                STATE.pendingPresetEvent.tacticTelemetry = clone(beforeSnapshot?.tacticTelemetry);
            }
            return result;
        };

        const originalBuildPresetEffect = EventTracker.buildPresetEffect.bind(EventTracker);
        EventTracker.buildPresetEffect = function buildPresetEffectWithTelemetry(afterSnapshot) {
            enrich(afterSnapshot, 'preset_effect_after');
            const effect = originalBuildPresetEffect(afterSnapshot);
            if (effect) {
                effect.schemaVersion = 3;
                effect.parserVersion = 'preset_effect_generation_v4_tactic_telemetry';
                effect.tacticTelemetry = clone(afterSnapshot?.tacticTelemetry);
                effect.decisionContext = compactDecision(afterSnapshot?.ruleDecision || effect.decisionContext || STATE?.lastRuleDecision || null);
            }
            return effect;
        };
    }

    SnapshotEngine.__tacticsTelemetryEnvelopeInstalled = true;
    SnapshotEngine.getTacticsTelemetry = snapshot => buildEnvelope(snapshot || SnapshotEngine.build(), 'explicit_read');
}

applyTacticsDropdownUiPolicy();
installTacticsTelemetryEnvelope();

const App = {
    mountUI() {
    UI.addMatchParserPanel();
    // Manual-only Coach Hint mode:
    // - no live parser auto-resume;
    // - no manual tactic watcher freeze/status loop;
    // - tactical blocks are rebuilt only when the user presses "Подсказка".
    // Keep the library module loaded for preset metadata, but do not mount its visible reference panel.
    void TacticPresetLibraryPanel;
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
        // Production exports no page-global API or debug capability.
        // The release builder adds read-only version metadata after App starts.
    }
};

App.start();

})();