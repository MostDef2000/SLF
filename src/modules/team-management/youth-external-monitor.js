// 11.4 Youth External Monitor
// ============================================================

const YouthExternalMonitor = {
    cacheKey: 'slf_youth_tm_seen_ids_v8',
    _scanPromise: null,

    getSeasons() {
        const y = new Date().getFullYear();
        return [y, y - 1];
    },

    buildTransferUrl(source, season) {
        return `https://www.transfermarkt.com/${source.slug}/transfers/verein/${source.clubId}/saison_id/${season}`;
    },

    buildCanonicalYouthUrl(source) {
        return `https://www.transfermarkt.com/${source.slug}/transfers/verein/${source.clubId}`;
    },

    getCanonicalYouthKey(source) {
        return String(source?.clubId || '').trim();
    },

    extractClubIdFromUrl(url) {
        const m = String(url || '').match(/\/verein\/(\d+)/i);
        return m ? Number(m[1]) : null;
    },

    isTmChallengePage(html) {
        const text = String(html || '').toLowerCase();
        if (!text) return false;

        return (
            text.includes('captcha') ||
            text.includes('access denied') ||
            text.includes('are you a human') ||
            text.includes('unusual traffic') ||
            text.includes('cloudflare')
        );
    },

    resolveTmSourceState(html, source, requestedSeason, requestedUrl, loadedUrl) {
        const finalUrl = loadedUrl || requestedUrl || '';
        const expectedClubId = Number(source?.clubId || 0) || null;
        const loadedClubId = this.extractClubIdFromUrl(finalUrl) || this.extractClubIdFromUrl(requestedUrl);
        const resolvedSeason = this.resolveSeasonFromUrlOrContent(finalUrl || requestedUrl, requestedSeason, html);
        const identityMismatch = !!(expectedClubId && loadedClubId && expectedClubId !== loadedClubId);

        return {
            canonicalYouthKey: this.getCanonicalYouthKey(source),
            canonicalYouthUrl: this.buildCanonicalYouthUrl(source),
            requestedUrl,
            loadedUrl: finalUrl || requestedUrl,
            requestedSeason,
            resolvedSeason,
            label: source?.label || '',
            team: source?.team || '',
            slug: source?.slug || '',
            expectedClubId,
            loadedClubId,
            identityMismatch,
            challenge: this.isTmChallengePage(html),
            sourceLabel: source?.label || '',
            sourceTeam: source?.team || '',
            sourceClubId: expectedClubId
        };
    },

    loadSeenIds() {
        try {
            return JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
        } catch (e) {
            return {};
        }
    },

    saveSeenIds(data) {
        localStorage.setItem(this.cacheKey, JSON.stringify(data));
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    makeFetchError(kind, url, response = null, original = null) {
        const status = response?.status ?? null;
        const statusText = response?.statusText || '';
        const err = new Error(`${kind}${status ? ' HTTP ' + status : ''}${statusText ? ' ' + statusText : ''}`.trim());
        err.kind = kind;
        err.url = url;
        err.status = status;
        err.statusText = statusText;
        err.responseText = response?.responseText || '';
        err.original = original || null;
        return err;
    },

    async fetchUrl(url, options = {}) {
        const retries = Number(options.retries ?? 1);
        const delayMs = Number(options.delayMs ?? CONFIG.TRANSFER_ANALYZER?.requestDelayMs ?? 900);
        const timeout = Number(options.timeout ?? 20000);

        let lastError = null;

        for (let attempt = 0; attempt <= retries; attempt++) {
            if (attempt > 0 || delayMs > 0) await this.sleep(delayMs * (attempt + 1));

            try {
                return await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url,
                        headers: {
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                        },
                        onload: r => {
                            if (r.status >= 200 && r.status < 400) {
                                const html = r.responseText || '';

                                if (options.returnMeta) {
                                    resolve({
                                        html,
                                        requestedUrl: url,
                                        finalUrl: r.finalUrl || r.responseURL || url,
                                        status: r.status,
                                        statusText: r.statusText || ''
                                    });
                                    return;
                                }

                                resolve(html);
                                return;
                            }
                            reject(this.makeFetchError('http_error', url, r));
                        },
                        onerror: e => reject(this.makeFetchError('network_error', url, null, e)),
                        ontimeout: e => reject(this.makeFetchError('timeout', url, null, e)),
                        timeout
                    });
                });
            } catch (e) {
                lastError = e;
                if (e.status && ![403, 408, 429, 500, 502, 503, 504].includes(Number(e.status))) break;
            }
        }

        throw lastError || this.makeFetchError('unknown_error', url);
    },

    extractPlayersFromTM(html, source, season, sourceUrl, sourceState = null) {
        const state = sourceState || this.resolveTmSourceState(html, source, season, sourceUrl, sourceUrl);

        if (state.identityMismatch) {
            throw this.makeFetchError(
                'tm_identity_mismatch',
                state.loadedUrl || sourceUrl,
                { status: 0, statusText: `expected verein ${state.expectedClubId}, got ${state.loadedClubId || 'unknown'}` }
            );
        }

        if (state.challenge) {
            throw this.makeFetchError(
                'tm_challenge_or_block',
                state.loadedUrl || sourceUrl,
                { status: 0, statusText: 'captcha/access denied/challenge page' }
            );
        }

        const doc = new DOMParser().parseFromString(html, 'text/html');
        const links = [...doc.querySelectorAll('a[href*="/profil/spieler/"]')];

        const map = new Map();

        links.forEach(a => {
            const href = a.getAttribute('href') || '';
            const m = href.match(/spieler\/(\d+)/);
            if (!m) return;

            const tmId = m[1];
            const name = (a.textContent || '').trim().replace(/\s+/g, ' ');

            if (!name || name.length < 2) return;

            const fullUrl = href.startsWith('http')
                ? href
                : 'https://www.transfermarkt.com' + href;

            map.set(tmId, {
                tmId,
                name,
                tmUrl: fullUrl,
                season: state.resolvedSeason || season,
                requestedSeason: season,
                resolvedSeason: state.resolvedSeason || season,
                sourceLabel: source.label,
                sourceTeam: source.team,
                sourceSlug: source.slug,
                sourceClubId: source.clubId,
                canonicalYouthKey: state.canonicalYouthKey,
                canonicalYouthUrl: state.canonicalYouthUrl,
                loadedUrl: state.loadedUrl,
                sourceUrl: state.loadedUrl || sourceUrl,
                sourceDebug: state
            });
        });

        return [...map.values()];
    },

    normalizeText(value) {
        return String(value ?? '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    resolveSeasonFromUrlOrContent(url, fallbackSeason, html = '') {
        const fromUrl = String(url || '').match(/saison_id\/(\d{4})|saison_id=(\d{4})/i);
        const urlSeason = Number(fromUrl?.[1] || fromUrl?.[2] || 0);
        if (Number.isFinite(urlSeason) && urlSeason > 0) return urlSeason;

        const body = String(html || '');
        const selected = body.match(/<option[^>]+(?:selected|selected="selected")[^>]+value=["']?(\d{4})/i);
        const selectedSeason = Number(selected?.[1] || 0);
        if (Number.isFinite(selectedSeason) && selectedSeason > 0) return selectedSeason;

        const anySeason = body.match(/saison_id[=\/"'&;: ]+(\d{4})/i);
        const contentSeason = Number(anySeason?.[1] || 0);
        if (Number.isFinite(contentSeason) && contentSeason > 0) return contentSeason;

        const season = Number(fallbackSeason || 0);
        return Number.isFinite(season) && season > 0 ? season : fallbackSeason;
    },

    getYouthFilterForPlayer(player, seen) {
        const check = seen[String(player?.tmId || '')] || {};
        const eligibility = check.eligibility || player?.eligibility || null;

        if (!check.checked) return 'unchecked';
        if (check.exists === true) return 'exists';
        if (check.exists === false && eligibility?.skip) return 'skip';
        if (check.exists === false && eligibility?.manualReview) return 'manual';
        if (check.exists === false) return 'missing';
        return 'found';
    },

    makeFilterButton(filter, label, count, color = '#ddd') {
        return `
            <button type="button" class="slf-youth-filter-btn" data-filter="${this.escapeHtml(filter)}" style="
                background:#181818;
                border:1px solid #444;
                border-radius:5px;
                padding:6px 8px;
                color:${color};
                cursor:pointer;
            ">${this.escapeHtml(label)}: <b>${this.escapeHtml(count)}</b></button>
        `;
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    },

    normalizeClubName(value) {
        return this.normalizeText(value)
            .toLowerCase()
            .replace(/\bunder\s*[- ]?\s*(\d{2})\b/g, 'u$1')
            .replace(/\bu\s*[- ]?\s*(\d{2})\b/g, 'u$1')
            .replace(/\b(fc|sc|cf|afc|club|football club)\b/g, ' ')
            .replace(/[^a-z0-9а-яё]+/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    stripYouthSuffix(value) {
        return this.normalizeText(value)
            .replace(/\bunder\s*[- ]?\s*\d{2}\b/ig, '')
            .replace(/\bu\s*[- ]?\s*\d{2}\b/ig, '')
            .replace(/\bgiovanili\b/ig, '')
            .replace(/\byouth\b/ig, '')
            .replace(/\bjugend\b/ig, '')
            .replace(/\bacademy\b/ig, '')
            .replace(/\s+/g, ' ')
            .trim();
    },

    sourceClubAliasGroups(source) {
        const rawLabel = this.normalizeText(source?.label || '');
        const rawTeam = this.normalizeText(source?.team || '');
        const rawSlug = this.normalizeText(String(source?.slug || '').replace(/-/g, ' '));

        const youthRaw = [rawLabel, rawSlug].filter(Boolean);
        const parentRaw = [
            rawTeam,
            this.stripYouthSuffix(rawLabel),
            this.stripYouthSuffix(rawSlug)
        ].filter(Boolean);

        const normalizeList = arr => [...new Set(arr
            .map(x => this.normalizeClubName(x))
            .filter(x => x && x.length >= 3))];

        return {
            youth: normalizeList(youthRaw),
            parent: normalizeList(parentRaw),
            all: normalizeList([...youthRaw, ...parentRaw])
        };
    },

    clubMatchesAliases(clubName, aliases) {
        const name = this.normalizeClubName(clubName);
        const list = Array.isArray(aliases) ? aliases : [];
        if (!name || !list.length) return false;

        return list.some(alias => {
            const a = this.normalizeClubName(alias);
            if (!a || a.length < 3) return false;
            if (name === a) return true;
            if (a.length >= 5 && name.includes(a)) return true;
            if (name.length >= 5 && a.includes(name)) return true;
            return false;
        });
    },

    parseTransferDateText(text) {
        const m = String(text || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (!m) return null;
        const dd = Number(m[1]);
        const mm = Number(m[2]);
        const yy = Number(m[3]);
        if (!dd || !mm || !yy) return null;
        return Date.UTC(yy, mm - 1, dd);
    },

    findValueAfterLabels(lines, labels) {
        const lowerLabels = labels.map(x => String(x).toLowerCase().replace(/:$/, '').trim());

        for (let i = 0; i < lines.length; i++) {
            const line = this.normalizeText(lines[i]);
            const lower = line.toLowerCase().replace(/:$/, '').trim();

            if (!lowerLabels.includes(lower)) continue;

            for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
                const value = this.normalizeText(lines[j]);
                const valueLower = value.toLowerCase().replace(/:$/, '').trim();
                if (!value) continue;
                if (lowerLabels.includes(valueLower)) continue;
                return value;
            }
        }

        return '';
    },

    parseTransferHistoryRows(doc) {
        const rows = [];
        const trs = [...doc.querySelectorAll('table tr')];

        trs.forEach(tr => {
            const cells = [...tr.querySelectorAll('td,th')]
                .map(td => this.normalizeText(td.innerText || td.textContent || ''))
                .filter(Boolean);

            if (cells.length < 4) return;

            const dateIndex = cells.findIndex(x => /\d{1,2}\/\d{1,2}\/\d{4}/.test(x));
            if (dateIndex < 0) return;

            const dateText = cells[dateIndex];
            const left = cells[dateIndex + 1] || '';
            const joined = cells[dateIndex + 2] || '';
            const fee = cells[cells.length - 1] || '';
            const season = cells[0] || '';

            rows.push({
                season,
                dateText,
                dateTs: this.parseTransferDateText(dateText),
                left,
                joined,
                fee,
                rawCells: cells
            });
        });

        return rows;
    },

    parseTmProfileDoc(doc) {
        const bodyText = doc.body?.innerText || '';
        const lines = bodyText
            .split(/\n+/)
            .map(x => this.normalizeText(x))
            .filter(Boolean);

        const currentClub = this.findValueAfterLabels(lines, [
            'Current club:',
            'Current club',
            'Aktueller Verein:',
            'Aktueller Verein'
        ]);

        const onLoanFrom = this.findValueAfterLabels(lines, [
            'On loan from:',
            'On loan from',
            'Ausgeliehen von:',
            'Ausgeliehen von'
        ]);

        const joined = this.findValueAfterLabels(lines, ['Joined:', 'Joined']);
        const contractExpires = this.findValueAfterLabels(lines, ['Contract expires:', 'Contract expires']);
        const contractThereExpires = this.findValueAfterLabels(lines, ['Contract there expires:', 'Contract there expires']);

        return {
            currentClub,
            onLoanFrom,
            joined,
            contractExpires,
            contractThereExpires,
            transferHistory: this.parseTransferHistoryRows(doc)
        };
    },

    async inspectYouthEligibility(player, source) {
        try {
            const html = await this.fetchUrl(player.tmUrl);
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const profile = this.parseTmProfileDoc(doc);
            return this.analyzeYouthEligibility(player, source, profile);
        } catch (e) {
            return {
                status: 'manual_review_candidate',
                bucket: 'manual',
                manualReview: true,
                skip: false,
                reason: `TM profile check failed: ${e?.message || e || 'unknown error'}`,
                profile: null,
                parserVersion: 'youth_eligibility_v2'
            };
        }
    },

    analyzeYouthEligibility(player, source, profile) {
        const aliases = this.sourceClubAliasGroups(source || player || {});
        const rows = Array.isArray(profile?.transferHistory) ? profile.transferHistory : [];
        const currentClub = this.normalizeText(profile?.currentClub || '');
        const onLoanFrom = this.normalizeText(profile?.onLoanFrom || '');
        const lowerCurrent = currentClub.toLowerCase();
        const checkTs = Date.now();

        const currentIsUnknown = !currentClub || lowerCurrent === '-' || lowerCurrent.includes('unknown') || lowerCurrent.includes('без клуба');
        const currentIsRetired = lowerCurrent.includes('retired') || lowerCurrent.includes('career break');
        const currentMatchesYouth = this.clubMatchesAliases(currentClub, aliases.youth);
        const currentMatchesParent = this.clubMatchesAliases(currentClub, aliases.parent);
        const loanFromMatches = this.clubMatchesAliases(onLoanFrom, aliases.all);

        const rowTouchesYouthOrParent = row => (
            this.clubMatchesAliases(row.left, aliases.all) ||
            this.clubMatchesAliases(row.joined, aliases.all)
        );

        const rowLeftYouthOrParent = row => this.clubMatchesAliases(row.left, aliases.all);
        const rowJoinedYouthOrParent = row => this.clubMatchesAliases(row.joined, aliases.all);
        const isLoanRow = row => /loan|аренд|end of loan/i.test(`${row.fee || ''} ${row.rawCells?.join(' ') || ''}`);

        const relatedRows = rows.filter(rowTouchesYouthOrParent);
        const leftRows = relatedRows.filter(row => rowLeftYouthOrParent(row) && !rowJoinedYouthOrParent(row));
        const loanRows = relatedRows.filter(isLoanRow);
        const latestRelated = relatedRows
            .slice()
            .sort((a, b) => (b.dateTs || 0) - (a.dateTs || 0))[0] || null;
        const latestLeft = leftRows
            .slice()
            .sort((a, b) => (b.dateTs || 0) - (a.dateTs || 0))[0] || null;

        if (currentIsRetired) {
            return {
                status: 'skip_retired_or_invalid',
                bucket: 'skip',
                manualReview: false,
                skip: true,
                reason: 'Transfermarkt current club is Retired / career inactive.',
                profile,
                parserVersion: 'youth_eligibility_v2'
            };
        }

        if (loanFromMatches || loanRows.length) {
            return {
                status: 'loaned_youth_candidate',
                bucket: 'manual',
                manualReview: true,
                skip: false,
                reason: loanFromMatches
                    ? `Player is on loan from monitored club/pathway: ${onLoanFrom}.`
                    : 'Transfer history contains loan / end-of-loan row touching monitored club/pathway.',
                profile,
                latestRelated,
                parserVersion: 'youth_eligibility_v2'
            };
        }

        if (currentMatchesYouth) {
            return {
                status: 'active_youth_candidate',
                bucket: 'candidate',
                manualReview: false,
                skip: false,
                reason: `Current club matches monitored youth source: ${currentClub}.`,
                profile,
                latestRelated,
                parserVersion: 'youth_eligibility_v2'
            };
        }

        if (currentMatchesParent) {
            return {
                status: 'parent_club_candidate',
                bucket: 'manual',
                manualReview: true,
                skip: false,
                reason: `Player appears to have moved from youth to parent club: ${currentClub}.`,
                profile,
                latestRelated,
                parserVersion: 'youth_eligibility_v2'
            };
        }

        if (latestLeft && latestLeft.dateTs && latestLeft.dateTs <= checkTs && (currentIsUnknown || !currentMatchesYouth && !currentMatchesParent)) {
            return {
                status: 'skip_left_youth',
                bucket: 'skip',
                manualReview: false,
                skip: true,
                reason: `Player left monitored youth/pathway on ${latestLeft.dateText}: ${latestLeft.left} → ${latestLeft.joined}.`,
                profile,
                latestRelated,
                latestLeft,
                parserVersion: 'youth_eligibility_v2'
            };
        }

        if (currentIsUnknown) {
            return {
                status: 'manual_review_candidate',
                bucket: 'manual',
                manualReview: true,
                skip: false,
                reason: 'Current club is Unknown; transfer history did not give a definitive active/left verdict.',
                profile,
                latestRelated,
                parserVersion: 'youth_eligibility_v2'
            };
        }

        return {
            status: 'manual_review_candidate',
            bucket: 'manual',
            manualReview: true,
            skip: false,
            reason: currentClub
                ? `Current club is ${currentClub}; requires manual check against monitored youth/pathway.`
                : 'No decisive current club / transfer history signal.',
            profile,
            latestRelated,
            parserVersion: 'youth_eligibility_v2'
        };
    },

    getYouthStatusPresentation(status) {
        const map = {
            active_youth_candidate: { text: 'активная молодёжка', color: '#7cff7c' },
            loaned_youth_candidate: { text: 'аренда / ручной анализ', color: '#8cf' },
            parent_club_candidate: { text: 'основной клуб / ручной анализ', color: '#8cf' },
            manual_review_candidate: { text: 'ручной анализ', color: '#ffd76a' },
            skip_left_youth: { text: 'ушёл из молодёжки — skip', color: '#f99' },
            skip_retired_or_invalid: { text: 'неактивен — skip', color: '#f99' }
        };

        return map[status] || { text: 'не найден в SLF', color: '#ffd76a' };
    },

    shouldShowApplication(eligibility, checked, exists) {
        if (!checked || exists) return false;
        if (eligibility?.skip) return false;
        return true;
    },

  checkSlfExists(tmId) {
    return new Promise(resolve => {
        const id = String(tmId);

        const iframe = document.createElement('iframe');
        iframe.style.cssText = `
            position:fixed;
            left:-9999px;
            top:-9999px;
            width:900px;
            height:600px;
            opacity:0;
            pointer-events:none;
        `;

        iframe.src = buildSlfUrl(`/search.php?tmid=${encodeURIComponent(id)}`);

        let finished = false;
        let clicked = false;
        let startedAt = Date.now();
        let pollTimer = null;

        const cleanup = (exists, reason, extra = {}) => {
            if (finished) return;

            finished = true;

            if (pollTimer) {
                clearTimeout(pollTimer);
                pollTimer = null;
            }

            try {
                iframe.remove();
            } catch (e) {}

            console.log('[SLF Youth check]', {
                tmId: id,
                exists,
                reason,
                ...extra
            });

            resolve(exists);
        };

        const getDoc = () => {
            try {
                return iframe.contentDocument || iframe.contentWindow.document;
            } catch (e) {
                return null;
            }
        };

        const normalizeHref = href => String(href || '').replaceAll('&amp;', '&');

        const isMenuOrServiceLink = a => {
            if (!a) return true;

            const text = (a.textContent || '').trim().toLowerCase();
            const href = normalizeHref(a.getAttribute('href') || '');
            const cls = String(a.className || '').toLowerCase();

            if (!text) return true;

            const badText = [
                'я/мы',
                'мониторинг опыта',
                'профиль',
                'мой профиль',
                'статистика',
                'опыт',
                'менеджер'
            ];

            if (badText.some(x => text.includes(x))) return true;

            if (href.includes('monitoring')) return true;
            if (cls.includes('general-menu')) return true;

            const badParent = a.closest(
                '#head, #header, .head, .header, .head-ui, .general-menu, .top-menu, .left-menu, .right-menu, .user-menu, .menu, .tmenu, .ticon'
            );

            return !!badParent;
        };

        const looksLikePlayerName = text => {
            const clean = String(text || '')
                .replace(/\s+/g, ' ')
                .trim();

            if (clean.length < 3) return false;

            const lower = clean.toLowerCase();

            const bad = [
                'я/мы',
                'мониторинг',
                'профиль',
                'статистика',
                'опыт',
                'поиск',
                'найти',
                'добавить',
                'создать'
            ];

            if (bad.some(x => lower.includes(x))) return false;

            // Обычно в SLF игрок — это фамилия + имя: "Карас Самуэль".
            // Но оставляем запас: достаточно букв и не служебного текста.
            const letters = clean.match(/[A-Za-zА-Яа-яЁё]/g) || [];

            return letters.length >= 3;
        };

        const findRealPlayerLink = doc => {
            if (!doc || !doc.body) return null;

            const links = [...doc.querySelectorAll('a[href]')];

            const candidates = links
                .map(a => {
                    const href = normalizeHref(a.getAttribute('href') || '');
                    const text = (a.textContent || '').trim().replace(/\s+/g, ' ');
                    const row = a.closest('tr, td, div');
                    const rowText = (row?.innerText || '').trim().replace(/\s+/g, ' ');

                    return { a, href, text, rowText };
                })
                .filter(x => {
                    const isPlayerHref =
                        /\/?player\.php\?action=view&id=\d+/i.test(x.href) ||
                        /\/?player\.php[^"'<>]*action=view[^"'<>]*id=\d+/i.test(x.href);

                    if (!isPlayerHref) return false;
                    if (isMenuOrServiceLink(x.a)) return false;
                    if (!looksLikePlayerName(x.text)) return false;

                    return true;
                });

            return candidates[0] || null;
        };

        const isClearlyMissing = doc => {
            if (!doc || !doc.body) return false;

            const text = (doc.body.innerText || '').toLowerCase();

            return (
                text.includes('ничего не найдено') ||
                text.includes('нет результатов') ||
                text.includes('поиск не дал результатов') ||
                text.includes('игрок не найден') ||
                text.includes('создать игрока') ||
                text.includes('создать нового игрока') ||
                text.includes('добавить игрока')
            );
        };

        const submitSearch = doc => {
            if (!doc || clicked) return false;

            const input =
                doc.querySelector('input[name="tm_id"]') ||
                doc.querySelector('input[name="tmid"]') ||
                doc.querySelector('input[id*="tm"]');

            const btn =
                doc.getElementById('sfButton') ||
                doc.querySelector('input[type="submit"][name="search"]') ||
                doc.querySelector('input[type="submit"]') ||
                doc.querySelector('button[type="submit"]');

            if (!input || !btn) return false;

            clicked = true;
            input.value = id;

            try {
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (e) {}

            setTimeout(() => {
                try {
                    btn.click();
                } catch (e) {
                    cleanup(false, 'click_failed_treat_as_missing');
                }
            }, 150);

            return true;
        };

        const pollResult = () => {
            if (finished) return;

            const doc = getDoc();

            if (!doc || !doc.body) {
                pollTimer = setTimeout(pollResult, 300);
                return;
            }

            const realPlayer = findRealPlayerLink(doc);

            if (realPlayer) {
                cleanup(true, 'real_player_link_found', {
                    href: realPlayer.href,
                    text: realPlayer.text,
                    rowText: realPlayer.rowText.slice(0, 180)
                });
                return;
            }

            if (clicked && Date.now() - startedAt > 1200 && isClearlyMissing(doc)) {
                cleanup(false, 'missing_marker_found');
                return;
            }

            /*
             * Важно:
             * Раньше здесь был fallback "непонятно => exists true".
             * Для твоего сценария это плохо: непонятные/пустые результаты должны попадать
             * в ручную проверку как "не найден в SLF".
             */
            if (clicked && Date.now() - startedAt > 8000) {
                cleanup(false, 'no_valid_result_player_link');
                return;
            }

            if (Date.now() - startedAt > 15000) {
                cleanup(false, 'timeout_treat_as_missing');
                return;
            }

            pollTimer = setTimeout(pollResult, 300);
        };

        iframe.onload = () => {
            const doc = getDoc();

            if (!doc || !doc.body) {
                cleanup(false, 'no_document_treat_as_missing');
                return;
            }

            const beforeClick = findRealPlayerLink(doc);

            if (beforeClick) {
                cleanup(true, 'real_player_link_found_before_click', {
                    href: beforeClick.href,
                    text: beforeClick.text,
                    rowText: beforeClick.rowText.slice(0, 180)
                });
                return;
            }

            submitSearch(doc);
            setTimeout(pollResult, 500);
        };

        document.body.appendChild(iframe);

        setTimeout(() => {
            cleanup(false, 'global_timeout_treat_as_missing');
        }, 18000);
    });
},

    async scanAll(onProgress) {
        if (this._scanPromise) {
            if (onProgress) onProgress('Youth Monitor уже выполняется: ждём текущую проверку.');
            return this._scanPromise;
        }

        this._scanPromise = this.scanAllInternal(onProgress)
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    },

    async scanAllInternal(onProgress) {
        const seen = this.loadSeenIds();
        const sources = CONFIG.YOUTH_TM_SOURCES || [];
        const seasons = this.getSeasons();

        const foundMap = new Map();
        const fresh = [];
        const errors = [];
        const seasonSources = [];

        for (const source of sources) {
            for (const season of seasons) {
                const url = this.buildTransferUrl(source, season);

                try {
                    if (onProgress) onProgress(`Загружаю ${source.label}, сезон ${season}...`);

                    const page = await this.fetchUrl(url, { returnMeta: true });
                    const html = page?.html || '';
                    const loadedUrl = page?.finalUrl || page?.requestedUrl || url;
                    const sourceState = this.resolveTmSourceState(html, source, season, url, loadedUrl);
                    const players = this.extractPlayersFromTM(html, source, season, loadedUrl, sourceState);

                    const sourceRecord = Object.assign({}, sourceState, {
                        status: page?.status || null,
                        playersFound: players.length
                    });

                    seasonSources.push(sourceRecord);
                    debugLog('[SLF Youth TM source]', sourceRecord);

                    if (onProgress) {
                        onProgress(
                            `Загружено ${source.label}: сезон ${sourceState.resolvedSeason || season}, игроков ${players.length}`
                        );
                    }

                    players.forEach(p => {
                        const key = `${p.tmId}`;
                        if (!foundMap.has(key)) foundMap.set(key, p);
                    });
                } catch (e) {
                    const errorRecord = {
                        source: source.label,
                        team: source.team,
                        season,
                        status: e?.status || null,
                        kind: e?.kind || 'error',
                        url,
                        canonicalYouthKey: this.getCanonicalYouthKey(source),
                        canonicalYouthUrl: this.buildCanonicalYouthUrl(source),
                        error: e?.message || String(e)
                    };

                    errors.push(errorRecord);
                    seasonSources.push(Object.assign({}, errorRecord, {
                        playersFound: 0,
                        failed: true
                    }));
                    debugWarn('[SLF Youth TM source error]', errorRecord);
                }
            }
        }

        const found = [...foundMap.values()];
        const manualReview = [];
        const skipped = [];

        for (const p of found) {
            const seenKey = `${p.tmId}`;
            const cached = seen[seenKey] || null;

            if (cached?.checked && cached?.youthEligibilityVersion === 2) {
                const eligibility = cached?.eligibility || null;
                if (cached?.exists === false) {
                    if (eligibility?.skip) skipped.push(p);
                    else if (eligibility?.manualReview) manualReview.push(p);
                    else fresh.push(p);
                }
                continue;
            }

            if (onProgress) onProgress(`Проверяю SLF: ${p.name} / ${p.tmId}`);

            const exists = await this.checkSlfExists(p.tmId);
            let eligibility = null;

            if (!exists) {
                if (onProgress) onProgress(`Проверяю актуальность youth/TM: ${p.name} / ${p.tmId}`);
                eligibility = await this.inspectYouthEligibility(p, p);
                p.eligibility = eligibility;
            }

            seen[seenKey] = {
                tmId: p.tmId,
                name: p.name,
                sourceLabel: p.sourceLabel,
                sourceTeam: p.sourceTeam,
                sourceClubId: p.sourceClubId,
                sourceSlug: p.sourceSlug,
                canonicalYouthKey: p.canonicalYouthKey,
                canonicalYouthUrl: p.canonicalYouthUrl,
                requestedSeason: p.requestedSeason,
                resolvedSeason: p.resolvedSeason,
                loadedUrl: p.loadedUrl || p.sourceUrl || '',
                firstSeen: cached?.firstSeen || Date.now(),
                checkedAt: Date.now(),
                checked: true,
                exists,
                youthEligibilityVersion: 2,
                eligibility
            };

            if (!exists) {
                if (eligibility?.skip) skipped.push(p);
                else if (eligibility?.manualReview) manualReview.push(p);
                else fresh.push(p);
            }
        }

        this.saveSeenIds(seen);

        return {
            found,
            fresh,
            manualReview,
            skipped,
            errors,
            seen,
            seasonSources
        };
    },

    resetCache() {
        localStorage.removeItem(this.cacheKey);
    },

    renderResult(result) {
        const errors = Array.isArray(result?.errors) ? result.errors : [];
        const seen = result?.seen || {};
        const found = Array.isArray(result?.found) ? result.found : [];
        const fresh = Array.isArray(result?.fresh) ? result.fresh : [];
        const manualReview = Array.isArray(result?.manualReview) ? result.manualReview : [];
        const skipped = Array.isArray(result?.skipped) ? result.skipped : [];
        const seasonSources = Array.isArray(result?.seasonSources) ? result.seasonSources : [];

        const checkedCount = found.filter(p => seen[String(p.tmId)]?.checked).length;
        const existsCount = found.filter(p => seen[String(p.tmId)]?.exists === true).length;
        const missingCount = found.filter(p => {
            const check = seen[String(p.tmId)] || {};
            return check.checked && check.exists === false && !check.eligibility?.skip;
        }).length;
        const manualCount = found.filter(p => {
            const check = seen[String(p.tmId)] || {};
            return check.checked && check.exists === false && check.eligibility?.manualReview;
        }).length;
        const skippedCount = found.filter(p => {
            const check = seen[String(p.tmId)] || {};
            return check.checked && check.exists === false && check.eligibility?.skip;
        }).length;

        const errorsHtml = errors.length
            ? `
                <div style="color:#f99;margin-bottom:8px;">
                    Ошибки источников: ${this.escapeHtml(errors.length)}
                    <div style="margin-top:4px;color:#fbb;font-size:11px;line-height:1.35;">
                        ${errors.slice(0, 8).map(e => this.escapeHtml(`${e.source || ''} ${e.season || ''}: ${e.status || e.kind || ''} ${e.error || ''}`)).join('<br>')}
                    </div>
                </div>
            `
            : '';

        const freshNotice = fresh.length || manualReview.length || skipped.length
            ? `
                <div style="color:#ffd76a;margin-bottom:8px;">
                    Кандидаты не найдены в SLF: ${this.escapeHtml(fresh.length)};
                    ручной анализ: ${this.escapeHtml(manualReview.length)};
                    skip: ${this.escapeHtml(skipped.length)}.
                    Используй кнопки-фильтры ниже — они фильтруют эту же таблицу без повторной проверки TM/SLF.
                </div>
            `
            : `
                <div style="color:#9f9;margin-bottom:8px;">
                    Новых активных/потенциальных игроков не найдено.
                </div>
            `;

        const seasonSourcesHtml = seasonSources.length
            ? `
                <details style="margin-bottom:10px;color:#aaa;">
                    <summary style="cursor:pointer;color:#8cf;">TM источники/сезоны: ${this.escapeHtml(seasonSources.length)}</summary>
                    <div style="margin-top:6px;font-size:11px;line-height:1.35;">
                        ${seasonSources.slice(0, 40).map(s => {
                            const status = s.failed
                                ? `Ошибка: ${s.status || s.kind || ''} ${s.error || ''}`
                                : `OK · игроков ${s.playersFound ?? 0}`;
                            const seasonText = s.resolvedSeason && s.resolvedSeason !== s.requestedSeason
                                ? `${s.requestedSeason} → ${s.resolvedSeason}`
                                : `${s.requestedSeason || s.season || ''}`;
                            return this.escapeHtml(`${s.team || ''} / ${s.label || s.source || ''} · season ${seasonText} · verein ${s.expectedClubId || s.sourceClubId || ''} · ${status}`);
                        }).join('<br>')}
                    </div>
                </details>
            `
            : '';

        const rows = found
            .slice()
            .sort((a, b) => {
                const ae = seen[String(a.tmId)]?.exists;
                const be = seen[String(b.tmId)]?.exists;

                if (ae === false && be !== false) return -1;
                if (ae !== false && be === false) return 1;

                return String(a.sourceTeam || '').localeCompare(String(b.sourceTeam || '')) ||
                    String(a.sourceLabel || '').localeCompare(String(b.sourceLabel || '')) ||
                    String(a.name || '').localeCompare(String(b.name || ''));
            })
            .map(p => {
                const check = seen[String(p.tmId)] || {};
                const exists = check.exists === true;
                const checked = check.checked === true;
                const eligibility = check.eligibility || p.eligibility || null;
                const filter = this.getYouthFilterForPlayer(p, seen);
                const isMissingGroup = checked && check.exists === false && !eligibility?.skip;

                let statusText = 'не проверен';
                let statusColor = '#aaa';
                let reasonText = '';

                if (checked && exists) {
                    statusText = 'уже есть в SLF';
                    statusColor = '#7cff7c';
                } else if (checked && !exists) {
                    const presentation = this.getYouthStatusPresentation(eligibility?.status);
                    statusText = presentation.text;
                    statusColor = presentation.color;
                    reasonText = eligibility?.reason || '';
                }

                const addUrl = buildSlfUrl(
                    `/youngs2.php?action=new` +
                    `&slf_tm_id=${encodeURIComponent(p.tmId || '')}` +
                    `&slf_tm_url=${encodeURIComponent(p.tmUrl || '')}` +
                    `&slf_name=${encodeURIComponent(p.name || '')}` +
                    `&slf_source_team=${encodeURIComponent(p.sourceTeam || '')}` +
                    `&slf_source_label=${encodeURIComponent(p.sourceLabel || '')}`
                );

                const addLink = this.shouldShowApplication(eligibility, checked, exists)
                    ? `<a href="${this.escapeHtml(addUrl)}" target="_blank" style="color:#8cf;font-weight:bold;">Заявка</a>`
                    : `<span style="color:#555;">Заявка</span>`;

                return `
                    <tr class="slf-youth-player-row"
                        data-youth-filter="${this.escapeHtml(filter)}"
                        data-youth-checked="${checked ? '1' : '0'}"
                        data-youth-exists="${exists ? '1' : '0'}"
                        data-youth-missing="${isMissingGroup ? '1' : '0'}"
                        data-youth-tmid="${this.escapeHtml(p.tmId || '')}">
                        <td style="padding:4px;border-bottom:1px solid #333;">${this.escapeHtml(p.name || '')}</td>
                        <td style="padding:4px;border-bottom:1px solid #333;">${this.escapeHtml(p.tmId || '')}</td>
                        <td style="padding:4px;border-bottom:1px solid #333;">${this.escapeHtml(p.sourceTeam || '')}</td>
                        <td style="padding:4px;border-bottom:1px solid #333;">${this.escapeHtml(p.sourceLabel || '')}</td>
                        <td style="padding:4px;border-bottom:1px solid #333;" title="${this.escapeHtml(p.loadedUrl || p.sourceUrl || '')}">${this.escapeHtml(p.resolvedSeason || p.season || '')}</td>
                        <td style="padding:4px;border-bottom:1px solid #333;color:${statusColor};font-weight:bold;">${this.escapeHtml(statusText)}</td>
                        <td style="padding:4px;border-bottom:1px solid #333;color:#aaa;max-width:360px;">${this.escapeHtml(reasonText)}</td>
                        <td style="padding:4px;border-bottom:1px solid #333;">
                            <a href="${this.escapeHtml(p.tmUrl || '')}" target="_blank" style="color:#8cf;">TM</a>
                            |
                            <a href="${this.escapeHtml(buildSlfUrl(`/search.php?tmid=${encodeURIComponent(p.tmId || '')}`))}" target="_blank" style="color:#8cf;">SLF Search</a>
                            |
                            ${addLink}
                        </td>
                    </tr>
                `;
            })
            .join('');

        const manualHintHtml = manualCount
            ? `
                <div style="margin:0 0 10px 0;padding:7px 9px;background:#181818;border:1px solid #444;border-radius:5px;color:#aaa;">
                    <b style="color:#8cf;">Ручной анализ:</b>
                    ${this.escapeHtml(manualCount)} игроков. Это аренды, переходы youth → основной клуб, Unknown/current club и неоднозначные цепочки.
                    Нажми фильтр «Ручной анализ», чтобы оставить только их.
                </div>
            `
            : '';

        return `
            <h3>Youth Monitor</h3>

            ${errorsHtml}
            ${freshNotice}
            ${seasonSourcesHtml}

            <div id="slf-youth-filter-bar" data-active-filter="all" style="
                display:flex;
                gap:8px;
                flex-wrap:wrap;
                margin-bottom:8px;
                color:#ddd;
            ">
                ${this.makeFilterButton('all', 'Все', found.length, '#ddd')}
                ${this.makeFilterButton('found', 'Найдено на TM', found.length, '#ddd')}
                ${this.makeFilterButton('checked', 'Проверено через SLF', checkedCount, '#ddd')}
                ${this.makeFilterButton('exists', 'Уже есть в SLF', existsCount, '#7cff7c')}
                ${this.makeFilterButton('missing', 'Не найдены в SLF', missingCount, '#ffd76a')}
                ${this.makeFilterButton('manual', 'Ручной анализ', manualCount, '#8cf')}
                ${this.makeFilterButton('skip', 'Skip', skippedCount, '#f99')}
            </div>

            <div id="slf-youth-filter-state" style="margin-bottom:10px;color:#aaa;font-size:12px;">
                Показано: ${this.escapeHtml(found.length)} из ${this.escapeHtml(found.length)}.
            </div>

            ${manualHintHtml}

            <div style="margin-bottom:8px;color:#aaa;">
                Проверочная таблица: открой TM и SLF Search, чтобы вручную убедиться, найден ли игрок на проекте.
            </div>

            <table id="slf-youth-result-table" style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                    <tr style="color:#ffd76a;text-align:left;">
                        <th style="padding:4px;border-bottom:1px solid #555;">Игрок</th>
                        <th style="padding:4px;border-bottom:1px solid #555;">TM ID</th>
                        <th style="padding:4px;border-bottom:1px solid #555;">Клуб</th>
                        <th style="padding:4px;border-bottom:1px solid #555;">Источник</th>
                        <th style="padding:4px;border-bottom:1px solid #555;">Сезон</th>
                        <th style="padding:4px;border-bottom:1px solid #555;">Статус</th>
                        <th style="padding:4px;border-bottom:1px solid #555;">Причина</th>
                        <th style="padding:4px;border-bottom:1px solid #555;">Ссылки</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || `
                        <tr>
                            <td colspan="8" style="padding:8px;color:#aaa;">Нет данных для отображения.</td>
                        </tr>
                    `}
                    <tr id="slf-youth-empty-filter-row" style="display:none;">
                        <td colspan="8" style="padding:8px;color:#aaa;">Нет игроков для выбранного фильтра.</td>
                    </tr>
                </tbody>
            </table>
        `;
    },

    bindRenderedFilters(root = document) {
        const scope = root && root.querySelector ? root : document;
        const bar = scope.querySelector('#slf-youth-filter-bar') || document.getElementById('slf-youth-filter-bar');
        const table = scope.querySelector('#slf-youth-result-table') || document.getElementById('slf-youth-result-table');
        const stateBox = scope.querySelector('#slf-youth-filter-state') || document.getElementById('slf-youth-filter-state');

        if (!bar || !table) return;

        const getRows = () => [...table.querySelectorAll('tr.slf-youth-player-row[data-youth-filter]')];

        const matchesFilter = (row, filter) => {
            if (!row) return false;
            const value = row.dataset.youthFilter || '';

            if (filter === 'all' || filter === 'found') return true;
            if (filter === 'checked') return row.dataset.youthChecked === '1';
            if (filter === 'exists') return value === 'exists';
            if (filter === 'missing') return row.dataset.youthMissing === '1';
            if (filter === 'manual') return value === 'manual';
            if (filter === 'skip') return value === 'skip';
            if (filter === 'unchecked') return value === 'unchecked';

            return value === filter;
        };

        const setButtonState = active => {
            bar.querySelectorAll('.slf-youth-filter-btn').forEach(btn => {
                const isActive = (btn.dataset.filter || 'all') === active;
                btn.dataset.active = isActive ? '1' : '0';
                btn.style.outline = isActive ? '2px solid #7cff7c' : 'none';
                btn.style.background = isActive ? '#25351f' : '#181818';
                btn.style.boxShadow = isActive ? '0 0 0 1px rgba(124,255,124,.15) inset' : 'none';
            });
        };

        const apply = requestedFilter => {
            const current = bar.dataset.activeFilter || 'all';
            const requested = requestedFilter || 'all';
            const active = requested === 'all' || requested === current ? 'all' : requested;

            bar.dataset.activeFilter = active;
            setButtonState(active);

            let visible = 0;
            const rows = getRows();

            rows.forEach(row => {
                const show = matchesFilter(row, active);
                row.style.display = show ? '' : 'none';
                if (show) visible += 1;
            });

            const emptyRow = table.querySelector('#slf-youth-empty-filter-row');
            if (emptyRow) emptyRow.style.display = visible ? 'none' : '';

            if (stateBox) {
                const labelMap = {
                    all: 'Все',
                    found: 'Найдено на TM',
                    checked: 'Проверено через SLF',
                    exists: 'Уже есть в SLF',
                    missing: 'Не найдены в SLF',
                    manual: 'Ручной анализ',
                    skip: 'Skip',
                    unchecked: 'Не проверены'
                };

                stateBox.textContent = `Фильтр: ${labelMap[active] || active}. Показано: ${visible} из ${rows.length}.`;
            }
        };

        bar.onclick = event => {
            const btn = event.target && event.target.closest
                ? event.target.closest('.slf-youth-filter-btn')
                : null;

            if (!btn || !bar.contains(btn)) return;

            event.preventDefault();
            event.stopPropagation();

            apply(btn.dataset.filter || 'all');
        };

        apply(bar.dataset.activeFilter || 'all');
    }
};
