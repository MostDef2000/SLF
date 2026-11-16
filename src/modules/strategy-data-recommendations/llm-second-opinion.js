// LLM Second Opinion (specs/434-llm-tactical-advisor, phase F1)
// ============================================================
// Advisory-only layer: sends the current rules-decision context to the VPS
// /api/advisor endpoint and renders the validated LLM answer next to the
// rules hint. The rules engine stays the primary decider; this module NEVER
// applies tactics, never mutates engine or registry state, and degrades to
// a muted inline message on any failure.

const LLMSecondOpinion = {
    ENDPOINT_COLLECTION: 'advisor',
    REQUEST_TIMEOUT_MS: 35000,
    MAX_HINTS: 20,
    MAX_HINT_CHARS: 300,
    MAX_CATALOG_ENTRIES: 40,

    // Compact whitelist of decision-context signals sent to the advisor.
    // Everything else in the moment context stays local (payload budget).
    SIGNAL_KEYS: [
        'minute', 'scoreState', 'scoreDiff', 'strengthGap', 'pressureRisk',
        'attackNeed', 'controlNeed', 'preservationNeed', 'pressingOpportunity',
        'pressingCost', 'strengthAdvantage', 'defensiveStability',
        'pressingResponse', 'widthOpportunity', 'gameMode', 'underPressure',
        'attackingMomentum', 'transitionThreat', 'centerClosed', 'wideQuality',
        'myXg', 'oppXg', 'myXT', 'oppXT', 'myShots', 'oppShots', 'myBad',
        'oppBad', 'myPower', 'oppPower', 'myPowerDropPct', 'oppPowerDropPct',
        'myPressVector', 'oppPressVector', 'ownRedCard', 'opponentRedCard'
    ],

    escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    // Fail-closed: null unless a rules decision AND a preset catalog exist.
    buildPayload({ snapshot, ruleDecision, registry }) {
        if (!ruleDecision || typeof ruleDecision !== 'object' || !registry || typeof registry !== 'object') return null;
        const active = Array.isArray(registry.active) ? registry.active : [];
        if (!active.length) return null;

        const catalog = active.slice(0, this.MAX_CATALOG_ENTRIES).map(id => {
            const meta = (registry.meta && registry.meta[id]) || {};
            return {
                id,
                label: (registry.labels && registry.labels[id]) || id,
                idea: typeof meta.idea === 'string' ? meta.idea : '',
                use: typeof meta.use === 'string' ? meta.use : '',
                risk: typeof meta.risk === 'string' ? meta.risk : ''
            };
        }).filter(entry => entry.id);

        const context = (ruleDecision.moment && ruleDecision.moment.context) || {};
        const signals = {};
        for (const key of this.SIGNAL_KEYS) {
            if (context[key] !== undefined && context[key] !== null) signals[key] = context[key];
        }

        const hints = (Array.isArray(snapshot && snapshot.developerHints) ? snapshot.developerHints : [])
            .map(hint => {
                // Hints may be plain strings or {text} objects; never
                // stringify the object itself ('[object Object]').
                const text = (hint && typeof hint === 'object') ? hint.text : hint;
                return String(text || '').trim().slice(0, this.MAX_HINT_CHARS);
            })
            .filter(Boolean)
            .slice(0, this.MAX_HINTS);

        const candidates = (Array.isArray(ruleDecision.candidates) ? ruleDecision.candidates : [])
            .filter(item => item && !item.vetoed && (item.preset || item.id))
            .slice(0, 5)
            .map(item => ({ id: item.preset || item.id, score: typeof item.score === 'number' ? item.score : null }));

        return {
            schema: 'slf_llm_advisor_request_v1',
            gameId: (snapshot && snapshot.gameId) || null,
            minute: (snapshot && snapshot.minute != null) ? snapshot.minute : (context.minute ?? null),
            bucket: (snapshot && snapshot.bucket) || '',
            score: (snapshot && snapshot.score) || null,
            currentPreset: context.currentPreset
                || (ruleDecision.telemetry && ruleDecision.telemetry.currentPreset)
                || (snapshot && snapshot.presetName)
                || null,
            developerHints: hints,
            ruleDecision: {
                preset: (ruleDecision.action && ruleDecision.action.preset) || null,
                gameMode: context.gameMode || (ruleDecision.action && ruleDecision.action.decision) || null,
                // confidence is {level, gap, ...} from the scorer; accept a bare string too.
                confidence: (ruleDecision.confidence && ruleDecision.confidence.level) || ruleDecision.confidence || null,
                topCandidates: candidates
            },
            signals,
            presetCatalog: catalog
        };
    },

    requestSecondOpinion(payload) {
        return Api.postJson(this.ENDPOINT_COLLECTION, payload, 'llm-advisor', this.REQUEST_TIMEOUT_MS);
    },

    renderAnswer(answer) {
        if (!answer || answer.available !== true) {
            const message = this.escapeHtml((answer && answer.error) || 'LLM недоступен');
            return `<div id="slf-llm-second-opinion-answer" style="margin:5px 0;background:#181818;border:1px dashed #555;border-radius:5px;color:#999;padding:7px 9px;font-size:12px;">🤖 LLM недоступен: ${message}</div>`;
        }
        const label = this.escapeHtml(answer.presetLabel || answer.preset || '');
        const confidence = this.escapeHtml(answer.confidence || '');
        const reason = this.escapeHtml(answer.reason || '');
        // Show which model served the answer AND (when the server reports it)
        // the upstream provider. The provider is optional — an older server or
        // an upstream payload without it must keep the legacy
        // `<model> · <latency>` line, never a dangling separator.
        const provider = typeof answer.provider === 'string' ? answer.provider.trim() : '';
        const metaParts = [answer.model || ''];
        if (provider) metaParts.push(provider);
        metaParts.push(`${(Number(answer.latencyMs) / 1000).toFixed(1)}s`);
        const meta = this.escapeHtml(metaParts.join(' · '));
        // Ф2a (#441): one-click apply. The button only carries data; the
        // click handler lives in the ui-extension (event delegation) and
        // applies strictly on explicit click — never auto.
        const presetId = typeof answer.preset === 'string' ? answer.preset : '';
        const adviceId = typeof answer.adviceId === 'string' ? answer.adviceId : '';
        const applyHtml = presetId
            ? `<div style="margin-top:6px;"><button id="slf-llm-apply-btn" type="button"` +
              ` data-slf-llm-apply-preset="${this.escapeHtml(presetId)}"` +
              ` data-slf-llm-apply-advice-id="${this.escapeHtml(adviceId)}"` +
              ` style="padding:4px 10px;background:#2a4a2a;color:#cfc;border:1px solid #4a7;border-radius:3px;cursor:pointer;font-size:12px;">Применить пресет</button>` +
              `<span style="opacity:.55;margin-left:6px;">применение только по клику</span></div>`
            : '';
        return `<div id="slf-llm-second-opinion-answer" style="margin:5px 0;background:#141a14;border:1px solid #3a5a3a;border-radius:5px;color:#cde;padding:7px 9px;font-size:12px;line-height:1.45;">` +
            `<b style="color:#8fd3ff;">🤖 Второе мнение (LLM):</b> <b>${label}</b> <span style="opacity:.7;">(уверенность: ${confidence})</span><br>` +
            `${reason}<br>` +
            `<span style="opacity:.55;">${meta} · только совет, тактика не применена</span>${applyHtml}</div>`;
    },

    // Mount the answer inside the recommendation panel; a fresh hint render
    // wipes it together with the panel content (the answer belongs to the
    // hint that produced it). Returns true when mounted.
    mountAnswer(answerHtml) {
        const panel = document.getElementById('slf-parser-recommendation');
        if (!panel) return false;
        const existing = document.getElementById('slf-llm-second-opinion-answer');
        if (existing) existing.remove();
        const holder = document.createElement('div');
        holder.innerHTML = answerHtml;
        const node = holder.firstElementChild;
        if (!node) return false;
        panel.appendChild(node);
        return true;
    }
};

if (typeof window !== 'undefined') {
    window.SLFLLMSecondOpinion = LLMSecondOpinion;
}
