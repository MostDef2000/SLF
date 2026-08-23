// Transfer Badge Renderer
// Part of the TransferMarketAnalyzer badge rendering subsystem (issue #275).
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
