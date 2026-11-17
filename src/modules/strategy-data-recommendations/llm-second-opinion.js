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
    // Phase 1 (#459): optional per-match dialogue. Mirrors the server caps.
    MAX_DIALOG_TURNS: 20,
    MAX_DIALOG_TURN_CHARS: 500,
    // #461: partial-data mode. On an early match the rules engine has no
    // decision yet; the payload then says so honestly instead of refusing.
    PARTIAL_DATA_NOTE: 'Правила не дали решения на текущих данных матча',

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

    // Client-side cleaning for the dialogue: only {role: user|assistant,
    // text: string} turns survive, text is trimmed/capped, ts is kept only
    // when numeric, and the list is capped at MAX_DIALOG_TURNS.
    cleanDialog(dialog) {
        if (!Array.isArray(dialog)) return [];
        return dialog
            .map(turn => {
                if (!turn || typeof turn !== 'object') return null;
                const role = turn.role === 'user' || turn.role === 'assistant' ? turn.role : '';
                const text = typeof turn.text === 'string'
                    ? turn.text.trim().slice(0, this.MAX_DIALOG_TURN_CHARS)
                    : '';
                if (!role || !text) return null;
                const cleaned = { role, text };
                if (typeof turn.ts === 'number' && Number.isFinite(turn.ts)) cleaned.ts = turn.ts;
                return cleaned;
            })
            .filter(Boolean)
            .slice(0, this.MAX_DIALOG_TURNS);
    },

    // Fail-closed on "nothing to advise with": no registry or an empty catalog
    // still yields null (partial mode additionally needs the snapshot). #461: a
    // missing rules decision (early match, phase collect) no longer refuses the
    // request — it becomes an explicitly marked partial payload.
    buildPayload({ snapshot, ruleDecision, registry, dialog }) {
        if (!registry || typeof registry !== 'object') return null;
        const active = Array.isArray(registry.active) ? registry.active : [];
        if (!active.length) return null;
        const partial = !ruleDecision || typeof ruleDecision !== 'object';
        // #461: only partial mode requires the snapshot's own situation to be
        // meaningful; full mode keeps the pre-existing contract untouched.
        if (partial && (!snapshot || typeof snapshot !== 'object')) return null;
        const decision = partial ? null : ruleDecision;

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

        // The decision's moment context is the only signal source; in partial
        // mode there is none, and the situation (score/minute) still rides in
        // the top-level fields below.
        const context = partial ? {} : ((decision.moment && decision.moment.context) || {});
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

        const candidates = (Array.isArray(decision && decision.candidates) ? decision.candidates : [])
            .filter(item => item && !item.vetoed && (item.preset || item.id))
            .slice(0, 5)
            .map(item => ({ id: item.preset || item.id, score: typeof item.score === 'number' ? item.score : null }));

        const payload = {
            schema: 'slf_llm_advisor_request_v1',
            gameId: (snapshot && snapshot.gameId) || null,
            minute: (snapshot && snapshot.minute != null) ? snapshot.minute : (context.minute ?? null),
            bucket: (snapshot && snapshot.bucket) || '',
            score: (snapshot && snapshot.score) || null,
            currentPreset: context.currentPreset
                || (decision && decision.telemetry && decision.telemetry.currentPreset)
                || (snapshot && snapshot.presetName)
                || null,
            developerHints: hints,
            ruleDecision: partial ? null : {
                preset: (decision.action && decision.action.preset) || null,
                gameMode: context.gameMode || (decision.action && decision.action.decision) || null,
                // confidence is {level, gap, ...} from the scorer; accept a bare string too.
                confidence: (decision.confidence && decision.confidence.level) || decision.confidence || null,
                topCandidates: candidates
            },
            signals,
            presetCatalog: catalog
        };
        // #461: the partial marker is appended only in partial mode, so a
        // full-data payload keeps the exact legacy shape/bytes.
        if (partial) {
            payload.dataCompleteness = 'partial';
            payload.dataNote = this.PARTIAL_DATA_NOTE;
        }
        // Phase 1 (#459): the dialogue key is appended only when turns survive
        // cleaning, so a no-dialog payload keeps the exact legacy shape/bytes.
        const dialogTurns = this.cleanDialog(dialog);
        if (dialogTurns.length) payload.dialog = dialogTurns;
        return payload;
    },

    requestSecondOpinion(payload) {
        return Api.postJson(this.ENDPOINT_COLLECTION, payload, 'llm-advisor', this.REQUEST_TIMEOUT_MS);
    },

    renderAnswer(answer, options = {}) {
        if (!answer || answer.available !== true) {
            const message = this.escapeHtml((answer && answer.error) || 'LLM недоступен');
            return `<div id="slf-llm-second-opinion-answer" style="margin:5px 0;background:#181818;border:1px dashed #555;border-radius:5px;color:#999;padding:7px 9px;font-size:12px;">🤖 LLM недоступен: ${message}</div>`;
        }
        // #461: the advisor answered without a rules decision (early match).
        // Mark the advice as preliminary; the answer itself is unchanged.
        const partial = !!(options && options.partial === true);
        const partialHtml = partial
            ? '<div style="opacity:.75;margin-bottom:4px;color:#e8c87a;">Предварительный совет на неполных данных (правила не дали решения)</div>'
            : '';
        const label = this.escapeHtml(answer.presetLabel || answer.preset || '');
        const confidence = this.escapeHtml(answer.confidence || '');
        const reason = this.escapeHtml(answer.reason || '');
        // Show which model served the answer AND (when the server reports it)
        // the upstream provider. The provider is optional — an older server or
        // an upstream payload without it must keep the pre-existing
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
            partialHtml +
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
    },

    // Phase 1 (#459): compact chat window for the current match. Turns are
    // user/assistant remarks about tactics; every text is escaped and the
    // send control is disabled while a request is in flight. The window never
    // applies anything — the answer's «Применить пресет» button stays the only
    // trigger.
    renderChat({ turns, busy } = {}) {
        const safeTurns = this.cleanDialog(turns);
        const rows = safeTurns.map(turn =>
            `<div data-slf-llm-chat-turn="${turn.role}" style="margin:2px 0;line-height:1.4;">` +
            `<span style="opacity:.6;">${turn.role === 'assistant' ? 'LLM' : 'Вы'}:</span> ` +
            `${this.escapeHtml(turn.text)}</div>`
        ).join('');
        const placeholder = safeTurns.length
            ? ''
            : '<div style="opacity:.55;margin:2px 0;">Пока нет реплик — напишите замечание по тактике.</div>';
        const disabled = busy ? ' disabled' : '';
        const busyStyle = busy ? 'opacity:.55;cursor:not-allowed;' : 'cursor:pointer;';
        return '<div id="slf-llm-chat" style="margin:5px 0;background:#141414;border:1px solid #444;border-radius:5px;color:#ddd;padding:7px 9px;font-size:12px;">' +
            '<b style="color:#8fd3ff;">💬 Диалог с тренером:</b>' +
            `<div id="slf-llm-chat-turns" style="max-height:150px;overflow-y:auto;margin:5px 0;">${rows || placeholder}</div>` +
            '<div style="display:flex;gap:5px;align-items:flex-start;">' +
            `<input id="slf-llm-chat-input" type="text" maxlength="${this.MAX_DIALOG_TURN_CHARS}"` +
            ' placeholder="Замечание по тактике…"' +
            `${disabled} style="flex:1;min-width:0;padding:4px 6px;background:#222;color:#eee;border:1px solid #555;border-radius:3px;font-size:12px;" />` +
            `<button id="slf-llm-chat-send" type="button"${disabled}` +
            ` style="padding:4px 10px;background:#254;color:#fff;border:1px solid #4a7;border-radius:3px;${busyStyle}font-size:12px;">Отправить</button>` +
            '</div>' +
            '<span style="opacity:.55;">Реплики уходят в LLM вместе с ситуацией; пресет применяется только кнопкой.</span>' +
            '</div>';
    },

    // Mount the chat window inside the recommendation panel, replacing any
    // previous chat node (distinct id, never collides with the answer node).
    mountChat(chatHtml) {
        const panel = document.getElementById('slf-parser-recommendation');
        if (!panel) return false;
        const existing = document.getElementById('slf-llm-chat');
        if (existing) existing.remove();
        const holder = document.createElement('div');
        holder.innerHTML = chatHtml;
        const node = holder.firstElementChild;
        if (!node) return false;
        panel.appendChild(node);
        return true;
    }
};

if (typeof window !== 'undefined') {
    window.SLFLLMSecondOpinion = LLMSecondOpinion;
}
