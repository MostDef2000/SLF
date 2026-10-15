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

    // ============================================================
    // Final merged tactic recommendation (#350): the v11 preset (base)
    // merged with the Dave 5.6 etalon (situational overrides) into ONE
    // «Рекомендация» block with a single «Применить» button. The block is
    // display-only here; the button is the ONLY trigger and the v11 preset
    // engine / direction policy (autoApply:false) is untouched.
    // ============================================================

    const FINAL_CONTROL_LABELS = {
        def_line: 'линия', press_line: 'прессинг', def_width: 'ширина', press_intense: 'интенс',
        build_type: 'выход', build_temp: 'темп', build_long: 'диаг', build_fast: 'касание',
        style: 'стиль', pass_risk: 'риск', dribble: 'дриблинг', cross: 'кроссы',
        corner: 'угловые', shot: 'удары', priority: 'фланги'
    };
    const FINAL_GROUP_KEYS = {
        defense: ['def_line', 'press_line', 'def_width', 'press_intense'],
        buildup: ['build_type', 'build_temp', 'build_long', 'build_fast'],
        style: ['style'],
        attack: ['pass_risk', 'dribble', 'cross', 'corner', 'shot']
    };
    const FINAL_GROUP_LABELS = { defense: 'оборона', buildup: 'построение', style: 'стиль', attack: 'атака' };
    const FINAL_INSUFFICIENT_LABELS = {
        score_state: 'счёт не определён',
        def_press_vectors: 'векторы об/пр недоступны',
        fouls: 'фолы недоступны',
        xg: 'xG недоступен',
        b10_lane_play: 'игра через «столба» не распознаётся',
        exception: 'ошибка вычисления',
        etalon_layer_absent: 'эталон недоступен',
        stale_preset_name: 'пресет не найден в реестре'
    };
    const FINAL_LANE_LABELS = { left: 'Л', center: 'Ц', right: 'П' };

    function etalonEscape(value) {
        return RecommendationEngine.escapeHtml ? RecommendationEngine.escapeHtml(value) : String(value ?? '');
    }

    function safeGetCurrentTactic() {
        try {
            return typeof getCurrentTactic === 'function' ? getCurrentTactic() : null;
        } catch (_) {
            return null;
        }
    }

    function etalonPriorityEquals(a, b) {
        const norm = value => (Array.isArray(value) ? value : []).map(String).sort().join(',');
        return norm(a) === norm(b);
    }

    function etalonVectorMatchesCurrent(vector, current) {
        if (!vector || !current) return false;
        return Object.entries(vector).every(([key, value]) => key === 'priority'
            ? etalonPriorityEquals(value, current.priority)
            : String(current[key] ?? '') === String(value));
    }

    function finalTacticApplyVector(rec) {
        const vector = rec?.vector;
        if (!vector || typeof vector !== 'object' || !Object.keys(vector).length) return null;
        const copy = {};
        for (const [key, value] of Object.entries(vector)) {
            copy[key] = key === 'priority' ? (Array.isArray(value) ? value.slice() : value) : value;
        }
        return copy;
    }

    function finalTacticSourceMissing(rec) {
        return rec?.schema !== 'slf_final_tactic_v1';
    }

    function finalTacticVectorSummary(rec) {
        const vector = rec?.vector || {};
        const parts = [];
        for (const [group, keys] of Object.entries(FINAL_GROUP_KEYS)) {
            const present = keys.filter(key => vector[key] !== undefined && vector[key] !== null);
            if (!present.length) continue;
            const label = FINAL_GROUP_LABELS[group] || group;
            if (present.length === 1) {
                parts.push(`${label}: ${vector[present[0]]}`);
            } else {
                const names = present.map(key => FINAL_CONTROL_LABELS[key] || key).join('/');
                const values = present.map(key => vector[key]).join('/');
                parts.push(`${label} ${names}: ${values}`);
            }
        }
        const lanes = Array.isArray(vector.priority) && vector.priority.length
            ? vector.priority.map(lane => FINAL_LANE_LABELS[lane] || lane).join('+')
            : null;
        if (lanes) parts.push(`фланги: ${lanes}`);
        return parts.join(' · ');
    }

    function finalTacticProvenanceText(rec) {
        const overrides = rec?.overrides || {};
        const etalonText = `эталон ${(Array.isArray(rec?.etalonIds) ? rec.etalonIds : []).join('+')}`;
        const presetText = `пресет ${rec?.presetId || '?'}`;
        const render = value => {
            if (typeof value === 'string' && value.startsWith('etalon')) return etalonText;
            if (value === 'current') return 'текущая тактика';
            return presetText;
        };
        const groups = [
            ['оборона', overrides.defense],
            ['построение', overrides.buildup],
            ['стиль', overrides.style],
            ['атака', overrides.attack]
        ];
        const parts = [];
        let currentText = null;
        let bucket = [];
        for (const [label, value] of groups) {
            const text = render(value);
            if (!currentText) {
                currentText = text;
                bucket = [label];
            } else if (text === currentText) {
                bucket.push(label);
            } else {
                parts.push(`${bucket.join('/')} ← ${currentText}`);
                currentText = text;
                bucket = [label];
            }
        }
        if (bucket.length) parts.push(`${bucket.join('/')} ← ${currentText}`);
        return parts.join(' · ');
    }

    function finalTacticInsufficientText(rec) {
        const keys = Array.isArray(rec?.insufficientData) ? rec.insufficientData : [];
        // b10_lane_play is a permanent known limitation of the etalon data —
        // it is pushed unconditionally by the etalon layer; surfacing it on
        // every recommendation (even a confident T5) is noise. Telemetry keeps
        // the full list; display filters it.
        return keys.filter(key => key !== 'b10_lane_play')
            .map(key => FINAL_INSUFFICIENT_LABELS[key] || key).filter(Boolean).join(', ');
    }

    function finalTacticDeltaText(rec, snapshot) {
        let delta = Array.isArray(rec?.deltaVsCurrent) ? rec.deltaVsCurrent : null;
        if (!delta) {
            const current = safeGetCurrentTactic();
            const vector = finalTacticApplyVector(rec);
            if (current && vector) {
                delta = Object.entries(vector)
                    .filter(([key, value]) => key === 'priority'
                        ? !etalonPriorityEquals(value, current.priority)
                        : String(current[key] ?? '') !== String(value))
                    .map(([key, value]) => ({
                        key,
                        from: key === 'priority' ? (current.priority || []).join('+') : current[key] ?? null,
                        to: key === 'priority' ? value.join('+') : value
                    }));
            }
        }
        if (!delta || !delta.length) return '';
        return delta.map(item => `${FINAL_CONTROL_LABELS[item.key] || item.key} ${item.from ?? '?'}→${item.to}`).join(' · ');
    }

    function finalTacticRenderState(snapshot, rec) {
        const vector = finalTacticApplyVector(rec);
        if (!vector) return null;

        const current = safeGetCurrentTactic();
        if (current && etalonVectorMatchesCurrent(vector, current)) {
            return { status: 'already_applied', label: 'Уже применено', disabled: true, title: 'Рекомендованный вектор уже совпадает с текущей тактикой' };
        }
        if (snapshot?.matchOwnership === 'foreign') {
            return { status: 'idle', label: 'Применить', disabled: true, title: 'Чужой матч — применение тактики недоступно' };
        }
        if (snapshot?.status === 'finished') {
            return { status: 'idle', label: 'Применить', disabled: true, title: 'Матч завершён — применение недоступно' };
        }
        if (typeof STATE !== 'undefined' && STATE?.tacticControlBridgeApplyInProgress) {
            return { status: 'idle', label: 'Применить', disabled: true, title: 'Идёт применение тактики — подождите' };
        }
        return { status: 'idle', label: 'Применить', disabled: false, title: 'Применить итоговую рекомендацию одним кликом' };
    }

    function rememberFinalTacticRecommendation(snapshot, rec) {
        if (typeof STATE === 'undefined' || !STATE) return null;
        const vector = finalTacticApplyVector(rec);
        if (!vector) {
            STATE.finalTacticRecommendation = null;
            return null;
        }
        const recommendation = {
            token: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            vector,
            source: String(rec.source || ''),
            ids: Array.isArray(rec.etalonIds) ? rec.etalonIds.filter(Boolean).slice() : [],
            gameId: snapshot?.gameId ?? null,
            minute: snapshot?.minute ?? snapshot?.effectiveMinute ?? null,
            ts: Date.now()
        };
        STATE.finalTacticRecommendation = recommendation;
        return recommendation;
    }

    function buildFinalTacticTitle(rec) {
        if (rec?.base === 'current_tactic' || !rec?.presetId) return 'оставить текущую тактику';
        const title = RecommendationEngine.getPresetTitle(rec.presetId) || rec.presetId;
        const scheme = RecommendationEngine.getPresetScheme(rec.presetId);
        return scheme ? `${title}. Схема: ${scheme}.` : `${title}.`;
    }

    function buildFinalTacticBlockHtml(snapshot) {
        try {
            const rec = snapshot?.ruleDecision?.finalTactic;
            if (!rec || finalTacticSourceMissing(rec)) return null;
            if (!finalTacticApplyVector(rec)) return null;

            const recommendation = rememberFinalTacticRecommendation(snapshot, rec);
            if (!recommendation) return null;

            const state = finalTacticRenderState(snapshot, rec);
            if (typeof STATE !== 'undefined' && STATE) {
                STATE.finalTacticApplyStatus = state?.status === 'already_applied' ? 'already_applied' : 'idle';
            }

            const title = '<b style="color:#75ff75;">Рекомендация:</b> ';
            const summary = finalTacticVectorSummary(rec);
            const delta = finalTacticDeltaText(rec, snapshot);
            const provenance = finalTacticProvenanceText(rec);
            const referenceLine = typeof rec.referenceLine === 'string' ? rec.referenceLine : '';
            const insufficientText = finalTacticInsufficientText(rec);
            const notes = Array.isArray(rec.notes) ? rec.notes.filter(Boolean) : [];

            const btnStyle = 'padding:4px 8px;background:#345;color:#fff;border:1px solid #79a;'
                + 'border-radius:3px;cursor:pointer;margin-top:5px;'
                + (state?.disabled ? 'opacity:.55;cursor:not-allowed;' : '');
            const button = `<button id="slf-final-tactic-apply-btn" type="button" data-token="${etalonEscape(recommendation.token)}"`
                + ` title="${etalonEscape(state?.title || '')}"`
                + `${state?.disabled ? ' disabled' : ''} style="${btnStyle}">${etalonEscape(state?.label || 'Применить')}</button>`;

            return `<div style="line-height:1.4;margin-top:5px;border-top:1px solid #333;padding-top:5px;">`
                + `${title}${etalonEscape(buildFinalTacticTitle(rec))}`
                + `${summary ? `<div>Вектор: ${etalonEscape(summary)}</div>` : ''}`
                + `${delta ? `<div>Δ: ${etalonEscape(delta)}</div>` : ''}`
                + `${provenance ? `<div style="opacity:.9;">${etalonEscape(provenance)}</div>` : ''}`
                + `${referenceLine ? `<div style="opacity:.9;">${etalonEscape(referenceLine)}</div>` : ''}`
                + `${insufficientText ? `<div>Эталон: недостаточно данных${insufficientText ? ` (${etalonEscape(insufficientText)})` : ''}</div>` : ''}`
                + `${notes.length ? `<div style="opacity:.9;">Совет: ${etalonEscape(notes.join('; '))}</div>` : ''}`
                + `${button}</div>`;
        } catch (_) {
            return null;
        }
    }

    async function applyFinalTactic(btn) {
        if (typeof STATE === 'undefined' || !STATE) return;
        const rec = STATE.finalTacticRecommendation;

        if (!rec || !btn || btn.dataset.token !== rec.token) {
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Данные устарели — ↻ Подсказка';
            }
            UI.addParserLog('Рекомендация: данные устарели — обновите подсказку (↻ Подсказка)');
            return;
        }
        if (STATE.tacticControlBridgeApplyInProgress) {
            UI.addParserLog('Рекомендация: применение тактики уже выполняется — подождите');
            return;
        }

        // The merged vector carries all 14 controls + priority; the source
        // names the etalon ids and the base preset/current tactic.
        const source = rec.source;
        STATE.finalTacticApplyStatus = 'applying';
        btn.disabled = true;
        btn.textContent = 'Применяю…';

        let result = null;
        try {
            result = await STATE.tacticControlBridge.applyTacticObject(rec.vector, { strict: true, source });
        } catch (error) {
            console.error('[SLF] Final tactic apply failed', error);
            result = { ok: false, reason: 'exception', failures: [], mismatches: [], rolledBack: false };
        }

        const reenableAfterRollbackNote = () => {
            // Keep the rollback notice visible for 5s, then restore the idle button.
            setTimeout(() => {
                if (STATE.finalTacticApplyStatus === 'failed_rolled_back' && btn.isConnected
                    && btn.dataset.token === (STATE.finalTacticRecommendation?.token || null)) {
                    btn.disabled = false;
                    btn.textContent = 'Применить';
                }
            }, 5000);
        };

        if (result?.ok && !result.failures?.length && !result.mismatches?.length) {
            STATE.finalTacticApplyStatus = 'applied';
            btn.textContent = 'Применено ✓';
            btn.disabled = true;
            UI.addParserLog('Рекомендация применена (readback подтверждён)');
            UI.updateParserStatus('Рекомендация применена (readback подтверждён)');
            return;
        }

        const reason = String(result?.reason || 'unknown');
        const applicationStatus = String(result?.applicationStatus || '');
        const failureKeys = (Array.isArray(result?.failures) ? result.failures : []).join(', ');

        if (reason === 'preflight_failed') {
            // Nothing was changed — allow an immediate retry.
            STATE.finalTacticApplyStatus = 'failed_rolled_back';
            btn.disabled = false;
            btn.textContent = 'Применить';
            UI.addParserLog(`Не удалось: нет элементов ${failureKeys || '?'} — ничего не менялось`);
            UI.updateParserStatus('Рекомендация: предпроверка не пройдена, ничего не менялось');
            return;
        }

        if (reason === 'post_apply_rolled_back' || reason === 'exception_rolled_back'
            || applicationStatus === 'apply_failed_rolled_back') {
            STATE.finalTacticApplyStatus = 'failed_rolled_back';
            btn.textContent = 'Отклонено — откачено';
            btn.disabled = true;
            UI.addParserLog('Изменение отклонено страницей, тактика откачена');
            UI.updateParserStatus('Изменение отклонено страницей, тактика откачена');
            reenableAfterRollbackNote();
            return;
        }

        if (reason === 'rollback_unverified' || applicationStatus === 'apply_failed_unverified') {
            // Unsafe state: keep the button disabled until a fresh hint render.
            STATE.finalTacticApplyStatus = 'failed_unverified';
            btn.textContent = '⚠ Откат не подтверждён';
            btn.disabled = true;
            UI.addParserLog('⚠ Откат не подтверждён — проверьте тактику вручную');
            UI.updateParserStatus('⚠ Откат не подтверждён — проверьте тактику вручную');
            return;
        }

        if (reason === 'apply_in_progress') {
            STATE.finalTacticApplyStatus = 'idle';
            btn.disabled = false;
            btn.textContent = 'Применить';
            UI.addParserLog('Рекомендация: применение тактики уже выполняется — попробуйте ещё раз');
            return;
        }

        STATE.finalTacticApplyStatus = 'failed_rolled_back';
        btn.disabled = false;
        btn.textContent = 'Применить';
        UI.addParserLog(`Рекомендация: применение не подтверждено (${reason})`);
        UI.updateParserStatus('Рекомендация: применение не подтверждено');
    }

    function bindFinalTacticApplyDelegation() {
        if (typeof document === 'undefined' || document.__slfFinalTacticApplyDelegation) return;
        document.__slfFinalTacticApplyDelegation = true;
        document.addEventListener('click', event => {
            const btn = event?.target?.closest ? event.target.closest('#slf-final-tactic-apply-btn') : null;
            if (!btn) return;
            void applyFinalTactic(btn);
        });
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
            // #350: one merged «Рекомендация» block (preset base + etalon
            // overrides + ONE apply button). Falls back to the legacy
            // «Действие» row when the merge layer is unavailable.
            const finalTacticHtml = buildFinalTacticBlockHtml(snapshot);

            return `
                <div data-slf-rec-priority="1" data-slf-rec-section="combined" style="margin:5px 0;background:#151515;border:1px solid #444;border-radius:5px;color:#ddd;padding:9px;">
                    <div style="font-weight:bold;color:#75ff75;text-align:center;margin-bottom:7px;">Подсказка</div>
                    ${context ? `<div style="line-height:1.4;"><b style="color:#8fd3ff;">Ситуация:</b> ${this.escapeHtml(context)}</div>` : ''}
                    ${signalText ? `<div style="line-height:1.4;margin-top:5px;"><b style="color:#c8ff7a;">Сигналы:</b> ${this.escapeHtml(signalText)}</div>` : ''}
                    ${finalTacticHtml !== null
                        ? finalTacticHtml
                        : `<div style="line-height:1.4;margin-top:5px;"><b style="color:#75ff75;">Действие:</b> ${this.escapeHtml(actionText)}</div>`}
                    ${decisionText ? `<div style="line-height:1.4;margin-top:5px;"><b style="color:#ffd76a;">Решение:</b> ${this.escapeHtml(decisionText)}</div>` : ''}
                    ${candidateText ? `<div style="line-height:1.4;margin-top:5px;opacity:.85;"><b>Кандидаты:</b> ${this.escapeHtml(candidateText)}</div>` : ''}
                </div>`;
        };

        RecommendationEngine.__compactCoachModePatched = true;
        RecommendationEngine.__compactCoachModePatchedV2 = true;
        RecommendationEngine.__compactCoachModePatchedV3 = true;
        RecommendationEngine.__compactCoachModePatchedV4 = true;
    }

    function resetManualRecommendationState() {
        if (typeof STATE === 'undefined') return;
        STATE.recommendationFreeze = null;
        // Keep pendingPresetEvent until the target generation window is reached.
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

    async function renderManualRecommendation() {
        resetManualRecommendationState();

        const snapshot = normalizeForeignSnapshot(SnapshotEngine.build());
        if (!snapshot) return;

        snapshot.recommendationSource = 'manual_hint_button';
        snapshot.manualRecommendationRefresh = true;
        snapshot.generatorVersion = GENERATOR_VERSION;

        if (typeof STATE !== 'undefined' && STATE.tacticalLabRuntime?.checkpoint && snapshot.matchOwnership !== 'foreign') {
            await STATE.tacticalLabRuntime.checkpoint('manual_hint', snapshot);
        }

        if (typeof SnapshotEngine !== 'undefined' && SnapshotEngine.rememberManualSnapshot) {
            SnapshotEngine.rememberManualSnapshot(snapshot);
        }

        const el = document.getElementById('slf-parser-recommendation');
        // Build the scored recommendation before sending telemetry so the same snapshot
        // contains candidate scores, veto reasons, vectors and confidence.
        const html = buildManualRecommendationHtml(snapshot);
        if (el) el.innerHTML = html;
        rememberManualRecommendation(html, snapshot);
        submitManualTelemetry(snapshot);

        if (typeof STATE !== 'undefined' && STATE.tacticalLabRuntime?.mountUI && snapshot.matchOwnership !== 'foreign') {
            await STATE.tacticalLabRuntime.mountUI(snapshot);
        }

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
        btn.onclick = async () => {
            btn.disabled = true;
            try {
                await renderManualRecommendation();
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
        select.onchange = () => { void renderManualRecommendation(); };

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
        bindFinalTacticApplyDelegation();
    }

    const originalAddMatchParserPanel = UI.addMatchParserPanel;
    UI.addMatchParserPanel = function patchedTaskAAddMatchParserPanel() {
        const result = originalAddMatchParserPanel.apply(this, arguments);
        mount();
        if (typeof STATE !== 'undefined' && STATE.tacticalLabRuntime?.mountUI) {
            const snapshot = normalizeForeignSnapshot(SnapshotEngine.build());
            if (snapshot?.matchOwnership !== 'foreign') void STATE.tacticalLabRuntime.mountUI(snapshot);
        }
        return result;
    };

    mount();
})();

// ============================================================