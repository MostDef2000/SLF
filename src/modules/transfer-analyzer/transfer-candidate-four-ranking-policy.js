// Transfer Candidate Scanner four-ranking policy
// ===============================================

if (typeof TransferCandidateScanner !== 'undefined' && TransferCandidateScanner && !TransferCandidateScanner.fourRankingPolicyApplied) {
    TransferCandidateScanner.fourRankingPolicyApplied = true;

    const previousStorageKey = TransferCandidateScanner.storageKey;
    TransferCandidateScanner.storageKey = 'slf_transfer_candidate_scanner_v8_meta';
    TransferCandidateScanner.schema = 'slf_transfer_candidate_scanner_v8_meta';
    TransferCandidateScanner.legacyStorageKeys = [...new Set([
        ...(TransferCandidateScanner.legacyStorageKeys || []),
        previousStorageKey,
        'slf_transfer_candidate_scanner_v7_meta'
    ])];

    TransferCandidateScanner.legacyStorageKeys.forEach(key => {
        if (key && key !== TransferCandidateScanner.storageKey) localStorage.removeItem(key);
    });

    TransferCandidateScanner.rankingMode = 'young';
    TransferCandidateScanner.rankingSourceRows = [];
    TransferCandidateScanner.rankingLabels = {
        young: 'Молодые на вырост',
        now: 'Здесь и сейчас',
        veteran: 'Ветераны за недорого',
        delta: 'Максимальный рост'
    };

    TransferCandidateScanner.clampScore = function clampScore(value) {
        return Math.max(0, Math.min(100, Number(value || 0)));
    };

    TransferCandidateScanner.logScore = function logScore(value, minimum, maximum) {
        const number = Number(value || 0);
        if (number <= 0) return 0;
        const low = Math.max(1, Number(minimum || 1));
        const high = Math.max(low + 1, Number(maximum || low + 1));
        return this.clampScore((Math.log10(number / low + 1) / Math.log10(high / low + 1)) * 100);
    };

    TransferCandidateScanner.playerMetrics = function playerMetrics(row) {
        const enrichment = row.enrichment || {};
        const age = Number(row.age || 0) || null;
        const talent = Number(row.talent || 0) || 0;
        const potential = Number(row.potentialLevel || 0) || 0;
        const currentSkill = Number(enrichment.currentSkill || row.scoutSkill || 0) || 0;
        const finalSkill = Number(enrichment.finalSkill || currentSkill || 0) || 0;
        const delta = Number(enrichment.skillDelta || 0);
        const minutes = Number(enrichment.currentSeasonMinutes || 0);
        const minutesPct = Number(enrichment.minutesPct || 0);
        const leagueSkill = Number(enrichment.leagueSkill || 0);
        const leagueLevel = Number(enrichment.leagueLevel || 0);
        const tmValue = Number(enrichment.tmValueEur || 0);
        const slfPrice = Number(row.price || 0);
        const retired = enrichment.isRetired === true;
        const stale = enrichment.staleActivity === true;

        const absoluteMinutesScore = this.clampScore((minutes / 1800) * 100);
        const minutesScore = absoluteMinutesScore * 0.7 + this.clampScore(minutesPct) * 0.3;
        const leagueSkillScore = this.clampScore(((leagueSkill - 110) / 90) * 100);
        const leagueLevelScore = this.clampScore(((leagueLevel - 1) / 4) * 100);
        const leagueScore = leagueSkillScore * 0.85 + leagueLevelScore * 0.15;
        const tmScore = this.logScore(tmValue, 25000, 5000000);
        const finalSkillScore = this.clampScore(((finalSkill - 100) / 100) * 100);
        const currentSkillScore = this.clampScore(((currentSkill - 100) / 100) * 100);
        const deltaScore = this.clampScore(((delta + 5) / 25) * 100);
        const youngAgeScore = age == null ? 0 : age <= 21 ? 100 : age === 22 ? 90 : age === 23 ? 80 : age === 24 ? 70 : age === 25 ? 60 : 0;
        const nowAgeScore = age == null ? 0 : age <= 22 ? 80 : age <= 27 ? 100 : age <= 30 ? 85 : age <= 33 ? 55 : 25;
        const talentScore = this.clampScore(talent * 20);
        const potentialScore = potential >= 5 ? 100 : potential === 4 ? 80 : potential === 3 ? 60 : potential === 2 ? 35 : potential === 1 ? 15 : 0;
        const priceValueScore = slfPrice > 0 ? 100 - this.logScore(slfPrice, 10000, 500000000) : 0;
        const veteranRiskScore = retired ? 20 : stale ? 50 : 100;

        const qualitySignals = [
            finalSkill > 0,
            Number.isFinite(delta),
            minutes > 0 || minutesPct > 0,
            leagueSkill > 0,
            tmValue > 0
        ];
        const dataQuality = Math.round((qualitySignals.filter(Boolean).length / qualitySignals.length) * 100);
        const warnings = [];
        if (retired) warnings.push('retired');
        if (stale) warnings.push('stale');
        if (!minutes && !minutesPct) warnings.push('нет минут');
        if (!leagueSkill) warnings.push('нет лиги');
        if (!tmValue) warnings.push('нет TM');
        if (delta > 30) warnings.push('дельта требует проверки');

        return {
            age, talent, potential, currentSkill, finalSkill, delta, minutes, minutesPct,
            leagueSkill, leagueLevel, tmValue, slfPrice, retired, stale,
            minutesScore, leagueScore, tmScore, finalSkillScore, currentSkillScore,
            deltaScore, youngAgeScore, nowAgeScore, talentScore, potentialScore,
            priceValueScore, veteranRiskScore, dataQuality, warnings
        };
    };

    TransferCandidateScanner.categoryScore = function categoryScore(row, mode) {
        const m = this.playerMetrics(row);

        if (mode === 'young') {
            const eligible = m.age != null && m.age <= 25 && m.delta > 0 && (m.minutes > 0 || m.minutesPct > 0 || m.leagueSkill > 0 || m.tmValue > 0) && !m.retired;
            if (!eligible) return null;
            return Number((
                m.deltaScore * 0.30 +
                m.leagueScore * 0.22 +
                m.minutesScore * 0.18 +
                m.youngAgeScore * 0.10 +
                m.tmScore * 0.10 +
                m.finalSkillScore * 0.07 +
                m.talentScore * 0.03
            ).toFixed(1));
        }

        if (mode === 'now') {
            if (m.retired) return null;
            return Number((
                m.finalSkillScore * 0.27 +
                m.minutesScore * 0.23 +
                m.leagueScore * 0.22 +
                m.tmScore * 0.15 +
                this.clampScore(m.minutesPct) * 0.07 +
                m.talentScore * 0.04 +
                m.priceValueScore * 0.02
            ).toFixed(1));
        }

        if (mode === 'veteran') {
            const eligible = (m.age != null && m.age >= 30) || m.retired || m.stale;
            if (!eligible || m.finalSkill <= 0) return null;
            return Number((
                m.finalSkillScore * 0.38 +
                m.priceValueScore * 0.30 +
                m.currentSkillScore * 0.15 +
                m.leagueScore * 0.08 +
                m.minutesScore * 0.04 +
                m.veteranRiskScore * 0.05
            ).toFixed(1));
        }

        if (mode === 'delta') return m.delta > 0 ? Number(m.delta.toFixed(1)) : null;
        return null;
    };

    TransferCandidateScanner.rankingRows = function rankingRows(mode) {
        const selectedMode = mode || this.rankingMode || 'young';
        return (this.rankingSourceRows || [])
            .filter(row => row.enrichment?.completedAt && !row.enrichment.error)
            .map(row => ({ ...row, categoryScore: this.categoryScore(row, selectedMode), metrics: this.playerMetrics(row) }))
            .filter(row => row.categoryScore != null)
            .sort((a, b) => {
                if (selectedMode !== 'delta') return b.categoryScore - a.categoryScore;
                return b.metrics.delta - a.metrics.delta ||
                    b.metrics.leagueSkill - a.metrics.leagueSkill ||
                    b.metrics.minutes - a.metrics.minutes ||
                    b.metrics.tmValue - a.metrics.tmValue ||
                    (a.metrics.age || 99) - (b.metrics.age || 99) ||
                    b.metrics.finalSkill - a.metrics.finalSkill;
            })
            .slice(0, this.resultLimit);
    };

    TransferCandidateScanner.rankRows = function rankFourCategories(rows) {
        this.rankingSourceRows = this.dedupeRows(rows || []);
        return this.rankingRows(this.rankingMode);
    };

    TransferCandidateScanner.setRankingMode = function setRankingMode(mode) {
        if (!this.rankingLabels[mode]) return;
        this.rankingMode = mode;
        this.finalRows = this.rankingRows(mode);
        this.render();
    };

    TransferCandidateScanner.renderRankingTabs = function renderRankingTabs() {
        return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;">${Object.entries(this.rankingLabels).map(([mode, label]) =>
            `<button type="button" data-slf-ranking="${mode}" style="font-weight:${this.rankingMode === mode ? 'bold' : 'normal'};">${this.escape(label)}</button>`
        ).join('')}</div>`;
    };

    TransferCandidateScanner.render = function renderFourRankings() {
        this.renderProgress();
        const box = document.getElementById('slf-candidate-results');
        if (!box) return;

        const rows = this.rankingRows(this.rankingMode);
        this.finalRows = rows;
        const tabs = this.renderRankingTabs();
        if (!rows.length) {
            const message = this.state.phase === 'idle'
                ? 'Нажми «Найти Top 20», чтобы проанализировать текущую выдачу.'
                : 'Идёт анализ всех игроков. Рейтинги обновляются автоматически.';
            box.innerHTML = `${tabs}<div style="color:#888;padding:6px 0;">${message}</div>`;
        } else {
            const columns = '32px 52px minmax(160px,1fr) 40px 42px 46px 52px 52px 58px 58px 62px 62px 74px minmax(110px,1fr)';
            box.innerHTML = `${tabs}
                <div style="display:grid;grid-template-columns:${columns};gap:5px;padding:5px 4px;border-bottom:1px solid #445;font-weight:bold;color:#9aaebe;position:sticky;top:0;background:#14181d;z-index:2;">
                    <span>#</span><span>Score</span><span>Игрок</span><span>Возр.</span><span>Тал.</span><span>Скилл</span><span>Финал</span><span>Δ</span><span>Мин.</span><span>Мин%</span><span>Лига</span><span>Цена</span><span>TM</span><span>Данные / риск</span>
                </div>
                ${rows.map((row, index) => this.fourRankingRowHtml(row, columns, index + 1)).join('')}`;
        }

        box.querySelectorAll('[data-slf-ranking]').forEach(button => {
            button.onclick = () => this.setRankingMode(button.dataset.slfRanking);
        });
    };

    TransferCandidateScanner.fourRankingRowHtml = function fourRankingRowHtml(row, columns, rank) {
        const m = row.metrics || this.playerMetrics(row);
        const color = rank <= 5 ? '#7cff7c' : rank <= 10 ? '#ffda72' : '#ddd';
        const league = m.leagueSkill ? `${m.leagueLevel || '?'} / ${Math.round(m.leagueSkill)}` : '—';
        const warningText = m.warnings.length ? m.warnings.join(', ') : 'OK';
        const score = this.rankingMode === 'delta' ? `+${row.categoryScore.toFixed(1)}` : row.categoryScore.toFixed(1);
        return `<div style="display:grid;grid-template-columns:${columns};gap:5px;align-items:center;padding:5px 4px;border-bottom:1px solid #2c343b;">
            <span style="color:${color};font-weight:bold;">${rank}</span>
            <span style="font-weight:bold;">${score}</span>
            <a href="${this.escape(row.playerUrl)}" style="color:#d8e9ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.escape(row.name || row.playerId)}</a>
            <span>${m.age ?? '—'}</span>
            <span>${m.talent || '—'}</span>
            <span>${m.currentSkill ? m.currentSkill.toFixed(1) : '—'}</span>
            <span>${m.finalSkill ? m.finalSkill.toFixed(1) : '—'}</span>
            <span style="color:${m.delta > 0 ? '#7cff7c' : '#ccc'};">${Number.isFinite(m.delta) ? `${m.delta >= 0 ? '+' : ''}${m.delta.toFixed(1)}` : '—'}</span>
            <span>${m.minutes || '—'}</span>
            <span>${m.minutesPct || '—'}</span>
            <span>${league}</span>
            <span>${this.moneyText(m.slfPrice) || '—'}</span>
            <span>${this.moneyText(m.tmValue) || '—'}</span>
            <span title="${this.escape(warningText)}">${m.dataQuality}% · ${this.escape(warningText)}</span>
        </div>`;
    };
}