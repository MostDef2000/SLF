    // 4. Tactic Control Engine
    // ============================================================

    function nativeClick(element) {
        if (!element) return;

        try {
            element.click();
            return;
        } catch (e) {}

        const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;
        const eventInit = { bubbles: true, cancelable: true };

        if (rect) {
            eventInit.clientX = rect.left + rect.width / 2;
            eventInit.clientY = rect.top + rect.height / 2;
        }

        element.dispatchEvent(new MouseEvent('click', eventInit));
    }

    function priorityNameToValue(name) {
        if (name === 'priority_l') return 'left';
        if (name === 'priority_c') return 'center';
        if (name === 'priority_r') return 'right';
        return '';
    }

    async function setPriorityAsync(value) {
        const values = Array.isArray(value) ? value : [value];
        const allCB = document.querySelectorAll('input[type="checkbox"][name^="priority_"]');

        for (let cb of allCB) {
            const priorityValue = priorityNameToValue(cb.name);
            const shouldBeChecked = values.includes(priorityValue);

            if (cb.checked !== shouldBeChecked) {
                const label = cb.closest('label');
                if (label) nativeClick(label);
                else nativeClick(cb);

                await new Promise(r => setTimeout(r, 80));
            }
        }

        return true;
    }

    async function setControlAsync(key, value) {
        return new Promise(resolve => {
            setTimeout(async () => {
                if (key === 'priority') {
                    resolve(await setPriorityAsync(value));
                    return;
                }

                const el = document.querySelector(`input[name="${key}"][value="${value}"]`);

                if (!el) {
                    debugWarn('[SLF] Не найден элемент:', key, value);
                    resolve(false);
                    return;
                }

                if (!el.checked) {
                    const label = el.closest('label');
                    if (label) nativeClick(label);
                    else nativeClick(el);
                }

                resolve(true);
            }, 20);
        });
    }

    function getCurrentTactic() {
        const groups = {};

        document.querySelectorAll('input[type="radio"][name]:checked').forEach(el => {
            groups[el.name] = el.value;
        });

        document.querySelectorAll('input[type="checkbox"][name]:checked').forEach(el => {
            if (el.name.startsWith('priority_')) return;
            groups[el.name] = el.value;
        });

        const priorities = [];

        document.querySelectorAll('input[type="checkbox"][name^="priority_"]:checked').forEach(el => {
            const value = priorityNameToValue(el.name);
            if (value) priorities.push(value);
        });

        groups.priority = priorities;

        return normalizePresets({ current: groups }).current || groups;
    }

    async function applyPresetAsync(name) {
        const presets = PresetStorage.getAllPresets();
        const preset = presets[name];

        if (!preset || typeof preset !== 'object') {
            debugWarn('[SLF] Пресет не найден:', name);
            return false;
        }

        const beforeSnapshot = location.pathname.includes('/game.php')
            ? SnapshotEngine.build()
            : null;

        STATE.suppressManualWatcherUntil = Date.now() + 2500;
        STATE.suppressManualWatcherReason = `preset:${name}`;

        const allowedKeys = [
            'def_line', 'press_line', 'def_width', 'press_intense',
            'build_type', 'build_temp', 'build_long', 'build_fast',
            'style', 'pass_risk', 'dribble', 'cross',
            'corner', 'shot', 'priority'
        ];

        for (let key of allowedKeys) {
            if (!Object.prototype.hasOwnProperty.call(preset, key)) continue;
            await setControlAsync(key, preset[key]);
        }

        const labels = PresetStorage.getAllLabels ? PresetStorage.getAllLabels() : {};
        const presetLabel = labels[name] || TacticPresetLibrary?.meta?.[name]?.title || name;

        if (location.pathname.includes('/game.php') && beforeSnapshot?.myTeam) {
            EventTracker.savePresetEvent(name, preset, beforeSnapshot);
        } else {
            PresetUsageTracker.record(name, {
                gameId: MatchStateParser.getGameId(),
                minute: beforeSnapshot?.minute ?? null,
                bucket: beforeSnapshot?.bucket || '',
                source: 'preset_apply'
            });
        }

        UI.addParserLog(`Пресет выбран: ${presetLabel}`);

        STATE.lastManualTactic = getCurrentTactic();
        STATE.suppressManualWatcherUntil = Date.now() + 800;
        STATE.suppressManualWatcherReason = `preset:${name}`;

        return true;
    }

    // ============================================================
