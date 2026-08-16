// Tactic Preset Library Panel
// ============================================================
// UI projection of the active tactical registry. No preset identities,
// formations or ordering are owned here.

const TacticPresetLibraryPanel = {
    panelId: 'slf-tactic-preset-library-panel',
    layoutId: 'slf-tactic-preset-layout',
    livePanelId: 'slf-live-lineup-preset-panel',
    liveSelectId: 'slf-live-lineup-preset-select',
    liveStatusId: 'slf-live-lineup-preset-status',
    liveRecommendationId: 'slf-live-lineup-preset-recommendation',
    liveInstalled: false,
    liveActivePreset: '',

    getRegistry() {
        return typeof window !== 'undefined' ? window.SLFActivePresetRegistry || null : null;
    },

    getLivePresetOrder() {
        const registry = this.getRegistry();
        return Array.isArray(registry?.active) ? registry.active.slice() : [];
    },

    getLiveFormationPositions() {
        const registry = this.getRegistry();
        return registry?.formations && typeof registry.formations === 'object'
            ? registry.formations
            : {};
    },

    isTacticPage() {
        const params = new URLSearchParams(location.search || '');
        return location.pathname.includes('/team4.php') && params.get('action') === 'tactic';
    },

    isLiveMatchPage() {
        return location.pathname.includes('/game.php');
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    },

    getGroupColors() {
        return { defensive: '#9fd3ff', balance: '#ffd76a', attack: '#ff9f9f' };
    },

    getGroups() {
        return [
            { id:'defensive', title:'Defensive / удержание', desc:'Удержание счёта, снижение риска, компактность и временная защита от давления.' },
            { id:'balance', title:'Balance / контроль', desc:'Контроль, выход из прессинга, cooldown и использование ширины.' },
            { id:'attack', title:'Attack / давление', desc:'Контролируемая погоня, позиционный дожим, поздний прессинг и финальный all-in.' }
        ];
    },

    getMeta() {
        const registry = this.getRegistry();
        if (registry?.meta) return registry.meta;
        return typeof TacticPresetLibrary !== 'undefined' && TacticPresetLibrary?.meta
            ? TacticPresetLibrary.meta
            : {};
    },

    renderPresetCard(name, meta, existsInStorage) {
        const color = this.getGroupColors()[meta.group] || '#ddd';
        const statusText = existsInStorage ? 'есть в dropdown' : 'пресет недоступен';
        const statusColor = existsInStorage ? '#7cff7c' : '#ff9f9f';
        return `
            <div style="background:#181818;border:1px solid #444;border-left:4px solid ${color};border-radius:6px;padding:8px 9px;margin:7px 0;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                    <div style="min-width:0;">
                        <div style="font-weight:bold;color:${color};font-size:13px;line-height:1.25;word-break:break-word;">${this.escapeHtml(name)}</div>
                        <div style="font-size:10px;color:#aaa;margin-top:2px;line-height:1.3;">${this.escapeHtml(meta.title || '')} · role: ${this.escapeHtml(meta.role || '')} · rank: ${this.escapeHtml(meta.rank ?? '')}</div>
                    </div>
                    <div style="font-size:10px;color:${statusColor};border:1px solid ${statusColor};border-radius:10px;padding:1px 6px;white-space:nowrap;">${this.escapeHtml(statusText)}</div>
                </div>
                <div style="margin-top:7px;line-height:1.35;font-size:11px;">
                    <div><b style="color:#ddd;">Идея:</b> ${this.escapeHtml(meta.idea || '')}</div>
                    <div style="margin-top:3px;"><b style="color:#ddd;">Использовать:</b> ${this.escapeHtml(meta.use || '')}</div>
                    <div style="margin-top:3px;"><b style="color:#ddd;">Риск:</b> ${this.escapeHtml(meta.risk || '')}</div>
                </div>
            </div>`;
    },

    buildHtml() {
        const meta = this.getMeta();
        const presets = typeof PresetStorage !== 'undefined' && PresetStorage.getAllPresets
            ? PresetStorage.getAllPresets()
            : {};
        const registry = this.getRegistry();
        const active = Array.isArray(registry?.active) ? registry.active : Object.keys(meta);
        const names = active.filter(name => meta[name]);
        if (!names.length) {
            return '<h3 style="margin:0;color:#ffd76a;font-size:14px;">Preset Library</h3><div style="color:#f99;">Active tactical registry ещё не готов.</div>';
        }

        const groups = this.getGroups().map(group => {
            const groupNames = names
                .filter(name => meta[name]?.group === group.id)
                .sort((a, b) => Number(meta[b]?.rank || 0) - Number(meta[a]?.rank || 0) || a.localeCompare(b));
            if (!groupNames.length) return '';
            return `
                <div style="margin-bottom:12px;">
                    <h4 style="margin:9px 0 3px;color:#ffd76a;font-size:13px;text-transform:uppercase;">${this.escapeHtml(group.title)}</h4>
                    <div style="color:#aaa;margin-bottom:7px;font-size:11px;line-height:1.3;">${this.escapeHtml(group.desc)}</div>
                    ${groupNames.map(name => this.renderPresetCard(name, meta[name], !!presets[name])).join('')}
                </div>`;
        }).join('');
        const importedCount = names.filter(name => presets[name]).length;
        return `
            <h3 style="margin:0 0 8px;color:#fff;font-size:14px;font-variant:small-caps;letter-spacing:.3px;">Preset Library</h3>
            <div style="margin-bottom:9px;padding:7px 8px;background:#181818;border:1px solid #444;border-radius:6px;color:#ddd;line-height:1.35;font-size:11px;">
                Tactical Suite: <b>${this.escapeHtml(registry?.suiteVersion || 'loading')}</b><br>
                В dropdown: <b style="color:#7cff7c;">${importedCount}</b> из <b>${names.length}</b> active presets.
            </div>${groups}`;
    },

    ensureLayout(tacticWrap) {
        let layout = document.getElementById(this.layoutId);
        if (layout) return layout;
        layout = document.createElement('div');
        layout.id = this.layoutId;
        layout.style.cssText = 'display:flex;align-items:flex-start;gap:12px;width:max-content;max-width:none;';
        tacticWrap.parentNode.insertBefore(layout, tacticWrap);
        layout.appendChild(tacticWrap);
        return layout;
    },

    getLiveLabels() {
        const registry = this.getRegistry();
        if (registry?.labels) return registry.labels;
        return typeof PresetStorage !== 'undefined' && PresetStorage.getAllLabels ? PresetStorage.getAllLabels() : {};
    },

    getLivePresetLabel(name) {
        const labels = this.getLiveLabels();
        return String(labels[name] || name);
    },

    getLiveRecommendedPreset() {
        const recommendation = document.getElementById('slf-parser-recommendation');
        const text = String(recommendation?.textContent || '');
        if (!text) return '';
        const labels = this.getLiveLabels();
        return this.getLivePresetOrder().find(name => text.includes(name) || (labels[name] && text.includes(String(labels[name])))) || '';
    },

    buildLivePresetOptions(select) {
        if (!select) return;
        const order = this.getLivePresetOrder();
        if (!order.length) return;
        const recommended = this.getLiveRecommendedPreset();
        const current = select.value || this.liveActivePreset;
        const labels = this.getLiveLabels();
        select.innerHTML = '';
        order.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.dataset.presetId = name;
            option.dataset.recommended = recommended === name ? '1' : '0';
            option.textContent = recommended === name
                ? `★ ${String(labels[name] || name)} — рекомендовано`
                : String(labels[name] || name);
            select.appendChild(option);
        });
        if (Array.from(select.options).some(option => option.value === current)) select.value = current;
        else if (recommended && Array.from(select.options).some(option => option.value === recommended)) select.value = recommended;
        else if (select.options.length) select.value = select.options[0].value;

        const badge = document.getElementById(this.liveRecommendationId);
        if (badge) {
            badge.textContent = recommended ? `★ Coach Mode: ${String(labels[recommended] || recommended)}` : '';
            badge.style.display = recommended ? 'inline-flex' : 'none';
        }
        const panel = document.getElementById(this.livePanelId);
        if (panel) panel.dataset.recommendedPreset = recommended;
    },

    setLiveStatus(text, type = 'info') {
        const status = document.getElementById(this.liveStatusId);
        if (!status) return;
        status.textContent = text;
        status.dataset.type = type;
        status.style.color = type === 'error' ? '#ff9f9f' : type === 'success' ? '#43f58c' : '#aeb6cf';
    },

    dispatchLiveTacticPreset(name) {
        const tacticSelect = document.querySelector('#slf-tactics-dropdown select');
        if (!tacticSelect) return false;
        const tacticOption = Array.from(tacticSelect.options).find(option => String(option.dataset.presetId || option.value) === String(name || ''));
        if (!tacticOption) return false;
        tacticSelect.value = tacticOption.value;
        const event = document.createEvent('Event');
        event.initEvent('change', true, true);
        tacticSelect.dispatchEvent(event);
        return true;
    },

    getPageJQuery() {
        const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        return typeof pageWindow?.jQuery === 'function' ? pageWindow.jQuery : null;
    },

    getLivePlayerPosition(card, pageJQuery) {
        if (!card) return '';
        let position = '';
        if (pageJQuery) {
            try { position = pageJQuery(card).data('position'); } catch (_) {}
        }
        return String(position || card.dataset.position || card.parentElement?.dataset.position || '').toLowerCase();
    },

    updateLivePlayerPosition(card, position, pageJQuery) {
        if (!card) return;
        const normalized = String(position || '').toLowerCase();
        card.dataset.position = normalized;
        let start = String(card.dataset.start || '').toLowerCase();
        if (pageJQuery) {
            try {
                const chip = pageJQuery(card);
                start = String(chip.data('start') || start).toLowerCase();
                chip.data('position', normalized);
            } catch (_) {}
        }
        card.classList.toggle('position_modify', normalized !== start);
    },

    applyLiveFormation(name) {
        const positions = this.getLiveFormationPositions()[name];
        const root = document.querySelector('.control_field_1');
        const pitch = root?.querySelector('.cf1-pitch');
        if (!pitch || !Array.isArray(positions) || positions.length !== 11) return { ok:false, reason:'Поле расстановки или схема пресета недоступны.' };

        const slotMap = new Map(Array.from(pitch.querySelectorAll('.control_line[data-position]')).map(slot => [String(slot.dataset.position || '').toLowerCase(), slot]));
        const targetPositions = positions.map(position => String(position).toLowerCase());
        const uniqueTargets = new Set(targetPositions);
        if (uniqueTargets.size !== 11 || targetPositions.some(position => !slotMap.has(position))) return { ok:false, reason:'На поле отсутствуют квадраты для схемы выбранного пресета.' };

        const players = Array.from(pitch.querySelectorAll('.control_line > .control_lineup'));
        if (players.length !== 11) return { ok:false, reason:'Для перестроения на поле должно находиться ровно 11 игроков.' };
        const pageJQuery = this.getPageJQuery();
        const currentPositions = new Map();
        players.forEach(card => {
            const position = this.getLivePlayerPosition(card, pageJQuery);
            if (position && !currentPositions.has(position)) currentPositions.set(position, card);
        });
        const goalkeeper = currentPositions.get('gk');
        if (!goalkeeper || !uniqueTargets.has('gk')) return { ok:false, reason:'В текущей расстановке не найден вратарь в квадрате GK.' };

        const assignments = new Map([['gk', goalkeeper]]);
        const usedPlayers = new Set([goalkeeper]);
        targetPositions.forEach(position => {
            if (position === 'gk') return;
            const same = currentPositions.get(position);
            if (same && !usedPlayers.has(same)) {
                assignments.set(position, same);
                usedPlayers.add(same);
            }
        });
        const remaining = players.filter(card => !usedPlayers.has(card));
        targetPositions.forEach(position => {
            if (!assignments.has(position) && remaining.length) assignments.set(position, remaining.shift());
        });
        if (assignments.size !== 11 || remaining.length) return { ok:false, reason:'Не удалось однозначно распределить текущих игроков по схеме.' };

        const holder = document.createDocumentFragment();
        players.forEach(card => holder.appendChild(card));
        targetPositions.forEach(position => {
            const card = assignments.get(position);
            slotMap.get(position).appendChild(card);
            this.updateLivePlayerPosition(card, position, pageJQuery);
        });
        const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        if (typeof pageWindow?.cf1_options_load === 'function') {
            try { pageWindow.cf1_options_load(); } catch (_) {}
        }
        return { ok:true, positions:targetPositions.slice() };
    },

    handleLivePresetChange(select) {
        const name = String(select?.value || '');
        if (!name || !this.getLiveFormationPositions()[name]) return;
        select.disabled = true;
        try {
            if (!this.dispatchLiveTacticPreset(name)) {
                this.setLiveStatus('Не удалось найти тактический dropdown SLF. Повторите после полной загрузки матча.', 'error');
                return;
            }
            const result = this.applyLiveFormation(name);
            if (!result.ok) {
                this.setLiveStatus(result.reason, 'error');
                return;
            }
            this.liveActivePreset = name;
            const panel = document.getElementById(this.livePanelId);
            if (panel) panel.dataset.activePreset = name;
            this.setLiveStatus('Тактика отправлена в матч. Расстановка подготовлена — сохраните её штатной кнопкой.', 'success');
        } finally {
            select.disabled = false;
        }
    },

    mountLiveLineup() {
        if (!this.isLiveMatchPage()) return false;
        const root = document.querySelector('.control_field_1');
        if (!root) return false;
        if (!this.getRegistry()) return false;

        let panel = document.getElementById(this.livePanelId);
        if (!panel) {
            panel = document.createElement('section');
            panel.id = this.livePanelId;
            panel.style.cssText = 'display:flex;align-items:center;gap:9px;flex-wrap:wrap;width:100%;margin:0 0 10px;padding:9px 10px;box-sizing:border-box;background:var(--fc-soft,#171b29);border:1px solid var(--fc-border,#38415f);border-radius:10px;color:var(--fc-text,#eef1f8);font-family:var(--fm-font,Arial,sans-serif);font-size:12px;';

            const title = document.createElement('strong');
            title.textContent = 'SLF пресет';
            title.style.cssText = 'color:var(--fc-text,#eef1f8);white-space:nowrap;';

            const select = document.createElement('select');
            select.id = this.liveSelectId;
            select.setAttribute('aria-label', 'Пресет тактики и расстановки');
            select.style.cssText = 'flex:1 1 290px;min-width:220px;max-width:520px;padding:7px 9px;border:1px solid var(--fc-border,#38415f);border-radius:8px;background:var(--fc-card,#1c2132);color:var(--fc-text,#eef1f8);';
            select.addEventListener('focus', () => this.buildLivePresetOptions(select));
            select.addEventListener('pointerdown', () => this.buildLivePresetOptions(select));
            select.addEventListener('change', () => this.handleLivePresetChange(select));

            const recommendation = document.createElement('span');
            recommendation.id = this.liveRecommendationId;
            recommendation.style.cssText = 'display:none;align-items:center;padding:3px 8px;border:1px solid rgba(43,217,124,.45);border-radius:999px;color:#43f58c;background:rgba(43,217,124,.10);white-space:nowrap;font-size:10px;';

            const status = document.createElement('span');
            status.id = this.liveStatusId;
            status.textContent = 'Выбор применит тактику сразу, а расстановку оставит на предпросмотре.';
            status.style.cssText = 'flex:1 1 100%;color:#aeb6cf;font-size:10px;line-height:1.3;';

            panel.append(title, select, recommendation, status);
            const anchor = root.querySelector('.system_message') || root.firstElementChild;
            if (anchor) root.insertBefore(panel, anchor); else root.prepend(panel);
        }
        this.buildLivePresetOptions(document.getElementById(this.liveSelectId));
        return true;
    },

    installLiveLineup() {
        if (this.liveInstalled || !this.isLiveMatchPage()) return;
        this.liveInstalled = true;
        const mount = () => this.mountLiveLineup();
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once:true });
        else mount();
        document.addEventListener('click', event => {
            const target = event.target?.closest?.('#slf-manual-recommendation-btn, #control_choice [data-field="1"]');
            if (!target) return;
            this.mountLiveLineup();
            this.buildLivePresetOptions(document.getElementById(this.liveSelectId));
        });
    },

    mount() {
        if (!this.isTacticPage() || !this.getRegistry()) return;
        const tacticWrap = document.querySelector('.ui-tactic__wrap');
        if (!tacticWrap) return;
        const layout = this.ensureLayout(tacticWrap);
        let panel = document.getElementById(this.panelId);
        if (!panel) {
            panel = document.createElement('aside');
            panel.id = this.panelId;
            panel.style.cssText = 'width:430px;max-height:720px;overflow:auto;padding:10px;background:#111;color:#fff;border:1px solid #444;border-radius:6px;box-sizing:border-box;font-family:Arial,sans-serif;font-size:12px;';
            layout.appendChild(panel);
        }
        panel.innerHTML = this.buildHtml();
    }
};

// The registry is defined later in the synchronous bundle. Defer mounting one
// microtask so initial live options also come from that canonical registry.
Promise.resolve().then(() => TacticPresetLibraryPanel.installLiveLineup());

// ============================================================