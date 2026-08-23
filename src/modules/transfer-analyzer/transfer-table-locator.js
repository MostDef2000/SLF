// Transfer Table Locator
// Extracted verbatim from transfer-market-analyzer.js (stage 1 refactor).
// Assigned onto the TransferMarketAnalyzer facade; behaviour unchanged.

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.stage1TableLocatorApplied = true;

    Object.assign(TransferMarketAnalyzer, {
    isTransferDetailPage() {
        if (!location.pathname.includes('/transfers.php')) return false;

        const params = new URLSearchParams(location.search);
        return params.get('action') === 'view' && !!params.get('transfer_id');
    },

    isPage() {
        // Transfer detail pages are not list/analysis pages.
        // Do not mount analyzer UI, hydration, tooltips, observers or requests there.
        return location.pathname.includes('/transfers.php') && !this.isTransferDetailPage();
    },

    isHistoryPage() {
        return location.pathname.includes('/transfers.php') &&
            !this.isTransferDetailPage() &&
            new URLSearchParams(location.search).get('action') === 'history';
    },

    isWrapperTable(table) {
        if (!table) return true;

        const id = String(table.id || '').toLowerCase();
        const cls = String(table.className || '').toLowerCase();

        if (id === 'globalcontent') return true;
        if (cls.includes('game-ui__background')) return true;

        const nestedTables = table.querySelectorAll('table').length;
        const rows = table.querySelectorAll('tr').length;

        if (nestedTables >= 3 && rows > 20) return true;

        return false;
    },

    getPlayerLinksIn(table) {
        if (!table) return [];

        return [...table.querySelectorAll('a[href]')]
            .filter(a => {
                const href = a.getAttribute('href') || '';
                return /player\.php/i.test(href) && /id=\d+/i.test(href);
            });
    },

    scoreTransferTable(table) {
        if (!table || this.isWrapperTable(table)) return -999;

        const text = this.normalizeLower(table.innerText);
        const rows = [...table.querySelectorAll('tr')];
        const playerLinks = this.getPlayerLinksIn(table);
        const nestedTables = table.querySelectorAll('table').length;

        const headerScore =
            (text.includes('амплуа') ? 4 : 0) +
            (text.includes('фамилия') || text.includes('имя') ? 4 : 0) +
            (text.includes('цена') ? 3 : 0) +
            (text.includes('тал') ? 1 : 0) +
            (text.includes('воз') ? 1 : 0) +
            (text.includes('пот') ? 1 : 0) +
            (text.includes('дата') || text.includes('оконч') ? 1 : 0);

        const playerScore = Math.min(playerLinks.length, 20) * 3;

        const sizePenalty =
            rows.length > 80 ? 20 :
            rows.length > 40 ? 8 :
            0;

        const nestedPenalty =
            nestedTables > 0 ? nestedTables * 2 : 0;

        return headerScore + playerScore - sizePenalty - nestedPenalty;
    },

    findTransferTable() {
        const tables = [...document.querySelectorAll('table')];

        const candidates = tables
            .map(table => ({
                table,
                score: this.scoreTransferTable(table),
                rows: table.querySelectorAll('tr').length,
                nested: table.querySelectorAll('table').length,
                playerLinks: this.getPlayerLinksIn(table).length,
                id: table.id || '',
                cls: String(table.className || ''),
                sample: this.normalizeLower(table.innerText).slice(0, 220)
            }))
            .filter(x => x.score > 0 && x.playerLinks > 0)
            .sort((a, b) => b.score - a.score);

        if (candidates.length) {
            debugLog('[SLF Transfer Analyzer] findTransferTable', {
                found: true,
                selected: {
                    score: candidates[0].score,
                    rows: candidates[0].rows,
                    nested: candidates[0].nested,
                    playerLinks: candidates[0].playerLinks,
                    id: candidates[0].id,
                    sample: candidates[0].sample
                },
                candidates: candidates.slice(0, 5).map(x => ({
                    score: x.score,
                    rows: x.rows,
                    nested: x.nested,
                    playerLinks: x.playerLinks,
                    id: x.id,
                    sample: x.sample
                }))
            });

            return candidates[0].table;
        }

        const playerLinks = [...document.querySelectorAll('a[href]')]
            .filter(a => {
                const href = a.getAttribute('href') || '';
                return /player\.php/i.test(href) && /id=\d+/i.test(href);
            });

        const tableMap = new Map();

        playerLinks.forEach(a => {
            let node = a;

            while (node && node !== document.body) {
                if (node.tagName && node.tagName.toLowerCase() === 'table') {
                    if (!this.isWrapperTable(node)) {
                        tableMap.set(node, (tableMap.get(node) || 0) + 1);
                        break;
                    }
                }

                node = node.parentElement;
            }
        });

        const fallback = [...tableMap.entries()]
            .map(([table, count]) => ({
                table,
                count,
                rows: table.querySelectorAll('tr').length,
                nested: table.querySelectorAll('table').length,
                sample: this.normalizeLower(table.innerText).slice(0, 220)
            }))
            .filter(x => x.count >= 3)
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return a.rows - b.rows;
            });

        const found = fallback[0]?.table || null;

        debugLog('[SLF Transfer Analyzer] findTransferTable fallback', {
            found: !!found,
            fallback: fallback.slice(0, 5).map(x => ({
                count: x.count,
                rows: x.rows,
                nested: x.nested,
                sample: x.sample
            }))
        });

        return found;
    },

    findHeaderRow(table) {
        if (!table) return null;

        return [...table.querySelectorAll('tr')].find(tr => {
            const text = this.normalizeLower(tr.innerText);

            return text.includes('амплуа') &&
                (
                    text.includes('фамилия') ||
                    text.includes('имя')
                );
        }) || null;
    },

    ensureAnalysisHeader(table) {
        const headerRow = this.findHeaderRow(table);

        if (!headerRow) {
            console.warn('[SLF Transfer Analyzer] header row not found');
            return;
        }

        if (headerRow.querySelector('.slf-transfer-analysis-header')) return;

        const cell = document.createElement('td');
        cell.className = 'slf-transfer-analysis-header';
        cell.textContent = this.isHistoryPage() ? 'VPS' : 'TM анализ';
        cell.style.cssText = `
            color:#7cff7c;
            font-weight:bold;
            text-align:center;
            min-width:${this.isHistoryPage() ? '80px' : '0'};
            width:auto;
            border-left:1px solid #444;
            background:#202020;
        `;

        headerRow.appendChild(cell);
    },

    getHeaderMap(table) {
        const headerRow = this.findHeaderRow(table);

        const cells = headerRow
            ? [...headerRow.querySelectorAll('td, th')].map(c => this.normalizeLower(c.innerText))
            : [];

        const find = (...needles) => {
            const normalizedNeedles = needles.map(n => this.normalizeLower(n));

            const idx = cells.findIndex(text => {
                return normalizedNeedles.some(n => text.includes(n));
            });

            return idx >= 0 ? idx : null;
        };

        const map = {
            id: find('#', 'id'),
            pos: find('амплуа'),
            name: find('фамилия', 'имя'),
            club: find('команда', 'клуб'),
            age: find('возраст', 'воз'),
            talent: find('талант', 'тал'),
            potential: find('потенциал', 'пот'),
            scoutSkill: find('скилл', 'ск'),
            price: find('цена', 'сумма'),
            date: find('дата'),
            fromClub: find('откуда'),
            toClub: find('куда'),
            transferSum: find('сумма'),
            sellerManager: find('от кого'),
            buyerManager: find('кому'),
            transferType: find('тип'),
            endDate: find('дата окончания', 'оконч'),
            bids: find('предл', 'став')
        };

        debugLog('[SLF Transfer Analyzer] header map', {
            cells,
            map
        });

        return map;
    },

    parseVisibleRows() {
        const table = this.findTransferTable();

        if (!table) return [];

        this.ensureAnalysisHeader(table);

        const map = this.getHeaderMap(table);
        const rows = [...table.querySelectorAll('tr')];

        const parsed = rows
            .map((tr, index) => this.parseRow(tr, index, map))
            .filter(Boolean);

        debugLog('[SLF Transfer Analyzer] parseVisibleRows', parsed);

        return parsed;
    },

    findPlayerLinkInRow(tr) {
        const links = [...tr.querySelectorAll('a[href]')]
            .filter(a => {
                const href = a.getAttribute('href') || '';
                return /player\.php/i.test(href) && /id=\d+/i.test(href);
            });

        if (!links.length) return null;

        const scored = links
            .map(a => {
                const text = this.normalizeText(a.textContent || '');
                const title = this.normalizeText(a.getAttribute('title') || '');
                const href = a.getAttribute('href') || '';
                const nameCandidate = title || text;

                const hasLetters = /[A-Za-zА-Яа-яЁё]/.test(nameCandidate);
                const hasSpace = /\s/.test(nameCandidate);

                let score = 0;
                if (hasLetters) score += 5;
                if (hasSpace) score += 2;
                if (nameCandidate.length >= 3 && nameCandidate.length <= 40) score += 2;
                if (href.includes('action=view')) score += 1;

                return { a, score, nameCandidate };
            })
            .sort((a, b) => b.score - a.score);

        return scored[0].a;
    },

    cleanPlayerName(raw) {
        let name = this.normalizeText(raw);

        if (!name) return '';

        const parts = name.split(' ').filter(Boolean);

        if (parts.length >= 2) {
            const first = parts[0];
            const lastIndex = parts.length - 1;
            const last = parts[lastIndex];

            if (
                first.length >= 2 &&
                last.endsWith(first) &&
                last.length > first.length
            ) {
                parts[lastIndex] = last.slice(0, -first.length);
                name = parts.join(' ').trim();
            }
        }

        const firstWord = name.split(' ')[0];

        if (
            firstWord &&
            firstWord.length >= 2 &&
            name.endsWith(firstWord) &&
            name.length > firstWord.length * 2
        ) {
            const cut = name.slice(0, -firstWord.length).trim();

            if (cut.includes(' ')) {
                name = cut;
            }
        }

        return name.trim();
    },

    });
}
