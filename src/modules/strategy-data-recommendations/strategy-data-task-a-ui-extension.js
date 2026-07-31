// 10.1 Strategy Data Task A UI extension
// ============================================================

(function strategyDataTaskAExtension() {
    'use strict';

    const GENERATOR_VERSION = '5.61';

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

    function patchLateLosingPressCooldownGuard() {
        if (typeof RecommendationEngine === 'undefined' || RecommendationEngine.__lateLosingPressCooldownGuardV3) return;
        // The scored 4.4.246 policy already handles late losing, fatigue, vetoes and emergency overrides.
        // Do not wrap it with the legacy first-match override.
        if (RecommendationEngine.__generator561RuleScorerApplied) {
            RecommendationEngine.__lateLosingPressCooldownGuardV3 = true;
            return;
        }
        if (typeof RecommendationEngine.selectRawPreset !== 'function') return;

        const original = RecommendationEngine.selectRawPreset;
        RecommendationEngine.selectRawPreset = function(snapshot, state) {
            const candidate = original.apply(this, arguments);
            if (candidate?.name !== 'Pep_PressCooldown_bal2') return candidate;
            if (!state?.pressFatigue?.active) return candidate;

            const score = state.score || this.getScoreState(snapshot);
            const minute = Number(state.minute ?? this.getEffectiveMinute(snapshot));
            if (score?.state !== 'losing' || !Number.isFinite(minute) || minute < 75) return candidate;

            const myBad = Number(state.myBad || 0);
            return {
                name: myBad > 0 && myBad <= 16 ? 'Pep_TwoThreeFive_att3' : 'Pep_ControlledPush_att3',
                reason: 'legacy late override: нужен гол, но fatigue исключает автоматический chaos press'
            };
        };

        RecommendationEngine.__lateLosingPressCooldownGuard = true;
        RecommendationEngine.__lateLosingPressCooldownGuardV2 = true;
        RecommendationEngine.__lateLosingPressCooldownGuardV3 = true;
    }

    function finiteNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function statValue(stats, keys) {
        for (const key of keys) {
            const value = finiteNumber(stats?.[key]);
            if (value !== null) return value;
        }
        return null;
    }

    function buildCompactContext(snapshot) {
        const pack = RecommendationEngine.getTeamStats(snapshot);
        const my = pack?.my?.stats || null;
        const opp = pack?.opp?.stats || null;
        const score = RecommendationEngine.getScoreState(snapshot);
        const minute = RecommendationEngine.getEffectiveMinute(snapshot);
        const decisionSignals = snapshot?.ruleDecision?.moment?.context || null;
        const parts = [];

        if (minute) parts.push(`${minute}'`);
        if (score?.known) parts.push(`${score.myGoals}:${score.oppGoals}`);

        const myXg = statValue(my, ['xG']);
        const oppXg = statValue(opp, ['xG']);
        if (myXg !== null && oppXg !== null) parts.push(`xG ${myXg.toFixed(2)}–${oppXg.toFixed(2)}`);

        const myPower = statValue(my, ['power']);
        const oppPower = statValue(opp, ['power']);
        if (myPower !== null && oppPower !== null) {
            const gap = myPower - oppPower;
            const drop = finiteNumber(decisionSignals?.myPowerDropPct);
            const dropText = drop !== null && drop > 0 ? `; падение ${drop.toFixed(1)}%` : '';
            parts.push(`сила ${Math.round(myPower)}–${Math.round(oppPower)} (${gap >= 0 ? '+' : ''}${Math.round(gap)}${dropText})`);
        }

        const myDef = statValue(my, ['defVector']);
        const myPress = statValue(my, ['pressVector']);
        const oppDef = statValue(opp, ['defVector']);
        const oppPress = statValue(opp, ['pressVector']);
        if (myDef !== null && myPress !== null) {
            const opponentText = oppDef !== null && oppPress !== null ? `; соп. ${Math.round(oppDef)}/${Math.round(oppPress)}` : '';
            parts.push(`векторы об/пр ${Math.round(myDef)}/${Math.round(myPress)}${opponentText}`);
        }

        const bad = statValue(my, ['badActionsPct', 'defective']);
        if (bad !== null && bad > 0) parts.push(`брак ${Math.round(bad)}%`);

        return parts.join(' · ');
    }

    function pickGeneratorSignals(rows) {
        return (Array.isArray(rows) ? rows : [])
            .map(row => String(row || '').trim())
            .filter(row => row && !row.includes('Детали «подробнее»'))
            .sort((a, b) => {
                const rank = row => row.includes('Каналы генератора') ? 0 : row.startsWith('Генератор:') ? 1 : 2;
                return rank(a) - rank(b);
            })
            .slice(0, 2);
    }

    function resolveRecommendedPresetName(snapshot, primaryPresetName) {
        if (snapshot?.ruleDecision?.action?.preset) return snapshot.ruleDecision.action.preset;
        if (primaryPresetName) return primaryPresetName;
        const progression = STATE?.presetProgression || null;
        if (!progression) return '';
        if (String(progression.gameId || '') !== String(snapshot?.gameId || '')) return '';
        return progression.lastRecommendedPreset || progression.lastAppliedPreset || '';
    }

    function buildRecommendedAction(snapshot, primaryPresetName) {
        const presetName = resolveRecommendedPresetName(snapshot, primaryPresetName);
        if (!presetName) return 'Сохранить текущую тактику.';

        const title = RecommendationEngine.getPresetTitle(presetName) || presetName;
        const scheme = RecommendationEngine.getPresetScheme(presetName);
        return scheme ? `${title}. Схема: ${scheme}.` : `${title}.`;
    }

    function formatDecisionReason(reason) {
        const text = String(reason || '').trim();
        return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
    }

    function buildDecisionExplanation(snapshot) {
        const decision = snapshot?.ruleDecision;
        if (!decision?.action) return '';

        const confidence = decision.confidence?.level || 'low';
        const confidenceLabel = confidence === 'high' ? 'высокая' : confidence === 'medium' ? 'средняя' : 'низкая';
        const modeLabels = {
            front_foot_squeeze: 'раннее давление',
            active_control: 'активный контроль',
            compact_counter_control: 'компактность и контратака',
            controlled_chase: 'контролируемая погоня',
            emergency_lock: 'аварийное удержание'
        };
        const mode = modeLabels[decision.action.decision] || decision.action.decision || 'активный контроль';
        const reason = formatDecisionReason(decision.action.reason);
        const guard = decision.action.guardType && decision.action.guardType !== 'top_score'
            ? ` Ограничитель: ${decision.action.guardReason}.`
            : '';
        return `Режим: ${mode}. Уверенность: ${confidenceLabel}; разрыв ${Number(decision.margin || 0).toFixed(1)}. ${reason}.${guard}`;
    }

    function buildCandidateSummary(snapshot) {
        const rows = (snapshot?.ruleDecision?.candidates || [])
            .filter(item => !item.vetoed)
            .slice(0, 3);
        if (!rows.length) return '';
        return rows.map(item => {
            const title = RecommendationEngine.getPresetTitle(item.preset) || item.preset;
            return `${title} ${item.score >= 0 ? '+' : ''}${Number(item.score || 0).toFixed(1)}`;
        }).join(' · ');
    }

    function patchCompactCoachMode() {
        if (typeof RecommendationEngine === 'undefined' || RecommendationEngine.__compactCoachModePatchedV4) return;

        RecommendationEngine.compactPlan = function compactCoachPlan(plan, snapshot, primaryPresetName = '') {
            const clean = this.normalizePlan(plan);
            const context = buildCompactContext(snapshot);
            const signalText = pickGeneratorSignals(clean.developer).join(' ');
            const actionText = buildRecommendedAction(snapshot, primaryPresetName);
            const decisionText = buildDecisionExplanation(snapshot);
            const candidateText = buildCandidateSummary(snapshot);

            return `
                <div data-slf-rec-priority="1" data-slf-rec-section="combined" style="margin:5px 0;background:#151515;border:1px solid #444;border-radius:5px;color:#ddd;padding:9px;">
                    <div style="font-weight:bold;color:#75ff75;text-align:center;margin-bottom:7px;">Подсказка</div>
                    ${context ? `<div style="line-height:1.4;"><b style="color:#8fd3ff;">Ситуация:</b> ${this.escapeHtml(context)}</div>` : ''}
                    ${signalText ? `<div style="line-height:1.4;margin-top:5px;"><b style="color:#c8ff7a;">Сигналы:</b> ${this.escapeHtml(signalText)}</div>` : ''}
                    <div style="line-height:1.4;margin-top:5px;"><b style="color:#75ff75;">Действие:</b> ${this.escapeHtml(actionText)}</div>
                    ${decisionText ? `<div style="line-height:1.4;margin-top:5px;"><b style="color:#ffd76a;">Решение:</b> ${this.escapeHtml(decisionText)}</div>` : ''}
                    ${candidateText ? `<div style="line-height:1.4;margin-top:5px;opacity:.85;"><b>Кандидаты:</b> ${this.escapeHtml(candidateText)}</div>` : ''}
                </div>`;
        };

        RecommendationEngine.__compactCoachModePatched = true;
        RecommendationEngine.__compactCoachModePatchedV2 = true;
        RecommendationEngine.__compactCoachModePatchedV3 = true;
        RecommendationEngine.__compactCoachModePatchedV4 = true;
    }

    function resetLiveOnlyRecommendationState() {
        if (typeof STATE === 'undefined') return;
        STATE.recommendationFreeze = null;
        // Keep pendingPresetEvent until the target generation window is reached.
        STATE.liveWaitStatus = null;
    }

    function submitManualTelemetry(snapshot) {
        if (typeof SnapshotEngine?.submitManualTelemetry !== 'function') return;
        SnapshotEngine.submitManualTelemetry(snapshot, GENERATOR_VERSION);
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
        STATE.lastRuleDecision = snapshot?.ruleDecision || STATE.lastRuleDecision || null;
        STATE.lastRecommendationMeta = {
            schema: 'slf_manual_hint_render_v2',
            savedAt: Date.now(),
            gameId: snapshot?.gameId || MatchStateParser.getGameId(),
            bucket: snapshot?.bucket || '',
            minute: snapshot?.minute ?? null,
            source: 'manual_hint_button',
            generatorVersion: GENERATOR_VERSION,
            recommendedPreset: snapshot?.ruleDecision?.action?.preset || null,
            confidence: snapshot?.ruleDecision?.confidence || null,
            margin: snapshot?.ruleDecision?.margin ?? null
        };
    }

    function renderManualRecommendation() {
        resetLiveOnlyRecommendationState();

        const snapshot = normalizeForeignSnapshot(SnapshotEngine.build());
        if (!snapshot) return;

        snapshot.recommendationSource = 'manual_hint_button';
        snapshot.manualRecommendationRefresh = true;
        snapshot.generatorVersion = GENERATOR_VERSION;

        if (typeof SnapshotEngine !== 'undefined' && SnapshotEngine.rememberLiveSnapshot) {
            SnapshotEngine.rememberLiveSnapshot(snapshot);
        }

        const el = document.getElementById('slf-parser-recommendation');
        // Build the scored recommendation before sending telemetry so the same snapshot
        // contains candidate scores, veto reasons, vectors and confidence.
        const html = buildManualRecommendationHtml(snapshot);
        if (el) el.innerHTML = html;
        rememberManualRecommendation(html, snapshot);
        submitManualTelemetry(snapshot);

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
        btn.title = 'Собрать текущий snapshot и показать rule-based подсказку по текущему состоянию';
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
        patchCompactCoachMode();
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
