// Transfer Details Html Builder
// Extracted verbatim from transfer-market-analyzer.js (stage 1 refactor).
// Assigned onto the TransferMarketAnalyzer facade; behaviour unchanged.

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.stage1DetailsHtmlBuilderApplied = true;

    Object.assign(TransferMarketAnalyzer, {
    isUsefulTmText(value) {
        const text = this.normalizeText(value);

        if (!text) return false;

        const lower = text.toLowerCase();

        return ![
            '-',
            '—',
            'n/a',
            'na',
            'unknown',
            'none',
            'null'
        ].includes(lower);
    },

    includesAny(text, terms) {
        const lower = this.normalizeLower(text);

        return (terms || []).some(term => lower.includes(String(term).toLowerCase()));
    },

    isRetired(profile) {
        const terms = this.getCfg().currentClub?.retiredTerms || [];
        return this.includesAny(profile?.currentClub || '', terms);
    },

    isFreeAgent(profile) {
        const terms = this.getCfg().currentClub?.freeAgentTerms || [];
        return this.includesAny(profile?.currentClub || '', terms);
    },

    isNoAgent(profile) {
        const terms = this.getCfg().agent?.noAgentTerms || [];
        return this.includesAny(profile?.playerAgent || '', terms);
    },

    getUsefulRumors(rumors) {
        const list = Array.isArray(rumors) ? rumors : [];

        return list.filter(r => {
            const text = this.normalizeText(r.text || r.rawText || '');
            const lower = text.toLowerCase();

            if (!text) return false;

            if (
                lower.includes('interested club') &&
                (
                    lower.includes('most recent source') ||
                    lower.includes('last reply') ||
                    lower.includes('user assessment') ||
                    lower.includes('verein_id')
                )
            ) {
                return false;
            }

            return !!(r.club || r.dateText || text.length >= 4);
        });
    },

    formatRumorLine(rumor) {
        const club = this.normalizeText(rumor.club || '');
        const date = this.normalizeText(rumor.dateText || '');

        if (club && date) return `${club} · ${date}`;
        if (club) return club;
        if (date) return date;

        return this.normalizeText(rumor.text || rumor.rawText || '')
            .replace(/\s*\|\s*/g, ' · ')
            .slice(0, 160);
    },

    buildTmDetailsHtml(profile) {
        const lines = [];

        if (this.isUsefulTmText(profile.currentClub)) {
            lines.push(`<div><b>Current club:</b> ${this.escapeHtml(profile.currentClub)}</div>`);
        }

        if (this.isUsefulTmText(profile.playerAgent)) {
            lines.push(`<div><b>Agent:</b> ${this.escapeHtml(profile.playerAgent)}</div>`);
        }

        if (this.isUsefulTmText(profile.contractExpires)) {
            lines.push(`<div><b>Контракт:</b> ${this.escapeHtml(profile.contractExpires)}</div>`);
        }

        if (this.isUsefulTmText(profile.joined)) {
            lines.push(`<div><b>Joined:</b> ${this.escapeHtml(profile.joined)}</div>`);
        }

        if (this.isUsefulTmText(profile.lastContractExtension)) {
            lines.push(`<div><b>Extension:</b> ${this.escapeHtml(profile.lastContractExtension)}</div>`);
        }

        if (this.isUsefulTmText(profile.marketValueText)) {
            lines.push(`<div><b>TM value:</b> ${this.escapeHtml(profile.marketValueText)}</div>`);
        }

        if (profile.marketValueIsHistorical && (profile.lastKnownMarketValueEur || profile.lastKnownMarketValueText)) {
            lines.push(`<div><b>Old TM value:</b> ${this.escapeHtml(profile.lastKnownMarketValueText || TMEnrichmentLayer.formatMoney(profile.lastKnownMarketValueEur))} ${this.escapeHtml(profile.lastKnownMarketValueDate || '')} — retired, not current market value</div>`);
        }

        if (this.isUsefulTmText(profile.highestMarketValueText)) {
            lines.push(`<div><b>Highest TM:</b> ${this.escapeHtml(profile.highestMarketValueText)} ${this.escapeHtml(profile.highestMarketValueDate || '')}</div>`);
        }

        if (profile.activity) {
            const a = profile.activity;
            const activityParts = [];

            if (a.startingElevenPct != null) activityParts.push(`XI ${a.startingElevenPct}%`);
            if (a.minutesPct != null) activityParts.push(`Min ${a.minutesPct}%`);
            if (a.goalParticipationPct != null) activityParts.push(`GP ${a.goalParticipationPct}%`);

            if (activityParts.length) {
                lines.push(`<div><b>Activity:</b> ${this.escapeHtml(activityParts.join(' · '))}</div>`);
            }
        }

        const youthClubs = Array.isArray(profile.youthClubs) ? profile.youthClubs : [];

        if (youthClubs.length) {
            lines.push(`<div><b>Youth Clubs:</b> ${this.escapeHtml(youthClubs.join(', '))}</div>`);
        }

        const history = Array.isArray(profile.transferHistory)
            ? profile.transferHistory
            : [];

        if (history.length) {
            const historyPreview = history
                .slice(0, 5)
                .map(h => this.escapeHtml(this.normalizeText(h.text || '').slice(0, 220)))
                .filter(Boolean)
                .map(x => `<li>${x}</li>`)
                .join('');

            lines.push(`
                <div style="margin-top:6px;color:#8cf;font-weight:bold;">Transfer history: ${history.length}</div>
                <ul style="margin:3px 0 0 16px;padding:0;color:#ccc;">
                    ${historyPreview}
                </ul>
            `);
        }

        const rumors = this.getUsefulRumors(profile.rumors);

        if (rumors.length) {
            const rumorsHtml = rumors
                .slice(0, 6)
                .map(r => this.formatRumorLine(r))
                .filter(Boolean)
                .map(x => `<li>${this.escapeHtml(x)}</li>`)
                .join('');

            lines.push(`
                <div style="margin-top:6px;color:#ffd76a;font-weight:bold;">Rumors: ${rumors.length}</div>
                <ul style="margin:3px 0 0 16px;padding:0;color:#ccc;">
                    ${rumorsHtml}
                </ul>
            `);
        }

        if (!lines.length) return '';

        return `
            <details class="slf-transfer-details" style="
                display:inline-block;
                margin-left:5px;
                position:relative;
                vertical-align:middle;
            ">
                <summary style="
                    cursor:pointer;
                    color:#aaa;
                    display:inline-block;
                    list-style:none;
                    border:1px solid #444;
                    border-radius:4px;
                    padding:1px 4px;
                    background:#202020;
                    white-space:nowrap;
                ">подробнее</summary>

                <div style="
                    position:absolute;
                    right:0;
                    top:20px;
                    z-index:999999;
                    width:580px;
                    max-height:380px;
                    overflow:auto;
                    padding:8px 10px;
                    background:#181818;
                    color:#ddd;
                    border:1px solid #666;
                    border-radius:6px;
                    box-shadow:0 8px 24px rgba(0,0,0,0.75);
                    white-space:normal;
                    line-height:1.35;
                ">
                    ${lines.join('')}
                </div>
            </details>
        `;
    },

    buildSlfDetailsHtml(alter) {
        if (!alter) return '';

        const lines = [];

        if (alter.currentSkill != null || alter.finalSkill != null) {
            lines.push(`<div><b>SLF skill:</b> ${this.escapeHtml(SLFAlterLayer.formatSkill(alter.currentSkill))} → ${this.escapeHtml(SLFAlterLayer.formatSkill(alter.finalSkill))} ${alter.skillDelta != null ? '(' + this.escapeHtml(SLFAlterLayer.formatDelta(alter.skillDelta)) + ')' : ''}</div>`);
        }

        if (alter.currentRow) {
            const row = alter.currentRow;
            lines.push(`<div><b>Current season:</b> ${this.escapeHtml(row.season)} · ${this.escapeHtml(row.minutesPct)}% / ${this.escapeHtml(row.minutes || 0)} min · L${this.escapeHtml(row.leagueLevel)}/${this.escapeHtml(row.leagueSkill)} · ${this.escapeHtml(row.gamesPlayed)}/${this.escapeHtml(row.gamesPossible)} games · starts ${this.escapeHtml(row.starts ?? '')}</div>`);
        } else if (alter.staleActivity) {
            lines.push(`<div><b>Current season:</b> no current league row. Last season: ${this.escapeHtml(alter.lastSeasonYear || '?')}</div>`);
        }

        if (alter.talentUpgradeRow) {
            const row = alter.talentUpgradeRow;
            lines.push(`<div><b>Talent-up signal:</b> T${this.escapeHtml(alter.talent)} → L${this.escapeHtml(row.leagueLevel)} · ${this.escapeHtml(row.minutesPct)}% · ${this.escapeHtml(row.season)}</div>`);
        }

        if (alter.bestEligibleRow) {
            const row = alter.bestEligibleRow;
            lines.push(`<div><b>Best 40%+ season:</b> ${this.escapeHtml(row.season)} · ${this.escapeHtml(row.minutesPct)}% · L${this.escapeHtml(row.leagueLevel)}/${this.escapeHtml(row.leagueSkill)} · ${this.escapeHtml(row.teamText || '')}</div>`);
        }

        if (alter.seasonSkills?.length) {
            lines.push(`<div><b>Season skills:</b> ${this.escapeHtml(alter.seasonSkills.map(x => `${x.season}: ${x.skill}`).join(' · '))}</div>`);
        }

        if (!lines.length) return '';

        return `
            <details class="slf-transfer-details" style="
                display:inline-block;
                margin-left:5px;
                position:relative;
                vertical-align:middle;
            ">
                <summary style="
                    cursor:pointer;
                    color:#9fd3ff;
                    display:inline-block;
                    list-style:none;
                    border:1px solid #446;
                    border-radius:4px;
                    padding:1px 4px;
                    background:#202020;
                    white-space:nowrap;
                ">SLF</summary>

                <div style="
                    position:absolute;
                    right:0;
                    top:20px;
                    z-index:999999;
                    width:620px;
                    max-height:380px;
                    overflow:auto;
                    padding:8px 10px;
                    background:#181818;
                    color:#ddd;
                    border:1px solid #666;
                    border-radius:6px;
                    box-shadow:0 8px 24px rgba(0,0,0,0.75);
                    white-space:normal;
                    line-height:1.35;
                ">
                    ${lines.join('')}
                </div>
            </details>
        `;
    },


    buildScoreBreakdown(markers) {
        const sum = cats => (markers || [])
            .filter(marker => cats.includes(this.markerCategory(marker)))
            .reduce((total, marker) => total + Number(marker.score || 0), 0);
        const value = sum(['market', 'slf', 'tm']);
        const readiness = sum(['activity', 'league']);
        const growth = sum(['talent', 'age', 'trend']);
        const risk = (markers || [])
            .filter(marker => marker.redFlag || marker.hardStop || Number(marker.score || 0) < 0)
            .reduce((total, marker) => total + Math.min(0, Number(marker.score || 0)), 0);
        return `value ${value >= 0 ? '+' : ''}${value} · readiness ${readiness >= 0 ? '+' : ''}${readiness} · growth ${growth >= 0 ? '+' : ''}${growth} · risk ${risk}`;
    },

    buildDecisionDetailsHtml(row, profile, slfAlter, markers, verdict) {
        const marketMarker = (markers || []).find(m => this.markerCategory(m) === 'market') || null;
        const market = marketMarker?.marketDetails || {};
        const baseline = market?.baseline || null;
        const nominalRatio = Number(row?.nominalRatio || market?.nominal?.ratio || 0);
        const baseNominal = Number(row?.nominalBase || market?.nominal?.baseNominal || 0);
        const currentPrice = Number(row?.slfPrice || market?.currentInfo?.value || 0);
        const p75 = Number(baseline?.p75 || 0);
        const comparison = currentPrice && p75
            ? `текущая цена ${currentPrice > p75 ? 'выше' : 'ниже'} p75 примерно в ${(currentPrice / p75).toFixed(2)}x`
            : '';
        const riskMarkers = (markers || [])
            .filter(m => m && (m.redFlag || m.hardStop || ['risk', 'skip'].includes(String(m.level || ''))))
            .map(m => m.label || m.text || '')
            .filter(Boolean)
            .slice(0, 5);

        const rowHtml = (label, value) => {
            const clean = value == null || value === '' ? '—' : String(value);
            return `
                <div style="display:grid;grid-template-columns:160px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid #2b2b2b;">
                    <span style="color:#aaa;">${this.escapeHtml(label)}</span>
                    <span style="color:#ddd;">${this.escapeHtml(clean)}</span>
                </div>
            `;
        };

        const section = (title, rows) => {
            const body = (rows || []).filter(Boolean).join('');
            if (!body) return '';
            return `
                <div style="margin:0 0 8px 0;padding:7px 9px;background:#151515;border:1px solid #333;border-radius:5px;">
                    <div style="font-weight:bold;color:#ffd76a;margin-bottom:5px;">${this.escapeHtml(title)}</div>
                    ${body}
                </div>
            `;
        };

        const position = Array.isArray(row?.positions) && row.positions.length ? row.positions.join('/') : '';
        const tmValue = profile?.marketValueText || (profile?.marketValueEur ? TMEnrichmentLayer.formatMoney(profile.marketValueEur) : '');
        const slfSkill = slfAlter && (slfAlter.currentSkill != null || slfAlter.finalSkill != null)
            ? `${SLFAlterLayer.formatSkill(slfAlter.currentSkill)} → ${SLFAlterLayer.formatSkill(slfAlter.finalSkill)}${slfAlter.skillDelta != null ? ' (' + SLFAlterLayer.formatDelta(slfAlter.skillDelta) + ')' : ''}`
            : (row?.scoutSkill ? String(row.scoutSkill) : '');
        const minutes = slfAlter?.currentRow?.minutesPct != null
            ? `${slfAlter.currentRow.minutesPct}% · ${slfAlter.currentRow.minutes || 0} min`
            : (slfAlter?.staleActivity ? 'нет текущего сезона' : '');

        const plusMarkers = (markers || []).filter(m => Number(m.score || 0) > 0).map(m => m.label || m.text || '').filter(Boolean).slice(0, 5);
        const minusMarkers = (markers || []).filter(m => Number(m.score || 0) < 0 || m.redFlag || m.hardStop).map(m => m.label || m.text || '').filter(Boolean).slice(0, 5);
        const scoreBreakdown = this.buildScoreBreakdown(markers || []);
        const whyReasons = this.buildWhyRankReasons(markers || [], verdict).join(' · ');

        const html = [
            section('Почему такой ранг', [
                rowHtml('Итог', `${this.getShortVerdictLabel(verdict)}${verdict?.rank ? ' #' + verdict.rank : ''}`),
                rowHtml('Score', Number(verdict?.score || 0).toFixed(1).replace(/\.0$/, '')),
                rowHtml('why', whyReasons),
                rowHtml('Плюсы', plusMarkers.join(' · ')),
                rowHtml('Минусы', minusMarkers.join(' · ')),
                rowHtml('Score breakdown', scoreBreakdown)
            ]),
            section('Игрок', [
                rowHtml('Позиция', position),
                rowHtml('Возраст / талант', [row?.age ? `${row.age} лет` : '', row?.talent ? `T${row.talent}` : ''].filter(Boolean).join(' · ')),
                rowHtml('Скилл / потенциал', [slfSkill, row?.potentialText || ''].filter(Boolean).join(' · ')),
                rowHtml('Минуты текущего сезона', minutes)
            ]),
            section('Рынок SLF', [
                rowHtml('Цена сейчас', this.formatSlfMoneyShort(currentPrice)),
                rowHtml('База скилла MKT', market?.skillBasis?.label || ''),
                rowHtml('Рыночный ориентир p75', baseline ? this.formatSlfMoneyShort(p75) : 'нет выборки'),
                baseline && currentPrice ? rowHtml('Отношение к p75', `${(currentPrice / p75).toFixed(2)}x`) : '',
                baseline ? rowHtml('Диапазон продаж', `${this.formatSlfMoneyShort(baseline.min)} – ${this.formatSlfMoneyShort(baseline.max)}`) : '',
                baseline ? rowHtml('Выборка / доверие', `${baseline.count || 0} продаж / ${baseline.confidence || ''}`) : '',
                rowHtml('Номинал', nominalRatio ? `${nominalRatio.toFixed(1).replace(/\.0$/, '')}x` : ''),
                rowHtml('Базовый номинал', this.formatSlfMoneyShort(baseNominal)),
                rowHtml('Сравнение', comparison),
                rowHtml('Интерпретация', market?.conclusion || '')
            ]),
            section('TM / статус', [
                rowHtml('TM value / signal', tmValue),
                rowHtml('Клуб', profile?.currentClub || ''),
                rowHtml('Агент', profile?.playerAgent || ''),
                rowHtml('Контракт', profile?.contractExpires || '')
            ]),
            section('Риски / решение', [
                rowHtml('Verdict', verdict?.label || ''),
                rowHtml('Причина', verdict?.reason || ''),
                rowHtml('Риск-флаги', riskMarkers.join(' · ')),
                rowHtml('Короткий вывод', this.buildTransferShortDecision(verdict, market))
            ])
        ].filter(Boolean).join('');

        if (!html) return '';

        this.ensureHtmlTooltipStyles();

        return `
            <span class="slf-transfer-chip-tooltip-host slf-transfer-decision-details-trigger" tabindex="0" style="
                display:inline-flex;
                align-items:center;
                width:max-content;
                max-width:max-content;
                white-space:nowrap;
                cursor:pointer;
                color:#ddd;
                border:1px solid #555;
                border-radius:4px;
                padding:1px 5px;
                background:#202020;
                line-height:16px;
                min-height:17px;
                font-size:10px;
                box-sizing:border-box;
                vertical-align:middle;
            ">
                подробнее
                <span class="slf-transfer-html-tooltip" style="display:none;">${html}</span>
            </span>
        `;
    },

    buildTransferShortDecision(verdict, market) {
        const level = String(verdict?.level || '');
        const ratio = Number(market?.ratio || 0);
        if (level === 'skip' || level === 'risk' || ratio > 1.5) return 'skip / только при исключительных подтверждениях';
        if (level === 'watch' || ratio > 1.05) return 'watch / дорого, нужна дополнительная проверка';
        if (level === 'good' || level === 'hot' || (ratio && ratio <= 0.85)) return 'buy candidate / проверить финально вручную';
        return 'watch / нейтральная зона';
    },

    });
}
