// Transfer Badge Verdict Groups
// Part of the TransferMarketAnalyzer badge rendering subsystem (issue #275).
// Assigned onto the TransferMarketAnalyzer facade; behaviour unchanged.

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.badgeVerdictGroupsApplied = true;

    Object.assign(TransferMarketAnalyzer, {
    renderAnalysisGroup(className, title, markers, priority = 'medium') {
        const realMarkers = (markers || [])
            .filter(Boolean)
            .filter(marker => this.isRealAnalysisMarker(marker));

        if (!realMarkers.length) return '';

        return `
            <div class="ta-group ${className}" data-ta-group="${this.escapeHtml(className)}" aria-label="${this.escapeHtml(title)}">
                ${realMarkers.map(marker => this.renderCompactChip(this.withVisualPriority(marker, priority))).join('')}
            </div>
        `;
    },

    makeCombinedContextMarker(markers, labelFallback = '') {
        const realMarkers = (markers || []).filter(Boolean).filter(marker => this.isRealAnalysisMarker(marker));
        if (!realMarkers.length) return null;

        const labels = realMarkers
            .map(marker => String(marker.label || '').trim())
            .filter(Boolean);
        if (!labels.length) return null;

        const texts = realMarkers
            .map(marker => String(marker.text || marker.label || '').trim())
            .filter(Boolean);

        return {
            label: labels.join(' · ') || labelFallback,
            level: 'neutral',
            score: realMarkers.reduce((sum, marker) => sum + Number(marker.score || 0), 0),
            redFlag: realMarkers.some(marker => marker.redFlag),
            hardStop: realMarkers.some(marker => marker.hardStop),
            text: texts.join(' | '),
            category: 'combined'
        };
    },

    renderSemanticAnalysisGroups(markers, linksHtml, detailsHtml, verdict) {
        const primaryMarkers = [
            this.firstMarkerByCategory(markers, 'slf'),
            this.firstMarkerByCategory(markers, 'market'),
            this.firstMarkerByCategory(markers, 'tm'),
            this.firstMarkerByCategory(markers, 'activity'),
            this.firstMarkerByCategory(markers, 'trend')
        ].filter(Boolean);

        const usedPrimary = new Set(primaryMarkers);
        const signalMarkers = this.allMarkersByCategories(markers, ['talent', 'league', 'trend'])
            .filter(marker => !usedPrimary.has(marker));
        const ageMarker = this.firstMarkerByCategory(markers, 'age');
        const clubAgent = this.makeCombinedContextMarker([
            this.firstMarkerByCategory(markers, 'club'),
            this.firstMarkerByCategory(markers, 'agent')
        ], 'club / agent');
        const contractService = this.makeCombinedContextMarker([
            this.firstMarkerByCategory(markers, 'contract'),
            this.firstMarkerByCategory(markers, 'rumors'),
            this.firstMarkerByCategory(markers, 'academy')
        ], 'contract / status');
        const otherMarkers = this.allMarkersByCategories(markers, ['other']);
        const whyMarker = this.buildWhyRankMarker(markers, verdict);

        const secondaryMarkers = [
            whyMarker,
            ...signalMarkers,
            ageMarker,
            clubAgent,
            contractService,
            ...otherMarkers
        ].filter(Boolean);

        const verdictHtml = verdict ? this.renderRankVerdictChip(verdict) : '';

        const primaryHtml = `
            <div class="ta-line ta-primary" data-ta-line="primary" aria-label="Итог и главные факторы">
                ${verdictHtml}
                ${primaryMarkers.map(marker => this.renderCompactChip(this.withVisualPriority(marker, 'high'))).join('')}
            </div>
        `;

        const secondaryHtml = `
            <div class="ta-line ta-secondary" data-ta-line="secondary" aria-label="Почему и контекст">
                ${secondaryMarkers.map(marker => this.renderCompactChip(this.withVisualPriority(marker, marker.category === 'why' ? 'medium' : 'low'))).join('')}
                ${linksHtml || ''}
                ${detailsHtml || ''}
            </div>
        `;

        return [primaryHtml, secondaryHtml].join('');
    },

    getShortVerdictLabel(verdict) {
        const raw = String(verdict?.label || '').toUpperCase();
        if (raw.includes('SKIP')) return 'SKIP';
        if (raw.includes('TRAP') || raw.includes('RISK')) return 'RISK';
        if (raw.includes('SPEC')) return 'SPEC';
        if (raw.includes('PRIORITY') || raw.includes('STRONG')) return 'TARGET';
        if (raw.includes('TARGET')) return 'TARGET';
        if (raw.includes('WATCH')) return 'WATCH';
        if (raw.includes('LOW DATA')) return 'WATCH';
        return 'WATCH';
    },

    buildVerdictTooltipHtml(verdict) {
        const esc = value => this.escapeHtml(value == null || value === '' ? '—' : String(value));
        const label = this.getShortVerdictLabel(verdict);
        const score = Number(verdict?.score || 0).toFixed(1).replace(/\.0$/, '');
        const rank = verdict?.rank ? `#${verdict.rank}` : '#?';
        const reason = verdict?.reason || verdict?.label || '';
        const level = String(verdict?.level || 'neutral');
        const meaning = (() => {
            const raw = String(verdict?.label || '').toUpperCase();
            if (raw.includes('PRIORITY') || raw.includes('TARGET')) return 'кандидат выше среднего: проверять первым, но финально сверить цену, минуты и статус';
            if (raw.includes('WATCH') || raw.includes('SPEC')) return 'наблюдение/ручная проверка: есть плюс, но не хватает уверенности или есть риск';
            if (raw.includes('RISK') || raw.includes('TRAP')) return 'риск покупки: маркеры указывают на переплату, слабую готовность или статусный риск';
            if (raw.includes('SKIP')) return 'пропуск: есть hard-stop или слишком сильная комбинация рисков';
            return 'общий ранговый вывод анализатора';
        })();

        return `
            <div style="font-weight:bold;color:#ffd76a;margin-bottom:6px;">Вердикт и ранг</div>
            <div style="display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid #2b2b2b;"><span style="color:#aaa;">Итог</span><span>${esc(label)} ${esc(rank)}</span></div>
            <div style="display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid #2b2b2b;"><span style="color:#aaa;">Score</span><span>${esc(score)}</span></div>
            <div style="display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid #2b2b2b;"><span style="color:#aaa;">Уровень</span><span>${esc(level)}</span></div>
            <div style="display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid #2b2b2b;"><span style="color:#aaa;">Почему</span><span>${esc(reason)}</span></div>
            <div style="display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px;padding:3px 0;"><span style="color:#aaa;">Как читать</span><span>${esc(meaning)}</span></div>
        `;
    },

    renderRankVerdictChip(verdict) {
        const label = this.getShortVerdictLabel(verdict);
        const rank = verdict?.rank ? ` #${verdict.rank}` : ' #?';
        const tooltip = this.buildVerdictTooltipHtml(verdict);
        return `
            <span class="slf-transfer-chip-tooltip-host slf-transfer-verdict-chip" data-verdict-base="${this.escapeHtml(label)}" data-score="${this.escapeHtml(verdict?.score || 0)}" tabindex="0" style="
                flex:0 0 auto;
                display:inline-flex;
                align-items:center;
                justify-content:center;
                min-height:18px;
                line-height:17px;
                padding:1px 6px;
                border-radius:6px;
                color:${this.colorByLevel(verdict.level)};
                background:${this.bgByLevel(verdict.level)};
                border:1px solid ${this.borderByLevel(verdict.level)};
                font-weight:800;
                white-space:nowrap;
                vertical-align:middle;
                cursor:help;
            ">
                <span class="slf-transfer-verdict-label">${this.escapeHtml(label + rank)}</span>
                <span class="slf-transfer-html-tooltip" style="display:none;">${tooltip}</span>
            </span>
        `;
    },

    buildWhyRankReasons(markers, verdict) {
        const reasons = [];
        const market = (markers || []).find(m => this.markerCategory(m) === 'market');
        const activity = (markers || []).find(m => this.markerCategory(m) === 'activity');
        const trend = (markers || []).find(m => this.markerCategory(m) === 'trend');
        const age = (markers || []).find(m => this.markerCategory(m) === 'age');
        const agent = (markers || []).find(m => this.markerCategory(m) === 'agent');
        const club = (markers || []).find(m => this.markerCategory(m) === 'club');
        const ratio = Number(market?.marketDetails?.ratio || 0);
        const minPct = Number((String(activity?.label || '').match(/MIN\s+(\d+)/i) || [])[1] || 0);
        const peakPct = Number((String(trend?.label || '').match(/peak\s+(\d+)/i) || [])[1] || 0);
        const ageNum = Number((String(age?.label || '').match(/age\s+(\d+)/i) || [])[1] || 0);
        const verdictText = String(verdict?.label || '').toUpperCase();

        if (minPct >= 70) reasons.push('ready');
        if (ratio && ratio < 1) reasons.push('cheap');
        if (ratio && ratio > 1) reasons.push('overpay');
        if (minPct && minPct < 35) reasons.push('low-min');
        if (peakPct >= 90) reasons.push('peak');
        if (String(trend?.label || '').toLowerCase().includes('fall')) reasons.push('fall');
        if (verdictText.includes('SPEC') || (ageNum >= 22 && ageNum <= 24 && minPct > 0 && minPct < 70 && peakPct >= 90)) reasons.push('spec');
        if (ageNum >= 30) reasons.push('old');
        if (String(agent?.label || '').includes('✓')) reasons.push('agent');
        if (String(club?.label || '').includes('✓')) reasons.push('club');

        return [...new Set(reasons)].slice(0, 3);
    },

    buildWhyRankMarker(markers, verdict) {
        const reasons = this.buildWhyRankReasons(markers, verdict);
        if (!reasons.length) return null;
        return {
            label: `why: ${reasons.join(' · ')}`,
            level: 'neutral',
            score: 0,
            redFlag: false,
            hardStop: false,
            category: 'why',
            text: `Главные причины ранга: ${reasons.join(', ')}.`
        };
    },

    getMarkerSlots(markers) {
        const defs = this.getMarkerSlotDefs();

        return defs.map(def => {
            const marker = this.firstMarkerByCategory(markers, def.key);
            if (marker) return marker;

            return {
                label: def.placeholder,
                level: 'empty',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: `Нет данных/сигнала для слота ${def.key}.`
            };
        });
    },

    renderMarkerSlots(markers) {
        return this.renderSemanticAnalysisGroups(markers, '', '', null);
    },

    getVerdictIcon(verdict) {
        const label = String(verdict?.label || '');

        if (label.includes('SKIP')) return '⛔';
        if (label.includes('HIGH RISK') || label.includes('RISK') || label.includes('TRAP')) return '🔴';
        if (label.includes('SPEC')) return '◇';
        if (label.includes('MANUAL')) return '🟡';
        if (label.includes('PRIORITY')) return '🔥';
        if (label.includes('TARGET')) return '🟢';
        if (label.includes('WATCHLIST')) return '👀';

        return '⚪';
    },
    });
}
