// Tactic Preset Library Panel
// ============================================================

const TacticPresetLibraryPanel = {
    panelId: 'slf-tactic-preset-library-panel',
    layoutId: 'slf-tactic-preset-layout',

    isTacticPage() {
        const params = new URLSearchParams(location.search || '');
        return location.pathname.includes('/team4.php') && params.get('action') === 'tactic';
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

// ============================================================