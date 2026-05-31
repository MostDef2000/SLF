// 9.6 Hidden generator advice detail parser
// ============================================================

const GeneratorAdviceDetailsParser = {
    norm(value) {
        return String(value ?? '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    parseNumber(value) {
        const m = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
        if (!m) return null;
        const n = Number(m[0]);
        return Number.isFinite(n) ? n : null;
    },

    parsePercent(value) {
        const m = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?\s*%/);
        if (!m) return null;
        const n = Number(m[0].replace('%', ''));
        return Number.isFinite(n) ? n : null;
    },

    parseDataId(onclick) {
        const m = String(onclick || '').match(/advice-long\[data-id\s*=\s*['"]?(\d+)['"]?\]/i);
        return m ? m[1] : null;
    },

    getTitleForLink(el) {
        const parentText = this.norm(el?.parentElement?.textContent || '');
        const before = parentText.split(/подробнее/i)[0] || '';
        return this.norm(before) || this.norm(el?.textContent || 'подробнее');
    },

    readAdviceBlocks() {
        const links = [...document.querySelectorAll('a,button,span')]
            .filter(el => this.norm(el.textContent).toLowerCase().includes('подробнее'))
            .map((el, index) => {
                const onclick = el.getAttribute('onclick') || '';
                const dataId = this.parseDataId(onclick);
                return {
                    index,
                    dataId,
                    title: this.getTitleForLink(el),
                    href: el.getAttribute('href') || '',
                    onclick
                };
            })
            .filter(x => x.dataId != null);

        const blocks = links.map(link => {
            const block = document.querySelector(`.advice-long[data-id="${link.dataId}"]`);
            const fullText = block ? this.norm(block.textContent || '') : '';
            return {
                schema: 'slf_generator_advice_block_v1',
                dataId: link.dataId,
                title: link.title,
                found: !!block,
                textLength: fullText.length,
                textPreview: fullText.slice(0, 700),
                fullText: fullText.slice(0, 2000),
                rows: block ? this.parseDetailRows(block) : [],
                source: 'dom_advice_long_hidden_block'
            };
        });

        return blocks;
    },

    parseDetailRows(block) {
        const rows = [];
        [...block.querySelectorAll('tr')].forEach(tr => {
            const cells = [...tr.querySelectorAll('th,td')]
                .map(td => this.norm(td.textContent || ''))
                .filter(Boolean);
            if (!cells.length) return;
            const joined = this.norm(cells.join(' '));
            if (!/^\d{1,2}'/.test(joined) && !/\b\d{1,2}'\b/.test(joined)) return;
            rows.push({ cells, raw: joined });
        });

        if (!rows.length) {
            const lines = String(block.textContent || '')
                .split(/\n+/)
                .map(x => this.norm(x))
                .filter(Boolean);
            lines.forEach(line => {
                if (/^\d{1,2}'/.test(line)) rows.push({ cells: [line], raw: line });
            });
        }

        return rows;
    },

    parseCrossRow(row) {
        const cells = Array.isArray(row?.cells) ? row.cells : [];
        const joined = this.norm(row?.raw || cells.join(' '));
        if (!/(кросс|навес|углов|штрафн)/i.test(joined)) return null;
        if (!/(^|\s)\d{1,2}'/.test(joined)) return null;

        const percents = joined.match(/\d+(?:[.,]\d+)?\s*%/g) || [];
        const result = cells.find(x => /(выиграл|проиграл|успеш|неуспеш|гол|удар)/i.test(x)) ||
            ((joined.match(/(выиграл|проиграл|успеш|неуспеш|гол|удар)/i) || [])[0] || '');
        const type = cells[1] || ((joined.match(/(кросс-навес|кросс|навес|угловой|штрафной)/i) || [])[0] || '');

        return {
            minute: this.parseNumber(cells[0] || joined),
            type: this.norm(type),
            duel: this.norm(cells[2] || joined),
            pressurePct: percents[0] ? this.parsePercent(percents[0]) : null,
            successPctCandidates: percents.map(x => this.parsePercent(x)).filter(x => x != null),
            result: this.norm(result),
            raw: joined
        };
    },

    summarizeCrossRows(rows) {
        const clean = (rows || []).filter(Boolean);
        const openPlay = clean.filter(r => /кросс|навес/i.test(r.type || '') && !/углов|штраф/i.test(r.type || ''));
        const setPieces = clean.filter(r => /углов|штраф/i.test(r.type || ''));
        const won = clean.filter(r => /выиграл|успеш|гол|удар/i.test(r.result || '')).length;
        const lost = clean.filter(r => /проиграл|неуспеш/i.test(r.result || '')).length;
        const avg = arr => arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : null;
        const pressures = clean.map(r => r.pressurePct).filter(x => Number.isFinite(x));
        const success = clean.flatMap(r => r.successPctCandidates || []).filter(x => Number.isFinite(x));
        const openLost = openPlay.filter(r => /проиграл|неуспеш/i.test(r.result || '')).length;
        const setLost = setPieces.filter(r => /проиграл|неуспеш/i.test(r.result || '')).length;

        let signal = 'neutral';
        if (openPlay.length >= 2 && openLost / openPlay.length >= 0.7) signal = 'open_play_crosses_bad';
        else if (clean.length >= 4 && clean.length > 0 && won / clean.length <= 0.25) signal = 'crosses_bad_total';

        return {
            total: clean.length,
            won,
            lost,
            winRate: clean.length ? Math.round((won / clean.length) * 100) : null,
            openPlay: {
                total: openPlay.length,
                won: openPlay.filter(r => /выиграл|успеш|гол|удар/i.test(r.result || '')).length,
                lost: openLost
            },
            setPieces: {
                total: setPieces.length,
                won: setPieces.filter(r => /выиграл|успеш|гол|удар/i.test(r.result || '')).length,
                lost: setLost
            },
            avgPressurePct: avg(pressures),
            avgSuccessPctCandidate: avg(success),
            signal
        };
    },

    parseCrosses(blocks) {
        const ownRows = [];
        const opponentRows = [];

        (blocks || []).forEach(block => {
            const title = this.norm(block.title || '').toLowerCase();
            if (!title.includes('оценка кроссов')) return;

            const parsedRows = (block.rows || [])
                .map(row => this.parseCrossRow(row))
                .filter(Boolean)
                .map(row => Object.assign(row, {
                    sourceDataId: block.dataId,
                    sourceTitle: block.title
                }));

            if (title.includes('соперник')) opponentRows.push(...parsedRows);
            else ownRows.push(...parsedRows);
        });

        return {
            schema: 'slf_generator_cross_detail_metrics_v1',
            source: 'advice_long_hidden_blocks',
            windowScope: 'unknown_generator_advice_window',
            caution: 'Advice detail rows do not expose an exact generation segment; use as supporting evidence, not as the only trigger.',
            own: {
                rows: ownRows.slice(0, 20),
                summary: this.summarizeCrossRows(ownRows)
            },
            opponent: {
                rows: opponentRows.slice(0, 20),
                summary: this.summarizeCrossRows(opponentRows)
            }
        };
    },

    parseQualityFromText(text) {
        const raw = String(text || '').replace(',', '.');
        const m = raw.match(/игру\s+лучше\s+ожиданий\s+генератора\s+на\s+(\d+(?:\.\d+)?)\s*%/i) ||
            raw.match(/проводите\s+игру\s+лучше\s+ожиданий.*?(\d+(?:\.\d+)?)\s*%/i);
        if (!m) return null;
        const percent = Number(m[1]);
        return Number.isFinite(percent)
            ? { detected: true, direction: 'positive', percent, text: this.norm(text), source: 'advice_long_quality_title' }
            : null;
    },

    collect() {
        const blocks = this.readAdviceBlocks();
        const textBlob = blocks.map(b => `${b.title}\n${b.fullText || b.textPreview || ''}`).join('\n');
        const quality = this.parseQualityFromText(textBlob);
        const crosses = this.parseCrosses(blocks);
        const meaningfulBlocks = blocks
            .filter(b => b.found && (b.textLength > 0 || /генератор|кросс|прессинг|обороны|атаки/i.test(b.title)))
            .map(b => ({
                dataId: b.dataId,
                title: b.title,
                textLength: b.textLength,
                textPreview: b.textPreview,
                source: b.source
            }));

        return {
            schema: 'slf_generator_advice_details_v1',
            collectedAt: Date.now(),
            blocksCount: blocks.length,
            meaningfulBlocks,
            quality,
            crosses,
            windowScope: 'unknown_generator_advice_window',
            caution: 'The hidden generator detail blocks do not disclose exact segment/window boundaries. Use them carefully as contextual signals and keep raw details in logs for later calibration.'
        };
    },

    toDeveloperHints(details) {
        const rows = [];
        if (!details || !details.schema) return rows;
        (details.meaningfulBlocks || []).forEach(block => {
            const text = this.norm(block.title || '');
            if (!text) return;
            if (/генератор|кросс|прессинг|обороны|атаки|дриблинг|точность|устали|замены|фланг|бить/i.test(text)) {
                rows.push(text);
            }
        });
        if (details.quality?.detected && details.quality.text) rows.push(details.quality.text);
        return [...new Set(rows)].map(text => ({
            text,
            type: DeveloperHintParser.classify(text),
            control: DeveloperHintParser.toControlSignal(text),
            weight: DeveloperHintParser.getWeight(text),
            source: 'advice_long_detail_title'
        }));
    }
};

// ============================================================
