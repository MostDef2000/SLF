// Transfer Money Parser
// Extracted verbatim from transfer-market-analyzer.js (stage 1 refactor).
// Assigned onto the TransferMarketAnalyzer facade; behaviour unchanged.

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.stage1MoneyParserApplied = true;

    Object.assign(TransferMarketAnalyzer, {
    parseMoney(value) {
        const raw = String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/,/g, '.')
            .trim();

        if (!raw) return null;

        const lower = raw.toLowerCase();
        const numberMatch = lower.match(/(\d+(?:\s\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/);

        if (!numberMatch) return null;

        const numeric = Number(String(numberMatch[1]).replace(/\s/g, ''));
        if (!Number.isFinite(numeric)) return null;

        let multiplier = 1;

        if (/[0-9]\s*[bб](?=$|[^a-zа-яё0-9])|\b(bn|billion)\b|млрд|миллиард/.test(lower)) {
            multiplier = 1000000000;
        } else if (/[0-9]\s*[mм](?=$|[^a-zа-яё0-9])|\b(mln|million)\b|млн|миллион/.test(lower)) {
            multiplier = 1000000;
        } else if (/[0-9]\s*[kк](?=$|[^a-zа-яё0-9])|\b(тыс|thousand)\b/.test(lower)) {
            multiplier = 1000;
        }

        const valueNumber = Math.round(numeric * multiplier);
        return Number.isFinite(valueNumber) && valueNumber > 0 ? valueNumber : null;
    },

    formatSlfMoneyShort(value) {
        const n = Number(value || 0);
        if (!Number.isFinite(n) || n <= 0) return '?';

        if (n >= 1000000) {
            const v = n / 1000000;
            return `${v >= 10 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(2).replace(/0$/, '').replace(/\.0$/, '')}M`;
        }

        if (n >= 1000) {
            const v = n / 1000;
            return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}k`;
        }

        return String(Math.round(n));
    },

    parseNominalRatio(text) {
        const raw = this.normalizeText(text);
        const m = raw.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*[HН](?=\s|$)/i);
        if (!m) return null;

        const n = Number(String(m[1]).replace(',', '.'));
        return Number.isFinite(n) && n > 0 ? n : null;
    },

    parseSlfMoneyToken(token) {
        return this.parseMoney(String(token || '').trim());
    },

    extractSlfMoneyTokens(text, nominalMatch) {
        const raw = String(text || '');
        const re = /(\d+(?:[.,]\d+)?|\d{1,3}(?:\s\d{3})+)(?:\s*)([KКMМBБ])/gi;
        const tokens = [];
        let m;

        while ((m = re.exec(raw))) {
            const token = m[0].trim();
            const start = m.index;
            const afterNominal = !nominalMatch || start >= nominalMatch.index + nominalMatch[0].length;
            if (!afterNominal) continue;

            const value = this.parseSlfMoneyToken(token);
            if (value) tokens.push({ token, value, start });
        }

        return tokens;
    },

    looksLikeTransferPriceCell(text) {
        const raw = this.normalizeText(text);
        if (!raw) return false;
        const hasNominal = /(?:^|\s)\d+(?:[.,]\d+)?\s*[HН](?=\s|$)/i.test(raw);
        const hasMoney = /(\d+(?:[.,]\d+)?|\d{1,3}(?:\s\d{3})+)\s*[KКMМBБ]/i.test(raw);
        return hasNominal && hasMoney;
    },

    findTransferPriceCell(tr, map) {
        const cells = [...tr.querySelectorAll('td')];
        if (!cells.length) return { cell: null, index: null, source: 'not_found' };

        const hasNominalDomMarker = cell => !!cell.querySelector(
            '[title="Кол-во номиналов"], [title*="Кол-во номиналов"], img[title="Кол-во номиналов"], img[title*="Кол-во номиналов"]'
        );

        const hasSlfCurrencyImg = cell => !!cell.querySelector(
            'img[title="Внутренняя валюта"], img[title*="Внутренняя валюта"]'
        );

        const hasSlfMoneyText = text => /(?:\d+(?:[.,]\d+)?|\d{1,3}(?:\s\d{3})+)\s*[KКMМBБ]/i.test(text);

        const candidates = cells
            .map((cell, index) => {
                const text = this.normalizeText(cell.innerText || cell.textContent || '');
                const nominalDom = hasNominalDomMarker(cell);
                const currencyImg = hasSlfCurrencyImg(cell);
                const contentPattern = this.looksLikeTransferPriceCell(text);
                const moneyText = hasSlfMoneyText(text);

                // Strict preferred detector for the real "Цена" cell on active transfers:
                // nominal marker title="Кол-во номиналов" + internal currency image.
                const domPriceCell = nominalDom && currencyImg && moneyText;
                const valid = domPriceCell || contentPattern;
                if (!valid) return null;

                let score = domPriceCell ? 200 : 100;
                if (nominalDom) score += 60;
                if (currencyImg) score += 60;
                if (index === map?.price) score += 30;
                if (/^\s*\d+(?:[.,]\d+)?\s*[HН]\s+\d/i.test(text)) score += 15;
                if (cell.querySelector('a[href*="player.php"]')) score -= 80;
                if (/^\d{4,}$/.test(text)) score -= 100;

                return {
                    cell,
                    index,
                    text,
                    score,
                    source: domPriceCell ? 'price_cell_nominal_title_currency_img' : 'price_cell_content_pattern'
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score);

        if (candidates[0]) {
            return { cell: candidates[0].cell, index: candidates[0].index, source: candidates[0].source };
        }

        const fallback = map?.price != null ? cells[map.price] : null;
        if (fallback) {
            const text = this.normalizeText(fallback.innerText || fallback.textContent || '');
            if (hasSlfMoneyText(text) && !fallback.querySelector('a[href*="player.php"]')) {
                return { cell: fallback, index: map.price, source: 'validated_header_price_cell' };
            }
        }

        return { cell: null, index: null, source: 'not_found' };
    },

    parseTransferPriceCellInfo(tr, map) {
        const found = this.findTransferPriceCell(tr, map);
        const rawText = this.normalizeText(found.cell?.innerText || found.cell?.textContent || '');
        const nominalMatch = rawText.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*[HН](?=\s|$)/i);
        const nominalRatio = nominalMatch ? Number(String(nominalMatch[1]).replace(',', '.')) : null;
        const moneyTokens = this.extractSlfMoneyTokens(rawText, nominalMatch);
        const current = moneyTokens[0] || null;
        const secondary = moneyTokens[1] || null;
        const currentPrice = current?.value || null;
        const nominalBase = currentPrice && nominalRatio ? Math.round(currentPrice / nominalRatio) : null;

        return {
            rawText,
            priceText: current?.token || rawText,
            currentPrice,
            secondaryPriceText: secondary?.token || '',
            secondaryPrice: secondary?.value || null,
            nominalRatio: Number.isFinite(nominalRatio) && nominalRatio > 0 ? nominalRatio : null,
            nominalBase,
            source: found.source,
            cellIndex: found.index
        };
    },

    getCurrentSlfMarketPrice(row) {
        const fromPageText = row?.slfPriceText || '';
        const fromPageCellText = row?.slfPriceCellText || fromPageText;
        const fromPageParsed = row?.slfPrice != null ? Number(row.slfPrice) : this.parseMoney(fromPageText);

        if (Number.isFinite(fromPageParsed) && fromPageParsed > 0) {
            return {
                value: fromPageParsed,
                text: fromPageText || this.formatSlfMoneyShort(fromPageParsed),
                source: row?.slfPriceSource || 'transfer_page_price_cell',
                sourceLabel: row?.slfPriceSource === 'price_cell_content_pattern'
                    ? 'ячейка Цена по DOM-паттерну H + SLF money'
                    : 'текущая цена на странице',
                parsedDomCellValue: fromPageCellText || '',
                nominalRatio: row?.nominalRatio ?? null,
                nominalBase: row?.nominalBase ?? null,
                secondaryPriceText: row?.slfSecondaryPriceText || ''
            };
        }

        if (row?.completedTransfer && row?.salePrice) {
            const value = Number(row.salePrice || 0);
            return {
                value,
                text: row.salePriceText || this.formatSlfMoneyShort(value),
                source: 'completed_transfer_row_price',
                sourceLabel: 'финальная цена завершённого трансфера',
                parsedDomCellValue: row.salePriceText || ''
            };
        }

        return {
            value: 0,
            text: '',
            source: 'not_found',
            sourceLabel: 'цена не распознана',
            parsedDomCellValue: fromPageText || row?.salePriceText || ''
        };
    },

    });
}
