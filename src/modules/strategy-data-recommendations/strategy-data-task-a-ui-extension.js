// 10.1 Strategy Data Task A UI extension
// ============================================================

(function strategyDataTaskAExtension() {
    'use strict';

    function getFallbackTargetTeam(snapshot) {
        const teams = Array.isArray(snapshot?.teams) ? snapshot.teams : [];
        if (!teams.length) return null;
        const selector = document.getElementById('slf-foreign-match-target');
        const side = selector?.value || 'home';
        return side === 'away' ? teams[1] : teams[0];
    }

    function normalizeForeignSnapshot(snapshot) {
        if (!snapshot || snapshot.myTeam || !Array.isArray(snapshot.teams) || snapshot.teams.length < 2) return snapshot;
        const targetTeam = getFallbackTargetTeam(snapshot);
        if (!targetTeam) return snapshot;

        snapshot.matchOwnership = 'foreign';
        snapshot.targetSide = Number(snapshot.teams[1]) === Number(targetTeam) ? 'away' : 'home';
        snapshot.myTeam = targetTeam;
        return snapshot;
    }

    function patchSnapshotBuild() {
        if (typeof SnapshotEngine === 'undefined' || SnapshotEngine.__taskAPatchedBuild) return;
        const originalBuild = SnapshotEngine.build;
        SnapshotEngine.build = function patchedTaskABuild() {
            return normalizeForeignSnapshot(originalBuild.apply(this, arguments));
        };
        SnapshotEngine.__taskAPatchedBuild = true;
    }

    function patchHasEnoughLiveData() {
        if (typeof RecommendationEngine === 'undefined' || RecommendationEngine.__taskAPatchedLiveGate) return;
        const originalHasEnoughLiveData = RecommendationEngine.hasEnoughLiveData;
        RecommendationEngine.hasEnoughLiveData = function patchedTaskAHasEnoughLiveData(snapshot) {
            const gate = originalHasEnoughLiveData.apply(this, arguments);
            const minute = this.getEffectiveMinute(snapshot);

            if (gate?.phase === 'collect' && Number.isFinite(minute) && minute >= 10) {
                return { ok: true, phase: 'pre_window' };
            }

            if (gate?.phase === 'collect') {
                return Object.assign({}, gate, {
                    reason: 'Сбор данных до первого pre-window. Первая предварительная рекомендация появится с 10-й минуты, чтобы подготовить смену до 15-й.'
                });
            }

            return gate;
        };
        RecommendationEngine.__taskAPatchedLiveGate = true;
    }

    function getPresetOptionPair(name) {
        if (!name || typeof RecommendationEngine === 'undefined') return { cautious: '', aggressive: '' };

        const group = RecommendationEngine.getPresetGroup(name);
        const ladder = RecommendationEngine.getPresetLadder(group);
        const index = ladder.indexOf(name);
        if (index < 0) return { cautious: '', aggressive: '' };

        if (group === 'defensive') {
            return {
                cautious: ladder[index + 1] || '',
                aggressive: ladder[index - 1] || ''
            };
        }

        return {
            cautious: ladder[index - 1] || '',
            aggressive: ladder[index + 1] || ''
        };
    }

    function appendPresetOptions(plan, name) {
        if (!plan || !Array.isArray(plan.preset) || !name || typeof RecommendationEngine === 'undefined') return;

        const options = getPresetOptionPair(name);
        const rows = [];

        if (options.cautious) rows.push(`Осторожнее: ${RecommendationEngine.getPresetTitle(options.cautious)}.`);
        if (options.aggressive) rows.push(`Агрессивнее: ${RecommendationEngine.getPresetTitle(options.aggressive)}.`);

        rows.forEach(row => {
            if (!plan.preset.includes(row)) plan.preset.push(row);
        });
    }

    function patchPresetOptions() {
        if (typeof RecommendationEngine === 'undefined' || RecommendationEngine.__taskBPatchedPresetOptions) return;
        const originalSelectPreset = RecommendationEngine.selectPreset;
        RecommendationEngine.selectPreset = function patchedTaskBSelectPreset(snapshot, my, opp, playerSignals, plan, state) {
            const selectedName = originalSelectPreset.apply(this, arguments);
            appendPresetOptions(plan, selectedName);
            return selectedName;
        };
        RecommendationEngine.__taskBPatchedPresetOptions = true;
    }

    function patchLateLosingPressCooldownGuard() {
        if (typeof RecommendationEngine === 'undefined' || RecommendationEngine.__lateLosingPressCooldownGuard) return;
        if (typeof RecommendationEngine.selectRawPreset !== 'function') return;

        const original = RecommendationEngine.selectRawPreset;

        RecommendationEngine.selectRawPreset = function(snapshot, state) {
            const candidate = original.apply(this, arguments);

            if (candidate?.name !== 'Pep_PressCooldown_bal2') return candidate;
            if (!state?.pressFatigue?.active) return candidate;

            const score = state.score || this.getScoreState(snapshot);
            const minute = Number(state.minute ?? this.getEffectiveMinute(snapshot));

            if (score?.state !== 'losing' || !Number.isFinite(minute) || minute < 75) {
                return candidate;
            }

            const myBad = Number(state.myBad || 0);
            const finalLosing = minute >= 80;
            const lastApplied = STATE?.presetProgression?.lastAppliedPreset || '';
            const currentIsChaos = lastApplied === 'Bielsa_ChaosPress_att5';

            if (finalLosing && currentIsChaos && myBad < 26) {
                return {
                    name: 'Bielsa_ChaosPress_att5',
                    reason: 'late game override: preserve chaos press'
                };
            }

            if (finalLosing) {
                return {
                    name: myBad >= 24 ? 'Klopp_Gegenpress_att4' : 'Bielsa_ChaosPress_att5',
                    reason: 'final losing state adjustment'
                };
            }

            return {
                name: myBad >= 24 ? 'Pep_ControlledPush_att3' : 'Klopp_Gegenpress_att4',
                reason: 'late losing override'
            };
        };

        RecommendationEngine.__lateLosingPressCooldownGuard = true;
    }

    function resetLiveOnlyRecommendationState() {
        if (typeof STATE === 'undefined') return;
        STATE.recommendationFreeze = null;
        STATE.pendingPresetEvent = null;
        STATE.liveWaitStatus = null;
    }

    function buildManualRecommendationHtml(snapshot) {
        if (typeof RecommendationEngine === 'undefined') {
            return '<div style="padding:7px 9px;background:#181818;border:1px solid #444;border-radius:5px;color:#ddd;">RecommendationEngine недоступен.</div>';
        }

        return RecommendationEngine.make(snapshot);
    }

    function rememberManualRecommendation(html, snapshot) {
        if (typeof STATE === 'undefined' || typeof RecommendationEngine === 'undefined') return;
        if (RecommendationEngine.isPlaceholderHtml && RecommendationEngine.isPlaceholderHtml(html)) return;

        STATE.lastRecommendationHtml = html;
        STATE.lastRecommendationMeta = {
            schema: 'slf_manual_hint_render_v1',
            savedAt: Date.now(),
            gameId: snapshot?.gameId || MatchStateParser.getGameId(),
            bucket: snapshot?.bucket || '',
            minute: snapshot?.minute ?? null,
            source: 'manual_hint_button'
        };
    }

    function renderManualRecommendation() {
        resetLiveOnlyRecommendationState();

        const snapshot = normalizeForeignSnapshot(SnapshotEngine.build());
        if (!snapshot) return;

        snapshot.recommendationSource = 'manual_hint_button';
        snapshot.manualRecommendationRefresh = true;

        if (typeof SnapshotEngine !== 'undefined' && SnapshotEngine.rememberLiveSnapshot) {
            SnapshotEngine.rememberLiveSnapshot(snapshot);
        }

        const el = document.getElementById('slf-parser-recommendation');
        const html = buildManualRecommendationHtml(snapshot);

        if (el) el.innerHTML = html;
        rememberManualRecommendation(html, snapshot);

        UI.addParserLog('Подсказка обновлена по текущему snapshot');
        UI.updateParserStatus('Подсказка обновлена вручную');
    }

    function mountManualButton() {
        if (!location.pathname.includes('/game.php')) return;
        const panel = document.getElementById('slf-match-parser-panel');
        if (!panel || document.getElementById('slf-manual-recommendation-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'slf-manual-recommendation-btn';
        btn.type = 'button';
        btn.textContent = '↻ Подсказка';
        btn.title = 'Собрать текущий snapshot и показать подсказку по текущему состоянию';
        btn.style.cssText = 'padding:5px 8px;background:#345;color:#fff;border:1px solid #79a;border-radius:3px;cursor:pointer;';
        btn.onclick = () => {
            btn.disabled = true;
            try {
                renderManualRecommendation();
            } catch (error) {
                console.error('[SLF] Manual recommendation refresh failed', error);
                UI.addParserLog('Подсказка: ошибка, см. console');
            } finally {
                btn.disabled = false;
            }
        };

        const status = document.getElementById('slf-parser-status');
        panel.insertBefore(btn, status || null);
    }

    function mountForeignSelector() {
        if (!location.pathname.includes('/game.php')) return;
        const panel = document.getElementById('slf-match-parser-panel');
        if (!panel || document.getElementById('slf-foreign-match-target')) return;

        const snapshot = SnapshotEngine.build();
        if (!snapshot || snapshot.matchOwnership !== 'foreign') return;

        const select = document.createElement('select');
        select.id = 'slf-foreign-match-target';
        select.title = 'Тестовый режим чужого матча: выбрать сторону для подсказок';
        select.style.cssText = 'padding:4px 6px;background:#333;color:#fff;border:1px solid #777;border-radius:3px;';
        select.innerHTML = '<option value="home">Анализ: хозяева</option><option value="away">Анализ: гости</option>';
        select.onchange = () => renderManualRecommendation();

        const status = document.getElementById('slf-parser-status');
        panel.insertBefore(select, status || null);
    }

    function mount() {
        patchSnapshotBuild();
        patchHasEnoughLiveData();
        patchLateLosingPressCooldownGuard();
        patchPresetOptions();
        mountManualButton();
        mountForeignSelector();
    }

    const originalAddMatchParserPanel = UI.addMatchParserPanel;
    UI.addMatchParserPanel = function patchedTaskAAddMatchParserPanel() {
        const result = originalAddMatchParserPanel.apply(this, arguments);
        mount();
        return result;
    };

    mount();
})();

// ============================================================
