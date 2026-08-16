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

    (function installTacticControlBridge() {
        const controlKeys = [
            'def_line', 'press_line', 'def_width', 'press_intense',
            'build_type', 'build_temp', 'build_long', 'build_fast',
            'style', 'pass_risk', 'dribble', 'cross',
            'corner', 'shot', 'priority'
        ];

        const normalizePriority = value => (Array.isArray(value) ? value : value ? [value] : [])
            .map(item => String(item))
            .sort();
        const valuesEqual = (key, expected, actual) => key === 'priority'
            ? JSON.stringify(normalizePriority(expected)) === JSON.stringify(normalizePriority(actual))
            : String(expected ?? '') === String(actual ?? '');
        const pageJQuery = () => {
            const candidate = document.defaultView?.jQuery;
            return typeof candidate === 'function' ? candidate : null;
        };
        const readPlayerPosition = (card, jq) => {
            if (!card) return '';
            let position = '';
            if (jq) {
                try { position = jq(card).data('position'); } catch (_) {}
            }
            return String(position || card.dataset.position || card.parentElement?.dataset.position || '').toLowerCase();
        };
        const updatePlayerPosition = (card, position, jq) => {
            if (!card) return;
            const normalized = String(position || '').toLowerCase();
            card.dataset.position = normalized;
            let start = String(card.dataset.start || '').toLowerCase();
            if (jq) {
                try {
                    const chip = jq(card);
                    start = String(chip.data('start') || start).toLowerCase();
                    chip.data('position', normalized);
                } catch (_) {}
            }
            card.classList.toggle('position_modify', normalized !== start);
        };
        const validateFormation = positions => {
            const root = document.querySelector('.control_field_1');
            const pitch = root?.querySelector('.cf1-pitch');
            if (!pitch || !Array.isArray(positions) || positions.length !== 11) {
                return { ok:false, reason:'Поле расстановки или схема недоступны.' };
            }
            const targetPositions = positions.map(position => String(position || '').toLowerCase());
            const uniqueTargets = new Set(targetPositions);
            const slotMap = new Map(Array.from(pitch.querySelectorAll('.control_line[data-position]'))
                .map(slot => [String(slot.dataset.position || '').toLowerCase(), slot]));
            if (uniqueTargets.size !== 11 || targetPositions.some(position => !slotMap.has(position))) {
                return { ok:false, reason:'На поле отсутствуют квадраты для экспериментальной схемы.' };
            }
            const players = Array.from(pitch.querySelectorAll('.control_line > .control_lineup'));
            if (players.length !== 11) return { ok:false, reason:'На поле должно находиться ровно 11 игроков.' };
            const saveButton = root.querySelector('.lineup_send');
            if (!saveButton) return { ok:false, reason:'Штатная кнопка сохранения расстановки недоступна.' };
            return { ok:true, targetPositions, root, pitch, slotMap, players, saveButton };
        };

        STATE.tacticControlBridge = {
            schema: 'slf_tactic_control_bridge_v1',
            allowedKeys: controlKeys.slice(),

            async applyTacticObject(tactic, options = {}) {
                const normalized = normalizePresets({ current: tactic }).current || tactic;
                if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
                    return { ok:false, reason:'invalid_tactic', failures:['tactic'], mismatches:[] };
                }
                const strict = options.strict === true;
                const source = String(options.source || 'direct_tactic');
                const failures = [];
                STATE.suppressManualWatcherUntil = Date.now() + 2500;
                STATE.suppressManualWatcherReason = source;

                for (const key of controlKeys) {
                    if (!Object.prototype.hasOwnProperty.call(normalized, key)) continue;
                    const applied = await setControlAsync(key, normalized[key]);
                    if (!applied) failures.push(key);
                }

                const current = getCurrentTactic();
                const mismatches = controlKeys.filter(key =>
                    Object.prototype.hasOwnProperty.call(normalized, key)
                    && !valuesEqual(key, normalized[key], current?.[key])
                );
                STATE.lastManualTactic = current;
                STATE.suppressManualWatcherUntil = Date.now() + 800;
                STATE.suppressManualWatcherReason = source;

                return {
                    ok: strict ? failures.length === 0 && mismatches.length === 0 : true,
                    strict,
                    failures,
                    mismatches,
                    tactic: current
                };
            },

            validateFormation(positions) {
                const result = validateFormation(positions);
                return result.ok
                    ? { ok:true, positions:result.targetPositions.slice(), saveAvailable:true }
                    : { ok:false, reason:result.reason, saveAvailable:false };
            },

            applyFormation(positions) {
                const validation = validateFormation(positions);
                if (!validation.ok) return { ok:false, reason:validation.reason };
                const { targetPositions, slotMap, players } = validation;
                const jq = pageJQuery();
                const currentPositions = new Map();
                players.forEach(card => {
                    const position = readPlayerPosition(card, jq);
                    if (position && !currentPositions.has(position)) currentPositions.set(position, card);
                });
                const goalkeeper = currentPositions.get('gk');
                if (!goalkeeper || !targetPositions.includes('gk')) {
                    return { ok:false, reason:'В текущей расстановке не найден вратарь в GK.' };
                }

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
                if (assignments.size !== 11 || remaining.length) {
                    return { ok:false, reason:'Не удалось однозначно распределить 11 игроков по схеме.' };
                }

                const holder = document.createDocumentFragment();
                players.forEach(card => holder.appendChild(card));
                targetPositions.forEach(position => {
                    const card = assignments.get(position);
                    slotMap.get(position).appendChild(card);
                    updatePlayerPosition(card, position, jq);
                });
                const preview = document.defaultView?.cf1_options_load;
                if (typeof preview === 'function') {
                    try { preview(); } catch (_) {}
                }
                return { ok:true, positions:targetPositions.slice() };
            },

            readFormation() {
                const pitch = document.querySelector('.control_field_1 .cf1-pitch');
                if (!pitch) return [];
                const jq = pageJQuery();
                return Array.from(pitch.querySelectorAll('.control_line > .control_lineup'))
                    .map(card => readPlayerPosition(card, jq))
                    .filter(Boolean)
                    .sort();
            },

            formationMatches(positions) {
                const expected = (Array.isArray(positions) ? positions : []).map(String).map(x => x.toLowerCase()).sort();
                const actual = this.readFormation();
                return expected.length === 11 && actual.length === 11 && JSON.stringify(expected) === JSON.stringify(actual);
            },

            saveLiveLineup() {
                const button = document.querySelector('.control_field_1 .lineup_send');
                if (!button) return { ok:false, reason:'Штатная кнопка сохранения расстановки недоступна.' };
                nativeClick(button);
                return { ok:true };
            }
        };
    })();

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

        const applied = await STATE.tacticControlBridge.applyTacticObject(preset, {
            source: `preset:${name}`,
            strict: false
        });
        if (!applied.ok) return false;

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
        return true;
    }

    // ============================================================