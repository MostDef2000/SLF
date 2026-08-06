// Tactic Preset Library Panel
// ============================================================

const TacticPresetLibraryPanel = {
    panelId: 'slf-tactic-preset-library-panel',
    layoutId: 'slf-tactic-preset-layout',
    livePanelId: 'slf-live-lineup-preset-panel',
    liveSelectId: 'slf-live-lineup-preset-select',
    liveStatusId: 'slf-live-lineup-preset-status',
    liveRecommendationId: 'slf-live-lineup-preset-recommendation',
    liveInstalled: false,
    liveActivePreset: '',
    livePresetOrder: [
        'Arteta_Control433_bal3',
        'Pep_BoxControl_bal2',
        'Pep_PressCooldown_bal2',
        'Compact_Counter_def3',
        'Pep_ControlledPush_att3',
        'Pep_TwoThreeFive_att3',
        'Conte_WingbackWidth_bal4',
        'Klopp_Gegenpress_att4',
        'Simeone_Compact442_def4',
        'Simeone_LowBlock_def5',
        'Bielsa_ChaosPress_att5'
    ],
    liveFormationPositions: {
        Arteta_Control433_bal3: ['gk', 'ld', 'cd1', 'cd3', 'rd', 'cm1', 'dm2', 'cm3', 'lw', 'st2', 'rw'],
        Pep_BoxControl_bal2: ['gk', 'ld', 'cd1', 'cd3', 'rd', 'dm2', 'cm2', 'am1', 'am2', 'st1', 'st2'],
        Pep_PressCooldown_bal2: ['gk', 'ld', 'cd1', 'cd3', 'rd', 'dm2', 'lm', 'cm2', 'cm3', 'rm', 'st2'],
        Compact_Counter_def3: ['gk', 'ld', 'cd1', 'cd3', 'rd', 'lm', 'dm2', 'cm2', 'cm3', 'rm', 'st2'],
        Pep_ControlledPush_att3: ['gk', 'ld', 'cd1', 'cd3', 'rd', 'dm2', 'cm2', 'lw', 'am2', 'rw', 'st2'],
        Pep_TwoThreeFive_att3: ['gk', 'ld', 'cd1', 'cd3', 'rd', 'dm2', 'cm2', 'lw', 'am2', 'rw', 'st2'],
        Conte_WingbackWidth_bal4: ['gk', 'cd1', 'cd2', 'cd3', 'lb', 'dm2', 'cm2', 'rb', 'lw', 'st2', 'rw'],
        Klopp_Gegenpress_att4: ['gk', 'ld', 'cd1', 'cd3', 'rd', 'cm1', 'dm2', 'cm3', 'lw', 'st2', 'rw'],
        Simeone_Compact442_def4: ['gk', 'ld', 'cd1', 'cd3', 'rd', 'lm', 'cm2', 'dm2', 'rm', 'st1', 'st2'],
        Simeone_LowBlock_def5: ['gk', 'lb', 'cd1', 'cd2', 'cd3', 'rb', 'lm', 'dm2', 'cm2', 'rm', 'st2'],
        Bielsa_ChaosPress_att5: ['gk', 'cd1', 'cd2', 'cd3', 'lm', 'dm2', 'rm', 'lw', 'st1', 'st2', 'rw']
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
        return {
            defensive: '#9fd3ff',
            balance: '#ffd76a',
            attack: '#ff9f9f',
            henta: '#c6a6ff'
        };
    },

    getGroups() {
        return [
            {
                id: 'defensive',
                title: 'Defensive / удержание',
                desc: 'Схемы для удержания счёта, снижения риска, компактности и игры против давления.'
            },
            {
                id: 'balance',
                title: 'Balance / контроль',
                desc: 'Схемы для равного матча, контроля центра, снижения брака и аккуратного вскрытия блока.'
            },
            {
                id: 'attack',
                title: 'Attack / давление',
                desc: 'Схемы для усиления давления, дожима, высокого прессинга и спасения матча.'
            },
            {
                id: 'henta',
                title: 'Henta Experimental',
                desc: 'Низкий блок, агрессивные отборы и ловушки через фланги, центр или контру.'
            }
        ];
    },

    renderPresetCard(name, meta, existsInStorage) {
        const groupColors = this.getGroupColors();
        const color = groupColors[meta.group] || '#ddd';
        const statusText = existsInStorage
            ? 'есть в dropdown'
            : 'описание есть, пресет не импортирован';
        const statusColor = existsInStorage ? '#7cff7c' : '#ffb86c';

        return `
            <div style="
                background:#181818;
                border:1px solid #444;
                border-left:4px solid ${color};
                border-radius:6px;
                padding:8px 9px;
                margin:7px 0;
            ">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                    <div style="min-width:0;">
                        <div style="font-weight:bold;color:${color};font-size:13px;line-height:1.25;word-break:break-word;">
                            ${this.escapeHtml(name)}
                        </div>
                        <div style="font-size:10px;color:#aaa;margin-top:2px;line-height:1.3;">
                            ${this.escapeHtml(meta.title || '')}
                            · group: ${this.escapeHtml(meta.group || '')}
                            · rank: ${this.escapeHtml(meta.rank ?? '')}
                        </div>
                    </div>
                    <div style="font-size:10px;color:${statusColor};border:1px solid ${statusColor};border-radius:10px;padding:1px 6px;white-space:nowrap;">
                        ${this.escapeHtml(statusText)}
                    </div>
                </div>

                <div style="margin-top:7px;line-height:1.35;font-size:11px;">
                    <div><b style="color:#ddd;">Идея:</b> ${this.escapeHtml(meta.idea || '')}</div>
                    <div style="margin-top:3px;"><b style="color:#ddd;">Использовать:</b> ${this.escapeHtml(meta.use || '')}</div>
                    <div style="margin-top:3px;"><b style="color:#ddd;">Риск:</b> ${this.escapeHtml(meta.risk || '')}</div>
                </div>
            </div>
        `;
    },

    buildHtml() {
        const meta =
            typeof TacticPresetLibrary !== 'undefined' && TacticPresetLibrary.meta
                ? TacticPresetLibrary.meta
                : {};

        const presets =
            typeof PresetStorage !== 'undefined' && PresetStorage.getAllPresets
                ? PresetStorage.getAllPresets()
                : {};

        const names = Object.keys(meta);

        if (!names.length) {
            return `
                <h3 style="margin:0 0 8px 0;color:#ffd76a;font-size:14px;">Preset Library</h3>
                <div style="color:#f99;">TacticPresetLibrary пустой или не найден.</div>
            `;
        }

        const groupHtml = this.getGroups().map(group => {
            const groupNames = names
                .filter(name => meta[name].group === group.id)
                .sort((a, b) => {
                    const ra = Number(meta[a].rank || 0);
                    const rb = Number(meta[b].rank || 0);
                    return rb - ra || a.localeCompare(b);
                });

            if (!groupNames.length) return '';

            const cards = groupNames
                .map(name => this.renderPresetCard(name, meta[name], !!presets[name]))
                .join('');

            return `
                <div style="margin-bottom:12px;">
                    <h4 style="margin:9px 0 3px 0;color:#ffd76a;font-size:13px;text-transform:uppercase;">
                        ${this.escapeHtml(group.title)}
                    </h4>
                    <div style="color:#aaa;margin-bottom:7px;font-size:11px;line-height:1.3;">
                        ${this.escapeHtml(group.desc)}
                    </div>
                    ${cards}
                </div>
            `;
        }).join('');

        const importedCount = names.filter(name => presets[name]).length;

        return `
            <h3 style="margin:0 0 8px 0;color:#fff;font-size:14px;font-variant:small-caps;letter-spacing:.3px;">
                Preset Library
            </h3>
            <div style="
                margin-bottom:9px;
                padding:7px 8px;
                background:#181818;
                border:1px solid #444;
                border-radius:6px;
                color:#ddd;
                line-height:1.35;
                font-size:11px;
            ">
                Справочник авторских схем: что означает пресет, когда его использовать и какой риск.
                <br>
                Импортировано в dropdown: <b style="color:#7cff7c;">${this.escapeHtml(importedCount)}</b> из <b>${this.escapeHtml(names.length)}</b>.
            </div>
            ${groupHtml}
        `;
    },

    ensureLayout(tacticWrap) {
        let layout = document.getElementById(this.layoutId);
        if (layout) return layout;

        layout = document.createElement('div');
        layout.id = this.layoutId;
        layout.style.cssText = `
            display:flex;
            align-items:flex-start;
            gap:12px;
            width:max-content;
            max-width:none;
        `;

        tacticWrap.parentNode.insertBefore(layout, tacticWrap);
        layout.appendChild(tacticWrap);

        return layout;
    },

    getLiveLabels() {
        return typeof PresetStorage !== 'undefined' && PresetStorage.getAllLabels
            ? PresetStorage.getAllLabels()
            : {};
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
        return this.livePresetOrder.find(name => (
            text.includes(name) || (labels[name] && text.includes(String(labels[name])))
        )) || '';
    },

    buildLivePresetOptions(select) {
        if (!select) return;
        const recommended = this.getLiveRecommendedPreset();
        const current = select.value || this.liveActivePreset;
        const labels = this.getLiveLabels();
        select.innerHTML = '';
        this.livePresetOrder.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = recommended === name
                ? `★ ${String(labels[name] || name)} — рекомендовано`
                : String(labels[name] || name);
            option.dataset.recommended = recommended === name ? '1' : '0';
            select.appendChild(option);
        });

        if (Array.from(select.options).some(option => option.value === current)) {
            select.value = current;
        } else if (recommended && Array.from(select.options).some(option => option.value === recommended)) {
            select.value = recommended;
        }

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
        if (!tacticSelect || !Array.from(tacticSelect.options).some(option => option.value === name)) return false;

        tacticSelect.value = name;
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
            try {
                position = pageJQuery(card).data('position');
            } catch (_) {}
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
        const positions = this.liveFormationPositions[name];
        const root = document.querySelector('.control_field_1');
        const pitch = root?.querySelector('.cf1-pitch');
        if (!pitch || !Array.isArray(positions) || positions.length !== 11) {
            return { ok: false, reason: 'Поле расстановки или схема пресета недоступны.' };
        }

        const slotMap = new Map(
            Array.from(pitch.querySelectorAll('.control_line[data-position]'))
                .map(slot => [String(slot.dataset.position || '').toLowerCase(), slot])
        );
        const targetPositions = positions.map(position => String(position).toLowerCase());
        const uniqueTargets = new Set(targetPositions);
        if (uniqueTargets.size !== 11 || targetPositions.some(position => !slotMap.has(position))) {
            return { ok: false, reason: 'На поле отсутствуют квадраты для схемы выбранного пресета.' };
        }

        const players = Array.from(pitch.querySelectorAll('.control_line > .control_lineup'));
        if (players.length !== 11) {
            return { ok: false, reason: 'Для перестроения на поле должно находиться ровно 11 игроков.' };
        }

        const pageJQuery = this.getPageJQuery();
        const currentPositions = new Map();
        players.forEach(card => {
            const position = this.getLivePlayerPosition(card, pageJQuery);
            if (position && !currentPositions.has(position)) currentPositions.set(position, card);
        });

        const goalkeeper = currentPositions.get('gk');
        if (!goalkeeper || !uniqueTargets.has('gk')) {
            return { ok: false, reason: 'В текущей расстановке не найден вратарь в квадрате GK.' };
        }

        const assignments = new Map([['gk', goalkeeper]]);
        const usedPlayers = new Set([goalkeeper]);
        targetPositions.forEach(position => {
            if (position === 'gk') return;
            const samePositionPlayer = currentPositions.get(position);
            if (samePositionPlayer && !usedPlayers.has(samePositionPlayer)) {
                assignments.set(position, samePositionPlayer);
                usedPlayers.add(samePositionPlayer);
            }
        });

        const remainingPlayers = players.filter(card => !usedPlayers.has(card));
        targetPositions.forEach(position => {
            if (assignments.has(position)) return;
            const card = remainingPlayers.shift();
            if (card) assignments.set(position, card);
        });

        if (assignments.size !== 11 || remainingPlayers.length) {
            return { ok: false, reason: 'Не удалось однозначно распределить текущих игроков по схеме.' };
        }

        const holder = document.createDocumentFragment();
        players.forEach(card => holder.appendChild(card));
        targetPositions.forEach(position => {
            const card = assignments.get(position);
            const slot = slotMap.get(position);
            slot.appendChild(card);
            this.updateLivePlayerPosition(card, position, pageJQuery);
        });

        const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        if (typeof pageWindow?.cf1_options_load === 'function') {
            try {
                pageWindow.cf1_options_load();
            } catch (_) {}
        }

        return { ok: true, positions: targetPositions.slice() };
    },

    handleLivePresetChange(select) {
        const name = String(select?.value || '');
        if (!name || !this.liveFormationPositions[name]) return;

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

        let panel = document.getElementById(this.livePanelId);
        if (!panel) {
            panel = document.createElement('section');
            panel.id = this.livePanelId;
            panel.style.cssText = `
                display:flex;
                align-items:center;
                gap:9px;
                flex-wrap:wrap;
                width:100%;
                margin:0 0 10px;
                padding:9px 10px;
                box-sizing:border-box;
                background:var(--fc-soft, #171b29);
                border:1px solid var(--fc-border, #38415f);
                border-radius:10px;
                color:var(--fc-text, #eef1f8);
                font-family:var(--fm-font, Arial, sans-serif);
                font-size:12px;
            `;

            const title = document.createElement('strong');
            title.textContent = 'SLF пресет';
            title.style.cssText = 'color:var(--fc-text, #eef1f8);white-space:nowrap;';

            const select = document.createElement('select');
            select.id = this.liveSelectId;
            select.setAttribute('aria-label', 'Пресет тактики и расстановки');
            select.style.cssText = `
                flex:1 1 290px;
                min-width:220px;
                max-width:520px;
                padding:7px 9px;
                border:1px solid var(--fc-border, #38415f);
                border-radius:8px;
                background:var(--fc-card, #1c2132);
                color:var(--fc-text, #eef1f8);
            `;
            select.addEventListener('focus', () => this.buildLivePresetOptions(select));
            select.addEventListener('pointerdown', () => this.buildLivePresetOptions(select));
            select.addEventListener('change', () => this.handleLivePresetChange(select));

            const recommendation = document.createElement('span');
            recommendation.id = this.liveRecommendationId;
            recommendation.style.cssText = `
                display:none;
                align-items:center;
                padding:3px 8px;
                border:1px solid rgba(43,217,124,.45);
                border-radius:999px;
                color:#43f58c;
                background:rgba(43,217,124,.10);
                white-space:nowrap;
                font-size:10px;
            `;

            const status = document.createElement('span');
            status.id = this.liveStatusId;
            status.textContent = 'Выбор применит тактику сразу, а расстановку оставит на предпросмотре.';
            status.style.cssText = 'flex:1 1 100%;color:#aeb6cf;font-size:10px;line-height:1.3;';

            panel.append(title, select, recommendation, status);
            const anchor = root.querySelector('.system_message') || root.firstElementChild;
            if (anchor) root.insertBefore(panel, anchor);
            else root.prepend(panel);
        }

        const select = document.getElementById(this.liveSelectId);
        this.buildLivePresetOptions(select);
        return true;
    },

    installLiveLineup() {
        if (this.liveInstalled || !this.isLiveMatchPage()) return;
        this.liveInstalled = true;

        const mount = () => this.mountLiveLineup();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', mount, { once: true });
        } else {
            mount();
        }

        document.addEventListener('click', event => {
            const target = event.target?.closest?.('#slf-manual-recommendation-btn, #control_choice [data-field="1"]');
            if (!target) return;
            this.mountLiveLineup();
            const select = document.getElementById(this.liveSelectId);
            this.buildLivePresetOptions(select);
        });
    },

    mount() {
        if (!this.isTacticPage()) return;

        const tacticWrap = document.querySelector('.ui-tactic__wrap');
        if (!tacticWrap) return;

        const layout = this.ensureLayout(tacticWrap);
        let panel = document.getElementById(this.panelId);

        if (!panel) {
            panel = document.createElement('aside');
            panel.id = this.panelId;
            panel.style.cssText = `
                width:430px;
                max-height:720px;
                overflow:auto;
                padding:10px;
                background:#111;
                color:#fff;
                border:1px solid #444;
                border-radius:6px;
                box-sizing:border-box;
                font-family:Arial,sans-serif;
                font-size:12px;
            `;

            layout.appendChild(panel);
        }

        panel.innerHTML = this.buildHtml();
    }
};

TacticPresetLibraryPanel.installLiveLineup();

// ============================================================
