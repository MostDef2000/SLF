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

    // Issue #377: single family predicate for priority control precedence.
    // Legacy checkboxes anywhere on the page make the legacy family the
    // authoritative one for ALL lanes; β toggles decide only on pages with
    // no legacy priority checkbox at all (KB invariant, issue #375).
    function hasLegacyPriorityInputs() {
        return !!document.querySelector('input[type="checkbox"][name^="priority_"]');
    }

    async function setPriorityAsync(value) {
        const values = Array.isArray(value) ? value : [value];
        const allCB = document.querySelectorAll('input[type="checkbox"][name^="priority_"]');

        // β design (issue #375): the new dark design renders wing priorities as
        // multi-select tc-seg toggle buttons (aria-pressed), not checkboxes.
        // [] means "release every lane" — one click per needed state change.
        if (!allCB.length) {
            const buttons = document.querySelectorAll('.tc-seg button[data-option^="priority_"]');
            if (!buttons.length) return false;

            for (const button of buttons) {
                const priorityValue = priorityNameToValue(button.dataset.option);
                if (!priorityValue) continue;
                const shouldBePressed = values.includes(priorityValue);
                const isPressed = button.getAttribute('aria-pressed') === 'true';

                if (isPressed !== shouldBePressed) {
                    nativeClick(button);
                    // The site's bubble handler flips aria-pressed after the
                    // click dispatch settles — settle in a later macrotask
                    // (same lesson as the β radio path).
                    await new Promise(r => setTimeout(r, 80));
                }
            }

            return true;
        }

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

    // β design (tc-seg buttons): resolve a canonical option button without
    // native radios. Radio-group presence on the same key always wins, even
    // when it lacks the requested value.
    function findBetaTacticButton(key, value = null) {
        if (!TACTIC_CONTROL_KEYS.includes(key)) return null;
        if (document.querySelector(`input[type="radio"][name="${key}"]`)) return null;
        const group = document.querySelector(`.tc-seg[data-option="${key}"]`);
        if (!group) return null;
        const buttons = Array.from(group.querySelectorAll('button[data-value]'));
        if (value !== null) {
            return buttons.find(button => button.dataset.value === String(value)) || null;
        }
        const active = buttons.filter(button => button.classList.contains('is-on'));
        return active.length === 1 ? active[0] : null;
    }

    function findTacticControl(key, value) {
        const input = document.querySelector(`input[name="${key}"][value="${value}"]`);
        if (input) return input;
        return findBetaTacticButton(key, value);
    }

    async function setControlAsync(key, value) {
        return new Promise(resolve => {
            setTimeout(async () => {
                if (key === 'priority') {
                    resolve(await setPriorityAsync(value));
                    return;
                }

                const el = findTacticControl(key, value);

                if (!el) {
                    debugWarn('[SLF] Не найден элемент:', key, value);
                    resolve(false);
                    return;
                }

                if (el.matches('.tc-seg button[data-value]')) {
                    if (!el.classList.contains('is-on')) {
                        nativeClick(el);
                        await new Promise(r => setTimeout(r, 20));
                    }
                } else if (!el.checked) {
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

        // β design: canonical button groups are read only for keys that have
        // no native radio value in this page state. No active button (or
        // multiple) yields no fabricated value.
        for (const key of TACTIC_CONTROL_KEYS) {
            if (Object.prototype.hasOwnProperty.call(groups, key)) continue;
            const button = findBetaTacticButton(key);
            if (button) groups[key] = button.dataset.value;
        }

        const priorities = [];

        if (hasLegacyPriorityInputs()) {
            document.querySelectorAll('input[type="checkbox"][name^="priority_"]:checked').forEach(el => {
                const value = priorityNameToValue(el.name);
                if (value) priorities.push(value);
            });
        } else {
            // β design: pressed tc-seg priority toggles stand in for the
            // checkboxes when the old-design inputs are absent.
            document.querySelectorAll('.tc-seg button[data-option^="priority_"][aria-pressed="true"]').forEach(el => {
                const value = priorityNameToValue(el.dataset.option);
                if (value) priorities.push(value);
            });
        }

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

