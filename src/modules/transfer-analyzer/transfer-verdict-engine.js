// Transfer Verdict Engine
// Extracted verbatim from transfer-market-analyzer.js (stage 1 refactor).
// Assigned onto the TransferMarketAnalyzer facade; behaviour unchanged.

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.stage1VerdictEngineApplied = true;

    Object.assign(TransferMarketAnalyzer, {
    buildTransferVerdict(markers, profile, slfAlter) {
        const cfg = this.getCfg().verdict || {};
        const score = markers.reduce((sum, m) => sum + Number(m.score || 0), 0);

        const hardStop = markers.find(m => m.hardStop);

        if (hardStop) {
            return {
                label: 'SKIP',
                level: 'skip',
                score,
                reason: hardStop.text || hardStop.label
            };
        }

        const redFlags = markers.filter(m => m.redFlag || m.level === 'risk');
        const redFlagCount = redFlags.length;
        const hotCount = markers.filter(m => m.level === 'hot').length;
        const goodCount = markers.filter(m => m.level === 'good').length;

        const noClub = this.isFreeAgent(profile);
        const noAgent = this.isNoAgent(profile);
        const age = Number(slfAlter?.age || profile?.age || 0);
        const collapsed = markers.some(m => String(m.label || '').includes('collapsed'));
        const inactiveNow = !!slfAlter && (
            slfAlter.staleActivity ||
            !slfAlter.hasCurrentSeason ||
            slfAlter.currentRow?.minutesPct === 0
        );

        if (
            noClub &&
            noAgent &&
            (inactiveNow || collapsed || age >= 30)
        ) {
            return {
                label: 'SKIP',
                level: 'skip',
                score,
                reason: 'Без клуба + no agent + inactive/collapsed/age risk.'
            };
        }

        if (
            age >= 33 &&
            noClub &&
            (inactiveNow || collapsed)
        ) {
            return {
                label: 'SKIP',
                level: 'skip',
                score,
                reason: 'Возрастной игрок без клуба и без актуального игрового сигнала SLF.'
            };
        }

        const marketMarker = markers.find(m => this.markerCategory(m) === 'market') || null;
        const trendMarker = markers.find(m => this.markerCategory(m) === 'trend') || null;
        const marketRatio = Number(marketMarker?.marketDetails?.ratio || 0);
        const minPct = Number(slfAlter?.currentRow?.minutesPct || 0);
        const peakPct = Number((String(trendMarker?.label || '').match(/peak\s+(\d+)/i) || [])[1] || 0);
        const talent = Number(slfAlter?.talent || 0);
        const currentSkill = Number(slfAlter?.currentSkill || 0);
        const slfDelta = Number(slfAlter?.skillDelta || 0);

        const slfGapVeryGood = slfDelta >= 10 || (marketRatio > 0 && marketRatio <= 0.70) || score >= (cfg.priorityScore || 13);
        const slfGapGood = slfDelta >= 5 || (marketRatio > 0 && marketRatio <= 1.05) || score >= (cfg.targetScore || 8);
        const lateAge = age >= 22 && age <= 24;
        const highPeak = peakPct >= 90;
        const lowReadiness = minPct > 0 && minPct < 40;
        const veryLowReadiness = minPct > 0 && minPct < 30;
        const ready = minPct >= 70;
        const mediumReady = minPct >= 50 && minPct < 70;
        const skillReady = ready || currentSkill >= 130 || (currentSkill >= 120 && minPct >= 50);
        const priceCheapEnough = marketRatio > 0 && marketRatio <= 0.85;
        const priceVeryCheap = marketRatio > 0 && marketRatio <= 0.50;
        const mktOverpriced = marketRatio > 1.05;

        if (slfGapVeryGood && ready && skillReady && highPeak && talent >= 2) {
            return {
                label: 'PRIORITY',
                level: 'hot',
                score,
                reason: 'Готовый актив: высокий gap, MIN 70%+, skill ready, peak 90%+, талант 2+.'
            };
        }

        if (slfGapGood && mktOverpriced && lowReadiness && talent <= 1) {
            return {
                label: 'TRAP?',
                level: 'risk',
                score,
                reason: 'MKT переплата при низкой готовности и таланте 1: риск false bargain.'
            };
        }

        if (slfGapVeryGood && lateAge && highPeak && lowReadiness) {
            return {
                label: 'SPEC',
                level: 'spec',
                score,
                reason: 'Сильный gap, но низкая готовность: late-growth gamble, нужна ручная проверка.'
            };
        }

        if (slfGapGood && veryLowReadiness && talent <= 1 && !priceVeryCheap) {
            return {
                label: 'TRAP?',
                level: 'risk',
                score,
                reason: 'Gap есть, но MIN < 30% и талант 1: риск false bargain.'
            };
        }

        if (slfGapGood && mediumReady && (peakPct >= 80 || highPeak) && redFlagCount < 2) {
            return {
                label: 'TARGET',
                level: 'good',
                score,
                reason: 'Хороший кандидат: gap подтверждён, готовность средняя, hard risk не доминирует.'
            };
        }

        if (slfGapGood && ready && talent <= 1 && priceCheapEnough) {
            return {
                label: 'TARGET',
                level: 'good',
                score,
                reason: 'Готовность высокая и цена достаточно дешёвая, несмотря на talent risk.'
            };
        }

        if (redFlagCount >= (cfg.highRiskRedFlags || 3)) {
            return {
                label: 'RISK',
                level: 'risk',
                score,
                reason: `Красных флагов: ${redFlagCount}.`
            };
        }

        if (redFlagCount >= 2 && score < (cfg.priorityScore || 13)) {
            return {
                label: 'RISK',
                level: 'risk',
                score,
                reason: 'Несколько рисков без достаточного количества сильных плюсов.'
            };
        }

        if (redFlagCount >= (cfg.manualCheckRedFlags || 1)) {
            return {
                label: 'WATCH',
                level: 'watch',
                score,
                reason: 'Есть риск-факторы, нужна ручная проверка.'
            };
        }

        if (score >= (cfg.priorityScore || 13) || (hotCount >= 2 && score >= 9)) {
            return {
                label: ready && skillReady ? 'PRIORITY' : 'WATCH',
                level: ready && skillReady ? 'hot' : 'watch',
                score,
                reason: ready && skillReady
                    ? 'Сильный кандидат по TM и/или SLF alter-сигналам, готовность подтверждена.'
                    : 'Сильные сигналы есть, но готовность недостаточно подтверждена для PRIORITY.'
            };
        }

        if (score >= (cfg.targetScore || 8) || goodCount >= 3) {
            return {
                label: 'TARGET',
                level: 'good',
                score,
                reason: 'Хороший кандидат без крупных красных флагов.'
            };
        }

        if (score >= (cfg.watchlistScore || 3)) {
            return {
                label: 'WATCH',
                level: 'normal',
                score,
                reason: 'Есть полезные сигналы, но пока не приоритет.'
            };
        }

        return {
            label: 'WATCH',
            level: 'neutral',
            score,
            reason: 'Мало сильных сигналов.'
        };
    },

    colorByLevel(level) {
        return {
            skip: '#ff4d4d',
            risk: '#ff7777',
            watch: '#ffd166',
            spec: '#9fb8cc',
            old: '#b8b8b8',
            low: '#b8b8b8',
            empty: '#777',
            unknown: '#aaa',
            neutral: '#d7d7d7',
            normal: '#c9ff8a',
            good: '#6dff8c',
            hot: '#00f080'
        }[level] || '#ddd';
    },

    bgByLevel(level) {
        return {
            skip: '#3a1010',
            risk: '#301515',
            watch: '#302610',
            spec: '#182533',
            old: '#202020',
            low: '#202020',
            empty: '#171717',
            unknown: '#1d1d1d',
            neutral: '#202020',
            normal: '#173018',
            good: '#12351e',
            hot: '#0b3b22'
        }[level] || '#202020';
    },

    borderByLevel(level) {
        return {
            skip: '#9b3030',
            risk: '#854040',
            watch: '#7a6422',
            spec: '#49687f',
            old: '#555',
            low: '#555',
            empty: '#333',
            unknown: '#444',
            neutral: '#555',
            normal: '#4b7d2d',
            good: '#2f8f4c',
            hot: '#00a65a'
        }[level] || '#555';
    },

    });
}
