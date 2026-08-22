// Transfer Badge Renderer
// Extracted verbatim from transfer-market-analyzer.js (stage 1 refactor).
// Assigned onto the TransferMarketAnalyzer facade; behaviour unchanged.

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.stage1BadgeRendererApplied = true;

    Object.assign(TransferMarketAnalyzer, {
    getOrCreateBadgeCell(row) {
        const tr = row.rowEl;

        if (!tr) return null;

        let box = tr.querySelector('.slf-transfer-analysis-badge');

        if (!box) {
            box = document.createElement('td');
            box.className = 'slf-transfer-analysis-badge';
            box.style.cssText = this.isHistoryPage()
                ? `
                    box-sizing:border-box;
                    min-width:80px;
                    max-width:96px;
                    width:86px;
                    font-size:11px;
                    line-height:1.12;
                    border-left:1px solid #444;
                    padding:3px 5px;
                    vertical-align:middle;
                    white-space:nowrap;
                    position:relative;
                    overflow:visible;
                    text-align:center;
                `
                : `
                    box-sizing:border-box;
                    min-width:0;
                    max-width:none;
                    width:auto;
                    font-size:11px;
                    line-height:1.12;
                    border-left:1px solid #444;
                    padding:3px 5px;
                    vertical-align:top;
                    white-space:normal;
                    position:relative;
                    overflow:visible;
                    display:flex;
                    flex-wrap:wrap;
                    align-items:flex-start;
                    gap:3px 4px;
                `;

            tr.appendChild(box);
        }

        return box;
    },

    renderLoadingBadge(row) {
        const box = this.getOrCreateBadgeCell(row);

        if (!box) return;

        box.innerHTML = `<span style="color:#aaa;">TM/SLF анализ...</span>`;
    },

    renderErrorBadge(row, error) {
        const box = this.getOrCreateBadgeCell(row);

        if (!box) return;

        box.innerHTML = `
            <span style="color:#ff9f9f;">Ошибка анализа</span>
            <span style="color:#777;margin-left:4px;">${this.escapeHtml(String(error?.message || error || 'unknown'))}</span>
        `;
    },

    renderRowBadge(row, enriched, slfAlter) {
        if (this.isHistoryPage()) {
            this.renderHistoryVpsBadge(row, null);
            return;
        }

        const box = this.getOrCreateBadgeCell(row);

        if (!box) return;

        const profile = enriched?.tmProfile || null;
        const safeEnriched = enriched || {
            playerId: row.playerId,
            slfUrl: row.playerUrl,
            tmUrl: '',
            tmProfile: null,
            error: 'empty_enrichment'
        };

        const fallbackProfile = {
            marketValueEur: 0,
            transferHistory: [],
            youthClubs: [],
            rumors: [],
            currentClub: '',
            playerAgent: '',
            contractExpires: '',
            age: row.age,
            tmUrl: ''
        };

        const markers = this.buildMarkers(row, profile || fallbackProfile, slfAlter);

        const verdict = profile
            ? this.buildTransferVerdict(markers, profile, slfAlter)
            : {
                label: '⚪ LOW DATA',
                level: 'neutral',
                score: markers.reduce((sum, m) => sum + Number(m.score || 0), 0),
                reason: 'TM-профиль не найден, показаны только SLF-сигналы из cache/alter.php.'
            };

        this.writeRowSortMetrics(row, markers, verdict, slfAlter, profile);
        verdict.rank = this.computeVisibleScoreRank(row, verdict.score);

        const detailsHtml = this.buildDecisionDetailsHtml(row, profile || fallbackProfile, slfAlter, markers, verdict);
        const linksHtml = profile?.tmUrl
            ? `
                <span style="
                    display:inline-flex;
                    gap:4px;
                    align-items:center;
                    white-space:nowrap;
                    font-size:11px;
                    line-height:16px;
                    margin-left:2px;
                ">
                    <a href="${this.escapeHtml(profile.tmUrl)}" target="_blank" style="color:#8cf;">TM</a>
                </span>
            `
            : '';

        box.innerHTML = `
            <div class="slf-transfer-analysis-compact ta-cell" style="
                display:inline-flex;
                flex-direction:column;
                align-items:flex-start;
                gap:3px;
                width:max-content;
                max-width:100%;
                box-sizing:border-box;
                overflow:visible;
                white-space:normal;
            ">
                ${this.renderSemanticAnalysisGroups(markers, linksHtml, detailsHtml, verdict)}
            </div>
        `;

        this.bindDetailsAutoClose();
        this.bindHtmlTooltipPortal(box);
        this.cleanupStandaloneMarketNominalControls(box);
        this.refreshVisibleRankBadges();
    },

    writeRowSortMetrics(row, markers, verdict, slfAlter, profile) {
        const tr = row?.rowEl;

        if (!tr) return;

        const talentMarker = markers.find(m => this.markerCategory(m) === 'talent');
        const marketMarker = markers.find(m => this.markerCategory(m) === 'market');
        const marketRatio = Number(marketMarker?.marketDetails?.ratio || 0);
        const marketCurrent = Number(marketMarker?.marketDetails?.currentInfo?.value || 0);
        const marketP75 = Number(marketMarker?.marketDetails?.baseline?.p75 || 0);
        const marketHasData = marketRatio > 0 && marketCurrent > 0 && marketP75 > 0;

        tr.dataset.slfAnalyzerScore = String(Number(verdict?.score || 0));
        tr.dataset.slfSkillDelta = String(slfAlter?.skillDelta != null ? Number(slfAlter.skillDelta) : -9999);
        tr.dataset.slfMinutesPct = String(slfAlter?.currentRow?.minutesPct != null ? Number(slfAlter.currentRow.minutesPct) : -1);
        tr.dataset.slfTalentUp = String(talentMarker ? Number(talentMarker.score || 0) * 100 + Number(slfAlter?.talentUpgradeRow?.minutesPct || 0) : 0);
        tr.dataset.slfTmValue = String(Number(profile?.marketValueEur || profile?.lastKnownMarketValueEur || 0));
        tr.dataset.slfMktBargain = String(marketHasData ? Number((marketP75 / marketCurrent).toFixed(4)) : -1);
        tr.dataset.slfMktOverpriced = String(marketHasData ? Number(marketRatio.toFixed(4)) : -1);
    },

    markerCategory(marker) {
        if (marker?.category) return marker.category;

        const label = String(marker?.label || '').toLowerCase();

        if (label.includes('retired') || label.includes('no club') || label.includes('без клуба') || label.includes('club')) return 'club';
        if (label.includes('agent')) return 'agent';
        if (label.startsWith('slf') || label.startsWith('→')) return 'slf';
        if (label.includes('min') || label.startsWith('m-') || label.startsWith('m?')) return 'activity';
        if (label.includes('t') && label.includes('<l')) return 'talent';
        if (label.includes('>') && /\d/.test(label)) return 'league';
        if (label.includes('age') || label.includes('growth') || label.includes('grow') || label.includes('late') || label.includes('prime') || label.includes('veteran') || label.includes('vet') || label.includes('short')) return 'age';
        if (label.startsWith('mkt')) return 'market';
        if (label.startsWith('n ') || label.startsWith('n?')) return 'nominal';
        if (label.includes('tm ') || label.startsWith('tm') || label.startsWith('old €') || label.startsWith('old')) return 'tm';
        if (label.includes('peak') || label.includes('trend') || label.includes('collapsed') || label.includes('fallen') || label.includes('fall')) return 'trend';
        if (label.includes('contract') || label.includes('ctr') || label.includes('exp ')) return 'contract';
        if (label.includes('rumor') || /^r\d/.test(label)) return 'rumors';
        if (label.includes('academy') || label.includes('acad') || label.includes('youth') || label.includes('elite') || label.includes('strong')) return 'academy';

        return 'other';
    },

    getMarkerSlotDefs() {
        return [
            { key: 'slf', placeholder: 'SLF?' },
            { key: 'activity', placeholder: 'MIN?' },
            { key: 'talent', placeholder: 'T-' },
            { key: 'league', placeholder: 'L-' },
            { key: 'tm', placeholder: 'TM?' },
            { key: 'market', placeholder: 'MKT?' },
            { key: 'trend', placeholder: 'tr?' },

            { key: 'club', placeholder: 'club?' },
            { key: 'agent', placeholder: 'agent?' },
            { key: 'age', placeholder: 'age?' },
            { key: 'contract', placeholder: 'ctr?' },
            { key: 'rumors', placeholder: 'rum0' },
            { key: 'academy', placeholder: 'acad-' }
        ];
    },

    markerScoreRank(level) {
        return ({
            skip: 100,
            risk: 90,
            hot: 80,
            good: 70,
            watch: 60,
            normal: 50,
            neutral: 40,
            unknown: 30,
            low: 20,
            old: 15,
            empty: 10
        }[level] || 0);
    },

    sortMarkersByImportance(markers) {
        return [...(markers || [])].sort((a, b) => {
            return this.markerScoreRank(b.level) - this.markerScoreRank(a.level) ||
                Math.abs(Number(b.score || 0)) - Math.abs(Number(a.score || 0));
        });
    },

    isRealAnalysisMarker(marker) {
        if (!marker) return false;

        const level = String(marker.level || '');
        const label = this.normalizeText(marker.label || '');

        if (!label || level === 'empty') return false;
        if (/^(SLF\?|MIN\?|TM\?|MKT\?|T-|L-|tr\?|club\?|agent\?|age\?|ctr\?|rum0|acad-)$/i.test(label)) return false;
        if (/^N\s+/i.test(label)) return false;
        if (/^N\?/i.test(label)) return false;

        return true;
    },

    firstMarkerByCategory(markers, category) {
        return this.sortMarkersByImportance(markers)
            .find(marker => this.markerCategory(marker) === category && this.isRealAnalysisMarker(marker)) || null;
    },

    allMarkersByCategories(markers, categories) {
        const allowed = new Set(categories || []);
        return this.sortMarkersByImportance(markers)
            .filter(marker => allowed.has(this.markerCategory(marker)) && this.isRealAnalysisMarker(marker));
    },

    withVisualPriority(marker, priority) {
        return marker ? Object.assign({}, marker, { visualPriority: priority }) : null;
    },

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

    computeVisibleScoreRank(row, score) {
        const tr = row?.rowEl;
        const table = this.findTransferTable();
        if (!tr || !table) return null;
        const rows = [...table.querySelectorAll('tr')]
            .filter(item => item.dataset && item.dataset.slfPlayerId && item.dataset.slfAnalyzerScore !== undefined)
            .map(item => ({ item, score: Number(item.dataset.slfAnalyzerScore || -999999999) }))
            .sort((a, b) => b.score - a.score);
        const index = rows.findIndex(item => item.item === tr);
        if (index >= 0) return index + 1;
        const better = rows.filter(item => Number(item.score) > Number(score || 0)).length;
        return better + 1;
    },

    refreshVisibleRankBadges() {
        const table = this.findTransferTable();
        if (!table) return;
        const rows = [...table.querySelectorAll('tr')]
            .filter(tr => tr.dataset && tr.dataset.slfPlayerId && tr.dataset.slfAnalyzerScore !== undefined)
            .map(tr => ({ tr, score: Number(tr.dataset.slfAnalyzerScore || -999999999) }))
            .sort((a, b) => b.score - a.score);
        rows.forEach((entry, index) => {
            const chip = entry.tr.querySelector('.slf-transfer-verdict-chip[data-verdict-base]');
            if (!chip) return;
            const base = chip.dataset.verdictBase || 'WATCH';
            const labelEl = chip.querySelector('.slf-transfer-verdict-label');
            if (labelEl) labelEl.textContent = `${base} #${index + 1}`;
            else chip.childNodes[0].textContent = `${base} #${index + 1}`;
        });
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

    ensureHtmlTooltipStyles() {
        if (document.getElementById('slf-transfer-html-tooltip-style')) return;

        const style = document.createElement('style');
        style.id = 'slf-transfer-html-tooltip-style';
        style.textContent = `
            .slf-transfer-chip-tooltip-host { overflow:visible !important; position:relative; outline:none; cursor:help; }
            .slf-transfer-decision-details-trigger { cursor:pointer !important; }
            .slf-transfer-mkt-leaf-badge { min-width:max-content !important; max-width:none !important; width:auto !important; white-space:nowrap !important; overflow:visible !important; text-overflow:clip !important; }
            .slf-transfer-analysis-badge, .slf-transfer-analysis-compact, .slf-transfer-marker-wrap, .ta-cell, .ta-line { overflow:visible !important; white-space:normal !important; }
            .slf-transfer-analysis-badge { min-width:0 !important; width:auto !important; max-width:none !important; }
            .ta-cell { display:inline-flex !important; flex-direction:column !important; align-items:flex-start !important; gap:3px !important; box-sizing:border-box !important; min-width:0 !important; width:max-content !important; max-width:100% !important; }
            .ta-line { display:flex !important; flex-wrap:wrap !important; align-items:center !important; justify-content:flex-start !important; gap:3px 4px !important; min-width:0 !important; box-sizing:border-box !important; width:max-content !important; max-width:100% !important; }
            .ta-primary { order:1; }
            .ta-secondary { order:2; opacity:.9; }
            .ta-secondary .slf-transfer-decision-details-trigger { display:inline-flex !important; width:max-content !important; max-width:max-content !important; white-space:nowrap !important; align-self:center !important; }
            .ta-secondary a { white-space:nowrap !important; }
            .slf-transfer-chip-tooltip-host .slf-transfer-html-tooltip { display:none !important; }
            .slf-transfer-html-tooltip-portal {
                position:fixed;
                z-index:2147483647;
                max-width:min(780px, calc(100vw - 24px));
                min-width:260px;
                width:auto;
                max-height:min(560px, calc(100vh - 24px));
                overflow:auto;
                padding:8px 10px;
                background:#181818;
                color:#ddd;
                border:1px solid #666;
                border-radius:6px;
                box-shadow:0 8px 24px rgba(0,0,0,0.75);
                white-space:normal;
                line-height:1.35;
                text-align:left;
                font-size:11px;
            }
            .slf-transfer-html-tooltip-portal.slf-transfer-tooltip-hover { pointer-events:none; }
            .slf-transfer-html-tooltip-portal.slf-transfer-tooltip-click { pointer-events:auto; }
        `;
        document.head.appendChild(style);
    },

    bindHtmlTooltipPortal(root = document) {
        if (window.__slf_transfer_html_tooltip_portal_bound) return;
        window.__slf_transfer_html_tooltip_portal_bound = true;

        let portal = null;
        let activeHost = null;
        let activeMode = '';

        const escape = value => String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');

        const isDetailsHost = host => !!host && (
            host.classList?.contains('slf-transfer-decision-details-trigger') ||
            host.closest?.('.slf-transfer-details') ||
            String(host.textContent || '').trim().toLowerCase() === 'подробнее'
        );

        const normalizeHostTitle = host => {
            if (!host) return;
            const title = host.getAttribute('title');
            if (title && !host.dataset.slfTip) host.dataset.slfTip = title;
            if (title) host.removeAttribute('title');
        };

        const getTooltipHtml = host => {
            if (!host) return '';
            normalizeHostTitle(host);
            const source = host.querySelector?.('.slf-transfer-html-tooltip');
            if (source) return source.innerHTML || '';
            const tip = host.dataset?.slfTip || host.getAttribute?.('data-tooltip') || host.getAttribute?.('aria-label') || '';
            return tip ? `<div>${escape(tip)}</div>` : '';
        };

        const close = () => {
            if (portal) {
                portal.remove();
                portal = null;
            }
            activeHost = null;
            activeMode = '';
        };

        const place = host => {
            if (!portal || !host) return;
            const rect = host.getBoundingClientRect();
            const margin = 8;
            const details = isDetailsHost(host);
            const preferredWidth = details ? 540 : 780;
            const minWidth = details ? 300 : 260;
            const width = Math.max(Math.min(preferredWidth, window.innerWidth - margin * 2), Math.min(minWidth, window.innerWidth - margin * 2));
            portal.style.width = width + 'px';
            portal.style.minWidth = Math.min(minWidth, width) + 'px';

            let left = Math.min(Math.max(rect.left, margin), window.innerWidth - width - margin);
            let top = rect.bottom + 6;
            portal.style.left = left + 'px';
            portal.style.top = top + 'px';

            let after = portal.getBoundingClientRect();
            if (after.right > window.innerWidth - margin) {
                left = Math.max(margin, window.innerWidth - after.width - margin);
                portal.style.left = left + 'px';
            }
            if (after.left < margin) {
                portal.style.left = margin + 'px';
            }
            after = portal.getBoundingClientRect();
            if (after.bottom > window.innerHeight - margin) {
                top = Math.max(margin, rect.top - after.height - 6);
                portal.style.top = top + 'px';
            }
        };

        const open = (host, mode) => {
            if (!host) return;
            const html = getTooltipHtml(host);
            if (!html) return;
            if (portal && activeHost === host && activeMode === mode) {
                place(host);
                return;
            }

            close();
            activeHost = host;
            activeMode = mode;
            portal = document.createElement('div');
            portal.className = 'slf-transfer-html-tooltip-portal ' + (mode === 'click' ? 'slf-transfer-tooltip-click' : 'slf-transfer-tooltip-hover');
            portal.innerHTML = html;
            document.body.appendChild(portal);
            place(host);
        };

        const getHoverHost = target => {
            const host = target?.closest?.('.slf-transfer-chip-tooltip-host');
            if (!host || isDetailsHost(host)) return null;
            return host;
        };

        document.addEventListener('mouseover', e => {
            const host = getHoverHost(e.target);
            if (!host) return;
            open(host, 'hover');
        }, true);

        document.addEventListener('mouseout', e => {
            const host = getHoverHost(e.target);
            if (!host) return;
            const related = e.relatedTarget;
            if (related && host.contains(related)) return;
            if (activeHost === host && activeMode === 'hover') close();
        }, true);

        document.addEventListener('focusin', e => {
            const host = getHoverHost(e.target);
            if (!host) return;
            open(host, 'hover');
        }, true);

        document.addEventListener('focusout', e => {
            const host = getHoverHost(e.target);
            if (!host) return;
            if (activeHost === host && activeMode === 'hover') close();
        }, true);

        document.addEventListener('click', e => {
            const host = e.target.closest?.('.slf-transfer-chip-tooltip-host');
            if (!host) {
                if (!e.target.closest?.('.slf-transfer-html-tooltip-portal')) close();
                return;
            }

            normalizeHostTitle(host);

            if (!isDetailsHost(host)) {
                return;
            }

            if (host === activeHost && portal && activeMode === 'click') close();
            else open(host, 'click');

            e.stopPropagation();
            e.preventDefault();
        }, true);

        window.addEventListener('scroll', () => activeHost ? place(activeHost) : null, true);
        window.addEventListener('resize', () => activeHost ? place(activeHost) : null);
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') close();
        }, true);
    },

    buildStructuredMarkerTooltipHtml(marker) {
        if (!marker) return '';

        const category = this.markerCategory(marker);
        const esc = value => this.escapeHtml(value == null || value === '' ? '—' : String(value));
        const row = (label, value) => `
            <div style="display:grid;grid-template-columns:145px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid #2b2b2b;text-align:left;">
                <span style="color:#aaa;">${esc(label)}</span>
                <span style="color:#ddd;">${esc(value)}</span>
            </div>
        `;
        const section = (title, rows) => `
            <div style="margin:0 0 8px 0;">
                <div style="font-weight:bold;color:#ffd76a;margin-bottom:4px;">${esc(title)}</div>
                ${(rows || []).filter(Boolean).join('')}
            </div>
        `;

        const label = marker.label || '';
        const score = Number(marker.score || 0);
        const baseRows = [
            row('Маркер', label),
            row('Тип', category || 'other'),
            row('Сила сигнала', `${score >= 0 ? '+' : ''}${score}`),
            marker.redFlag ? row('Риск', 'красный флаг') : '',
            marker.hardStop ? row('Стоп', 'hard-stop') : '',
            row('Смысл', marker.text || label)
        ];

        if (category === 'market') {
            const details = marker.marketDetails || {};
            const current = details.currentInfo || {};
            const baseline = details.baseline || null;
            const nominal = details.nominal || {};
            const comparison = baseline?.p75 && current?.value
                ? `текущая цена ${Number(current.value) > Number(baseline.p75) ? 'выше' : 'ниже'} p75 примерно в ${Number(current.value / baseline.p75).toFixed(2)}x`
                : 'нет достаточной базы для сравнения';

            return [
                section('Рынок SLF', [
                    row('Цена сейчас', this.formatSlfMoneyShort(current.value)),
                    row('База скилла MKT', details.skillBasis?.label || ''),
                    row('Рыночный ориентир p75', baseline ? this.formatSlfMoneyShort(baseline.p75) : 'нет выборки'),
                    baseline && current?.value ? row('Отношение к p75', details.ratioText || `${Number(current.value / baseline.p75).toFixed(2)}x`) : '',
                    baseline ? row('Диапазон продаж', `${this.formatSlfMoneyShort(baseline.min)} – ${this.formatSlfMoneyShort(baseline.max)}`) : '',
                    baseline ? row('Выборка', `${baseline.count || 0} продаж`) : '',
                    baseline ? row('Доверие', baseline.confidence || '') : ''
                ]),
                section('Номинал', [
                    row('Номинал', nominal.ratioText || ''),
                    row('Базовый номинал', this.formatSlfMoneyShort(nominal.baseNominal || 0))
                ]),
                section('Сравнение', [
                    row('К p75', comparison),
                    row('Вывод', details.conclusion || marker.text || '')
                ])
            ].join('');
        }

        if (category === 'slf') {
            return section('SLF alter.php', [
                row('SLF delta', label),
                row('Что значит', marker.text || 'сравнение current skill и ИТОГ'),
                row('Решение', score > 0 ? 'положительный внутренний сигнал' : score < 0 ? 'риск просадки относительно ИТОГ' : 'нейтрально')
            ]);
        }

        if (category === 'activity') {
            return section('Готовность / минуты', [
                row('MIN', label),
                row('Что значит', marker.text || ''),
                row('Влияние', score >= 3 ? 'готовность подтверждена' : score < 0 ? 'риск отсутствия актуальной практики' : 'нужна ручная проверка')
            ]);
        }

        if (category === 'tm') {
            return section('Transfermarkt value', [
                row('TM €', label),
                row('Источник', 'Transfermarkt как внешний ориентир, не SLF-цена'),
                row('Что значит', marker.text || '')
            ]);
        }

        if (category === 'trend') {
            return section('Пик / динамика цены', [
                row('Сигнал', label),
                row('Что значит', marker.text || ''),
                row('Влияние', String(label).toLowerCase().includes('fall') ? 'сильный риск падения/старого пика' : 'проверка актуальности относительно пика')
            ]);
        }

        if (category === 'age') {
            return section('Возраст / стадия', [
                row('Возрастной маркер', label),
                row('Стадия', marker.text || ''),
                row('Влияние', score >= 3 ? 'рост/перепродажа возможны' : score < 0 ? 'возрастной риск' : 'оценивать как текущую пользу')
            ]);
        }

        if (category === 'club' || category === 'agent') {
            return section(category === 'club' ? 'Клубный статус' : 'Агент', [
                row('Маркер', label),
                row('Что значит', marker.text || ''),
                row('Риск', marker.redFlag ? 'повышенный' : 'обычный / неизвестный')
            ]);
        }

        if (category === 'contract') {
            return section('Контракт', [
                row('Статус', label),
                row('Что значит', marker.text || ''),
                row('Влияние', marker.redFlag ? 'нужна ручная проверка срока/доступности' : 'положительный или нейтральный статус')
            ]);
        }

        if (category === 'why') {
            return section('Почему такой ранг', [
                row('why', label),
                row('Главные причины', marker.text || ''),
                row('Как использовать', 'быстрый сжатый вывод; подробная расшифровка остаётся в «подробнее»')
            ]);
        }

        if (category === 'talent' || category === 'league') {
            return section('Рост / уровень лиги', [
                row('Сигнал', label),
                row('Что значит', marker.text || ''),
                row('Влияние', score > 0 ? 'потенциальный плюс к развитию/таланту' : 'слабый или рискованный сигнал')
            ]);
        }

        if (category === 'academy') {
            return section('Академия / клубный след', [
                row('Сигнал', label),
                row('Что значит', marker.text || ''),
                row('Влияние', score > 0 ? 'добавляет доверия к профилю' : 'нейтральный или неизвестный след')
            ]);
        }

        if (category === 'rumor') {
            return section('Интерес / слухи', [
                row('Сигнал', label),
                row('Что значит', marker.text || ''),
                row('Влияние', score > 0 ? 'внешний спрос поддерживает актуальность' : 'слабый или отсутствующий сигнал')
            ]);
        }

        return section('Маркер анализа', baseRows);
    },

    renderCompactChip(marker) {
        const label = String(marker?.label || '');
        const structuredTooltip = this.buildStructuredMarkerTooltipHtml(marker);
        const category = this.markerCategory(marker);
        const isMarket = category === 'market';
        const priority = String(marker?.visualPriority || (['slf', 'market', 'tm', 'activity'].includes(category) ? 'high' : ['talent', 'league', 'trend'].includes(category) ? 'medium' : 'low'));
        const priorityCss = priority === 'high'
            ? 'font-weight:700;padding:1px 5px;min-height:18px;line-height:17px;'
            : priority === 'low'
                ? 'font-weight:400;opacity:.78;filter:saturate(.75);'
                : 'font-weight:500;';
        const chipBase = `
            box-sizing:border-box;
            margin:0;
            padding:0 4px;
            border:1px solid ${this.borderByLevel(marker.level)};
            border-radius:4px;
            color:${this.colorByLevel(marker.level)};
            background:${this.bgByLevel(marker.level)};
            vertical-align:middle;
            line-height:16px;
            min-height:17px;
            font-size:10px;
            ${priorityCss}
            text-align:center;
        `;
        const marketCss = `
            display:inline-flex;
            flex:0 0 auto;
            width:auto;
            min-width:max-content;
            max-width:none;
            white-space:nowrap;
            overflow:visible;
            text-overflow:clip;
            cursor:help;
        `;
        const normalCss = `
            display:inline-flex;
            flex:0 1 auto;
            min-width:38px;
            max-width:110px;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
            cursor:help;
        `;

        this.ensureHtmlTooltipStyles();

        return `
            <span class="slf-transfer-chip-tooltip-host slf-transfer-analysis-chip ${isMarket ? 'slf-transfer-mkt-leaf-badge' : ''}" data-slf-tip-category="${this.escapeHtml(category || 'other')}" tabindex="0" style="
                ${chipBase}
                ${isMarket ? marketCss : normalCss}
            ">
                <span style="display:inline-block;min-width:${isMarket ? 'max-content' : '0'};max-width:${isMarket ? 'none' : '100%'};white-space:nowrap;overflow:${isMarket ? 'visible' : 'hidden'};text-overflow:${isMarket ? 'clip' : 'ellipsis'};">${this.escapeHtml(label)}</span>
                <span class="slf-transfer-html-tooltip" style="display:none;">${structuredTooltip}</span>
            </span>
        `;
    },

    shouldShowCompactMarker(marker) {
        if (!marker) return false;

        const label = String(marker.label || '');
        const level = String(marker.level || '');

        if (marker.hardStop || marker.redFlag) return true;
        if (['skip', 'risk', 'hot', 'good', 'watch'].includes(level)) return true;

        if (label.startsWith('SLF ')) return true;
        if (label.includes('now ')) return true;
        if (label.includes('no current')) return true;
        if (label.includes('T') && label.includes('<L')) return true;
        if (label.includes('>') && /\d/.test(label)) return true;

        if (label.includes('TM €')) return true;
        if (label.includes('peak')) return true;
        if (label.includes('collapsed')) return true;
        if (label.includes('contract')) return true;
        if (label.includes('exp ')) return true;
        if (label.includes('rumors') && !label.includes('RUMORS 0')) return true;

        if (label.includes('elite')) return true;
        if (label.includes('strong')) return true;

        return false;
    },

    cleanupStandaloneMarketNominalControls(root = document) {
        const scope = root || document;
        const duplicateDetails = [...scope.querySelectorAll('.slf-transfer-details > summary')]
            .filter(summary => /^(MKT|N)$/i.test((summary.textContent || '').trim()))
            .map(summary => summary.closest('.slf-transfer-details'))
            .filter(Boolean);

        if (duplicateDetails.length) {
            console.warn('[SLF Transfer Analyzer] removed standalone MKT/N controls', duplicateDetails.length);
            duplicateDetails.forEach(el => el.remove());
        }
    },

    bindDetailsAutoClose() {
        if (window.__slf_transfer_details_autoclose) return;
        window.__slf_transfer_details_autoclose = true;

        const positionOpenDetails = details => {
            if (!details || !details.open) return;
            const summary = details.querySelector('summary');
            const popup = details.querySelector(':scope > div');
            if (!summary || !popup) return;

            const rect = summary.getBoundingClientRect();
            popup.style.position = 'fixed';
            popup.style.zIndex = '2147483647';
            popup.style.background = '#181818';
            popup.style.opacity = '1';
            popup.style.pointerEvents = 'auto';
            popup.style.maxWidth = 'min(720px, calc(100vw - 24px))';
            popup.style.maxHeight = 'min(520px, calc(100vh - 24px))';
            popup.style.overflow = 'auto';
            popup.style.right = 'auto';
            popup.style.bottom = 'auto';

            const popupWidth = Math.min(popup.offsetWidth || 620, window.innerWidth - 24);
            let left = Math.min(Math.max(12, rect.left), window.innerWidth - popupWidth - 12);
            let top = rect.bottom + 8;

            const popupHeight = Math.min(popup.offsetHeight || 360, window.innerHeight - 24);
            if (top + popupHeight > window.innerHeight - 12) {
                top = Math.max(12, rect.top - popupHeight - 8);
            }

            popup.style.left = `${left}px`;
            popup.style.top = `${top}px`;
        };

        const positionAllOpenDetails = () => {
            document.querySelectorAll('.slf-transfer-details[open]').forEach(positionOpenDetails);
        };

        window.addEventListener('scroll', positionAllOpenDetails, true);
        window.addEventListener('resize', positionAllOpenDetails, true);

        document.addEventListener('click', e => {
            const clickedDetails = e.target.closest?.('.slf-transfer-details') || null;

            document.querySelectorAll('.slf-transfer-details[open]').forEach(details => {
                if (clickedDetails !== details) {
                    details.removeAttribute('open');
                }
            });
        }, true);

        document.addEventListener('toggle', e => {
            const details = e.target;

            if (!details || !details.matches || !details.matches('.slf-transfer-details')) return;
            if (!details.open) return;

            document.querySelectorAll('.slf-transfer-details[open]').forEach(other => {
                if (other !== details) {
                    other.removeAttribute('open');
                }
            });

            requestAnimationFrame(() => positionOpenDetails(details));
        }, true);

        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;

            document.querySelectorAll('.slf-transfer-details[open]').forEach(details => {
                details.removeAttribute('open');
            });
        }, true);
    },

    });
}
