// 14.9 Team4 player status helper
// ============================================================

const PlayerStatusPanel = {
    HEAD_CLASS: 'slf-player-status-head',
    CELL_CLASS: 'slf-player-status-cell',
    MARKER_CLASS: 'slf-status-marker',
    TIP_ID: 'slf-player-status-tip',
    STYLE_ID: 'slf-player-status-style',
    STORAGE_KEY: 'slf_team4_player_status_cache_v3',
    LEGACY_STORAGE_KEYS: ['slf_team4_player_status_cache_v2', 'slf_team4_player_status_cache_v1'],
    TAB_TYPES: new Set(['0', '1', '-3']),
    TYPE_TO_ROW_CLASS: { '0': 'pl-0', '1': 'pl-1', '-3': 'pl--3' },
    REAL_MARKER_CATEGORIES: new Set(['club', 'agent', 'tmValue', 'activity', 'trend', 'contract', 'academy']),
    mounted: false,
    renderSeq: 0,
    sessionCache: new Map(),
    tooltipHtmlCache: new Map(),
    activeTipPlayerId: '',
    activeTipButton: null,

    isPage() {
        return location.pathname.includes('/team4.php');
    },

    norm(text) {
        return String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    },

    low(text) {
        return this.norm(text).toLowerCase();
    },

    parseNum(text) {
        const match = String(text || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
        return match ? Number(match[0]) : null;
    },

    parseMoney(text) {
        const raw = this.norm(text);
        if (!raw) return 0;
        const match = raw.replace(/'/g, '').replace(/,/g, '.').match(/([0-9]+(?:\.[0-9]+)?)/);
        if (!match) return 0;
        let value = Number(match[1] || 0);
        if (!Number.isFinite(value)) return 0;
        if (/\bM\b|млн|mio\.?/i.test(raw)) value *= 1000000;
        else if (/\bk\b|тыс/i.test(raw)) value *= 1000;
        return value;
    },

    formatMoney(value) {
        const n = Number(value || 0);
        if (!n) return '?';
        if (typeof TMEnrichmentLayer !== 'undefined' && TMEnrichmentLayer.formatMoney) {
            try { return TMEnrichmentLayer.formatMoney(n); } catch (_) { /* noop */ }
        }
        if (n >= 1000000) return `€${(n / 1000000).toFixed(n >= 10000000 ? 1 : 2)}M`;
        if (n >= 1000) return `€${Math.round(n / 1000)}k`;
        return `€${Math.round(n)}`;
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    },

    escapeAttr(value) {
        return this.escapeHtml(value).replaceAll('\n', '&#10;');
    },

    getActiveTabType() {
        return String(document.querySelector('.tpanel-a[data-tp]')?.dataset.tp || '0');
    },

    shouldShowModule() {
        return this.TAB_TYPES.has(this.getActiveTabType());
    },

    getRows() {
        return [...document.querySelectorAll('tr.view-team__player.pl-0, tr.view-team__player.pl-1, tr.view-team__player.pl--3')];
    },

    getActiveRows() {
        const rowClass = this.TYPE_TO_ROW_CLASS[this.getActiveTabType()];
        return rowClass ? [...document.querySelectorAll(`tr.view-team__player.${rowClass}`)] : [];
    },

    getPlayerId(row) {
        return String(row?.id || '').replace(/^pltr-/, '');
    },

    getTmLink(row) {
        return row.querySelector('a[href*="transfermarkt.com"]')?.href || '';
    },

    getTmPlayerId(tmUrl) {
        const match = String(tmUrl || '').match(/spieler\/(\d+)/i);
        return match ? match[1] : '';
    },

    makeKeyFromValues(playerId, tmUrl) {
        const slfId = String(playerId || '').trim();
        const tmId = this.getTmPlayerId(tmUrl);
        return `slf:${slfId}|tm:${tmId || tmUrl || '-'}`;
    },

    playerKey(row) {
        return this.makeKeyFromValues(this.getPlayerId(row), this.getTmLink(row));
    },

    getSessionCached(row) {
        return this.sessionCache.get(this.playerKey(row)) || null;
    },

    setSessionCached(row, data) {
        this.sessionCache.set(this.playerKey(row), data);
        if (data?.key) this.sessionCache.set(data.key, data);
    },

    parseTime(value) {
        const timestamp = Date.parse(value || '');
        return Number.isFinite(timestamp) ? timestamp : 0;
    },

    isRealMarker(marker) {
        if (!marker) return false;
        const category = String(marker.category || '').trim();
        if (category && this.REAL_MARKER_CATEGORIES.has(category)) return true;
        const label = this.low(marker.label || '');
        return /^(tm|min|club|agent|ctr|contract|academy|youth|peak|fall|пик|спад|около пика|ниже пика)/i.test(label);
    },

    filterRealMarkers(markers) {
        return (Array.isArray(markers) ? markers : []).filter(marker => this.isRealMarker(marker));
    },

    normalizeRecord(record) {
        if (!record || record.recordType !== 'team4_player_status') return null;
        const key = record.key || this.makeKeyFromValues(record.slfPlayerId, record.tmUrl || record.tmLink || '');
        if (!key || !record.slfPlayerId) return null;

        const normalized = {
            ...record,
            key,
            tmLink: record.tmLink || record.tmUrl || '',
            tmUrl: record.tmUrl || record.tmLink || '',
            markers: this.filterRealMarkers(record.markers),
            contextMarkers: [],
            potentialTitle: '',
            formDelta: 0,
            practice: null,
            physical: null,
            fatigue: null,
            morale: null
        };

        normalized.trendInfo = normalized.trendInfo || this.getTrendInfo(normalized.tmProfile, normalized.tmValueRowEur);
        normalized.status = this.classifyStatus(normalized);
        normalized.reasons = normalized.status?.reasons || [];
        return normalized;
    },

    putSessionRecord(record) {
        const normalized = this.normalizeRecord(record);
        if (!normalized) return false;
        const existing = this.sessionCache.get(normalized.key);
        if (existing && this.parseTime(existing.updatedAt) > this.parseTime(normalized.updatedAt)) return false;
        this.sessionCache.set(normalized.key, normalized);
        this.cacheTooltipHtml(normalized);
        return true;
    },

    loadFromLocalStorage() {
        if (!this.isPage()) return false;
        try {
            const rows = [];
            [this.STORAGE_KEY, ...this.LEGACY_STORAGE_KEYS].forEach(key => {
                const raw = localStorage.getItem(key);
                if (!raw) return;
                const parsed = JSON.parse(raw);
                rows.push(...(Array.isArray(parsed) ? parsed : Object.values(parsed || {})));
            });
            let changed = false;
            rows.forEach(row => { changed = this.putSessionRecord(row) || changed; });
            return changed;
        } catch (error) {
            debugWarn('[SLF Статус] localStorage read failed', error);
            return false;
        }
    },

    saveToLocalStorage() {
        try {
            const unique = [];
            const seen = new Set();
            [...this.sessionCache.values()].forEach(record => {
                const row = this.normalizeRecord(record);
                if (!row?.key || seen.has(row.key)) return;
                seen.add(row.key);
                unique.push(row);
            });
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(unique));
        } catch (error) {
            debugWarn('[SLF Статус] localStorage write failed', error);
        }
    },

    getHeaderIndexMap() {
        const headers = [...document.querySelectorAll('#generallist thead th')]
            .filter(th => !th.classList.contains(this.HEAD_CLASS));
        const result = {
            age: 10,
            talent: 11,
            skill: 14,
            realClub: 19,
            tmPrice: 21
        };
        headers.forEach((th, index) => {
            const text = this.low(th.textContent);
            if (text.includes('воз')) result.age = index;
            else if (text.includes('тал')) result.talent = index;
            else if (text === 'скилл' || (text.includes('скилл') && !text.includes('р-скилл'))) result.skill = index;
            else if (text.includes('клуб в реале')) result.realClub = index;
            else if (text === 'цена') result.tmPrice = index;
        });
        return result;
    },

    getCell(row, index) {
        const cells = [...row.children].filter(td => !td.classList.contains(this.CELL_CLASS));
        return cells[index] || null;
    },

    getPosition(row) {
        return this.low(row.querySelector('.player-position')?.textContent || '').toUpperCase();
    },

    getName(row) {
        return this.norm(row.querySelector('a[href*="player.php"]')?.textContent || row.id || 'unknown');
    },

    getClub(row) {
        return this.norm(row.querySelector('.player-team-real')?.textContent || '');
    },

    getClubConfidence(row) {
        const cell = row.querySelector('.player-team-real');
        if (!cell) return 'none';
        if (cell.querySelector('a[href*="roster.php"]')) return 'linked';
        if (this.norm(cell.textContent)) return 'text';
        return 'none';
    },

    getTmContractFromRow(row) {
        return this.norm(row.querySelector('.player-tm-contract')?.textContent || '');
    },

    isCenterDefender(position) {
        return /^(CD|DC|CB)$/i.test(position);
    },

    isWidePosition(position) {
        return /^(LD|RD|LB|RB|LM|RM|LW|RW)$/i.test(position);
    },

    getAgeStage(age, position) {
        if (!Number.isFinite(age)) return { key: 'unknown', label: 'возр ?', className: 'neutral' };
        if (age <= 19) return { key: 'youth', label: `${age} юн`, className: 'good' };
        if (age <= 23) return { key: 'grow', label: `${age} рост`, className: 'good' };
        if (age <= 29) return { key: 'prime', label: `${age} прайм`, className: 'good' };
        if (position === 'GK') {
            if (age <= 33) return { key: 'hold', label: `${age} держит`, className: 'neutral' };
            if (age <= 36) return { key: 'late', label: `${age} поздно`, className: 'warn' };
            return { key: 'old', label: `${age} стар`, className: 'bad' };
        }
        if (this.isCenterDefender(position)) {
            if (age <= 32) return { key: 'hold', label: `${age} держит`, className: 'neutral' };
            if (age <= 34) return { key: 'late', label: `${age} поздно`, className: 'warn' };
            return { key: 'old', label: `${age} стар`, className: 'bad' };
        }
        if (this.isWidePosition(position)) {
            if (age <= 31) return { key: 'late', label: `${age} поздно`, className: 'warn' };
            return { key: 'old', label: `${age} стар`, className: 'bad' };
        }
        if (age <= 32) return { key: 'hold', label: `${age} держит`, className: 'neutral' };
        if (age <= 34) return { key: 'late', label: `${age} поздно`, className: 'warn' };
        return { key: 'old', label: `${age} стар`, className: 'bad' };
    },

    markerClass(level) {
        const value = String(level || '').toLowerCase();
        if (['hot', 'good', 'normal'].includes(value)) return 'good';
        if (['watch', 'low', 'old'].includes(value)) return 'warn';
        if (['risk', 'skip', 'bad'].includes(value)) return 'bad';
        return 'neutral';
    },

    serializeMarker(marker, category = '') {
        if (!marker) return null;
        const label = String(marker.label || '').trim();
        if (!label) return null;
        return {
            label,
            level: marker.level || 'neutral',
            className: marker.className || this.markerClass(marker.level),
            score: Number(marker.score || 0),
            redFlag: !!marker.redFlag,
            hardStop: !!marker.hardStop,
            category: marker.category || category || '',
            text: marker.text || ''
        };
    },

    getMinutesMarker(profile) {
        const pct = profile?.activity?.minutesPct;
        if (pct == null) return this.serializeMarker({ label: 'MIN ?', level: 'unknown', score: 0, text: 'Минуты текущего сезона не найдены.' }, 'activity');
        const p = Number(pct || 0);
        if (p >= 70) return this.serializeMarker({ label: `MIN ${p}%`, level: 'good', score: 4, text: 'Высокий процент минут в реальном сезоне.' }, 'activity');
        if (p >= 40) return this.serializeMarker({ label: `MIN ${p}%`, level: 'normal', score: 2, text: 'Нормальная доля минут в реальном сезоне.' }, 'activity');
        if (p > 0) return this.serializeMarker({ label: `MIN ${p}%`, level: 'watch', score: -1, redFlag: true, text: 'Мало минут в реальном сезоне.' }, 'activity');
        return this.serializeMarker({ label: 'MIN 0%', level: 'risk', score: -2, redFlag: true, text: 'В текущем реальном сезоне нет игровых минут.' }, 'activity');
    },

    getRowTmValueMarker(data) {
        if (data.tmValueRowEur) {
            return this.serializeMarker({ label: `TM ${this.formatMoney(data.tmValueRowEur)}`, level: data.tmValueRowEur >= 300000 ? 'normal' : 'low', score: data.tmValueRowEur >= 300000 ? 1 : 0, text: 'TM-цена прочитана из строки team4.' }, 'tmValue');
        }
        return this.serializeMarker({ label: 'TM €?', level: 'unknown', score: 0, text: 'TM-цена на странице не найдена.' }, 'tmValue');
    },

    getTransferMarkers(profile, data) {
        const markers = [];
        const analyzer = typeof TransferMarketAnalyzer !== 'undefined' ? TransferMarketAnalyzer : null;
        const safe = (fn, category) => {
            try {
                const marker = this.serializeMarker(fn(), category);
                if (marker && this.isRealMarker(marker)) markers.push(marker);
            } catch (error) {
                debugWarn('[SLF Статус] marker failed', category, error);
            }
        };

        if (!profile || !analyzer) {
            markers.push(this.getRowTmValueMarker(data));
            return this.filterRealMarkers(markers);
        }

        safe(() => analyzer.getClubStatusMarker(profile), 'club');
        safe(() => analyzer.getAgentMarker(profile), 'agent');
        safe(() => analyzer.getTmValueMarker(profile), 'tmValue');
        markers.push(this.getMinutesMarker(profile));
        safe(() => analyzer.getValueTrendMarker(profile), 'trend');
        safe(() => analyzer.getContractMarker(profile.contractExpires), 'contract');
        safe(() => analyzer.getAcademyMarker(profile.transferHistory || [], profile.youthClubs || []), 'academy');
        return this.filterRealMarkers(markers);
    },

    getTrendInfo(profile, rowValueEur) {
        const current = Number(profile?.marketValueEur || profile?.lastKnownMarketValueEur || rowValueEur || 0);
        const peak = Number(profile?.highestMarketValueEur || 0);
        const ratio = Number(profile?.valuePeakRatio || (current && peak ? current / peak : 0));
        const pct = ratio ? Math.round(ratio * 100) : null;
        if (!current) return { key: 'unknown', label: 'TM ?', className: 'neutral', current, peak, ratio, pct, text: 'TM-цена не найдена.' };
        if (!peak || !ratio) return { key: 'value', label: `TM ${this.formatMoney(current)}`, className: 'neutral', current, peak, ratio, pct, text: 'Есть текущая TM-цена, но пик не найден.' };
        if (ratio >= 0.90) return { key: 'peak', label: `пик ${pct}%`, className: 'good', current, peak, ratio, pct, text: 'TM-цена на пике или почти на пике.' };
        if (ratio >= 0.70) return { key: 'nearPeak', label: `около пика ${pct}%`, className: 'good', current, peak, ratio, pct, text: 'TM-цена близка к пику.' };
        if (ratio >= 0.40) return { key: 'belowPeak', label: `ниже пика ${pct}%`, className: 'neutral', current, peak, ratio, pct, text: 'TM-цена ниже пика, но игрок еще сохраняет стоимость.' };
        if (ratio >= 0.20) return { key: 'fall', label: `спад ${pct}%`, className: 'warn', current, peak, ratio, pct, text: 'TM-цена заметно ниже пика.' };
        return { key: 'hardFall', label: `сильный спад ${pct}%`, className: 'bad', current, peak, ratio, pct, text: 'TM-цена сильно ниже пика.' };
    },

    classifyStatus(data) {
        const club = this.low(data.club);
        const profile = data.tmProfile || null;
        const profileClub = this.low(profile?.currentClub || '');
        const combinedClubText = `${club} ${profileClub}`;
        const hasRowClub = !!club && !/без клуба|without club|no club|free agent|vereinslos|retired|заверш/i.test(club);
        const hasProfileClub = !!profileClub && !/без клуба|without club|no club|free agent|vereinslos|retired|заверш/i.test(profileClub);
        const hasClub = hasRowClub || hasProfileClub;
        const uncertainClub = data.clubConfidence === 'text' && !hasProfileClub;
        const free = /без клуба|without club|no club|free agent|vereinslos/i.test(combinedClubText) || !!profile?.isFreeAgent;
        const retired = /retired|заверш|career ended/i.test(combinedClubText) || !!profile?.isRetired;
        const hasExternalProfile = !!data.tmLink;
        const stage = data.ageStage?.key || 'unknown';
        const trend = data.trendInfo || this.getTrendInfo(null, data.tmValueRowEur);
        const minPct = profile?.activity?.minutesPct != null ? Number(profile.activity.minutesPct) : null;
        const age = Number(data.age || 0);
        const tmCurrent = Number(profile?.marketValueEur || data.tmValueRowEur || trend.current || 0);
        const peakRatio = Number.isFinite(trend.ratio) ? trend.ratio : null;
        const markers = this.filterRealMarkers(data.markers || []);
        const markerText = this.low(markers.map(marker => `${marker.label || ''} ${marker.text || ''} ${marker.category || ''}`).join(' '));
        const majorRisks = [];
        const minorRisks = [];
        const positives = [];
        const notes = [];
        let confidence = 'medium';

        const addUnique = (list, reason) => {
            if (reason && !list.includes(reason)) list.push(reason);
        };
        const addMajor = reason => addUnique(majorRisks, reason);
        const addMinor = reason => addUnique(minorRisks, reason);
        const addPositive = reason => addUnique(positives, reason);
        const addNote = reason => addUnique(notes, reason);
        const markerHas = re => re.test(markerText);

        if (profile && hasExternalProfile) confidence = 'high';
        if (!profile || !hasExternalProfile) confidence = 'medium';
        if (!hasExternalProfile && !hasClub) confidence = 'low';

        const severeTrend = trend.key === 'hardFall' || (Number.isFinite(peakRatio) && peakRatio > 0 && peakRatio < 0.20);
        const fallingTrend = trend.key === 'fall' || (Number.isFinite(peakRatio) && peakRatio >= 0.20 && peakRatio < 0.40);
        const belowPeakTrend = trend.key === 'belowPeak' || (Number.isFinite(peakRatio) && peakRatio >= 0.40 && peakRatio < 0.70);
        const nearPeakTrend = trend.key === 'peak' || trend.key === 'nearPeak' || (Number.isFinite(peakRatio) && peakRatio >= 0.85);
        const missingTrend = !trend.current || trend.key === 'unknown';
        const highValue = tmCurrent >= 10000000;
        const eliteValue = tmCurrent >= 20000000;
        const goodValue = tmCurrent >= 1000000;
        const hasAcademy = markerHas(/(elite|academy|youth|академ|школ|la masia|barcelona)/i);
        const hasAgent = markerHas(/(agent ✓|агент ✓|agent ok|agent)/i) && !markerHas(/(no agent|без агента|agent \?|агент \?|нет агента)/i);
        const hasContract = markerHas(/(ctr|contract|контракт)/i) && !markerHas(/(contract \?|ctr \?|нет контракта)/i);
        const confirmedLowMinutes = minPct != null && minPct < 30;
        const confirmedVeryLowMinutes = minPct != null && minPct < 10;
        const confirmedNoMinutes = minPct === 0;

        const isUnknownMarker = marker => {
            const text = this.low(`${marker.label || ''} ${marker.text || ''}`);
            return /min \?|minutes \?|минуты.*не найден|не найдены|нет данных|unknown|agent \?|агент \?|contract \?|ctr \?/i.test(text);
        };
        const redMarkers = markers.filter(marker => !isUnknownMarker(marker) && (marker.hardStop || marker.redFlag || marker.className === 'bad' || ['risk', 'skip', 'bad'].includes(String(marker.level || '').toLowerCase())));
        const warnMarkers = markers.filter(marker => !isUnknownMarker(marker) && (marker.className === 'warn' || ['watch', 'low', 'old'].includes(String(marker.level || '').toLowerCase())));

        if (retired) return { code: 'ВНЕ', label: 'завершил', className: 'bad', confidence, reasons: ['завершил карьеру'] };
        if (free) return { code: 'ВНЕ', label: 'без клуба', className: 'bad', confidence, reasons: ['без клуба'] };

        if (!hasClub) addMinor('клуб не подтвержден');
        if (uncertainClub) addNote('клуб указан текстом, уверенность ниже');
        if (!hasExternalProfile) addNote('нет TM-профиля');
        if (missingTrend && hasExternalProfile) addNote('TM-тренд не найден');
        if (minPct == null && profile) addNote('минуты текущего сезона не найдены');

        if (severeTrend) addMajor('TM-цена сильно ниже пика');
        else if (fallingTrend) addMajor('TM-цена заметно ниже пика');
        else if (belowPeakTrend && (stage === 'late' || stage === 'old' || age >= 30)) addMinor('TM-цена ниже пика на возрастном этапе');

        if (confirmedNoMinutes && age >= 23) addMajor('0% минут в текущем реальном сезоне');
        else if (confirmedVeryLowMinutes && age >= 23) addMajor('очень мало подтвержденных реальных минут');
        else if (confirmedLowMinutes && age >= 25) addMinor('низкая подтвержденная реальная активность');

        if (stage === 'old') addMajor('возрастной hard-risk для позиции');
        else if (stage === 'late') addMinor('поздний возрастной этап для позиции');
        redMarkers.forEach(marker => addMajor(marker.text || marker.label || 'красный real/TM маркер'));
        warnMarkers.forEach(marker => addMinor(marker.text || marker.label || 'желтый real/TM маркер'));

        if (hasClub) addPositive('есть клуб');
        if (hasExternalProfile) addPositive('есть TM-профиль');
        if (nearPeakTrend) addPositive('TM-цена около пика');
        if (eliteValue) addPositive('очень высокая TM-цена');
        else if (highValue) addPositive('высокая TM-цена');
        else if (goodValue) addPositive('есть значимая TM-цена');
        if (minPct != null && minPct >= 70) addPositive('высокие реальные минуты');
        else if (minPct != null && minPct >= 40) addPositive('есть реальные минуты');
        if (hasAgent) addPositive('есть агент');
        if (hasContract) addPositive('есть контракт');
        if (hasAcademy) addPositive('сильный academy/youth trace');

        const riskReasons = [...majorRisks, ...minorRisks];
        const allReasons = [...riskReasons, ...positives, ...notes].slice(0, 7);
        const strongCurrentProfile = hasClub && hasExternalProfile && nearPeakTrend && (highValue || eliteValue || hasAcademy || minPct >= 40);
        const cleanStrongProfile = majorRisks.length === 0 && hasClub && hasExternalProfile && nearPeakTrend;

        if (majorRisks.length) {
            if (severeTrend || stage === 'old' || (age >= 30 && majorRisks.length >= 1) || majorRisks.length >= 2) {
                return { code: 'СПАД', label: 'сильный спад', className: 'bad', confidence, reasons: allReasons };
            }
            return { code: 'РЕГРЕСС', label: 'подтвержденный риск', className: 'warn', confidence, reasons: allReasons };
        }

        if (minorRisks.length >= 2 && !strongCurrentProfile) {
            if (age >= 30 || stage === 'late' || stage === 'hold') {
                return { code: 'СПАД', label: 'накопленные риски', className: 'warn', confidence, reasons: allReasons };
            }
            return { code: 'РЕГРЕСС', label: 'есть риски снижения', className: 'warn', confidence, reasons: allReasons };
        }

        if (eliteValue && cleanStrongProfile && minPct != null && minPct >= 70) {
            return { code: 'ТОП', label: 'топ-уровень', className: 'good', confidence, reasons: [...positives, ...notes].slice(0, 7) };
        }

        if (highValue && cleanStrongProfile) {
            if (stage === 'youth' || stage === 'grow') {
                return { code: 'РОСТ', label: 'звезда на подъеме', className: 'good', confidence, reasons: [...positives, ...notes].slice(0, 7) };
            }
            return { code: 'ЗВЕЗДА', label: 'звезда команды', className: 'good', confidence, reasons: [...positives, ...notes].slice(0, 7) };
        }

        if ((stage === 'youth' || stage === 'grow') && hasClub && hasExternalProfile) {
            if (nearPeakTrend || hasAcademy || goodValue) {
                return { code: 'РОСТ', label: 'на подъеме', className: 'good', confidence, reasons: [...positives, ...notes].slice(0, 7) };
            }
            return { code: 'СЫРОЙ', label: 'молодой, мало данных', className: 'neutral', confidence: confidence === 'high' ? 'medium' : confidence, reasons: [...positives, ...notes].slice(0, 7) };
        }

        if (stage === 'prime' && hasClub && hasExternalProfile) {
            if (nearPeakTrend) return { code: 'ПИК', label: 'около пика', className: 'good', confidence, reasons: [...positives, ...notes].slice(0, 7) };
            if (minPct != null && minPct >= 40) return { code: 'ОСНОВА', label: 'стабильная основа', className: 'good', confidence, reasons: [...positives, ...notes].slice(0, 7) };
            if (minorRisks.length === 1) return { code: 'ОСНОВА', label: 'основа с оговоркой', className: 'neutral', confidence, reasons: allReasons };
            return { code: 'ОСНОВА', label: 'актуальный игрок', className: 'neutral', confidence, reasons: [...positives, ...notes].slice(0, 7) };
        }

        if (stage === 'hold' && hasClub && hasExternalProfile) {
            return { code: 'ДЕРЖИТ', label: 'держит уровень', className: 'neutral', confidence, reasons: [...positives, ...notes].slice(0, 7) };
        }

        if (stage === 'late' || stage === 'old') {
            return { code: 'СПАД', label: 'возрастной спад', className: stage === 'old' ? 'bad' : 'warn', confidence, reasons: allReasons.length ? allReasons : ['поздний возрастной этап для позиции'] };
        }

        if (hasClub && hasExternalProfile) {
            if (nearPeakTrend) return { code: 'ПИК', label: 'около пика', className: 'good', confidence, reasons: [...positives, ...notes].slice(0, 7) };
            if (goodValue || minPct != null && minPct >= 40) return { code: 'ОСНОВА', label: 'актуальный игрок', className: 'neutral', confidence, reasons: [...positives, ...notes].slice(0, 7) };
            return { code: 'СЫРОЙ', label: 'мало real/TM данных', className: 'neutral', confidence, reasons: [...positives, ...notes].slice(0, 7) };
        }

        if (age && age <= 21) return { code: 'СЫРОЙ', label: 'молодой, мало данных', className: 'neutral', confidence: 'low', reasons: allReasons.length ? allReasons : ['мало real/TM данных'] };
        return { code: 'СПАД', label: 'слабые real/TM данные', className: 'warn', confidence: 'low', reasons: allReasons.length ? allReasons : ['нет сильных real/TM подтверждений'] };
    },

    readPlayerFromDom(row, indexMap) {
        const age = this.parseNum(this.getCell(row, indexMap.age)?.textContent);
        const talent = this.parseNum(this.getCell(row, indexMap.talent)?.textContent);
        const skill = this.parseNum(this.getCell(row, indexMap.skill)?.textContent);
        const position = this.getPosition(row);
        const ageStage = this.getAgeStage(age, position);
        const tmLink = this.getTmLink(row);
        const data = {
            recordType: 'team4_player_status',
            key: this.playerKey(row),
            slfPlayerId: this.getPlayerId(row),
            tmPlayerId: this.getTmPlayerId(tmLink),
            tmUrl: tmLink,
            name: this.getName(row),
            position,
            age,
            talent,
            skill,
            tmValueRowText: this.norm(this.getCell(row, indexMap.tmPrice)?.childNodes?.[0]?.textContent || this.getCell(row, indexMap.tmPrice)?.textContent || ''),
            tmValueRowEur: 0,
            tmContractRow: this.getTmContractFromRow(row),
            club: this.getClub(row),
            clubConfidence: this.getClubConfidence(row),
            tmLink,
            ageStage,
            updatedAt: new Date().toISOString(),
            updateState: 'updated',
            tmProfile: null,
            tmError: '',
            markers: [],
            contextMarkers: []
        };
        data.tmValueRowEur = this.parseMoney(data.tmValueRowText);
        data.trendInfo = this.getTrendInfo(null, data.tmValueRowEur);
        data.markers = this.getTransferMarkers(null, data);
        data.status = this.classifyStatus(data);
        data.reasons = data.status?.reasons || [];
        return data;
    },

    async enrichWithTmProfile(data) {
        if (!data?.tmLink || typeof TMEnrichmentLayer === 'undefined' || !TMEnrichmentLayer.getTmProfile) {
            data.markers = this.getTransferMarkers(null, data);
            data.status = this.classifyStatus(data);
            data.reasons = data.status?.reasons || [];
            return data;
        }
        try {
            const profile = await TMEnrichmentLayer.getTmProfile(data.tmLink);
            data.tmProfile = {
                currentClub: profile.currentClub || '',
                playerAgent: profile.playerAgent || '',
                contractExpires: profile.contractExpires || '',
                marketValueText: profile.marketValueText || profile.lastKnownMarketValueText || '',
                marketValueEur: profile.marketValueEur || profile.lastKnownMarketValueEur || 0,
                highestMarketValueText: profile.highestMarketValueText || '',
                highestMarketValueEur: profile.highestMarketValueEur || 0,
                highestMarketValueDate: profile.highestMarketValueDate || '',
                valuePeakRatio: profile.valuePeakRatio ?? null,
                activity: profile.activity || null,
                isRetired: !!profile.isRetired,
                isFreeAgent: !!profile.isFreeAgent,
                transferHistory: profile.transferHistory || [],
                youthClubs: profile.youthClubs || [],
                rumors: profile.rumors || [],
                fetchedAt: profile.fetchedAt || Date.now()
            };
            data.trendInfo = this.getTrendInfo(profile, data.tmValueRowEur);
            data.markers = this.getTransferMarkers(profile, data);
        } catch (error) {
            data.tmError = String(error?.message || error || 'tm_failed');
            data.markers = this.getTransferMarkers(null, data);
        }
        data.contextMarkers = [];
        data.status = this.classifyStatus(data);
        data.reasons = data.status?.reasons || [];
        data.updatedAt = new Date().toISOString();
        return data;
    },

    async readPlayer(row, indexMap, enrich = false) {
        const data = this.readPlayerFromDom(row, indexMap);
        if (enrich) await this.enrichWithTmProfile(data);
        data.updatedAt = new Date().toISOString();
        this.setSessionCached(row, data);
        this.cacheTooltipHtml(data);
        return data;
    },

    markerRowHtml(marker) {
        if (!marker) return '';
        const text = marker.text ? `<div class="muted">${this.escapeHtml(marker.text)}</div>` : '';
        return `<div><span class="slf-status-badge ${this.escapeAttr(marker.className || 'neutral')}">${this.escapeHtml(marker.label)}</span>${text}</div>`;
    },

    buildTipHtml(data) {
        const reasons = (data.status?.reasons || []).map(reason => `<div>+ ${this.escapeHtml(reason)}</div>`).join('');
        const tmLine = data.tmLink
            ? `<a class="slf-status-link" href="${this.escapeAttr(data.tmLink)}" target="_blank">TM</a>`
            : '<span class="muted">TM ?</span>';
        const tmProfile = data.tmProfile || {};
        const trend = data.trendInfo || {};
        const tmCurrent = trend.current ? this.formatMoney(trend.current) : (data.tmValueRowEur ? this.formatMoney(data.tmValueRowEur) : '?');
        const tmPeak = trend.peak ? this.formatMoney(trend.peak) : '?';
        const ratioText = trend.pct != null ? `${trend.pct}%` : '?';
        const minutesPct = tmProfile.activity?.minutesPct != null ? `${tmProfile.activity.minutesPct}%` : '?';
        const markerHtml = this.filterRealMarkers(data.markers).map(marker => this.markerRowHtml(marker)).join('');
        return `
            <div class="title">${this.escapeHtml(data.name)} — ${this.escapeHtml(data.status?.code || '?')}</div>
            <div class="row"><b>Статус:</b> ${this.escapeHtml(data.status?.label || '?')} · уверенность ${this.escapeHtml(data.status?.confidence || '?')}</div>
            <div class="row"><b>Возраст/позиция:</b> ${this.escapeHtml(data.position || '?')} · ${this.escapeHtml(data.age ?? '?')} · ${this.escapeHtml(data.ageStage?.label || '?')}</div>
            <div class="row"><b>TM:</b> ${this.escapeHtml(tmCurrent)} / peak ${this.escapeHtml(tmPeak)} · ${this.escapeHtml(ratioText)} · ${this.escapeHtml(trend.label || '')}</div>
            <div class="row"><b>MIN:</b> ${this.escapeHtml(minutesPct)}</div>
            <div class="row"><b>Клуб:</b> ${this.escapeHtml(tmProfile.currentClub || data.club || '?')}</div>
            <div class="row"><b>Агент:</b> ${this.escapeHtml(tmProfile.playerAgent || '?')}</div>
            <div class="row"><b>Контракт:</b> ${this.escapeHtml(tmProfile.contractExpires || data.tmContractRow || '?')}</div>
            <div class="row"><b>Профиль:</b> ${tmLine}</div>
            <div class="row"><b>Маркеры реала:</b>${markerHtml || '<div class="muted">нет маркеров</div>'}</div>
            <div class="row"><b>Почему:</b>${reasons || '<div class="muted">нет явных причин</div>'}</div>
            ${data.tmError ? `<div class="row muted">TM error: ${this.escapeHtml(data.tmError)}</div>` : ''}
            <div class="row muted">обновлено · ${this.escapeHtml(data.updatedAt || '?')}</div>
        `;
    },

    cacheTooltipHtml(data) {
        const playerId = data?.slfPlayerId || '';
        if (!playerId) return '';
        const html = this.buildTipHtml(data);
        this.tooltipHtmlCache.set(playerId, html);
        return html;
    },

    statusMarker(data) {
        const code = data?.status?.code || '?';
        const type = data?.status?.className || 'neutral';
        const playerId = data?.slfPlayerId || '';
        const titleParts = [];
        if (data?.trendInfo?.label) titleParts.push(data.trendInfo.label);
        if (data?.tmProfile?.activity?.minutesPct != null) titleParts.push(`MIN ${data.tmProfile.activity.minutesPct}%`);
        if (data?.status?.confidence) titleParts.push(`conf ${data.status.confidence}`);
        this.cacheTooltipHtml(data);
        return `<button type="button" class="slf-status-badge ${this.MARKER_CLASS} ${type}" data-player-id="${this.escapeAttr(playerId)}" aria-label="${this.escapeAttr(code)}" title="${this.escapeAttr(titleParts.join(' · '))}">${this.escapeHtml(code)}</button>`;
    },

    loadingMarker(text = '...') {
        return `<span class="slf-status-badge neutral slf-status-loading">${this.escapeHtml(text)}</span>`;
    },

    makeCellHtml(row) {
        const cached = this.getSessionCached(row);
        if (!cached) return '<span class="slf-status-muted">-</span>';
        return this.statusMarker(cached);
    },

    ensureStyle() {
        if (document.getElementById(this.STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = this.STYLE_ID;
        style.textContent = `
            #generallist th.${this.HEAD_CLASS} {
                text-align:center;
                background:hsl(96, 5%, 19%);
                color:#9cff57;
                font-weight:bold;
                cursor:pointer;
                user-select:none;
                width:72px;
                min-width:72px;
                max-width:72px;
            }
            #generallist th.${this.HEAD_CLASS}:hover { color:#fff; }
            #generallist td.${this.CELL_CLASS} {
                width:72px;
                min-width:72px;
                max-width:72px;
                background:rgba(28,28,28,.72);
                border-left:1px solid #444;
                vertical-align:middle;
                white-space:nowrap;
                line-height:1.25;
                overflow:hidden;
                text-align:center;
            }
            .slf-status-title { white-space:nowrap; }
            .slf-status-badge,
            .slf-status-link {
                display:inline-block;
                padding:1px 4px;
                border-radius:3px;
                border:1px solid #555;
                background:#242424;
                color:#ddd;
                font:10px Verdana,Arial,sans-serif;
                text-decoration:none;
                cursor:default;
            }
            .${this.MARKER_CLASS} {
                cursor:pointer;
                max-width:68px;
                overflow:hidden;
                text-overflow:ellipsis;
                white-space:nowrap;
            }
            .slf-status-link {
                color:#9bd4ff;
                text-decoration:underline;
                cursor:pointer;
            }
            .slf-status-badge.good { background:#053d1f; border-color:#1e9c50; color:#78ff9a; }
            .slf-status-badge.warn { background:#483500; border-color:#9b7a00; color:#ffd45a; }
            .slf-status-badge.bad { background:#471414; border-color:#a64040; color:#ff8a8a; }
            .slf-status-badge.neutral { background:#262626; border-color:#555; color:#d0d0d0; }
            .slf-status-muted { color:#777; font-size:10px; }
            #${this.TIP_ID} {
                position:absolute;
                z-index:999999;
                width:390px;
                max-width:390px;
                max-height:70vh;
                overflow:auto;
                padding:10px;
                background:#151515;
                color:#e8e8e8;
                border:1px solid #666;
                border-radius:6px;
                box-shadow:0 8px 24px rgba(0,0,0,.55);
                font:11px Verdana,Arial,sans-serif;
                line-height:1.38;
                display:none;
                pointer-events:auto;
            }
            #${this.TIP_ID} .title { color:#9cff57; font-weight:bold; margin-bottom:6px; }
            #${this.TIP_ID} .row { border-top:1px solid #333; padding:4px 0; }
            #${this.TIP_ID} .muted { color:#aaa; margin-top:2px; }
        `;
        document.head.appendChild(style);
    },

    ensureHeader() {
        const headRow = document.querySelector('#generallist thead tr');
        if (!headRow) return;
        let th = headRow.querySelector(`th.${this.HEAD_CLASS}`);
        if (!th) {
            th = document.createElement('th');
            th.className = this.HEAD_CLASS;
            headRow.appendChild(th);
        }
        th.innerHTML = '<div class="slf-status-title">обновить</div>';
        th.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            this.hideTip();
            this.render(true);
        };
    },

    ensureTip() {
        let tip = document.getElementById(this.TIP_ID);
        if (!tip) {
            tip = document.createElement('div');
            tip.id = this.TIP_ID;
            document.body.appendChild(tip);
        }
        return tip;
    },

    positionTip(tip, button) {
        if (!tip || !button) return;
        const rect = button.getBoundingClientRect();
        const margin = 8;
        const gap = 6;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1280;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 720;
        const scrollX = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || 0;
        const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
        const maxWidth = Math.max(260, Math.min(390, viewportWidth - margin * 2));

        tip.style.width = `${maxWidth}px`;
        tip.style.maxWidth = `${maxWidth}px`;
        tip.style.visibility = 'hidden';
        tip.style.display = 'block';
        const measured = tip.getBoundingClientRect();
        const width = measured.width || maxWidth;
        const height = measured.height || 260;

        let viewportLeft;
        if (rect.left + width <= viewportWidth - margin) viewportLeft = rect.left;
        else if (rect.right - width >= margin) viewportLeft = rect.right - width;
        else if (rect.left - width - gap >= margin) viewportLeft = rect.left - width - gap;
        else viewportLeft = Math.min(Math.max(rect.left, margin), viewportWidth - width - margin);
        viewportLeft = Math.min(Math.max(viewportLeft, margin), viewportWidth - width - margin);

        let viewportTop = rect.bottom + gap;
        if (viewportTop + height > viewportHeight - margin && rect.top - height - gap >= margin) viewportTop = rect.top - height - gap;
        viewportTop = Math.min(Math.max(viewportTop, margin), viewportHeight - height - margin);

        tip.style.left = `${viewportLeft + scrollX}px`;
        tip.style.top = `${viewportTop + scrollY}px`;
        tip.style.visibility = 'visible';
    },

    showPreparedTip(button, playerId) {
        const tip = this.ensureTip();
        if (tip.style.display === 'block' && this.activeTipPlayerId === playerId) {
            this.hideTip();
            return;
        }
        let html = this.tooltipHtmlCache.get(playerId);
        if (!html) {
            const data = [...this.sessionCache.values()].find(row => row.slfPlayerId === playerId);
            if (!data) return;
            html = this.cacheTooltipHtml(data);
        }
        tip.innerHTML = html;
        this.activeTipButton = button;
        this.positionTip(tip, button);
        tip.dataset.playerId = playerId;
        this.activeTipPlayerId = playerId;
        tip.style.display = 'block';
    },

    hideTip() {
        const tip = document.getElementById(this.TIP_ID);
        if (tip) {
            tip.style.display = 'none';
            tip.dataset.playerId = '';
        }
        this.activeTipPlayerId = '';
        this.activeTipButton = null;
    },

    handleMarkerClick(event) {
        const button = event.target.closest?.(`.${this.MARKER_CLASS}`);
        if (!button) return false;
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        const playerId = button.dataset.playerId || '';
        if (!playerId) return true;
        this.showPreparedTip(button, playerId);
        return true;
    },

    async refreshRow(row, indexMap, seq) {
        let cell = row.querySelector(`td.${this.CELL_CLASS}`);
        if (!cell) return;
        const baseData = this.readPlayerFromDom(row, indexMap);
        this.setSessionCached(row, baseData);
        cell.innerHTML = this.statusMarker(baseData);

        const data = await this.readPlayer(row, indexMap, true);
        if (seq !== this.renderSeq) return;
        cell = row.querySelector(`td.${this.CELL_CLASS}`);
        if (!cell) return;
        cell.innerHTML = this.statusMarker(data);
    },

    async runLimited(items, limit, worker) {
        const queue = [...items];
        const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
            while (queue.length) {
                const item = queue.shift();
                await worker(item);
            }
        });
        await Promise.all(workers);
    },

    render(refreshVisible = false) {
        if (!this.isPage()) return;
        const seq = ++this.renderSeq;
        this.ensureStyle();
        this.ensureHeader();

        const indexMap = this.getHeaderIndexMap();
        const rows = this.getRows();
        const activeRows = this.getActiveRows();
        const activeRowSet = new Set(activeRows);
        const show = this.shouldShowModule();
        const head = document.querySelector(`th.${this.HEAD_CLASS}`);
        if (head) head.style.display = show ? '' : 'none';

        rows.forEach(row => {
            let cell = row.querySelector(`td.${this.CELL_CLASS}`);
            if (!cell) {
                cell = document.createElement('td');
                cell.className = this.CELL_CLASS;
                row.appendChild(cell);
            }
            cell.style.display = show ? '' : 'none';
            cell.innerHTML = refreshVisible && show && activeRowSet.has(row)
                ? this.loadingMarker('...')
                : this.makeCellHtml(row);
        });

        if (!refreshVisible || !show) return;

        this.runLimited(activeRows, 3, async row => {
            try {
                await this.refreshRow(row, indexMap, seq);
            } catch (error) {
                debugWarn('[SLF Статус] refresh row failed', error);
                const cell = row.querySelector(`td.${this.CELL_CLASS}`);
                const fallback = this.readPlayerFromDom(row, indexMap);
                fallback.tmError = String(error?.message || error || 'refresh_failed');
                this.setSessionCached(row, fallback);
                if (cell) cell.innerHTML = this.statusMarker(fallback);
            }
        }).then(() => {
            if (seq === this.renderSeq) this.saveToLocalStorage();
        });
    },

    bindTabs() {
        if (this.mounted) return;
        this.mounted = true;
        document.addEventListener('click', event => {
            const tab = event.target.closest('.tpanel-a, .tpanel-b');
            if (!tab) return;
            setTimeout(() => {
                this.hideTip();
                this.render(false);
            }, 90);
        }, true);
        document.addEventListener('click', event => {
            this.handleMarkerClick(event);
        }, true);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') this.hideTip();
        });
        window.addEventListener('resize', () => {
            const tip = document.getElementById(this.TIP_ID);
            if (tip?.style.display === 'block') this.hideTip();
        });
        document.addEventListener('click', event => {
            if (event.target.closest(`.${this.MARKER_CLASS}`)) return;
            if (event.target.closest(`#${this.TIP_ID}`)) return;
            this.hideTip();
        }, true);
    },

    mount() {
        if (!this.isPage()) return;
        this.bindTabs();
        this.loadFromLocalStorage();
        this.render(false);
    }
};
// ============================================================
