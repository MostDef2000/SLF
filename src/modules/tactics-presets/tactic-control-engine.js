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
        // Allow an old persisted v10 selection without reintroducing the old
        // ID into active preset controls or recording it as a new source ID.
        name = PresetStorage.resolvePresetId?.(name) || name;
        const presets = PresetStorage.getAllPresets();
        const preset = presets[name];

        if (!preset || typeof preset !== 'object') {
            debugWarn('[SLF] Пресет не найден:', name);
            return false;
        }

        const beforeSnapshot = location.pathname.includes('/game.php')
            ? SnapshotEngine.build()
            : null;

        if (location.pathname.includes('/game.php') && STATE.tacticalLabRuntime?.isActive?.()) {
            try {
                await STATE.tacticalLabRuntime.closeActive('user_selected_production', beforeSnapshot, {
                    nextPresetId: name,
                    nextTacticSource: 'production'
                });
            } catch (error) {
                debugWarn('[SLF] Tactical Lab exit telemetry failed before production preset', error);
            }
        }

        const formationBefore = STATE.tacticControlBridge.inspectFixedLineup?.() || null;
        if (formationBefore?.available && !formationBefore.ok) {
            debugWarn('[SLF v11] Расстановка отличается от постоянной CD1/CD3 RW/RM; режим не перемещает игроков.');
        }

        const applied = await STATE.tacticControlBridge.applyTacticObject(preset, {
            source: `preset:${name}`,
            strict: true
        });
        // A successful click sequence is not enough: the local controls must
        // match the requested vector before recording a UI-verified apply.
        // No server/game acknowledgment is exposed here; telemetry retains
        // that distinction and does not claim game-level confirmation.
        if (!applied.ok || applied.failures?.length || applied.mismatches?.length) {
            STATE.lastTacticApplyFailure = {
                source:'preset_apply', presetId:name, reason:applied.reason || 'control_mismatch',
                failures:applied.failures || [], mismatches:applied.mismatches || [],
                rolledBack:applied.rolledBack === true, ts:Date.now()
            };
            debugWarn('[SLF] Не подтверждена установка тактики в интерфейсе:', name, applied.failures, applied.mismatches);
            return false;
        }

        const formationAfter = STATE.tacticControlBridge.inspectFixedLineup?.() || null;
        if (formationBefore?.available && formationAfter?.available
            && JSON.stringify(formationBefore.positions) !== JSON.stringify(formationAfter.positions)) {
            STATE.lastTacticApplyFailure = {
                source:'preset_apply', presetId:name,
                reason:'unexpected_lineup_mutation', ts:Date.now()
            };
            debugWarn('[SLF v11] Нативная страница неожиданно изменила позиции игроков:', name);
            return false;
        }

        const labels = PresetStorage.getAllLabels ? PresetStorage.getAllLabels() : {};
        const presetLabel = labels[name] || TacticPresetLibrary?.meta?.[name]?.title || name;

        if (location.pathname.includes('/game.php') && beforeSnapshot?.myTeam) {
            EventTracker.savePresetEvent(name, preset, beforeSnapshot, applied.tactic);
        } else {
            PresetUsageTracker.record(name, {
                gameId: MatchStateParser.getGameId(),
                minute: beforeSnapshot?.minute ?? null,
                bucket: beforeSnapshot?.bucket || '',
                source: 'preset_apply'
            });
        }

        UI.addParserLog(`Пресет выбран: ${presetLabel}`);
        return true;
    }

