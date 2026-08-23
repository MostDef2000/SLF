// 13. SLF Alter Layer
// ============================================================

const SLFAlterLayer = {
    cacheKey: 'slf_alter_cache_v4',
    cacheTtlMs: 1000 * 60 * 60 * 24 * (CONFIG.TRANSFER_ANALYZER?.slfAlter?.cacheTtlDays || 1),

    loadCache() {
        try {
            return JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
        } catch (e) {
            return {};
        }
    },

    saveCache(cache) {
        try {
            localStorage.setItem(this.cacheKey, JSON.stringify(cache));
        } catch (e) {
            console.warn('[SLF Alter] cache save failed', e);
        }
    },

    clearCache() {
        localStorage.removeItem(this.cacheKey);
    },

    getCache(key) {
        const cache = this.loadCache();
        const item = cache[key];

        if (!item) return null;

        const fetchedAt = Number(item.fetchedAt || 0);

        if (!fetchedAt || Date.now() - fetchedAt > this.cacheTtlMs) return null;

        return item;
    },

    peekByPlayerId(playerId) {
        const id = String(playerId || '').trim();
        if (!id) return null;

        return this.getCache(`alter:${id}`);
    },

    setCache(key, value) {
        const cache = this.loadCache();

        cache[key] = {
            ...value,
            fetchedAt: Date.now()
        };

        this.saveCache(cache);
    },

    normalizeText(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    toNumber(value) {
        const m = String(value || '')
            .replace(',', '.')
            .match(/-?\d+(?:\.\d+)?/);

        if (!m) return null;

        const n = Number(m[0]);

        return Number.isFinite(n) ? n : null;
    },

    async fetchAlterHtml(playerId) {
        const id = String(playerId || '').trim();

        if (!id) throw new Error('empty_player_id');

        const url = buildSlfUrl(`/alter.php?id=${encodeURIComponent(id)}`);
        const response = await fetch(url, {
            credentials: 'include',
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`alter_http_${response.status}`);
        }

        return {
            url,
            html: await response.text()
        };
    },

    async getByPlayerId(playerId) {
        const id = String(playerId || '').trim();

        if (!id) return null;

        const key = `alter:${id}`;
        const cached = this.getCache(key);

        if (cached) return cached;

        const { url, html } = await this.fetchAlterHtml(id);
        const parsed = this.parse(html, id, url);

        this.setCache(key, parsed);

        return parsed;
    },

    parse(html, playerId, url) {
        const doc = new DOMParser().parseFromString(html || '', 'text/html');
        const bodyText = this.normalizeText(doc.body?.innerText || doc.body?.textContent || '');

        const basic = this.parseAgeTalentSkill(bodyText);
        const skillData = this.parseSkillTables(doc);
        const rows = this.parseSeasonStatRows(doc);

        return this.buildAnalysis({
            playerId: String(playerId || ''),
            url,
            age: basic.age,
            talent: basic.talent,
            currentSkill: basic.currentSkill,
            seasonSkills: skillData.seasonSkills,
            seasonSkill: skillData.seasonSkill,
            talentSkill: skillData.talentSkill,
            classSkill: skillData.classSkill,
            finalSkill: skillData.finalSkill,
            rows
        });
    },

    parseAgeTalentSkill(text) {
        const m = String(text || '').match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,3}(?:[.,]\d+)?)\b/);

        if (!m) {
            return {
                age: null,
                talent: null,
                currentSkill: null
            };
        }

        return {
            age: Number(m[1]),
            talent: Number(m[2]),
            currentSkill: Number(String(m[3]).replace(',', '.'))
        };
    },

    parseSkillTables(doc) {
        // 2026 redesign: skill tables lost the dedicated `ai_skill` class and are
        // now plain `ai-table` blocks; stat tables carry `ai-stat` and must be
        // excluded. The requests-quota table is also a plain `ai-table`.
        const tables = [...doc.querySelectorAll('table.ai_skill, table.ai-table:not(.ai-stat)')]
            .filter(table => !/заявок|пополнить/i.test(this.normalizeText(table.innerText || table.textContent || '')));
        const seasonSkills = [];
        let seasonSkill = null;
        let talentSkill = null;
        let classSkill = null;
        let finalSkill = null;

        tables.forEach((table, tableIndex) => {
            [...table.querySelectorAll('tr')].forEach(tr => {
                const cells = [...tr.querySelectorAll('td, th')]
                    .map(td => this.normalizeText(td.innerText || td.textContent || ''));

                const label = String(cells[0] || '').toLowerCase();
                const value = this.toNumber(cells[cells.length - 1]);

                if (/^\d{2}\/\d{2}$/.test(cells[0] || '') && value != null) {
                    seasonSkills.push({
                        season: cells[0],
                        skill: value
                    });

                    return;
                }

                if (label === 'скилл' && value != null) {
                    if (tableIndex === 0) seasonSkill = value;
                    else talentSkill = value;
                }

                if (label.includes('класс') && value != null) {
                    classSkill = value;
                }

                if (label.includes('итог') && value != null) {
                    finalSkill = value;
                }
            });
        });

        return {
            seasonSkills,
            seasonSkill,
            talentSkill,
            classSkill,
            finalSkill
        };
    },

    parseGames(text) {
        const m = String(text || '').match(/(\d+)\s*\/\s*(\d+)/);

        return {
            played: m ? Number(m[1]) : null,
            possible: m ? Number(m[2]) : null
        };
    },

    parseMinutes(text) {
        const clean = this.normalizeText(text);
        const pctMatch = clean.match(/(\d{1,3})\s*%/);
        // Minutes may precede or follow the percentage depending on the page
        // layout; the percentage is removed before number extraction so the
        // remaining last number is always the played-minutes value.
        const withoutPct = clean.replace(/\d{1,3}\s*%\s*/g, ' ');
        const nums = [...withoutPct.matchAll(/\d+/g)].map(x => Number(x[0]));

        return {
            minutesText: clean,
            minutesPct: pctMatch ? Number(pctMatch[1]) : null,
            minutes: nums.length ? nums[nums.length - 1] : null
        };
    },

    parseStatCells(cells, season) {
        const rowText = cells.join(' | ');

        if (!rowText.trim()) return null;
        if (/Лига\s*\|\s*Команда\s*\|\s*Игр/i.test(rowText)) return null;

        // Semantic layout (2026 redesign): locate the games cell ("N/M") and
        // derive every other column relative to it, so adding or removing
        // leading columns cannot shift the mapping again.
        const gamesIdx = cells.findIndex(c => /^\d+\s*\/\s*\d+$/.test(this.normalizeText(c)));

        let leagueText, teamText, gamesText, startsText, minutesText, goalsText, assistsText;

        if (gamesIdx > 0) {
            leagueText = this.normalizeText(cells.slice(0, gamesIdx - 1).join(' '));
            teamText = cells[gamesIdx - 1] || '';
            gamesText = cells[gamesIdx];
            startsText = cells[gamesIdx + 1] || '';
            minutesText = cells[gamesIdx + 2] || '';
            goalsText = cells[gamesIdx + 3] || '';
            assistsText = cells[gamesIdx + 4] || '';
        } else {
            // Legacy fixed-index fallback.
            leagueText = cells[1] || '';
            teamText = cells[2] || '';
            gamesText = cells[3] || '';
            startsText = cells[4] || '';
            minutesText = cells[5] || '';
            goalsText = cells[6] || '';
            assistsText = cells[7] || '';
        }

        const leagueMatch = leagueText.match(/(\d+)\s*\/\s*(\d+)/);
        const games = this.parseGames(gamesText);
        const minutes = this.parseMinutes(minutesText);

        if (!leagueText && games.played == null && minutes.minutesPct == null) return null;

        return {
            season: season?.actualYear ?? null,
            seasonLabel: season?.label || '',
            seasonActualYear: season?.actualYear ?? null,
            seasonStartYear: season?.startYear ?? null,
            seasonEndYear: season?.endYear ?? null,
            isCurrentSeason: season?.isCurrent === true,
            rawCells: cells,
            rowText,

            leagueText,
            leagueLevel: leagueMatch ? Number(leagueMatch[1]) : null,
            leagueSkill: leagueMatch ? Number(leagueMatch[2]) : null,

            teamText,

            gamesPlayed: games.played,
            gamesPossible: games.possible,

            starts: this.toNumber(startsText),

            minutes: minutes.minutes,
            minutesPct: minutes.minutesPct,

            goals: this.toNumber(goalsText),
            assists: this.toNumber(assistsText)
        };
    },

    parseAiStatRow(tr, season) {
        const cells = [...tr.querySelectorAll('td, th')]
            .map(td => this.normalizeText(td.innerText || td.textContent || ''));

        return this.parseStatCells(cells, season);
    },


    parseSeasonHeader(text) {
        const clean = this.normalizeText(text);
        const isCurrent = /текущ/i.test(clean);

        const range = clean.match(/^Сезон\s+(\d{4})\s*\/\s*(\d{4})/i);

        if (range) {
            return {
                label: `Сезон ${range[1]}/${range[2]}`,
                startYear: Number(range[1]),
                endYear: Number(range[2]),
                actualYear: Number(range[2]),
                seasonYear: Number(range[2]),
                isCurrent
            };
        }

        const single = clean.match(/^Сезон\s+(\d{4})/i);

        if (single) {
            return {
                label: `Сезон ${single[1]}`,
                startYear: Number(single[1]),
                endYear: Number(single[1]),
                actualYear: Number(single[1]),
                seasonYear: Number(single[1]),
                isCurrent
            };
        }

        return null;
    },

    parseSeasonStatRows(doc) {
        const result = [];

        let currentSeason = null;

        [...doc.body.querySelectorAll('*')].forEach(el => {
            const text = this.normalizeText(el.innerText || el.textContent || '');

            const seasonHeader = text.length < 120
                ? this.parseSeasonHeader(text)
                : null;

            if (seasonHeader) {
                currentSeason = seasonHeader;
                return;
            }

            if (el.matches && el.matches('table.ai_stat')) {
                [...el.querySelectorAll('tr')]
                    .map(tr => this.parseAiStatRow(tr, currentSeason))
                    .filter(Boolean)
                    .forEach(row => {
                        result.push(row);
                    });
            }
        });

        return result;
    },

    getPracticeStatus(age, minutes) {
        const ageNumber = Number(age || 0);
        const minuteNumber = Number(minutes || 0);

        if (minuteNumber <= 0) {
            return {
                label: 'Не играет',
                level: 'risk',
                score: -3
            };
        }

        if (ageNumber <= 18) {
            if (minuteNumber >= 500) return { label: 'Практика', level: 'good', score: 4 };
            if (minuteNumber >= 300) return { label: 'Эпизодически', level: 'watch', score: 1 };
            return { label: 'Не играет', level: 'risk', score: -2 };
        }

        if (ageNumber <= 20) {
            if (minuteNumber >= 1200) return { label: 'Практика', level: 'good', score: 4 };
            if (minuteNumber >= 500) return { label: 'Эпизодически', level: 'watch', score: 1 };
            return { label: 'Не играет', level: 'risk', score: -2 };
        }

        if (ageNumber <= 22) {
            if (minuteNumber >= 1800) return { label: 'Практика', level: 'good', score: 4 };
            if (minuteNumber >= 900) return { label: 'Ротация', level: 'normal', score: 2 };
            if (minuteNumber >= 300) return { label: 'Эпизодически', level: 'watch', score: 1 };
            return { label: 'Не играет', level: 'risk', score: -2 };
        }

        if (minuteNumber >= 2500) return { label: 'Основа', level: 'good', score: 4 };
        if (minuteNumber >= 900) return { label: 'Ротация', level: 'normal', score: 2 };
        if (minuteNumber >= 300) return { label: 'Эпизодически', level: 'watch', score: 1 };
        return { label: 'Не играет', level: 'risk', score: -2 };
    },

    sumMinutes(rows) {
        return (rows || []).reduce((sum, row) => sum + Number(row?.minutes || 0), 0);
    },

    buildAnalysis(data) {
        const eligiblePct = CONFIG.TRANSFER_ANALYZER?.slfAlter?.eligibleMinutesPct || 40;
        const rows = Array.isArray(data.rows) ? data.rows : [];
        const calendarYear = new Date().getFullYear();

        const statRows = rows.filter(row =>
            row &&
            row.seasonActualYear &&
            row.minutes != null
        );

        const validRows = rows.filter(row =>
            row &&
            row.season &&
            row.gamesPossible != null &&
            row.minutesPct != null
        );

        const leagueRows = validRows.filter(row =>
            row.leagueLevel != null &&
            row.leagueSkill != null
        );

        const markedCurrentAllRows = statRows.filter(row => row.isCurrentSeason === true);
        const fallbackCurrentAllRows = markedCurrentAllRows.length
            ? []
            : statRows.filter(row => Number(row.seasonActualYear || row.season || 0) === calendarYear);
        const currentSeasonRows = markedCurrentAllRows.length ? markedCurrentAllRows : fallbackCurrentAllRows;

        const currentSeasonYear = currentSeasonRows.length
            ? Number(currentSeasonRows[0].seasonActualYear || currentSeasonRows[0].season || 0)
            : null;

        const currentSeasonLabel = currentSeasonRows[0]?.seasonLabel || '';

        const markedCurrentLeagueRows = leagueRows.filter(row =>
            currentSeasonYear && Number(row.seasonActualYear || row.season || 0) === currentSeasonYear
        );

        const currentRow = this.pickBestRow(markedCurrentLeagueRows);
        const currentSeasonMinutes = currentSeasonRows.length ? this.sumMinutes(currentSeasonRows) : 0;
        const practiceStatus = this.getPracticeStatus(data.age, currentSeasonMinutes);

        const eligibleRows = leagueRows.filter(row => Number(row.minutesPct || 0) >= eligiblePct);
        const currentEligibleRows = eligibleRows.filter(row =>
            currentSeasonYear && Number(row.seasonActualYear || row.season || 0) === currentSeasonYear
        );
        const pastEligibleRows = eligibleRows.filter(row =>
            !currentSeasonYear || Number(row.seasonActualYear || row.season || 0) !== currentSeasonYear
        );

        const bestEligibleRow = this.pickBestRow(eligibleRows);
        const currentEligibleRow = this.pickBestRow(currentEligibleRows);
        const pastEligibleRow = this.pickBestRow(pastEligibleRows);

        const talent = Number(data.talent || 0);
        const currentSkill = Number(data.currentSkill || 0);
        const finalSkill = data.finalSkill != null ? Number(data.finalSkill) : null;

        const talentUpgradeRows = eligibleRows.filter(row =>
            talent &&
            row.leagueLevel != null &&
            Number(row.leagueLevel) > talent
        );

        const currentTalentUpgradeRow = this.pickBestRow(
            talentUpgradeRows.filter(row =>
                currentSeasonYear && Number(row.seasonActualYear || row.season || 0) === currentSeasonYear
            )
        );

        const pastTalentUpgradeRow = this.pickBestRow(
            talentUpgradeRows.filter(row =>
                !currentSeasonYear || Number(row.seasonActualYear || row.season || 0) !== currentSeasonYear
            )
        );

        const talentUpgradeRow = currentTalentUpgradeRow || pastTalentUpgradeRow || null;

        const lastSeasonYear = statRows.length
            ? Math.max(...statRows.map(row => Number(row.seasonActualYear || row.season || 0)))
            : null;

        const activeRows = statRows.filter(row => Number(row.minutes || 0) > 0);
        const lastActiveSeasonActualYear = activeRows.length
            ? Math.max(...activeRows.map(row => Number(row.seasonActualYear || row.season || 0)))
            : null;
        const lastActiveSeasonRows = lastActiveSeasonActualYear
            ? activeRows.filter(row => Number(row.seasonActualYear || row.season || 0) === lastActiveSeasonActualYear)
            : [];
        const lastActiveSeasonLabel = lastActiveSeasonRows[0]?.seasonLabel || '';
        const lastActiveSeasonMinutes = this.sumMinutes(lastActiveSeasonRows);

        const hasCurrentSeason = currentSeasonRows.length > 0;
        const isCurrentSeasonActive = currentSeasonMinutes > 0;

        const skillDelta = finalSkill != null && currentSkill
            ? finalSkill - currentSkill
            : null;

        return {
            playerId: data.playerId,
            url: data.url,

            currentSeasonYear,
            currentSeasonLabel,
            currentSeasonMinutes,
            practiceStatus,
            lastSeasonYear,
            lastActiveSeasonLabel,
            lastActiveSeasonActualYear,
            lastActiveSeasonMinutes,
            hasCurrentSeason,
            isCurrentSeasonActive,
            staleActivity: !hasCurrentSeason || currentSeasonMinutes <= 0,

            age: data.age,
            talent: data.talent,
            currentSkill: data.currentSkill,
            finalSkill,
            skillDelta,
            seasonSkill: data.seasonSkill,
            talentSkill: data.talentSkill,
            classSkill: data.classSkill,
            seasonSkills: data.seasonSkills || [],

            rows: validRows,
            leagueRows,
            currentRow,
            bestEligibleRow,
            currentEligibleRow,
            pastEligibleRow,

            hasCurrent40: !!currentEligibleRow,
            hasPast40: !!pastEligibleRow,

            talentUpgradeEligible: !!talentUpgradeRow,
            talentUpgradeRow,
            currentTalentUpgradeRow,
            pastTalentUpgradeRow,

            leagueAboveSkill: !!currentRow &&
                currentSkill &&
                Number(currentRow.leagueSkill || 0) > Number(currentSkill)
        };
    },

    pickBestRow(rows) {
        const list = Array.isArray(rows) ? rows.filter(Boolean) : [];

        if (!list.length) return null;

        return list.slice().sort((a, b) => {
            return Number(b.seasonActualYear || b.season || 0) - Number(a.seasonActualYear || a.season || 0) ||
                Number(b.minutesPct || 0) - Number(a.minutesPct || 0) ||
                Number(b.leagueSkill || 0) - Number(a.leagueSkill || 0) ||
                Number(b.gamesPlayed || 0) - Number(a.gamesPlayed || 0);
        })[0];
    },

    formatSkill(value) {
        if (value == null || !Number.isFinite(Number(value))) return '?';

        const n = Number(value);

        return Number.isInteger(n) ? String(n) : n.toFixed(2);
    },

    formatDelta(value) {
        if (value == null || !Number.isFinite(Number(value))) return '';

        const n = Number(value);
        const sign = n >= 0 ? '+' : '';

        return `${sign}${n.toFixed(2)}`;
    }
};

// ============================================================
