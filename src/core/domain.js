    // 0. SLF domain helpers
    // ============================================================

    const SLF_GAME_DOMAINS = new Set([
        'slf.fm',
        'www.slf.fm',
        'soccerlife.ru',
        'www.soccerlife.ru'
    ]);

    function getSlfGameOrigin() {
        const host = String(location.hostname || '').toLowerCase();

        if (SLF_GAME_DOMAINS.has(host)) {
            return location.origin;
        }

        return 'https://slf.fm';
    }

    function buildSlfUrl(path) {
        const cleanPath = String(path || '');

        if (/^https?:\/\//i.test(cleanPath)) {
            return cleanPath;
        }

        return getSlfGameOrigin() + (cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath);
    }

// ============================================================
