    // 5. Match State Parser
    // ============================================================

    const MatchTimingModel = {
        OFFICIAL_MATCH_MINUTES: 90,
        REAL_MATCH_MINUTES: 36,
        GAME_MINUTES_PER_REAL_MINUTE: 90 / 36,
        GENERATION_WINDOWS: [
            { index: 1, from: 1, to: 15, label: '01-15', generationMinutes: 15, realMinutes: 6, phase: 'first_half' },
            { index: 2, from: 16, to: 30, label: '16-30', generationMinutes: 15, realMinutes: 6, phase: 'first_half' },
            { index: 3, from: 31, to: 45, label: '31-45', generationMinutes: 15, realMinutes: 6, phase: 'first_half' },
            { index: 4, from: 46, to: 60, label: '46-60', generationMinutes: 15, realMinutes: 6, phase: 'second_half' },
            { index: 5, from: 61, to: 75, label: '61-75', generationMinutes: 15, realMinutes: 6, phase: 'second_half' },
            { index: 6, from: 76, to: 84, label: '76-84', generationMinutes: 9, realMinutes: 3.6, phase: 'late' },
            { index: 7, from: 85, to: 90, label: '85-90', generationMinutes: 6, realMinutes: 2.4, phase: 'final_5', isFinal: true }
        ],

        clampMinute(minute) {
            const n = Number(minute);
            if (!Number.isFinite(n) || n < 1) return null;
            return Math.min(Math.max(Math.floor(n), 1), this.OFFICIAL_MATCH_MINUTES);
        },

        getWindow(minute) {
            const m = this.clampMinute(minute);
            if (!m) {
                return {
                    index: 0,
                    from: 0,
                    to: 0,
                    label: '0',
                    generationMinutes: 0,
                    realMinutes: 0,
                    phase: 'unknown',
                    next: null
                };
            }

            const current = this.GENERATION_WINDOWS.find(w => m >= w.from && m <= w.to) || this.GENERATION_WINDOWS[this.GENERATION_WINDOWS.length - 1];
            const next = this.GENERATION_WINDOWS.find(w => w.index === current.index + 1) || null;

            return Object.assign({}, current, {
                next: next ? Object.assign({}, next) : null,
                effectiveMinute: m,
                realMinuteEstimate: Number((m / this.GAME_MINUTES_PER_REAL_MINUTE).toFixed(2)),
                realMatchDurationMinutes: this.REAL_MATCH_MINUTES,
                officialMatchMinutes: this.OFFICIAL_MATCH_MINUTES
            });
        },

        getTargetWindowAfterChange(minute) {
            const current = this.getWindow(minute);
            return current.next || current;
        },

        getLegacyTenMinuteBucket(minute) {
            if (!minute || minute < 1) return '0';
            const start = Math.floor((minute - 1) / 10) * 10 + 1;
            return `${start}-${Math.min(start + 9, this.OFFICIAL_MATCH_MINUTES)}`;
        }
    };

    const MatchStateParser = {
        getGameId() {
            return new URLSearchParams(location.search).get('id');
        },

        getStatus() {
            const text = (document.body.innerText || '').toLowerCase();

            if (/матч\s+окончен|финальный\s+свисток|звучит\s+финальный\s+свисток|игра\s+окончена/i.test(text)) return 'finished';
            if (/ид[её]т\s+'?\d{1,3}(?:\+\d{1,2})?\s*мин/i.test(text)) return 'live';
            if (/перерыв|между\s+таймами|первый\s+тайм\s+заверш|команды\s+ушли\s+на\s+перерыв/i.test(text)) return 'halftime';

            return 'unknown';
        },

        isActiveLiveStatus(status) {
            return status === 'live' || status === 'halftime' || status === 'unknown';
        },

        readMinuteInfo() {
            const text = document.body.innerText || '';
            const m = text.match(/ид[её]т\s+'?(\d{1,3})(?:\+(\d{1,2}))?\s*мин/i);
            if (!m) {
                return {
                    rawMinute: null,
                    baseMinute: null,
                    stoppageMinute: 0,
                    effectiveMinute: null,
                    isStoppage: false
                };
            }

            const baseMinute = Number(m[1]);
            const stoppageMinute = m[2] ? Number(m[2]) : 0;
            const rawMinute = stoppageMinute ? `${baseMinute}+${stoppageMinute}` : String(baseMinute);
            const effectiveMinute = MatchTimingModel.clampMinute(baseMinute);

            return {
                rawMinute,
                baseMinute,
                stoppageMinute,
                effectiveMinute,
                isStoppage: stoppageMinute > 0 || baseMinute > MatchTimingModel.OFFICIAL_MATCH_MINUTES
            };
        },

        readMinute() {
            return this.readMinuteInfo().effectiveMinute;
        },

        getBucket(minute) {
            return MatchTimingModel.getWindow(minute).label;
        },

        getGenerationWindow(minute) {
            return MatchTimingModel.getWindow(minute);
        },

        getLegacyTenMinuteBucket(minute) {
            return MatchTimingModel.getLegacyTenMinuteBucket(minute);
        },

        readScore() {
            const scoreCells = [...document.querySelectorAll('.score_board .indarkbig div')];

            if (scoreCells.length >= 2) {
                return {
                    home: toNum(scoreCells[0].innerText.trim() || 0),
                    away: toNum(scoreCells[1].innerText.trim() || 0)
                };
            }

            return null;
        }
    };

    // ============================================================
