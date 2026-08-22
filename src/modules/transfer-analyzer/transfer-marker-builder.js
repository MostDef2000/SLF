// Transfer Marker Builder
// Extracted verbatim from transfer-market-analyzer.js (stage 1 refactor).
// Assigned onto the TransferMarketAnalyzer facade; behaviour unchanged.

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.stage1MarkerBuilderApplied = true;

    Object.assign(TransferMarketAnalyzer, {
    buildMarkers(row, profile, slfAlter) {
        return [
            this.getClubStatusMarker(profile),
            this.getAgentMarker(profile),
            this.getSlfSkillMarker(slfAlter),
            this.getSlfCurrentActivityMarker(slfAlter),
            this.getSlfTalentUpgradeMarker(slfAlter),
            this.getSlfLeagueSignalMarker(slfAlter),
            this.getAgeMarker(slfAlter?.age || profile.age || row.age),
            this.getTmValueMarker(profile),
            this.getMarketSalePriceMarker(row, slfAlter),
            this.getValueTrendMarker(profile),
            this.getContractMarker(profile.contractExpires),
            this.getRumorMarker(profile.rumors),
            this.getAcademyMarker(profile.transferHistory, profile.youthClubs)
        ].filter(Boolean);
    },

    getSlfSkillMarker(alter) {
        if (!alter || alter.currentSkill == null || alter.finalSkill == null) {
            return {
                label: 'SLF ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'alter.php не дал текущий и итоговый скилл.'
            };
        }

        const delta = Number(alter.skillDelta || 0);
        const finalSkill = SLFAlterLayer.formatSkill(alter.finalSkill);
        const label = `SLF ${SLFAlterLayer.formatDelta(delta)}`;

        return {
            label,
            level: delta > 0 ? 'good' : delta < 0 ? 'risk' : 'neutral',
            score: delta > 0 ? 3 : delta < 0 ? -2 : 0,
            redFlag: delta < 0,
            hardStop: false,
            text: `ИТОГ alter.php: ${finalSkill}. Чистая разница current skill → ИТОГ: ${SLFAlterLayer.formatDelta(delta)}. Пороги пока не фиксируем, смотри само число.`
        };
    },

    getSlfCurrentActivityMarker(alter) {
        if (!alter) {
            return {
                label: 'MIN ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'alter.php не прочитан.'
            };
        }

        const seasonLabel = alter.currentSeasonLabel || alter.currentSeasonYear || 'текущий сезон';

        if (alter.staleActivity || !alter.hasCurrentSeason) {
            return {
                label: 'MIN -',
                level: 'risk',
                score: -3,
                redFlag: true,
                hardStop: false,
                text: `На alter.php нет строки с пометкой "Текущий". Последний найденный сезон: ${alter.lastSeasonYear || '?'}. Это маркер, что игрок может не играть сейчас.`
            };
        }

        const row = alter.currentRow;

        if (!row) {
            return {
                label: 'MIN ?',
                level: 'risk',
                score: -2,
                redFlag: true,
                hardStop: false,
                text: `Есть текущий сезон ${seasonLabel}, но нет лиговой строки с уровнем лиги/минутами.`
            };
        }

        const pct = Number(row.minutesPct || 0);
        const league = row.leagueLevel != null ? `L${row.leagueLevel}/${row.leagueSkill}` : 'L?';

        if (pct >= 40) {
            return {
                label: `MIN ${pct}% ${league}`,
                level: 'good',
                score: 4,
                redFlag: false,
                hardStop: false,
                text: `Текущий сезон ${seasonLabel}: ${pct}% минут, ${row.minutes || 0} минут, ${row.gamesPlayed}/${row.gamesPossible} игр, стартов ${row.starts ?? '?'}.`
            };
        }

        if (pct > 0) {
            return {
                label: `MIN ${pct}% ${league}`,
                level: 'watch',
                score: 1,
                redFlag: false,
                hardStop: false,
                text: `В текущем сезоне ${seasonLabel} игрок играет, но пока меньше 40% минут.`
            };
        }

        return {
            label: `MIN 0% ${league}`,
            level: 'risk',
            score: -2,
            redFlag: true,
            hardStop: false,
            text: `Текущий сезон ${seasonLabel} есть, но игровые минуты 0%.`
        };
    },

    getSlfTalentUpgradeMarker(alter) {
        if (!alter || !alter.talentUpgradeEligible || !alter.talentUpgradeRow) {
            return null;
        }

        const row = alter.talentUpgradeRow;
        const isCurrent = row.isCurrentSeason === true;

        return {
            label: `T${alter.talent}<L${row.leagueLevel} ${row.minutesPct}%`,
            level: isCurrent ? 'hot' : 'good',
            score: isCurrent ? 5 : 3,
            redFlag: false,
            hardStop: false,
            text: `Талант игрока ${alter.talent}, а был сезон ${row.seasonLabel || row.season} с ${row.minutesPct}% минут в лиге уровня ${row.leagueLevel}/${row.leagueSkill}. Это сигнал возможного повышения таланта.`
        };
    },

    getSlfLeagueSignalMarker(alter) {
        if (!alter || !alter.currentRow) return null;

        const row = alter.currentRow;
        const currentSkill = SLFAlterLayer.formatSkill(alter.currentSkill);

        if (alter.leagueAboveSkill) {
            return {
                label: `L${row.leagueSkill}>${currentSkill}`,
                level: 'good',
                score: 2,
                redFlag: false,
                hardStop: false,
                text: `Игрок сейчас играет в лиге скилла ${row.leagueSkill}, выше текущего скилла ${alter.currentSkill}.`
            };
        }

        if (row.leagueSkill != null && alter.currentSkill != null && Number(row.leagueSkill) < Number(alter.currentSkill)) {
            return {
                label: `L${row.leagueSkill}<${currentSkill}`,
                level: 'watch',
                score: -1,
                redFlag: false,
                hardStop: false,
                text: `Текущая лига ниже скилла игрока. Это слабее как сигнал роста.`
            };
        }

        return null;
    },

    getAgeMarker(age) {
        const cfg = this.getCfg().ageGroups || {};

        if (!age) {
            return { label: 'age ?', level: 'unknown', score: 0, redFlag: false, hardStop: false, text: 'Возраст не найден.' };
        }

        if (age <= (cfg.academyMax || 18)) {
            return { label: `age ${age} acad`, level: 'hot', score: 5, redFlag: false, hardStop: false, text: 'Очень молодой игрок. Можно ниже планку текущего скилла, если есть другие сильные сигналы.' };
        }

        if (age <= (cfg.growthMax || 21)) {
            return { label: `age ${age} grow`, level: 'hot', score: 5, redFlag: false, hardStop: false, text: 'Возрастное окно роста.' };
        }

        if (age <= (cfg.lateGrowthMax || 24)) {
            return { label: `age ${age} late`, level: 'good', score: 3, redFlag: false, hardStop: false, text: 'Ещё возможен рост, но уже нужен нормальный скилл или сильный TM-профиль.' };
        }

        if (age <= (cfg.primeMax || 29)) {
            return { label: `age ${age} prime`, level: 'normal', score: 2, redFlag: false, hardStop: false, text: 'Игрок здесь и сейчас.' };
        }

        if (age <= (cfg.shortTermMax || 32)) {
            return { label: `age ${age} short`, level: 'watch', score: 1, redFlag: false, hardStop: false, text: 'Краткосрочное усиление. Нужен высокий скилл и разумная цена.' };
        }

        return { label: `age ${age} vet`, level: 'risk', score: -1, redFlag: true, hardStop: false, text: 'Возрастной риск.' };
    },

    getClubStatusMarker(profile) {
        const club = this.normalizeText(profile?.currentClub || '');

        if (!this.isUsefulTmText(club)) {
            return {
                label: 'club ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'Текущий клуб не найден.'
            };
        }

        if (this.isRetired(profile)) {
            return {
                label: 'retired',
                level: 'skip',
                score: -100,
                redFlag: true,
                hardStop: true,
                text: 'Transfermarkt показывает Current club: Retired. Игрок завершил карьеру — не покупать.'
            };
        }

        if (this.isFreeAgent(profile)) {
            const age = Number(profile.age || 0);
            const minutes = profile.activity?.minutesPct;

            if (age >= 29 || minutes === 0) {
                return {
                    label: 'no club',
                    level: 'risk',
                    score: -2,
                    redFlag: true,
                    hardStop: false,
                    text: 'Игрок без клуба. Для возрастного или неиграющего игрока это сильный риск.'
                };
            }

            return {
                label: 'no club',
                level: 'watch',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'Игрок без клуба. Может быть возможностью, но требует ручной проверки.'
            };
        }

        return {
            label: 'club ✓',
            level: 'normal',
            score: 0,
            redFlag: false,
            hardStop: false,
            text: `Текущий клуб: ${club}`
        };
    },

    getAgentMarker(profile) {
        const agent = this.normalizeText(profile?.playerAgent || '');

        if (!this.isUsefulTmText(agent)) {
            return {
                label: 'agent ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'Агент не найден.'
            };
        }

        if (this.isNoAgent(profile)) {
            const age = Number(profile.age || 0);
            const free = this.isFreeAgent(profile);

            const strongRisk = age >= 29 || free;

            return {
                label: 'no agent',
                level: strongRisk ? 'risk' : 'watch',
                score: strongRisk ? -2 : -1,
                redFlag: strongRisk,
                hardStop: false,
                text: 'Player agent: no agent. Само по себе не стоп, но усиливает риск у свободных/возрастных/неиграющих игроков.'
            };
        }

        return {
            label: 'agent ✓',
            level: 'normal',
            score: 0,
            redFlag: false,
            hardStop: false,
            text: `Агент: ${agent}`
        };
    },

    getTmValueMarker(profileOrValue) {
        const cfg = this.getCfg().tmValue || {};
        const profile = profileOrValue && typeof profileOrValue === 'object'
            ? profileOrValue
            : null;

        if (profile && this.isRetired(profile)) {
            const oldValue = Number(profile.lastKnownMarketValueEur || profile.highestMarketValueEur || 0);

            if (!oldValue) {
                return {
                    label: 'old €?',
                    level: 'old',
                    score: 0,
                    redFlag: false,
                    hardStop: false,
                    text: 'Игрок Retired. Текущей рыночной цены нет; TM-стоимость, если она была, является исторической.'
                };
            }

            return {
                label: `old ${TMEnrichmentLayer.formatMoney(oldValue)}`,
                level: 'old',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'Игрок Retired. Эта сумма не текущая рыночная цена, а последняя/историческая оценка Transfermarkt. Для покупки она почти не имеет положительного веса.'
            };
        }

        const value = profile
            ? Number(profile.marketValueEur || 0)
            : Number(profileOrValue || 0);

        if (!value) {
            return { label: 'TM €?', level: 'unknown', score: 0, redFlag: false, hardStop: false, text: 'Реальная цена TM не найдена.' };
        }

        if (value >= (cfg.high || 1000000)) {
            return { label: `TM ${TMEnrichmentLayer.formatMoney(value)}`, level: 'hot', score: 4, redFlag: false, hardStop: false, text: 'Высокая реальная цена TM. Это сильный внешний сигнал актуальности игрока.' };
        }

        if (value >= (cfg.good || 300000)) {
            return { label: `TM ${TMEnrichmentLayer.formatMoney(value)}`, level: 'good', score: 3, redFlag: false, hardStop: false, text: 'Хорошая реальная цена TM.' };
        }

        if (value >= (cfg.normal || 100000)) {
            return { label: `TM ${TMEnrichmentLayer.formatMoney(value)}`, level: 'normal', score: 1, redFlag: false, hardStop: false, text: 'Нормальная реальная цена TM.' };
        }

        return { label: `TM ${TMEnrichmentLayer.formatMoney(value)}`, level: 'low', score: 0, redFlag: false, hardStop: false, text: 'Низкая реальная цена TM.' };
    },

    getMarketSalePriceMarker(row, slfAlter) {
        if (this.isHistoryPage() || row?.completedTransfer) {
            return null;
        }

        const currentInfo = this.getCurrentSlfMarketPrice(row);
        const current = Number(currentInfo.value || 0);
        const nominalRatio = Number(row?.nominalRatio || currentInfo.nominalRatio || 0);
        const baseNominal = current && nominalRatio ? Math.round(current / nominalRatio) : Number(row?.nominalBase || currentInfo.nominalBase || 0);
        const nominalText = nominalRatio ? `${nominalRatio.toFixed(1).replace(/\.0$/, '')}x` : '';

        const skillBasis = this.getMarketSkillBasis(row, slfAlter);
        const unknownDetails = {
            currentInfo,
            baseline: null,
            ratio: 0,
            ratioText: '?',
            skillBasis,
            nominal: {
                ratio: nominalRatio || null,
                ratioText: nominalText,
                baseNominal
            },
            conclusion: 'нет текущей цены, alter.php ИТОГ или рыночной базы для сравнения'
        };

        if (!current) {
            return {
                label: 'MKT ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                category: 'market',
                marketDetails: unknownDetails,
                text: 'MKT: текущая SLF-цена из ячейки Цена не распознана.'
            };
        }

        if (!skillBasis.skill) {
            const shortCurrent = this.formatSlfMoneyShort(current);
            const fallbackText = skillBasis.pageSkill
                ? `Текущий скилл со страницы ${SLFAlterLayer.formatSkill(skillBasis.pageSkill)} показан только как контекст и не используется для MKT.`
                : 'Текущий скилл со страницы не используется для MKT.';

            return {
                label: `MKT ${shortCurrent} / ?`,
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                category: 'market',
                marketDetails: Object.assign({}, unknownDetails, {
                    baseline: null,
                    conclusion: `MKT не рассчитан: нужен ИТОГ из alter.php. ${fallbackText}`
                }),
                text: `MKT: ${shortCurrent}, но p75 не считается без ИТОГ alter.php. ${fallbackText}`
            };
        }

        const baseline = this.findMarketBaseline(row, slfAlter);
        const p75 = Number(baseline?.p75 || 0);

        if (!baseline || !p75) {
            return {
                label: `MKT ${this.formatSlfMoneyShort(current)} / ?`,
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                category: 'market',
                marketDetails: Object.assign({}, unknownDetails, {
                    baseline: null,
                    conclusion: 'нет достаточной completed-transfer выборки для p75'
                }),
                text: `MKT: текущая SLF цена ${this.formatSlfMoneyShort(current)}, p75 недоступен.`
            };
        }

        const ratio = current / p75;
        const ratioText = `${ratio.toFixed(2)}x`;
        let level = 'neutral';
        let score = 0;
        let conclusion = 'около рыночного p75; решение зависит от позиции, возраста, скилла и TM-сигнала.';

        if (baseline.count < 3 || baseline.confidence === 'weak') {
            level = 'unknown';
            score = 0;
            conclusion = 'маленькая выборка; использовать как слабый ориентир и проверить вручную.';
        } else if (current <= p75 * 0.85) {
            level = 'good';
            score = 3;
            conclusion = 'ниже верхнего рыночного ориентира p75; потенциально выгодно при нормальных игровых сигналах.';
        } else if (current <= p75 * 1.05) {
            level = 'normal';
            score = 1;
            conclusion = 'около p75; справедливая цена при подтверждении скилла/возраста/позиции.';
        } else if (current <= p75 * 1.50) {
            level = 'watch';
            score = -1;
            conclusion = 'выше p75; дорого, покупать только при сильном подтверждении потенциала или редкости позиции.';
        } else {
            level = 'risk';
            score = -3;
            conclusion = 'сильно выше верхнего рыночного ориентира; высокий риск переплаты.';
        }

        const shortCurrent = this.formatSlfMoneyShort(current);
        const shortP75 = this.formatSlfMoneyShort(p75);

        return {
            label: `MKT ${shortCurrent} / ${shortP75} · ${ratioText}`,
            level,
            score,
            redFlag: level === 'risk',
            hardStop: false,
            category: 'market',
            marketDetails: {
                currentInfo,
                baseline,
                ratio,
                ratioText,
                skillBasis,
                diffPct: Math.round((ratio - 1) * 100),
                nominal: {
                    ratio: nominalRatio || null,
                    ratioText: nominalText,
                    baseNominal
                },
                conclusion
            },
            text: `MKT ${shortCurrent} / ${shortP75}: сравнение текущей SLF-цены с p75 completed transfers (${ratioText}). База скилла: ${skillBasis.label}.`
        };
    },


    getValueTrendMarker(profile) {
        if (this.isRetired(profile)) return null;

        const current = Number(profile?.marketValueEur || 0);
        const highest = Number(profile?.highestMarketValueEur || 0);
        const ratio = Number(profile?.valuePeakRatio || 0);
        const cfg = this.getCfg().valueTrend || {};

        if (!current || !highest || !ratio) {
            return {
                label: 'trend ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'Не удалось сравнить текущую и максимальную цену TM.'
            };
        }

        const percent = Math.round(ratio * 100);
        const peakYear = Number((String(profile.highestMarketValueDate || '').match(/20\d{2}/) || [])[0]);
        const currentYear = new Date().getFullYear();
        const isOldPeak = peakYear && currentYear - peakYear >= (cfg.oldPeakYears || 5);

        if (ratio >= (cfg.nearPeakRatio || 0.80)) {
            return {
                label: `peak ${percent}%`,
                level: 'good',
                score: 3,
                redFlag: false,
                hardStop: false,
                text: 'Текущая цена близка к максимальной. Игрок актуален по TM.'
            };
        }

        if (ratio >= (cfg.stillValuableRatio || 0.50)) {
            return {
                label: `peak ${percent}%`,
                level: 'normal',
                score: 2,
                redFlag: false,
                hardStop: false,
                text: 'Цена ниже максимума, но игрок остаётся достаточно ценным по TM.'
            };
        }

        if (ratio >= (cfg.belowPeakRatio || 0.20)) {
            return {
                label: `peak ${percent}%`,
                level: isOldPeak ? 'risk' : 'watch',
                score: isOldPeak ? -2 : -1,
                redFlag: isOldPeak,
                hardStop: false,
                text: isOldPeak
                    ? 'Цена заметно ниже старого пика. Старый пик может вводить в заблуждение.'
                    : 'Цена заметно ниже пика. Нужна ручная проверка динамики.'
            };
        }

        return {
            label: `fall ${percent}%`,
            level: 'risk',
            score: -3,
            redFlag: true,
            hardStop: false,
            text: 'Игрок сильно дешевле своего пика. Это красный маркер, особенно у возрастных/без клуба.'
        };
    },

    getContractMarker(text) {
        if (!this.isUsefulTmText(text)) {
            return { label: 'ctr ?', level: 'unknown', score: 0, redFlag: false, hardStop: false, text: 'Контракт не найден.' };
        }

        const year = Number((String(text).match(/20\d{2}/) || [])[0]);
        const currentYear = new Date().getFullYear();

        if (!year) {
            return { label: `ctr ${String(text).slice(0, 10)}`, level: 'unknown', score: 0, redFlag: false, hardStop: false, text: `Контракт найден, но год не распознан: ${text}` };
        }

        if (year <= currentYear) {
            return { label: `exp ${year}`, level: 'risk', score: -2, redFlag: true, hardStop: false, text: 'Контракт истекает или уже истёк. Нужна ручная проверка.' };
        }

        if (year === currentYear + 1) {
            return { label: `exp ${year}`, level: 'watch', score: 1, redFlag: false, hardStop: false, text: 'Контракт скоро заканчивается.' };
        }

        return { label: `ctr ${year}`, level: 'good', score: 3, redFlag: false, hardStop: false, text: 'Действующий контракт.' };
    },

    getRumorMarker(rumors) {
        const list = this.getUsefulRumors(rumors);

        if (!list.length) {
            return { label: 'R0', level: 'empty', score: 0, redFlag: false, hardStop: false, text: 'Слухов не найдено.' };
        }

        const now = Date.now();

        const fresh = list.filter(r => {
            if (!r.dateTs) return false;

            const days = (now - r.dateTs) / 86400000;
            return days <= 90;
        });

        if (fresh.length >= 3) {
            return { label: `R${fresh.length} fresh`, level: 'hot', score: 5, redFlag: false, hardStop: false, text: 'Много свежего интереса.' };
        }

        if (fresh.length >= 1) {
            return { label: `R${fresh.length} fresh`, level: 'good', score: 3, redFlag: false, hardStop: false, text: 'Есть свежий интерес.' };
        }

        if (list.length >= 3) {
            return { label: `R${list.length}`, level: 'watch', score: 3, redFlag: false, hardStop: false, text: 'Есть слухи, свежесть не распознана.' };
        }

        return { label: `R${list.length}`, level: 'old', score: 1, redFlag: false, hardStop: false, text: 'Слухи есть, но сигнал слабый или дата не распознана.' };
    },

    matchAcademyList(text, list) {
        const lower = this.normalizeLower(text);

        for (const item of list || []) {
            const patterns = item.patterns || [];

            if (patterns.some(pattern => lower.includes(String(pattern).toLowerCase()))) {
                return item;
            }
        }

        return null;
    },

    getAcademyMarker(history, youthClubs) {
        const rows = Array.isArray(history) ? history : [];
        const youth = Array.isArray(youthClubs) ? youthClubs : [];

        if (!rows.length && !youth.length) {
            return {
                label: 'acad ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'История переходов и Youth Clubs не найдены.'
            };
        }

        const text = [
            ...rows.map(x => x.text || ''),
            ...youth
        ].join(' ');

        const cfg = this.getCfg();

        const elite = this.matchAcademyList(text, cfg.eliteAcademies || []);

        if (elite) {
            return {
                label: 'elite',
                level: 'hot',
                score: 4,
                redFlag: false,
                hardStop: false,
                text: `Топовая академия: ${elite.label}. Youth Clubs: ${youth.join(', ') || 'нет отдельного блока'}.`
            };
        }

        const strong = this.matchAcademyList(text, cfg.strongAcademies || []);

        if (strong) {
            return {
                label: 'strong',
                level: 'good',
                score: 2,
                redFlag: false,
                hardStop: false,
                text: `Сильный клубный след: ${strong.label}. Youth Clubs: ${youth.join(', ') || 'нет отдельного блока'}.`
            };
        }

        const lower = this.normalizeLower(text);
        const hasYouthTrace = /\bu1[7-9]\b|\bu2[0-3]\b|\bu-1[7-9]\b|\bu-2[0-3]\b|\byouth\b|\bacademy\b|\bii\b|\bb\b|юнош/i.test(lower);

        if (hasYouthTrace || youth.length) {
            return {
                label: 'youth',
                level: 'neutral',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: `Есть молодёжный след, но клуб не входит в список топовых/сильных академий. Youth Clubs: ${youth.join(', ') || 'нет отдельного блока'}.`
            };
        }

        return {
            label: 'acad -',
            level: 'empty',
            score: 0,
            redFlag: false,
            hardStop: false,
            text: 'Сильного академического сигнала нет.'
        };
    },

    });
}
