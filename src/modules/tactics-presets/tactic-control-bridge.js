// Tactic Control Bridge
// Extracted verbatim from tactic-control-engine.js (stage 4 refactor).

    (function installTacticControlBridge() {
        const controlKeys = [
            'def_line', 'press_line', 'def_width', 'press_intense',
            'build_type', 'build_temp', 'build_long', 'build_fast',
            'style', 'pass_risk', 'dribble', 'cross',
            'corner', 'shot', 'priority'
        ];

        // FM2026 controls: authored in Tactical Lab native-domain contract and
        // checked against the actual page DOM before the first mutation.
        const nativeDomains = Object.freeze({
            def_line:['1','2','3'], press_line:['1','2','3'], def_width:['1','2','3'],
            press_intense:['1','2','3','4','5'],
            build_type:['1','2','3'], build_temp:['1','2','3'],
            build_long:['1','2','3'], build_fast:['1','2','3'],
            style:['1','2','3','4','5'], pass_risk:['1','2','3','4','5'],
            dribble:['1','2','3','4','5'], cross:['1','2','3'],
            corner:['1','2'], shot:['1','2','3']
        });
        const priorityInputName = { left:'priority_l', center:'priority_c', right:'priority_r' };
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
                const normalized = normalizePresets({ current:tactic }).current || tactic;
                if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
                    return { ok:false, reason:'invalid_tactic', failures:['tactic'], mismatches:[], rolledBack:false };
                }
                if (STATE.tacticControlBridgeApplyInProgress) {
                    return { ok:false, reason:'apply_in_progress', failures:['reentrancy'], mismatches:[], rolledBack:false };
                }
                const strict = options.strict === true;
                const source = String(options.source || 'direct_tactic');
                const requested = controlKeys.filter(key => Object.prototype.hasOwnProperty.call(normalized, key));
                const initial = getCurrentTactic();
                const requestedPriorities = normalizePriority(normalized.priority);
                const initialPriorities = normalizePriority(initial?.priority);
                const failures = [];

                // All-or-nothing preflight. An unsupported ordinal or unavailable
                // DOM input rejects *before* even one radio/checkbox is clicked.
                for (const key of requested) {
                    if (key === 'priority') {
                        const invalid = requestedPriorities.filter(value => !priorityInputName[value]);
                        if (invalid.length) failures.push('priority_invalid');
                        const needed = new Set([...requestedPriorities, ...initialPriorities]);
                        for (const value of needed) {
                            if (!document.querySelector(`input[type="checkbox"][name="${priorityInputName[value]}"]`))
                                failures.push('priority_' + value);
                        }
                    } else {
                        const value = String(normalized[key] ?? '');
                        if (!nativeDomains[key]?.includes(value)) failures.push(key + ':out_of_domain');
                        else if (!document.querySelector(`input[name="${key}"][value="${value}"]`))
                            failures.push(key + ':missing_dom_input');
                        // A rollback also needs the original option to be present.
                        const originalValue = String(initial?.[key] ?? '');
                        if (!nativeDomains[key]?.includes(originalValue)
                            || !document.querySelector(`input[name="${key}"][value="${originalValue}"]`))
                            failures.push(key + ':rollback_unavailable');
                    }
                }
                if (failures.length) {
                    return { ok:false, reason:'preflight_failed', strict, source,
                        failures, mismatches:[], rolledBack:false, tactic:initial };
                }

                STATE.tacticControlBridgeApplyInProgress = true;
                STATE.suppressManualWatcherUntil = Date.now() + 2500;
                STATE.suppressManualWatcherReason = source;
                try {
                    for (const key of requested) {
                        const applied = await setControlAsync(key, normalized[key]);
                        if (!applied) { failures.push(key); break; }
                    }
                    let current = getCurrentTactic();
                    const mismatches = requested.filter(key => !valuesEqual(key, normalized[key], current?.[key]));
                    if (failures.length || mismatches.length) {
                        // A native event handler may reject a control after the
                        // preflight. Restore the full original vector and verify.
                        const rollbackFailures = [];
                        for (const key of controlKeys) {
                            if (!Object.prototype.hasOwnProperty.call(initial, key)) continue;
                            try {
                                if (!(await setControlAsync(key, initial[key]))) rollbackFailures.push(key);
                            } catch (_) { rollbackFailures.push(key); }
                        }
                        current = getCurrentTactic();
                        const rollbackMismatches = controlKeys.filter(key =>
                            Object.prototype.hasOwnProperty.call(initial, key)
                            && !valuesEqual(key, initial[key], current?.[key]));
                        const rolledBack = !rollbackFailures.length && !rollbackMismatches.length;
                        STATE.lastManualTactic = current;
                        return { ok:false, strict, source, reason:rolledBack?'post_apply_rolled_back':'rollback_unverified',
                            failures, mismatches, rollbackFailures, rollbackMismatches, rolledBack,
                            applicationStatus:rolledBack?'apply_failed_rolled_back':'apply_failed_unverified',
                            tactic:current };
                    }
                    STATE.lastManualTactic = current;
                    return { ok:true, strict, source, failures:[], mismatches:[],
                        rolledBack:false, applicationStatus:'ui_readback_confirmed',
                        verification:'native_control_dom_readback_only', tactic:current };
                } catch (error) {
                    // Exceptions are failures, never successful partial applies.
                    const rollbackFailures = [];
                    for (const key of controlKeys) {
                        if (!Object.prototype.hasOwnProperty.call(initial, key)) continue;
                        try {
                            if (!(await setControlAsync(key, initial[key]))) rollbackFailures.push(key);
                        } catch (_) { rollbackFailures.push(key); }
                    }
                    const current = getCurrentTactic();
                    STATE.lastManualTactic = current;
                    const rolledBack = !rollbackFailures.length
                        && controlKeys.every(key => !Object.prototype.hasOwnProperty.call(initial, key)
                            || valuesEqual(key, initial[key], current?.[key]));
                    return { ok:false, strict, source, reason:rolledBack?'exception_rolled_back':'rollback_unverified',
                        failures:['native_handler_exception'], mismatches:[], rollbackFailures,
                        rolledBack, applicationStatus:rolledBack?'apply_failed_rolled_back':'apply_failed_unverified',
                        tactic:current };
                } finally {
                    STATE.tacticControlBridgeApplyInProgress = false;
                    STATE.suppressManualWatcherUntil = Date.now() + 800;
                    STATE.suppressManualWatcherReason = source;
                }
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

            inspectFixedLineup(profile = window.SLFActivePresetRegistry?.fixedLineupProfile) {
                const actual = this.readFormation();
                if (!profile?.formationVariants || actual.length !== 11) {
                    return { ok:false, available:actual.length === 11, variant:null, reason:'fixed_lineup_unavailable' };
                }
                for (const [wing, positions] of Object.entries(profile.formationVariants)) {
                    const expected = positions.map(value => String(value).toLowerCase()).sort();
                    if (expected.length === 11 && JSON.stringify(expected) === JSON.stringify(actual)) {
                        return { ok:true, available:true, variant:wing, positions:actual.slice() };
                    }
                }
                return { ok:false, available:true, variant:null, reason:'lineup_differs_from_fixed_profile', positions:actual.slice() };
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
