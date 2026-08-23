// Re Html Utils
// Extracted verbatim from recommendation-engine.js (stage 4 refactor).
// Assigned onto the RecommendationEngine facade; behaviour unchanged.

if (typeof RecommendationEngine !== 'undefined' && RecommendationEngine) {
    RecommendationEngine.stage4ReHtmlUtilsApplied = true;

    Object.assign(RecommendationEngine, {
    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    },

    isPlaceholderHtml(html) {
        const clean = String(html || '').toLowerCase();
        return !clean ||
            clean.includes('рекомендация появится после snapshot') ||
            clean.includes('рекомендация отложена') ||
            clean.includes('live parser уже запущен');
    },

    getSectionKey(title) {
        const t = String(title || '').toLowerCase();
        if (t.includes('конкрет')) return 'action';
        if (t.includes('контекст')) return 'context';
        if (t.includes('генератор')) return 'generator';
        if (t.includes('ручн')) return 'controls';
        if (t.includes('замет')) return 'notes';
        if (t.includes('статус')) return 'status';
        if (t.includes('сбор')) return 'collect';
        if (t.includes('ошибка')) return 'error';
        return 'misc_' + t.replace(/[^a-z0-9а-яё]+/gi, '_').slice(0, 24);
    },

    getDefaultSectionOpen(title) {
        const t = String(title || '').toLowerCase();
        // Main tactical action stays visible. Error blocks also stay visible so failures are not hidden.
        return t.includes('конкрет') || t.includes('ошибка');
    },

    getStoredSectionOpen(title) {
        const key = this.getSectionKey(title);
        const storageKey = `slf_rec_section_open_${key}`;
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored === '1') return true;
            if (stored === '0') return false;
        } catch (e) {}
        return this.getDefaultSectionOpen(title);
    },

    sectionHtml(title, rows, color = '#ddd', priority = 3) {
        const list = this.dedupeRows(rows);

        if (!list.length) return '';

        const safeTitle = this.escapeHtml(title);
        const safeRows = list.map(row => `<div style="margin:2px 0;line-height:1.35;">${this.escapeHtml(row)}</div>`).join('');
        const sectionKey = this.getSectionKey(title);
        const storageKey = `slf_rec_section_open_${sectionKey}`;
        const openAttr = this.getStoredSectionOpen(title) ? ' open' : '';
        const countText = list.length > 1 ? ` <span style="opacity:.65;font-weight:normal;">(${list.length})</span>` : '';
        const toggleJs = `try{localStorage.setItem('${storageKey}',this.open?'1':'0')}catch(e){}`;

        return `
            <details${openAttr} data-slf-rec-priority="${priority}" data-slf-rec-section="${sectionKey}" ontoggle="${toggleJs}" style="margin:5px 0;padding:0;background:#151515;border:1px solid #444;border-radius:5px;color:#ddd;">
                <summary style="cursor:pointer;list-style:none;padding:7px 9px;font-weight:bold;color:${color};text-align:center;user-select:none;">
                    <span style="float:left;opacity:.65;font-weight:normal;">▸</span>${safeTitle}${countText}
                </summary>
                <div style="padding:0 9px 7px 9px;">${safeRows}</div>
            </details>
        `;
    },

    captureCurrentRecommendationHtml() {
        const el = document.getElementById('slf-parser-recommendation');
        const html = el ? String(el.innerHTML || '').trim() : '';

        if (!this.isPlaceholderHtml(html)) {
            STATE.lastRecommendationHtml = html;
            STATE.lastRecommendationMeta = Object.assign({}, STATE.lastRecommendationMeta || {}, {
                capturedAt: Date.now(),
                gameId: MatchStateParser.getGameId(),
                source: 'capture_current_recommendation_html'
            });
            return html;
        }

        return STATE.lastRecommendationHtml || '';
    },

    persistRenderedRecommendation(html, snapshot, meta = {}) {
        if (this.isPlaceholderHtml(html)) return;

        STATE.lastRecommendationHtml = html;
        STATE.lastRecommendationMeta = Object.assign({
            schema: 'slf_last_recommendation_render_v2',
            savedAt: Date.now(),
            gameId: snapshot?.gameId || MatchStateParser.getGameId(),
            bucket: snapshot?.bucket || '',
            minute: snapshot?.minute ?? null
        }, meta || {});

        if (typeof SnapshotEngine !== 'undefined' && SnapshotEngine.persistManualState) {
            SnapshotEngine.persistManualState();
        }
    },

    });
}
