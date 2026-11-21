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
    // #465: the 14 slider controls + priority read from getCurrentTactic()
    // and sent as the current vector so the advisor can propose fine-grained
    // «adjust» changes. Mirrors the server control names.
    CONTROL_KEYS: [
        'def_line', 'press_line', 'def_width', 'press_intense',
        'build_type', 'build_temp', 'build_long', 'build_fast',
        'style', 'pass_risk', 'dribble', 'cross', 'corner', 'shot'
    ],
    PRIORITY_DIRECTIONS: ['left', 'center', 'right'],
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

    // #465: client-side cleaning for the current slider vector. Only known
    // control keys with non-empty string values survive; priority keeps a
    // de-duplicated subset of left/center/right. Anything else is dropped and
    // an empty vector is omitted entirely (the server handles absence).
    cleanCurrentControls(currentControls) {
        if (!currentControls || typeof currentControls !== 'object' || Array.isArray(currentControls)) return null;
        const cleaned = {};
        for (const key of this.CONTROL_KEYS) {
            const value = currentControls[key];
            if (typeof value === 'string' && value.trim()) cleaned[key] = value.trim();
        }
        const priority = Array.isArray(currentControls.priority)
            ? currentControls.priority.filter((direction, index, list) =>
                this.PRIORITY_DIRECTIONS.includes(direction) && list.indexOf(direction) === index)
            : [];
        if (priority.length) cleaned.priority = priority;
        return Object.keys(cleaned).length ? cleaned : null;
    },

    // #477: canon manual channel. The decision comes from the local matcher
    // (finalTactic.canon); it is sent to the advisor as its own structured
    // field and is NEVER mixed into developerHints (page coach hints keep
    // their full 20-line budget).
    canonDecisionFrom(ruleDecision) {
        const canon = ruleDecision && ruleDecision.finalTactic ? ruleDecision.finalTactic.canon : null;
        if (!canon || typeof canon !== 'object' || canon.schema !== 'slf_canon_decision_v1') return null;
        if (typeof canon.status !== 'string') return null;
        return canon;
    },

    buildCanonReference(canon) {
        if (!canon) return null;
        const vector = canon.vector && typeof canon.vector === 'object' ? canon.vector : null;
        return {
            version: typeof canon.version === 'string' ? canon.version : null,
            title: 'Шпаргалка: построение атаки',
            status: canon.status,
            matchedId: canon.id == null ? null : canon.id,
            variant: canon.variant == null ? null : canon.variant,
            situationText: typeof canon.situationText === 'string' ? canon.situationText : null,
            vector: vector ? Object.assign({}, vector) : null,
            legend: Array.isArray(canon.legend) ? canon.legend.filter(line => typeof line === 'string').slice(0, 8) : [],
            evidence: Array.isArray(canon.evidence) ? canon.evidence.filter(item => typeof item === 'string').slice(0, 20) : [],
            missingInputs: Array.isArray(canon.missingInputs) ? canon.missingInputs.filter(item => typeof item === 'string').slice(0, 10) : [],
            additions: Array.isArray(canon.additions) ? canon.additions.slice(0, 5) : []
        };
    },

    // Client-boundary validation for «adjust» (#477 R8/R10). A matched row
    // makes its six manual settings authoritative: a change to one of those
    // fields must move TO the selected value. Valid changes on other
    // controls are allowed; any contradiction rejects the whole proposal
    // (never apply the valid half of a mixed answer).
    CONTROL_DOMAINS: {
        def_line: [1, 3], press_line: [1, 3], def_width: [1, 3], press_intense: [1, 5],
        build_type: [1, 3], build_temp: [1, 3], build_long: [1, 3], build_fast: [1, 3],
        style: [1, 5], pass_risk: [1, 5], dribble: [1, 5], cross: [1, 3], corner: [1, 2], shot: [1, 3]
    },

    validateAdjustAgainstCanon(changes, canon) {
        // Legacy path (no canon decision): preserve the pre-#477 rendering contract.
        if (!canon) return { ok: true, legacy: true, changes };
        if (!Array.isArray(changes) || !changes.length) return { ok: false, reason: 'пустой список изменений' };
        if (changes.length > 3) return { ok: false, reason: 'больше 3 изменений за раз' };
        const matched = canon && canon.status === 'matched' && canon.vector && typeof canon.vector === 'object' ? canon : null;
        const manualKeys = ['build_type', 'build_temp', 'build_long', 'build_fast', 'style'];
        const seen = new Set();
        for (const change of changes) {
            if (!change || typeof change !== 'object') return { ok: false, reason: 'изменение не объект' };
            const control = change.control;
            const value = change.value;
            if (typeof control !== 'string' || !Object.prototype.hasOwnProperty.call(this.CONTROL_DOMAINS, control)) {
                return { ok: false, reason: `неизвестный ползунок ${String(control)}` };
            }
            if (seen.has(control)) return { ok: false, reason: `ползунок ${control} повторяется` };
            seen.add(control);
            const text = typeof value === 'string' ? value.trim() : '';
            if (!/^\d{1,2}$/.test(text)) return { ok: false, reason: `значение ${control} вне диапазона` };
            const [low, high] = this.CONTROL_DOMAINS[control];
            if (Number(text) < low || Number(text) > high) return { ok: false, reason: `значение ${control} вне диапазона` };
            if (matched && manualKeys.includes(control) && String(text) !== String(matched.vector[control])) {
                return {
                    ok: false,
                    reason: `противоречит строке ${matched.id} канона: ${control} должно быть ${matched.vector[control]}, предложено ${text}`
                };
            }
        }
        return { ok: true, changes };
    },

    // Client-boundary validation for «switch» (#477 R8/R10). When a manual
    // row is matched, only an eligible preset mapped to that exact row AND
    // variant may be offered. A coach name, catalog id or a different
    // variant is never enough. Without a canon decision the legacy behaviour
    // is preserved; with an unresolved canon decision no canon switch is
    // offered at all.
    validateSwitchAgainstCanon(preset, canon) {
        if (!canon) return { ok: true, legacy: true };
        // An unresolved canon decision must not disable the ordinary preset
        // switch: R8 forbids inventing a canon match, not using the legacy
        // switch path. Only a MATCHED row constrains which preset is eligible.
        if (canon.status !== 'matched') return { ok: true, unresolvedCanon: true };
        const registry = this.__lastRegistry
            || (typeof window !== 'undefined' && window.SLFActivePresetRegistry ? window.SLFActivePresetRegistry : null)
            || (typeof SLFActivePresetRegistry !== 'undefined' ? SLFActivePresetRegistry : null);
        if (!registry || typeof preset !== 'string' || !preset) return { ok: false, reason: 'нет данных о пресетах' };
        const contract = registry.roleContracts && registry.roleContracts[preset];
        const mapping = contract && contract.canon;
        if (!mapping || mapping.exact !== true || Number(mapping.row) !== Number(canon.id)) {
            return { ok: false, reason: `пресет ${preset} не реализует строку ${canon.id} канона точно` };
        }
        const expectedVariant = canon.variant == null ? 'default' : String(canon.variant);
        if (String(mapping.variant == null ? 'default' : mapping.variant) !== expectedVariant) {
            return { ok: false, reason: `пресет ${preset} реализует другой вариант строки ${canon.id}` };
        }
        // Guard against a stale mapping: the declared preset controls must
        // still equal the selected manual vector.
        const controls = registry.presets && registry.presets[preset];
        if (!controls) return { ok: false, reason: `нет настроек пресета ${preset}` };
        for (const key of ['build_type', 'build_temp', 'build_long', 'build_fast', 'style']) {
            if (String(controls[key]) !== String(canon.vector[key])) {
                return { ok: false, reason: `настройки пресета ${preset} не совпадают со строкой ${canon.id}` };
            }
        }
        const lanes = canon.priorityLanes || [];
        const presetPriority = Array.isArray(controls.priority) ? controls.priority.map(String) : [];
        if (presetPriority.slice().sort().join(',') !== lanes.slice().map(String).sort().join(',')) {
            return { ok: false, reason: `приоритеты пресета ${preset} не совпадают со строкой ${canon.id}` };
        }
        return { ok: true };
    },

    // Fail-closed on "nothing to advise with": no registry or an empty catalog
    // still yields null (partial mode additionally needs the snapshot). #461: a
    // missing rules decision (early match, phase collect) no longer refuses the
    // request — it becomes an explicitly marked partial payload.
    buildPayload({ snapshot, ruleDecision, registry, dialog, currentControls }) {
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
        // #465: the current slider vector is appended only when it survives
        // cleaning, so a caller without it keeps the exact legacy bytes.
        const controls = this.cleanCurrentControls(currentControls);
        if (controls) payload.currentControls = controls;
        // #477: the canon reference + deterministic decision ride in their own
        // field, appended only when the local matcher produced one. Legacy
        // (no canon) requests keep the exact legacy payload bytes.
        const canon = this.canonDecisionFrom(ruleDecision);
        // #477: always refresh the decision slot, including to null. A stale
        // canon from a previous hint must never constrain a later answer.
        this.__lastCanonDecision = canon || null;
        this.__lastRegistry = registry;
        if (canon) payload.canonReference = this.buildCanonReference(canon);
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
        // #465: «adjust» answers change individual sliders, not the preset.
        // They render a compact change list plus their own click-only apply
        // button; the preset apply button belongs to «switch»/legacy answers
        // only. Model-derived values are escaped in both the text and the
        // JSON data attribute.
        const adjustChanges = Array.isArray(answer.changes) ? answer.changes : [];
        if (answer.mode === 'adjust' || adjustChanges.length) {
            const check = this.validateAdjustAgainstCanon(adjustChanges, this.__lastCanonDecision);
            if (!check.ok) {
                const blocked = this.escapeHtml(check.reason || 'предложение не соответствует канону');
                return `<div id="slf-llm-second-opinion-answer" style="margin:5px 0;background:#1a1414;border:1px solid #5a3a3a;border-radius:5px;color:#dcc;padding:7px 9px;font-size:12px;line-height:1.45;">` +
                    partialHtml +
                    `<b style="color:#8fd3ff;">🤖 Второе мнение (LLM):</b> <b>Точечная подстройка</b> <span style="opacity:.7;">(уверенность: ${confidence})</span><br>` +
                    `<span style="color:#e8c87a;">Не применено: ${blocked}</span><br>` +
                    `${reason}<br>` +
                    `<span style="opacity:.55;">${meta} · только совет, тактика не применена</span></div>`;
            }
            const changeRows = adjustChanges
                .filter(change => change && typeof change === 'object' && change.control != null)
                .map(change => `${this.escapeHtml(change.control)}: ${this.escapeHtml(change.value)}`)
                .join(', ');
            const adjustAdviceId = typeof answer.adviceId === 'string' ? answer.adviceId : '';
            const adjustApplyHtml = adjustChanges.length
                ? `<div style="margin-top:6px;"><button id="slf-llm-apply-adjust" type="button"` +
                  ` data-slf-llm-apply-changes="${this.escapeHtml(JSON.stringify(adjustChanges))}"` +
                  ` data-slf-llm-apply-advice-id="${this.escapeHtml(adjustAdviceId)}"` +
                  ` style="padding:4px 10px;background:#2a4a2a;color:#cfc;border:1px solid #4a7;border-radius:3px;cursor:pointer;font-size:12px;">Применить изменения</button>` +
                  `<span style="opacity:.55;margin-left:6px;">применение только по клику</span></div>`
                : '';
            return `<div id="slf-llm-second-opinion-answer" style="margin:5px 0;background:#141a14;border:1px solid #3a5a3a;border-radius:5px;color:#cde;padding:7px 9px;font-size:12px;line-height:1.45;">` +
                partialHtml +
                `<b style="color:#8fd3ff;">🤖 Второе мнение (LLM):</b> <b>Точечная подстройка</b> <span style="opacity:.7;">(уверенность: ${confidence})</span><br>` +
                `${changeRows ? `${changeRows}<br>` : ''}` +
                `${reason}<br>` +
                `<span style="opacity:.55;">${meta} · только совет, тактика не применена</span>${adjustApplyHtml}</div>`;
        }
        // Ф2a (#441): one-click apply. The button only carries data; the
        // click handler lives in the ui-extension (event delegation) and
        // applies strictly on explicit click — never auto.
        const presetId = typeof answer.preset === 'string' ? answer.preset : '';
        const adviceId = typeof answer.adviceId === 'string' ? answer.adviceId : '';
        // #477 R8: a «switch» is actionable only for an eligible preset that
        // exactly realizes the matched canon row AND variant. Without a canon
        // decision (legacy/old API) the pre-existing switch path is preserved.
        const switchCheck = presetId ? this.validateSwitchAgainstCanon(presetId, this.__lastCanonDecision) : { ok: true };
        if (presetId && !switchCheck.ok) {
            const blocked = this.escapeHtml(switchCheck.reason || 'предложение не соответствует канону');
            return `<div id="slf-llm-second-opinion-answer" style="margin:5px 0;background:#1a1414;border:1px solid #5a3a3a;border-radius:5px;color:#dcc;padding:7px 9px;font-size:12px;line-height:1.45;">` +
                partialHtml +
                `<b style="color:#8fd3ff;">🤖 Второе мнение (LLM):</b> <b>${label}</b> <span style="opacity:.7;">(уверенность: ${confidence})</span><br>` +
                `<span style="color:#e8c87a;">Не применено: ${blocked}</span><br>` +
                `${reason}<br>` +
                `<span style="opacity:.55;">${meta} · только совет, тактика не применена</span></div>`;
        }
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
