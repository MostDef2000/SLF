// 6. Match Stats Parser
// ============================================================

const MatchStatsParser = {
    readTeamNames() {
        // FM2026 "g3" layout (issue #313) scopes the match teams inside
        // .g3-scoreline.  Prefer those nodes so foreign roster.php links that
        // appear earlier in the document (e.g. a sidebar club link) cannot
        // hijack home/away.
        const g3HomeName = document.querySelector('.g3-scoreline .g3-team--home .g3-team__name a[href*="roster.php?id="]');
        const g3AwayName = document.querySelector('.g3-scoreline .g3-team--away .g3-team__name a[href*="roster.php?id="]');

        const g3Home = (g3HomeName?.textContent || '').trim();
        const g3Away = (g3AwayName?.textContent || '').trim();

        if (g3Home && g3Away) {
            return { home: g3Home, away: g3Away };
        }

        const links = [...document.querySelectorAll('a[href*="roster.php?id="]')];

        const names = links
            .map(a => (a.textContent || '').trim())
            .filter(Boolean)
            .filter(x => x.length >= 2);

        return {
            home: names[0] || null,
            away: names[1] || null
        };
    },

    getAllTeamIds() {
        const ids = [...document.querySelectorAll('[class*="stat-"]')]
            .flatMap(el => [...el.classList])
            .map(c => {
                const m = c.match(/^stat-(\d+)-/);
                return m ? Number(m[1]) : null;
            })
            .filter(Boolean);

        return [...new Set(ids)];
    },

    detectMyTeamId(ids, teamNames = null) {
        const list = Array.isArray(ids) ? ids.map(Number).filter(Boolean) : [];
        const byKnownId = list.find(id => Object.values(CONFIG.MY_TEAMS).includes(id));

        if (byKnownId) return byKnownId;

        const names = teamNames || this.readTeamNames();
        const aliases = CONFIG.MY_TEAM_ALIASES || {};
        const homeIsMine = Object.values(aliases).some(aliasList => aliasMatchesTeamName(names?.home, aliasList));
        const awayIsMine = Object.values(aliases).some(aliasList => aliasMatchesTeamName(names?.away, aliasList));

        if (homeIsMine && list[0]) return list[0];
        if (awayIsMine && list[1]) return list[1];

        return null;
    },

    readFullStats(teamId) {
        const get = key =>
            document.querySelector(`.stat-${teamId}-${key}`)?.innerText.trim() || null;

        return {
            power: toNum(get('power2') || get('power')),
            possession: toNum(get('pos')),
            shots: toNum(get('shots')),
            onTarget: toNum(get('ontarget')),
            xG: toNum(get('xG')),
            accuratePasses: toNum(get('passes')),
            inaccuratePasses: toNum(get('unpasses')),
            actions: toNum(get('ttx')),
            badActionsPct: toNum(get('defective')),
            defVector: toNum(get('def_height')),
            pressVector: toNum(get('press_height')),
            fouls: toNum(get('fouls')),
            corners: toNum(get('corners')),
            offsides: toNum(get('offsides')),
            individualActions: toNum(get('ind')),
            woodwork: toNum(get('post')),
            support: toNum(get('support'))
        };
    },

    readXT() {
        const text = document.body.innerText;
        const m = text.match(/xT\s*\(импульс атаки\)\s*([\d.]+)\s*-\s*([\d.]+)/i);

        return m
            ? {
                home: toNum(m[1]),
                away: toNum(m[2])
            }
            : null;
    },

    readEventsText() {
        return [...document.querySelectorAll('.game_comments tr, .game-ui__play-comments tr')]
            .slice(0, 30)
            .map(el => el.innerText.trim().replace(/\s+/g, ' '))
            .filter(Boolean);
    },

    readShotsTable() {
        return [];
    }
};

    // ============================================================
