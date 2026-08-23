// Transfer History Vps Sync
// Extracted verbatim from transfer-market-analyzer.js (stage 1 refactor).
// Assigned onto the TransferMarketAnalyzer facade; behaviour unchanged.

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.stage1HistoryVpsSyncApplied = true;

    Object.assign(TransferMarketAnalyzer, {
    parseHistoryDate(value) {
        const text = this.normalizeText(value);
        const m = text.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);

        if (!m) {
            return { dateText: text, dateTs: null };
        }

        const day = Number(m[1]);
        const month = Number(m[2]);
        const year = Number(m[3]);
        const hour = Number(m[4] || 0);
        const minute = Number(m[5] || 0);
        const ts = new Date(year, month - 1, day, hour, minute, 0, 0).getTime();

        return {
            dateText: text,
            dateTs: Number.isFinite(ts) ? ts : null
        };
    },

    parseHistoryVisibleRows() {
        const table = this.findTransferTable();

        if (!table) return [];

        this.ensureAnalysisHeader(table);

        const map = this.getHeaderMap(table);
        const rows = [...table.querySelectorAll('tr')];

        const parsed = rows
            .map((tr, index) => this.parseHistoryRow(tr, index, map))
            .filter(Boolean);

        debugLog('[SLF Transfer History] parseHistoryVisibleRows', parsed);

        return parsed;
    },

    parseHistoryRow(tr, index, map) {
        const text = this.normalizeText(tr.innerText);
        const lower = text.toLowerCase();

        if (!text) return null;
        if (lower.includes('амплуа') && lower.includes('сумма')) return null;

        const cells = [...tr.querySelectorAll('td')];
        if (cells.length < 10) return null;

        const rawCells = cells.map(td => this.normalizeText(td.innerText || td.textContent || ''));

        const dateIndex = rawCells.findIndex(cell =>
            /\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}(?:\s+\d{1,2}:\d{2})?/.test(cell)
        );

        if (dateIndex < 0) return null;

        const cell = offset => rawCells[dateIndex + offset] || '';

        const playerLink = this.findPlayerLinkInRow(tr);
        if (!playerLink) return null;

        const href = playerLink.getAttribute('href') || '';
        const idFromHref = (href.match(/id=(\d+)/) || [])[1];
        const idFromRowStart = (text.match(/^\s*(\d{4,})/) || [])[1];
        const playerId = idFromHref || idFromRowStart;

        if (!playerId) return null;

        const linkTitle = this.normalizeText(playerLink.getAttribute('title') || '');
        const linkText = this.normalizeText(playerLink.textContent || '');

        const dateRaw = cell(0);
        const date = this.parseHistoryDate(dateRaw);

        const positionsText = [cell(1), cell(2)]
            .filter(Boolean)
            .join(' ')
            .trim();

        const name = this.cleanPlayerName(linkTitle || linkText || cell(3));

        const age = this.parseNumber(cell(4));
        const talent = this.parseNumber(cell(5));
        const scoutSkill = this.parseNumber(cell(6));

        const fromClubText = cell(7);
        const toClubText = cell(8);
        const salePriceText = cell(9);
        const salePrice = this.parseMoney(salePriceText);

        const historyAuxText = cell(10);
        const buyerManagerText = cell(11);
        const sellerManagerText = cell(12);

        const row = {
            rowEl: tr,
            originalIndex: index,
            playerId: String(playerId),
            playerUrl: buildSlfUrl(`/player.php?action=view&id=${encodeURIComponent(playerId)}`),

            name,
            positions: this.parsePositions(positionsText || text),

            age,
            talent,
            potentialText: '',
            scoutSkill,

            slfPriceText: salePriceText,
            salePriceText,
            salePrice,
            transferDateText: date.dateText,
            transferDateTs: date.dateTs,
            fromClubText,
            toClubText,
            sellerManagerText,
            buyerManagerText,
            transferTypeText: historyAuxText,
            historyAuxText,
            historySchemaVersion: 2,
            historyParserVersion: 'history_v2_cells',

            rawCells,
            rawText: text,
            completedTransfer: true,

            tmUrl: '',
            tmProfile: null,
            tmValueEur: 0
        };

        tr.dataset.slfOriginalIndex = String(index);
        tr.dataset.slfPlayerId = row.playerId;
        tr.dataset.slfCompletedTransfer = '1';
        tr.dataset.slfTransferPrice = String(salePrice || 0);
        tr.dataset.slfTransferDateTs = String(date.dateTs || 0);

        return row;
    },

    getHistorySyncedStorageKey() {
        return 'slf_transfer_history_synced_keys_v2';
    },

    loadHistorySyncedKeys() {
        try {
            return JSON.parse(localStorage.getItem(this.getHistorySyncedStorageKey()) || '{}');
        } catch (e) {
            return {};
        }
    },

    saveHistorySyncedKeys(data) {
        localStorage.setItem(this.getHistorySyncedStorageKey(), JSON.stringify(data || {}));
    },

    getHistoryVpsCacheKey() {
        return 'slf_transfer_history_vps_records_cache_v1';
    },

    loadHistoryVpsCache() {
        try {
            return JSON.parse(localStorage.getItem(this.getHistoryVpsCacheKey()) || '{}');
        } catch (e) {
            return {};
        }
    },

    saveHistoryVpsCache(data) {
        try {
            localStorage.setItem(this.getHistoryVpsCacheKey(), JSON.stringify({
                savedAt: Date.now(),
                rows: Array.isArray(data) ? data.slice(-3000) : []
            }));
        } catch (e) {
            console.warn('[SLF Transfer History] VPS cache save failed', e);
        }
    },

    normalizeHistoryVpsRows(data) {
        const rows = normalizeServerRows(data)
            .filter(row => row && (row.recordType === 'completed_transfer' || row.eventType === 'completed_transfer'));

        return rows;
    },

    async loadHistoryVpsRows() {
        try {
            const result = await Api.getPromise(CONFIG.COLLECTIONS.TRANSFER_HISTORY);
            const rows = this.normalizeHistoryVpsRows(result.data);
            this.saveHistoryVpsCache(rows);
            return rows;
        } catch (e) {
            const cache = this.loadHistoryVpsCache();
            const rows = Array.isArray(cache.rows) ? cache.rows : [];
            if (rows.length) return rows;
            throw e;
        }
    },

    buildHistoryMatchKeys(row) {
        const keys = [];
        if (!row) return keys;

        const playerId = String(row.playerId || '').trim();
        const price = Number(row.salePrice || 0);
        const dateText = this.normalizeText(row.transferDateText || '');
        const dateTs = Number(row.transferDateTs || 0);

        if (playerId && price && dateText) keys.push(`pid:${playerId}|price:${price}|date:${dateText}`);
        if (playerId && price && dateTs) keys.push(`pid:${playerId}|price:${price}|ts:${dateTs}`);
        if (playerId && dateText) keys.push(`pid:${playerId}|date:${dateText}`);
        if (playerId && price) keys.push(`pid:${playerId}|price:${price}`);
        if (playerId) keys.push(`pid:${playerId}`);

        return keys;
    },

    buildHistoryVpsRecordKeys(record) {
        const transfer = record?.transfer || {};
        const player = record?.player || {};
        const playerId = String(player.playerId || record.playerId || '').trim();
        const price = Number(transfer.price || record.price || 0);
        const dateText = this.normalizeText(transfer.dateText || record.dateText || '');
        const dateTs = Number(transfer.dateTs || record.dateTs || 0);
        const keys = [];

        if (playerId && price && dateText) keys.push(`pid:${playerId}|price:${price}|date:${dateText}`);
        if (playerId && price && dateTs) keys.push(`pid:${playerId}|price:${price}|ts:${dateTs}`);
        if (playerId && dateText) keys.push(`pid:${playerId}|date:${dateText}`);
        if (playerId && price) keys.push(`pid:${playerId}|price:${price}`);
        if (playerId) keys.push(`pid:${playerId}`);

        return keys;
    },

    indexHistoryVpsRows(records) {
        const map = new Map();

        (records || []).forEach(record => {
            this.buildHistoryVpsRecordKeys(record).forEach(key => {
                if (!map.has(key)) map.set(key, []);
                map.get(key).push(record);
            });
        });

        return map;
    },

    findHistoryVpsMatch(row, index) {
        const keys = this.buildHistoryMatchKeys(row);
        for (const key of keys) {
            const list = index.get(key);
            if (Array.isArray(list) && list.length) {
                return { record: list[0], key, confidence: key.includes('|price:') && (key.includes('|date:') || key.includes('|ts:')) ? 'high' : 'medium' };
            }
        }
        return null;
    },

    renderHistoryVpsBadge(row, match) {
        const box = this.getOrCreateBadgeCell(row);
        if (!box) return;

        const synced = !!match;
        const label = synced ? '✓ VPS' : '□ VPS';
        const color = synced ? '#7cff7c' : '#777';
        const border = synced ? '#4b7d2d' : '#444';
        const bg = synced ? '#173018' : '#181818';

        box.innerHTML = `
            <span style="
                display:inline-flex;
                align-items:center;
                justify-content:center;
                min-width:54px;
                padding:2px 6px;
                border:1px solid ${border};
                border-radius:4px;
                background:${bg};
                color:${color};
                font-weight:bold;
                white-space:nowrap;
            ">${label}</span>
        `;
    },

    renderHistorySyncStatus(row, label = '… VPS', level = 'pending') {
        const box = this.getOrCreateBadgeCell(row);
        if (!box) return;

        const colors = {
            pending: { color: '#ffd76a', border: '#7a6422', bg: '#302610' },
            error: { color: '#ff9f9f', border: '#854040', bg: '#301515' },
            neutral: { color: '#aaa', border: '#444', bg: '#181818' }
        };
        const c = colors[level] || colors.neutral;

        box.innerHTML = `
            <span style="
                display:inline-flex;
                align-items:center;
                justify-content:center;
                min-width:54px;
                padding:2px 6px;
                border:1px solid ${c.border};
                border-radius:4px;
                background:${c.bg};
                color:${c.color};
                font-weight:bold;
                white-space:nowrap;
            ">${this.escapeHtml(label)}</span>
        `;
    },

    async hydrateHistoryFromVps() {
        const rows = this.parseHistoryVisibleRows();
        if (!rows.length) {
            this.setStatus('История: строки не найдены для VPS rehydrate.');
            return;
        }

        this.setStatus(`История: загружаю VPS completed_transfer (${rows.length} строк)...`);
        const records = await this.loadHistoryVpsRows();
        const index = this.indexHistoryVpsRows(records);
        let matched = 0;

        rows.forEach(row => {
            const match = this.findHistoryVpsMatch(row, index);
            if (match) matched++;
            this.renderHistoryVpsBadge(row, match || null);
        });

        this.setStatus(`История VPS: найдено совпадений ${matched}/${rows.length}; записей в базе ${records.length}.`);
    },

    async hashText(value) {
        const text = String(value || '');

        try {
            if (window.crypto?.subtle && window.TextEncoder) {
                const bytes = new TextEncoder().encode(text);
                const digest = await window.crypto.subtle.digest('SHA-256', bytes);

                return [...new Uint8Array(digest)]
                    .map(byte => byte.toString(16).padStart(2, '0'))
                    .join('');
            }
        } catch (e) {
            console.warn('[SLF Transfer History] crypto hash failed, fallback hash used', e);
        }

        let h = 0;
        for (let i = 0; i < text.length; i++) {
            h = ((h << 5) - h) + text.charCodeAt(i);
            h |= 0;
        }

        return `fallback_${Math.abs(h).toString(16)}`;
    },

    buildHistoryEventKeySource(row) {
        return [
            'completed_transfer',
            row.transferDateText || '',
            row.playerId || '',
            row.fromClubText || '',
            row.toClubText || '',
            row.salePrice || 0
        ].join('|');
    },

    buildHistoryAnalysisPayload(row, enriched, slfAlter) {
        const profile = enriched?.tmProfile || null;
        const fallbackProfile = {
            marketValueEur: 0,
            lastKnownMarketValueEur: 0,
            transferHistory: [],
            youthClubs: [],
            rumors: [],
            currentClub: '',
            playerAgent: '',
            contractExpires: '',
            age: row.age,
            tmUrl: ''
        };

        const effectiveProfile = profile || fallbackProfile;
        const markers = this.buildMarkers(row, effectiveProfile, slfAlter);
        const verdict = profile
            ? this.buildTransferVerdict(markers, profile, slfAlter)
            : {
                label: '⚪ LOW DATA',
                level: 'neutral',
                score: markers.reduce((sum, m) => sum + Number(m.score || 0), 0),
                reason: 'TM-профиль не найден, сохранены SLF/alter.php сигналы.'
            };

        return {
            verdict: {
                label: verdict.label,
                level: verdict.level,
                score: Number(verdict.score || 0),
                reason: verdict.reason || ''
            },
            markers: markers.map(marker => ({
                category: this.markerCategory(marker),
                label: marker.label || '',
                level: marker.level || '',
                score: Number(marker.score || 0),
                redFlag: !!marker.redFlag,
                hardStop: !!marker.hardStop,
                text: marker.text || ''
            })),
            sortMetrics: {
                analyzerScore: Number(verdict.score || 0),
                skillDelta: slfAlter?.skillDelta != null ? Number(slfAlter.skillDelta) : null,
                currentMinutesPct: slfAlter?.currentRow?.minutesPct != null ? Number(slfAlter.currentRow.minutesPct) : null,
                talentUpScore: markers.some(m => this.markerCategory(m) === 'talent')
                    ? Number(slfAlter?.talentUpgradeRow?.minutesPct || 0)
                    : null,
                tmValueEur: Number(profile?.marketValueEur || profile?.lastKnownMarketValueEur || 0),
                salePrice: Number(row.salePrice || 0)
            }
        };
    },

    buildSlfAlterSummary(alter) {
        if (!alter) return null;

        return {
            age: alter.age ?? null,
            talent: alter.talent ?? null,
            currentSkill: alter.currentSkill ?? null,
            finalSkill: alter.finalSkill ?? null,
            skillDelta: alter.skillDelta ?? null,
            currentSeasonYear: alter.currentSeasonYear ?? null,
            currentSeasonLabel: alter.currentSeasonLabel || '',
            hasCurrentSeason: !!alter.hasCurrentSeason,
            isCurrentSeasonActive: !!alter.isCurrentSeasonActive,
            staleActivity: !!alter.staleActivity,
            currentRow: alter.currentRow ? {
                season: alter.currentRow.season,
                seasonLabel: alter.currentRow.seasonLabel,
                leagueLevel: alter.currentRow.leagueLevel,
                leagueSkill: alter.currentRow.leagueSkill,
                minutesPct: alter.currentRow.minutesPct,
                minutes: alter.currentRow.minutes,
                gamesPlayed: alter.currentRow.gamesPlayed,
                gamesPossible: alter.currentRow.gamesPossible,
                starts: alter.currentRow.starts
            } : null,
            talentUpgradeEligible: !!alter.talentUpgradeEligible,
            talentUpgradeRow: alter.talentUpgradeRow ? {
                season: alter.talentUpgradeRow.season,
                seasonLabel: alter.talentUpgradeRow.seasonLabel,
                leagueLevel: alter.talentUpgradeRow.leagueLevel,
                leagueSkill: alter.talentUpgradeRow.leagueSkill,
                minutesPct: alter.talentUpgradeRow.minutesPct
            } : null
        };
    },

    buildTmProfileSummary(profile) {
        if (!profile) return null;

        return {
            tmUrl: profile.tmUrl || '',
            tmId: profile.tmId || '',
            marketValueText: profile.marketValueText || '',
            marketValueEur: profile.marketValueEur ?? null,
            lastKnownMarketValueText: profile.lastKnownMarketValueText || '',
            lastKnownMarketValueEur: profile.lastKnownMarketValueEur ?? null,
            highestMarketValueText: profile.highestMarketValueText || '',
            highestMarketValueEur: profile.highestMarketValueEur ?? null,
            valuePeakRatio: profile.valuePeakRatio ?? null,
            isRetired: !!profile.isRetired,
            isFreeAgent: !!profile.isFreeAgent,
            currentClub: profile.currentClub || '',
            playerAgent: profile.playerAgent || '',
            contractExpires: profile.contractExpires || '',
            age: profile.age ?? null,
            activity: profile.activity || null,
            rumorsCount: Array.isArray(profile.rumors) ? profile.rumors.length : 0,
            youthClubs: Array.isArray(profile.youthClubs) ? profile.youthClubs.slice(0, 12) : []
        };
    },

    async buildTransferHistoryEvent(row, enriched, slfAlter) {
        const eventKeySource = this.buildHistoryEventKeySource(row);
        const eventKey = await this.hashText(eventKeySource);
        const profile = enriched?.tmProfile || null;

        return {
            recordType: 'completed_transfer',
            eventType: 'completed_transfer',
            schemaVersion: 2,
            parserVersion: row.historyParserVersion || 'history_v2_cells',
            eventKey,
            eventKeySource,

            source: {
                page: 'transfers_history',
                url: location.href,
                collectedAt: Date.now(),
                scriptVersion: SLF_VERSION_INFO.scriptVersion
            },

            transfer: {
                dateText: row.transferDateText || '',
                dateTs: row.transferDateTs || null,
                priceText: row.salePriceText || '',
                price: row.salePrice ?? null,
                typeText: row.transferTypeText || '',
                auxText: row.historyAuxText || ''
            },

            player: {
                playerId: row.playerId || '',
                name: row.name || '',
                positions: row.positions || [],
                primaryPosition: row.positions?.[0] || null,
                age: row.age ?? null,
                talent: row.talent ?? null,
                skill: slfAlter?.finalSkill ?? row.scoutSkill ?? null,
                currentSkill: slfAlter?.currentSkill ?? row.scoutSkill ?? null,
                finalSkill: slfAlter?.finalSkill ?? null,
                skillDelta: slfAlter?.skillDelta ?? null,
                playerUrl: row.playerUrl || ''
            },

            clubs: {
                fromName: row.fromClubText || '',
                toName: row.toClubText || ''
            },

            managers: {
                seller: row.sellerManagerText || '',
                buyer: row.buyerManagerText || ''
            },

            analysis: this.buildHistoryAnalysisPayload(row, enriched, slfAlter),

            enrichment: {
                tmUrl: enriched?.tmUrl || profile?.tmUrl || '',
                tmProfileSummary: this.buildTmProfileSummary(profile),
                slfAlterSummary: this.buildSlfAlterSummary(slfAlter)
            },

            raw: {
                cells: row.rawCells || [],
                rowText: row.rawText || ''
            }
        };
    },

    markHistoryEventsSubmitted(events) {
        const synced = this.loadHistorySyncedKeys();

        (events || []).forEach(event => {
            if (!event?.eventKey) return;

            synced[event.eventKey] = {
                eventKey: event.eventKey,
                playerId: event.player?.playerId || '',
                dateText: event.transfer?.dateText || '',
                price: event.transfer?.price ?? null,
                submittedAt: Date.now()
            };
        });

        this.saveHistorySyncedKeys(synced);
    },

    sendTransferHistoryEvents(events) {
        if (!Array.isArray(events) || !events.length) return Promise.resolve(null);

        return Api.post(
            CONFIG.COLLECTIONS.TRANSFER_HISTORY + '?mode=append',
            events,
            'transfer history events'
        ).then(result => {
            this.markHistoryEventsSubmitted(events);
            return result;
        });
    },

    async analyzeHistoryVisibleRows() {
        const rows = this.parseHistoryVisibleRows();

        if (!rows.length) {
            this.setStatus('История трансферов: строки не найдены.');
            return;
        }

        const alreadySubmitted = this.loadHistorySyncedKeys();
        const eventsToSend = [];
        let skipped = 0;
        let failed = 0;

        this.setStatus(`История: найдено строк ${rows.length}. Синхронизация completed_transfer...`);

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const eventKeySource = this.buildHistoryEventKeySource(row);
            const eventKey = await this.hashText(eventKeySource);

            if (alreadySubmitted[eventKey]) {
                skipped++;
                this.renderHistoryVpsBadge(row, { confidence: 'local', key: eventKey, record: {} });
                this.setStatus(`История ${i + 1}/${rows.length}: уже синхронизировано ${row.name || row.playerId}`);
                continue;
            }

            const tmCached = TMEnrichmentLayer.peekBySlfPlayerId(row.playerId);
            const alterCached = SLFAlterLayer.peekByPlayerId(row.playerId);
            const fromCache = !!tmCached && !!alterCached;

            this.setStatus(`История ${i + 1}/${rows.length}: ${fromCache ? 'cache' : 'анализ'} ${row.name || row.playerId}`);

            this.renderHistorySyncStatus(row, '… VPS', 'pending');

            try {
                const tmResult = tmCached || await TMEnrichmentLayer.getBySlfPlayerId(row.playerId);

                let slfAlter = alterCached || null;

                if (!slfAlter) {
                    try {
                        slfAlter = await SLFAlterLayer.getByPlayerId(row.playerId);
                    } catch (alterError) {
                        console.warn('[SLF Transfer History] alter.php failed', row.playerId, alterError);
                    }
                }

                row.tmUrl = tmResult.tmUrl || '';
                row.tmProfile = tmResult.tmProfile || null;
                row.tmValueEur = row.tmProfile?.marketValueEur || row.tmProfile?.lastKnownMarketValueEur || 0;
                row.slfAlter = slfAlter;

                const event = await this.buildTransferHistoryEvent(row, tmResult, slfAlter);
                eventsToSend.push(event);
                this.renderHistoryVpsBadge(row, { confidence: 'queued', key: event.eventKey, record: event });
            } catch (e) {
                failed++;
                console.error('[SLF Transfer History] row failed', row, e);
                this.renderHistorySyncStatus(row, 'ERR', 'error');

                try {
                    const fallbackEvent = await this.buildTransferHistoryEvent(row, {
                        playerId: row.playerId,
                        slfUrl: row.playerUrl,
                        tmUrl: '',
                        tmProfile: null,
                        error: String(e?.message || e || 'history_analysis_failed')
                    }, null);
                    fallbackEvent.analysisFailed = true;
                    fallbackEvent.analysisError = String(e?.message || e || 'unknown');
                    eventsToSend.push(fallbackEvent);
                    this.renderHistoryVpsBadge(row, { confidence: 'fallback', key: fallbackEvent.eventKey, record: fallbackEvent });
                } catch (eventError) {
                    console.warn('[SLF Transfer History] fallback event build failed', row.playerId, eventError);
                }
            }
        }

        if (eventsToSend.length) {
            try {
                await this.sendTransferHistoryEvents(eventsToSend);
            } catch (error) {
                this.setStatus(
                    `История: ошибка отправки ${eventsToSend.length} записей (${error?.kind || 'unknown'}).`
                );
                return;
            }
        }

        this.setStatus(
            `История готова: отправлено ${eventsToSend.length}, пропущено дублей ${skipped}, ошибок ${failed}.`
        );
    },

    });
}
