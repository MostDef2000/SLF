// 9.8 Tactic Preset Library
// ============================================================

const TacticPresetLibrary = {
    resolvePresetId(name) {
        const registry = typeof window !== 'undefined' ? window.SLFActivePresetRegistry : null;
        return registry?.resolvePresetId?.(name) || name;
    },

    // v10 preset metadata retired: the active preset registry installs the
    // canonical v11 meta/traits/schemeStates/presetSchemeState at load time
    // (see active-preset-registry.js and tactic-preset-direction-policy.js).
    // Containers stay present (edge paths iterate them) but start empty.
    meta: {},

    schemeStates: {},

    presetSchemeState: {},

    traits: {},

    getSchemeForPreset(name) {
        name = this.resolvePresetId(name);
        const state = this.presetSchemeState[name] || 'base_balance';
        return this.schemeStates[state] || this.schemeStates.base_balance;
    },

    getTraits(name) {
        name = this.resolvePresetId(name);
        return this.traits?.[name] || null;
    },

    makeSchemeHint(name) {
        name = this.resolvePresetId(name);
        const scheme = this.getSchemeForPreset(name);
        const title = this.meta[name]?.title || name || '';
        return scheme ? `Схема для ${title}: ${scheme}.` : '';
    },

    makeHint(name, reason) {
        return this.makeRoleHint('Рекомендуемый', name, reason);
    },

    makeRoleHint(role, name, reason) {
        name = this.resolvePresetId(name);
        const meta = this.meta[name];
        const label = meta?.title || name;

        if (!meta) {
            return [
                `${role}: ${name}.`,
                `Действие: поставь ${name}.`,
                reason ? `Причина: ${reason}.` : ''
            ].filter(Boolean).join(' ');
        }

        return [
            `${role}: ${label}.`,
            reason ? `Причина: ${reason}.` : '',
            `Идея: ${meta.idea}.`,
            `Риск: ${meta.risk}.`
        ].filter(Boolean).join(' ');
    },

    makeRoleNameHint(role, name) {
        name = this.resolvePresetId(name);
        const meta = this.meta[name];
        const label = meta?.title || name;
        return `${role}: ${label}.`;
    },

    getGroup(name) {
        name = this.resolvePresetId(name);
        return this.meta[name]?.group || 'custom';
    },

    getRank(name) {
        name = this.resolvePresetId(name);
        return Number(this.meta[name]?.rank || 0);
    },

    getShortDescription(name) {
        name = this.resolvePresetId(name);
        const meta = this.meta[name];

        if (!meta) return '';

        return `${meta.title}: ${meta.idea}. Использовать: ${meta.use}. Риск: ${meta.risk}.`;
    }
};

// ============================================================
