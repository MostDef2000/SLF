// Transfer Analyzer: TM profile value guard
// ============================================================

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer && !TransferMarketAnalyzer.slfTmProfileGuardApplied) {
    TransferMarketAnalyzer.slfTmProfileGuardApplied = true;
    TransferMarketAnalyzer.snapshotCacheKey = 'slf_transfer_analysis_snapshot_cache_v2';

    const originalGetTmValueMarker = TransferMarketAnalyzer.getTmValueMarker;
    const originalGetValueTrendMarker = TransferMarketAnalyzer.getValueTrendMarker;

    function hasText(value) {
        return String(value || '').trim().length > 0;
    }

    function positivePlayerId(value) {
        const id = String(value || '').trim();
        return /^\d+$/.test(id) && Number(id) > 0 ? id : '';
    }

    function playerIdFromRelativeUrl(value) {
        const raw = String(value || '').trim();
        if (!/^\/player\.php\?/i.test(raw)) return '';
        if (!/(?:^|[?&])action=view(?:&|$)/i.test(raw)) return '';
        return positivePlayerId(raw.match(/(?:^|[?&])id=(\d+)(?:&|$)/i)?.[1] || '');
    }

    TransferMarketAnalyzer.buildPurchaseForecastPlayerUrl = function buildSafePurchaseForecastPlayerUrl(playerId, playerUrl) {
        const requestedId = positivePlayerId(playerId);
        const urlId = playerIdFromRelativeUrl(playerUrl);
        const id = requestedId || urlId;
        if (!id) return '';
        return `/player.php?action=view&id=${id}`;
    };

    TransferMarketAnalyzer.hasValidTmProfileForValue = function hasValidTmProfileForValue(profile) {
        if (!profile || typeof profile !== 'object') return false;
        if (!hasText(profile.tmUrl) && !hasText(profile.tmId)) return false;

        if (hasText(profile.currentClub)) return true;
        if (hasText(profile.playerAgent)) return true;
        if (hasText(profile.contractExpires)) return true;
        if (hasText(profile.dateOfBirth)) return true;
        if (profile.age != null) return true;
        if (Array.isArray(profile.transferHistory) && profile.transferHistory.length > 0) return true;
        if (Array.isArray(profile.youthClubs) && profile.youthClubs.length > 0) return true;
        if (profile.isRetired === true || profile.isFreeAgent === true) return true;

        return false;
    };

    TransferMarketAnalyzer.getTmValueMarker = function getTmValueMarkerWithProfileGuard(profileOrValue) {
        if (profileOrValue && typeof profileOrValue === 'object' && !this.hasValidTmProfileForValue(profileOrValue)) {
            return {
                label: 'TM €?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'TM profile is not confirmed, so TM value is hidden.'
            };
        }

        return originalGetTmValueMarker.apply(this, arguments);
    };

    TransferMarketAnalyzer.getValueTrendMarker = function getValueTrendMarkerWithProfileGuard(profile) {
        if (!this.hasValidTmProfileForValue(profile)) {
            return {
                label: 'trend ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'TM profile is not confirmed, so TM trend is hidden.'
            };
        }

        return originalGetValueTrendMarker.apply(this, arguments);
    };
}

if (typeof TMEnrichmentLayer !== 'undefined' && TMEnrichmentLayer && !TMEnrichmentLayer.slfStrictMarketValueApplied) {
    TMEnrichmentLayer.slfStrictMarketValueApplied = true;

    TMEnrichmentLayer.extractTmMarketValueText = function extractTmMarketValueTextStrict(doc) {
        const selectors = [
            '.data-header__market-value-wrapper',
            '.tm-player-market-value-development__current-value'
        ];

        for (const selector of selectors) {
            const el = doc.querySelector(selector);
            const text = this.normalizeText(el && el.textContent || '');
            if (text && text.indexOf('€') >= 0) {
                return text;
            }
        }

        return '';
    };
}

// FM2026 market rows may expose transfer-detail navigation without a direct player.php link.
// Resolve that identity before delegating to the existing live Analyzer implementation.
if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer && !TransferMarketAnalyzer.fm2026VisibleRowIdentityBridgeApplied) {
    TransferMarketAnalyzer.fm2026VisibleRowIdentityBridgeApplied = true;

    TransferMarketAnalyzer.playerIdFromMarketHref = function playerIdFromMarketHref(value) {
        if (!value) return '';
        try {
            const url = new URL(value, location.origin);
            const path = url.pathname.toLowerCase();
            if (!/(?:player|alter)\.php$/.test(path) && !/\/player\/\d+/.test(path)) return '';
            for (const key of ['id', 'player_id', 'playerId', 'player']) {
                const candidate = url.searchParams.get(key);
                if (/^\d+$/.test(candidate || '')) return candidate;
            }
            return (path.match(/\/player\/(\d+)/) || [])[1] || '';
        } catch (error) {
            return '';
        }
    };

    TransferMarketAnalyzer.transferIdFromMarketHref = function transferIdFromMarketHref(value) {
        if (!value) return '';
        try {
            const url = new URL(value, location.origin);
            if (url.pathname !== '/transfers.php') return '';
            for (const key of ['transfer_id', 'transfer', 'tl']) {
                const candidate = url.searchParams.get(key);
                if (/^\d+$/.test(candidate || '')) return candidate;
            }
            const id = url.searchParams.get('id') || '';
            return url.searchParams.get('action') === 'view' && /^\d+$/.test(id) ? id : '';
        } catch (error) {
            return '';
        }
    };

    TransferMarketAnalyzer.findMarketRowIdentity = function findMarketRowIdentity(tr) {
        const anchors = [...tr.querySelectorAll('a[href]')];
        const player = anchors
            .map(anchor => ({ anchor, playerId: this.playerIdFromMarketHref(anchor.getAttribute('href') || '') }))
            .find(entry => entry.playerId) || null;
        const detail = anchors
            .map(anchor => ({ anchor, transferId: this.transferIdFromMarketHref(anchor.getAttribute('href') || '') }))
            .find(entry => entry.transferId) || null;
        const rowTransferId = (tr.id || '').match(/(?:tl|transfer)[-_]?(\d+)/i)?.[1] || '';
        const transferId = detail?.transferId || rowTransferId || '';
        return {
            playerId: player?.playerId || '',
            playerAnchor: player?.anchor || null,
            transferId,
            transferDetailUrl: detail?.anchor
                ? new URL(detail.anchor.getAttribute('href') || '', location.origin).toString()
                : transferId
                    ? new URL(`/transfers.php?action=view&transfer_id=${encodeURIComponent(transferId)}`, location.origin).toString()
                    : ''
        };
    };

    TransferMarketAnalyzer.parseVisibleRowsCompat = function parseVisibleRowsCompat() {
        const table = document.querySelector('table.trans_market_offers, table[data-slf-transfer-table]') || this.findTransferTable();
        if (!table) return [];
        this.ensureAnalysisHeader(table);
        const map = this.getHeaderMap(table);

        return [...table.querySelectorAll('tr')].map((tr, index) => {
            const original = this.parseRow(tr, index, map);
            if (original) {
                const identity = this.findMarketRowIdentity(tr);
                original.transferId = original.transferId || identity.transferId;
                original.transferDetailUrl = original.transferDetailUrl || identity.transferDetailUrl;
                return original;
            }

            const text = this.normalizeText(tr.innerText || tr.textContent || '');
            const lower = text.toLowerCase();
            if (!text || (lower.includes('амплуа') && (lower.includes('фамилия') || lower.includes('имя')))) return null;
            const cells = [...tr.querySelectorAll('td')];
            if (cells.length < 4) return null;
            const getCell = idx => idx == null ? null : cells[idx] || null;
            const getText = idx => this.normalizeText(getCell(idx)?.innerText || getCell(idx)?.textContent || '');
            const identity = this.findMarketRowIdentity(tr);
            if (!identity.playerId && !identity.transferId) return null;

            const priceInfo = this.parseTransferPriceCellInfo(tr, map);
            const directLabel = this.normalizeText(identity.playerAnchor?.getAttribute('title') || identity.playerAnchor?.textContent || '');
            const nameCell = getText(map.name);
            const name = this.cleanPlayerName(/[A-Za-zА-Яа-яЁё]/.test(nameCell) ? nameCell : directLabel);
            return {
                rowEl: tr,
                originalIndex: index,
                playerId: String(identity.playerId || ''),
                playerUrl: identity.playerId ? `/player.php?action=view&id=${encodeURIComponent(identity.playerId)}` : '',
                transferId: identity.transferId,
                transferDetailUrl: identity.transferDetailUrl,
                name: name || identity.playerId || (identity.transferId ? `Трансфер #${identity.transferId}` : 'Игрок'),
                positions: this.parsePositions(getText(map.pos) || text),
                age: this.parseNumber(getText(map.age)),
                talent: this.parseNumber(getText(map.talent)),
                potentialText: getText(map.potential),
                scoutSkill: this.parseNumber(getText(map.scoutSkill)),
                slfPriceText: priceInfo.priceText,
                slfPriceCellText: priceInfo.rawText,
                slfPrice: priceInfo.currentPrice,
                slfSecondaryPriceText: priceInfo.secondaryPriceText,
                slfSecondaryPrice: priceInfo.secondaryPrice,
                nominalRatio: priceInfo.nominalRatio,
                nominalBase: priceInfo.nominalBase,
                slfPriceSource: priceInfo.source,
                slfPriceCellIndex: priceInfo.cellIndex,
                slfBids: this.parseNumber(getText(map.bids)),
                endDateText: getText(map.endDate),
                tmUrl: '',
                tmProfile: null,
                tmValueEur: 0
            };
        }).filter(Boolean);
    };

    TransferMarketAnalyzer.resolveMarketRowIdentity = async function resolveMarketRowIdentity(row) {
        if (/^\d+$/.test(String(row?.playerId || ''))) return row;
        if (!row) throw new Error('transfer_row_missing');
        let detailUrl = row.transferDetailUrl || '';
        if (!detailUrl && row.transferId) {
            detailUrl = new URL(`/transfers.php?action=view&transfer_id=${encodeURIComponent(row.transferId)}`, location.origin).toString();
        }
        if (!detailUrl) throw new Error(`player_identity_missing_${row.transferId || 'unknown'}`);

        const pageFetch = typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.fetch === 'function'
            ? unsafeWindow.fetch.bind(unsafeWindow)
            : fetch.bind(window);
        const response = await pageFetch(detailUrl, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) throw new Error(`transfer_detail_http_${response.status}`);
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const expectedName = this.normalizeText(row.name).toLowerCase();
        const candidates = [...doc.querySelectorAll('a[href]')]
            .map(anchor => {
                const href = anchor.getAttribute('href') || '';
                const playerId = this.playerIdFromMarketHref(href);
                if (!playerId) return null;
                const label = this.normalizeText(anchor.getAttribute('title') || anchor.textContent || '');
                let score = 10;
                if (label && /[A-Za-zА-Яа-яЁё]/.test(label)) score += 5;
                if (expectedName && label.toLowerCase().includes(expectedName)) score += 30;
                if (/player\.php/i.test(href)) score += 5;
                return { playerId, label, score };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score);
        let playerId = candidates[0]?.playerId || '';
        if (!playerId) {
            const html = doc.documentElement?.innerHTML || '';
            playerId = (html.match(/(?:player|alter)\.php[^"'<>]{0,180}?(?:[?&](?:id|player_id|playerId|player)=)(\d+)/i) || [])[1] || '';
        }
        if (!playerId) throw new Error(`player_identity_not_found_${row.transferId || 'unknown'}`);
        row.playerId = String(playerId);
        row.playerUrl = `/player.php?action=view&id=${encodeURIComponent(playerId)}`;
        if (candidates[0]?.label && /[A-Za-zА-Яа-яЁё]/.test(candidates[0].label)) row.name = candidates[0].label;
        return row;
    };

    const analyzeVisibleRowsBeforeFm2026Identity = TransferMarketAnalyzer.analyzeVisibleRows;
    TransferMarketAnalyzer.analyzeVisibleRows = async function analyzeVisibleRowsAfterFm2026Identity() {
        if (this.isHistoryPage?.()) return analyzeVisibleRowsBeforeFm2026Identity.apply(this, arguments);
        if (this.slfLiveAnalysisRunning) return analyzeVisibleRowsBeforeFm2026Identity.apply(this, arguments);

        const rows = this.parseVisibleRowsCompat();
        if (!rows.length) {
            this.setStatus?.('Игроки не найдены: структура строк рынка не распознана.');
            return;
        }

        const injected = [];
        let resolved = 0;
        let failed = 0;
        const button = document.getElementById('slf-transfer-analyze-visible');
        const originalText = button?.textContent || '';
        if (button) {
            button.disabled = true;
            button.textContent = 'Подготовка...';
        }
        this.setStatus?.(`Подготовка live: распознано ${rows.length} строк...`);

        for (let index = 0; index < rows.length; index++) {
            const row = rows[index];
            try {
                const resolvedRow = await this.resolveMarketRowIdentity(row);
                if (!resolvedRow?.playerId) throw new Error('player_identity_empty');
                resolved++;
                if (!resolvedRow.rowEl.querySelector(`a[href*="player.php"][href*="id=${resolvedRow.playerId}"]`)) {
                    const anchor = document.createElement('a');
                    anchor.href = `/player.php?action=view&id=${encodeURIComponent(resolvedRow.playerId)}`;
                    anchor.title = resolvedRow.name || resolvedRow.playerId;
                    anchor.textContent = resolvedRow.name || resolvedRow.playerId;
                    anchor.dataset.slfIdentityBridge = '1';
                    anchor.style.display = 'none';
                    resolvedRow.rowEl.appendChild(anchor);
                    injected.push(anchor);
                }
            } catch (error) {
                failed++;
                console.warn('[SLF Transfer Analyzer] player identity resolve failed', row, error);
            }
            if ((index + 1) % 5 === 0 || index + 1 === rows.length) {
                this.setStatus?.(`Подготовка live ${index + 1}/${rows.length}: resolved ${resolved}, errors ${failed}`);
            }
        }

        if (button) {
            button.disabled = false;
            button.textContent = originalText || 'Анализировать видимых';
        }
        if (!resolved) {
            injected.forEach(anchor => anchor.remove());
            this.setStatus?.(`Не удалось определить игроков: строк ${rows.length}, errors ${failed}.`);
            return;
        }

        try {
            return await analyzeVisibleRowsBeforeFm2026Identity.apply(this, arguments);
        } finally {
            injected.forEach(anchor => anchor.remove());
        }
    };
}
