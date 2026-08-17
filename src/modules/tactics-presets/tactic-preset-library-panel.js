// Tactic Preset Library Panel
// ============================================================
// UI projection of the active tactical registry. No preset identities,
// formations or ordering are owned here.

const TacticPresetLibraryPanel = {
    panelId: 'slf-tactic-preset-library-panel',
    layoutId: 'slf-tactic-preset-layout',

    getRegistry() {
        return typeof window !== 'undefined' ? window.SLFActivePresetRegistry || null : null;
    },

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

// ============================================================