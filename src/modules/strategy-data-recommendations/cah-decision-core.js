// Cah Decision Core
// Extracted verbatim from current-action-hint-engine.js (stage 4 refactor).
// Assigned onto the CurrentActionHintEngine facade; behaviour unchanged.

if (typeof CurrentActionHintEngine !== 'undefined' && CurrentActionHintEngine) {
    CurrentActionHintEngine.stage4CahDecisionCoreApplied = true;

    Object.assign(CurrentActionHintEngine, {
    classify(snapshot, context = {}) {
        const gameId = snapshot?.gameId || context?.gameId || 'unknown';
        const runtime = this.getGameRuntime(gameId);
        const decisionSignals = this.MatchDecisionSignals.build(this, snapshot, context, runtime);
        const reasons = [];
        const signalNames = [];
        const add = (name, reason) => {
            if (name && !signalNames.includes(name)) signalNames.push(name);
            if (reason && !reasons.includes(reason)) reasons.push(reason);
        };

        if (decisionSignals.attackNeed >= 55) add('need_goal', 'высокая потребность в голе');
        if (decisionSignals.preservationNeed >= 55) add('protect_lead', 'нужно снижать риск и удерживать результат');
        if (decisionSignals.pressureRisk >= 55) add('under_pressure', 'давление/переходная угроза соперника высоки');
        if (decisionSignals.pressingOpportunity >= 60) add('pressing_opportunity', 'есть условия для активного давления');
        if (decisionSignals.pressingCost >= 55) add('press_cost_high', 'прессинг дорого обходится по силе/браку/структуре');
        if (decisionSignals.widthOpportunity >= 55) add('wide_opportunity', 'фланговое преимущество подтверждено');
        if (decisionSignals.highBadActions) add('high_bad_actions', 'высокий процент брака');
        if (!signalNames.length) add('balanced_control', 'нет сильного аварийного сигнала');

        return {
            gameId: String(gameId),
            minute: decisionSignals.minute,
            score: decisionSignals.scoreState,
            signals: signalNames,
            reasons,
            context: decisionSignals,
            runtime
        };
    },

    decide(classification) {
        const runtime = classification?.runtime || this.getGameRuntime(classification?.gameId || 'unknown');
        const signals = classification?.context || {};
        const detectedPreset = runtime?.detectedPreset || runtime?.lastDecision?.action?.preset || '';
        return this.PresetRuleScorer.run(this, signals, runtime, detectedPreset);
    },

    evaluate(snapshot, context = {}) {
        if (!snapshot && !context) return null;

        const classification = this.classify(snapshot || {}, context || {});
        const runtime = classification.runtime;
        const detectedPreset = this.detectCurrentPreset(snapshot || {}, runtime);
        if (detectedPreset !== runtime.detectedPreset) {
            runtime.detectedPreset = detectedPreset;
            runtime.detectedPresetSinceWindow = classification.context.generationWindowIndex;
        }

        const scored = this.PresetRuleScorer.run(this, classification.context, runtime, detectedPreset);
        const result = {
            schema: this.schema,
            mode: this.mode,
            moment: {
                gameId: classification.gameId,
                minute: classification.minute,
                score: classification.score,
                signals: classification.signals,
                reasons: classification.reasons,
                context: classification.context
            },
            action: scored.action,
            confidence: scored.confidence,
            margin: scored.margin,
            candidates: scored.candidates,
            vetoedPresets: scored.vetoedPresets,
            guard: scored.guard,
            telemetry: {
                schema: 'slf_rule_decision_telemetry_v1',
                observation: classification.context,
                currentPreset: detectedPreset || null,
                recommendedPreset: scored.action.preset,
                recommendedScore: scored.action.score,
                confidence: scored.confidence,
                margin: scored.margin,
                candidateScores: Object.fromEntries(scored.candidates.map(item => [item.preset, item.score])),
                vetoedPresets: scored.vetoedPresets,
                generatedAt: Date.now()
            },
            generatedAt: Date.now()
        };

        runtime.previousObservation = Object.assign({}, classification.context);
        runtime.lastDecision = result;
        return result;
    },

    run(snapshot, context = {}) {
        return this.evaluate(snapshot, context);
    },

    toPlanRows(result) {
        if (!result) return [];
        const topCandidates = (result.candidates || []).filter(item => !item.vetoed).slice(0, 3);
        const candidateText = topCandidates.map(item => `${item.preset} ${item.score >= 0 ? '+' : ''}${item.score}`).join(' · ');
        const confidence = result.confidence?.level || 'low';
        return [
            `Режим: ${result.action?.decision || result.moment?.context?.gameMode || 'active_control'}`,
            `Рекомендация: ${result.action?.preset || 'Arteta_Control433_bal3'} (${result.action?.score ?? 0})`,
            `Уверенность: ${confidence}; разрыв ${result.margin ?? 0}`,
            `Причина: ${result.action?.reason || 'экспертный score'}`,
            candidateText ? `Кандидаты: ${candidateText}` : ''
        ].filter(Boolean);
    }
    });
}
