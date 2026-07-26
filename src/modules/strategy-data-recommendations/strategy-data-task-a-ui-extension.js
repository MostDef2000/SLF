// 10.1 Strategy Data Task A UI extension
// ============================================================

(function strategyDataTaskAExtension() {
    'use strict';

    function getFallbackTargetTeam(snapshot) {
        const teams = Array.isArray(snapshot?.teams) ? snapshot.teams : [];
        if (!teams.length) return null;
        const selector = document.getElementById('slf-foreign-match-target');
        const side = selector?.value || 'home';
        return side === 'away' ? teams[1] : teams[0];
    }

    function normalizeForeignSnapshot(snapshot) {
        if (!snapshot || snapshot.myTeam || !Array.isArray(snapshot.teams) || snapshot.teams.length < 2) return snapshot;
        const targetTeam = getFallbackTargetTeam(snapshot);
        if (!targetTeam) return snapshot;

        snapshot.matchOwnership = 'foreign';
        snapshot.targetSide = Number(snapshot.teams[1]) === Number(targetTeam) ? 'away' : 'home';
        snapshot.myTeam = targetTeam;
        return snapshot;
    }

    function patchSnapshotBuild() {
        if (typeof SnapshotEngine === 'undefined' || SnapshotEngine.__taskAPatchedBuild) return;
        const originalBuild = SnapshotEngine.build;
        SnapshotEngine.build = function patchedTaskABuild() {
            return normalizeForeignSnapshot(originalBuild.apply(this, arguments));
        };
        SnapshotEngine.__taskAPatchedBuild = true;
    }

    function patchHasEnoughLiveData() {
        if (typeof RecommendationEngine === 'undefined' || RecommendationEngine.__taskAPatchedLiveGate) return;
        const originalHasEnoughLiveData = RecommendationEngine.hasEnoughLiveData;
        RecommendationEngine.hasEnoughLiveData = function patchedTaskAHasEnoughLiveData(snapshot) {
            const gate = originalHasEnoughLiveData.apply(this, arguments);
            const minute = this.getEffectiveMinute(snapshot);

            if (gate?.phase === 'collect' && Number.isFinite(minute) && minute >= 10) {
                return { ok: true, phase: 'pre_window' };
            }

            if (gate?.phase === 'collect') {
                return Object.assign({}, gate, {
                    reason: 'Сбор данных до первого pre-window. Первая предварительная рекомендация появится с 10-й минуты, чтобы подготовить смену до 15-й.'
                });
            }

            return gate;
        };
        RecommendationEngine.__taskAPatchedLiveGate = true;
    }

    function getPresetOptionPair(name) {
        if (!name || typeof RecommendationEngine === 'undefined') return { cautious: '', aggressive: '' };

        const group = RecommendationEngine.getPresetGroup(name);
        const ladder = RecommendationEngine.getPresetLadder(group);
        const index = ladder.indexOf(name);
        if (index < 0) return { cautious: '', aggressive: '' };

        if (group === 'defensive') {
            return {
                cautious: ladder[index + 1] || '',
                aggressive: ladder[index - 1] || ''
            };
        }

        return {
            cautious: ladder[index - 1] || '',
            aggressive: ladder[index + 1] || ''
        };
    }

    function appendPresetOptions(plan, name) {
        if (!plan || !Array.isArray(plan.preset) || !name || typeof RecommendationEngine === 'undefined') return;

        const options = getPresetOptionPair(name);
        const rows = [];

        if (options.cautious) rows.push(`Осторожнее: ${RecommendationEngine.getPresetTitle(options.cautious)}.`);
        if (options.aggressive) rows.push(`Агрессивнее: ${RecommendationEngine.getPresetTitle(options.aggressive)}.`);

        rows.forEach(row => {
            if (!plan.preset.includes(row)) plan.preset.push(row);
        });
    }

    function patchPresetOptions() {
        if (typeof RecommendationEngine === 'undefined' || RecommendationEngine.__taskBPatchedPresetOptions) return;
        const originalSelectPreset = RecommendationEngine.selectPreset;
        RecommendationEngine.selectPreset = function patchedTaskBSelectPreset(snapshot, my, opp, playerSignals, plan, state) {
            const selectedName = originalSelectPreset.apply(this, arguments);
            appendPresetOptions(plan, selectedName);
            return selectedName;
        };
        RecommendationEngine.__taskBPatchedPresetOptions = true;
    }

    function patchLateLosingPressCooldownGuard() {
        if (typeof RecommendationEngine === 'undefined' || RecommendationEngine.__lateLosingPressCooldownGuard) return;
        if (typeof RecommendationEngine.selectRawPreset !== 'function') return;

        const original = RecommendationEngine.selectRawPreset;

        RecommendationEngine.selectRawPreset = function(snapshot, state) {
            const candidate = original.apply(this, arguments);

            if (candidate?.name !== 'Pep_PressCooldown_bal2') return candidate;
            if (!state?.pressFatigue?.active) return candidate;

            const score = state.score || this.getScoreState(snapshot);
            const minute = Number(state.minute ?? this.getEffectiveMinute(snapshot));

            if (score?.state !== 'losing' || !Number.isFinite(minute) || minute < 75) {
                return candidate;
            }

            const myBad = Number(state.myBad || 0);
            const finalLosing = minute >= 80;
            const lastApplied = STATE?.presetProgression?.lastAppliedPreset || '';
            const currentIsChaos = lastApplied === 'Bielsa_ChaosPress_att5';

            if (finalLosing && currentIsChaos && myBad < 26) {
                return {
                    name: 'Bielsa_ChaosPress_att5',
                    reason: 'late game override: preserve chaos press'
                };
            }

            if (finalLosing) {
                return {
                    name: myBad >= 24 ? 'Klopp_Gegenpress_att4' : 'Bielsa_ChaosPress_att5',
                    reason: 'final losing state adjustment'
                };
            }

            return {
                name: myBad >= 24 ? 'Pep_ControlledPush_att3' : 'Klopp_Gegenpress_att4',
                reason: 'late losing override'
            };
        };

        RecommendationEngine.__lateLosingPressCooldownGuard = true;
    }

    function finiteNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function statValue(stats, keys) {
        for (const key of keys) {
            const value = finiteNumber(stats?.[key]);
            if (value !== null) return value;
        }
        return null;
    }

    function buildCompactContext(snapshot) {
        const pack = RecommendationEngine.getTeamStats(snapshot);
        const my = pack?.my?.stats || null;
        const opp = pack?.opp?.stats || null;
        const score = RecommendationEngine.getScoreState(snapshot);
        const minute = RecommendationEngine.getEffectiveMinute(snapshot);
        const parts = [];

        if (minute) parts.push(`${minute}'`);
        if (score?.known) parts.push(`${score.myGoals}:${score.oppGoals}`);

        const myXg = statValue(my, ['xG']);
        const oppXg = statValue(opp, ['xG']);
        if (myXg !== null && oppXg !== null) parts.push(`xG ${myXg.toFixed(2)}–${oppXg.toFixed(2)}`);

        const myPower = statValue(my, ['power']);
        const oppPower = statValue(opp, ['power']);
        if (myPower !== null && oppPower !== null) {
            const gap = myPower - oppPower;
            parts.push(`сила ${Math.round(myPower)}–${Math.round(oppPower)} (${gap >= 0 ? '+' : ''}${Math.round(gap)})`);
        }

        const bad = statValue(my, ['badActionsPct', 'defective']);
        if (bad !== null && bad > 0) parts.push(`брак ${Math.round(bad)}%`);

        return parts.join(' · ');
    }

    function pickGeneratorSignals(rows) {
        return (Array.isArray(rows) ? rows : [])
            .map(row => String(row || '').trim())
            .filter(row => row && !row.includes('Детали «подробнее»'))
            .sort((a, b) => {
                const rank = row => row.includes('Каналы генератора') ? 0 : row.startsWith('Генератор:') ? 1 : 2;
                return rank(a) - rank(b);
            })
            .slice(0, 2);
    }

    function canonicalSlot(raw) {
        const slot = String(raw || '').trim().toUpperCase();
        if (slot === 'DL') return 'LD';
        if (slot === 'DR') return 'RD';
        if (slot.startsWith('DC')) return `CD${slot.slice(2)}`;
        return slot;
    }

    function slotProfile(raw) {
        const slot = canonicalSlot(raw);
        if (/^DM\d*$/.test(slot)) return { family: 'central', level: 2 };
        if (/^CM\d*$/.test(slot)) return { family: 'central', level: 3 };
        if (/^AM\d*$/.test(slot)) return { family: 'central', level: 4 };
        if (slot === 'LM') return { family: 'left', level: 3 };
        if (slot === 'LW') return { family: 'left', level: 4 };
        if (slot === 'RM') return { family: 'right', level: 3 };
        if (slot === 'RW') return { family: 'right', level: 4 };
        return null;
    }

    function parseSchemeSlots(scheme) {
        return String(scheme || '')
            .split('/')
            .slice(1)
            .flatMap(group => group.trim().split('-'))
            .map(canonicalSlot)
            .filter(Boolean);
    }

    function getFormationMoves(snapshot, presetName) {
        if (!presetName || typeof RecommendationEngine === 'undefined') return [];
        const teams = Array.isArray(snapshot?.teams) ? snapshot.teams : [];
        const targetSide = Number(teams[0]) === Number(snapshot?.myTeam) ? 'home' : 'away';
        const desired = parseSchemeSlots(RecommendationEngine.getPresetScheme(presetName));
        const desiredSet = new Set(desired);
        const starters = (Array.isArray(snapshot?.lineupRows) ? snapshot.lineupRows : [])
            .filter(row => row?.isStarter && row.side === targetSide)
            .map(row => Object.assign({}, row, { slot: canonicalSlot(row.gridPosition || row.position) }));
        const currentSet = new Set(starters.map(row => row.slot));
        const missing = desired.filter(slot => !currentSet.has(slot));
        const surplus = starters.filter(row => !desiredSet.has(row.slot));
        const moves = [];

        for (const target of missing) {
            const targetProfile = slotProfile(target);
            if (!targetProfile) continue;
            const source = surplus.find(row => {
                if (row.used) return false;
                const sourceProfile = slotProfile(row.slot);
                return sourceProfile?.family === targetProfile.family && Math.abs(sourceProfile.level - targetProfile.level) === 1;
            });
            if (!source) continue;
            source.used = true;
            moves.push({
                playerId: source.playerId,
                side: source.side,
                name: source.name || `Игрок ${source.playerId}`,
                from: source.slot,
                to: target
            });
            if (moves.length >= 2) break;
        }

        return moves;
    }

    function pickAlternative(rows, snapshot) {
        const cautious = rows.find(row => String(row).startsWith('Осторожнее:')) || '';
        const aggressive = rows.find(row => String(row).startsWith('Агрессивнее:')) || '';
        const score = RecommendationEngine.getScoreState(snapshot);
        const selected = score.state === 'winning' ? (cautious || aggressive) : (aggressive || cautious);
        return selected ? `Альтернатива: ${selected.replace(/^[^:]+:\s*/, '')}` : '';
    }

    function buildActionRows(plan, snapshot) {
        const source = Array.isArray(plan?.preset) ? plan.preset : [];
        const rows = [
            source.find(row => String(row).startsWith('Поставить:')),
            source.find(row => String(row).startsWith('Почему:')),
            source.find(row => String(row).startsWith('Что сделать:')),
            pickAlternative(source, snapshot)
        ].filter(Boolean);

        return rows.length ? rows : ['Явной причины менять пресет нет. Сохранить текущую структуру до следующего подтверждённого сигнала.'];
    }

    function resolveRecommendedPresetName(snapshot, primaryPresetName) {
        if (primaryPresetName) return primaryPresetName;
        const progression = STATE?.presetProgression || null;
        if (!progression) return '';
        if (String(progression.gameId || '') !== String(snapshot?.gameId || '')) return '';
        return progression.lastRecommendedPreset || progression.lastAppliedPreset || '';
    }

    function getSchemeAvailability(snapshot, moves) {
        if (!location.pathname.includes('/game.php')) return { canApply: false, label: 'Только в матче' };
        if (!snapshot?.myTeam || snapshot?.matchOwnership === 'foreign') return { canApply: false, label: 'Только свой матч' };
        if (snapshot?.status === 'finished') return { canApply: false, label: 'Матч завершён' };
        if (!moves.length) return { canApply: false, label: 'Уже совпадает' };
        return { canApply: true, label: `Применить схему (${moves.length})` };
    }

    function buildSchemeBlock(snapshot, primaryPresetName) {
        const presetName = resolveRecommendedPresetName(snapshot, primaryPresetName);
        const scheme = presetName ? RecommendationEngine.getPresetScheme(presetName) : '';
        if (!presetName || !scheme) return '';

        const title = RecommendationEngine.getPresetTitle(presetName);
        const moves = getFormationMoves(snapshot, presetName);
        const availability = getSchemeAvailability(snapshot, moves);
        const movesText = moves.length
            ? `Переставить: ${moves.map(move => `${move.name}: ${move.from} → ${move.to}`).join('; ')}.`
            : 'Текущая расстановка уже соответствует рекомендованной схеме.';
        const disabledAttr = availability.canApply ? '' : ' disabled';
        const buttonStyle = availability.canApply
            ? 'background:#3f8f3f;color:#fff;border:1px solid #6c6;cursor:pointer;'
            : 'background:#333;color:#888;border:1px solid #555;cursor:not-allowed;';

        return `
            <div data-slf-rec-section="formation" style="margin:6px 0;background:#151515;border:1px solid #444;border-radius:5px;color:#ddd;padding:9px;">
                <div style="font-weight:bold;color:#8fd3ff;text-align:center;margin-bottom:6px;">Рекомендованная схема</div>
                <div style="line-height:1.4;"><b>${RecommendationEngine.escapeHtml(title)}:</b> ${RecommendationEngine.escapeHtml(scheme)}</div>
                <div style="line-height:1.4;margin-top:4px;">${RecommendationEngine.escapeHtml(movesText)}</div>
                <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
                    <button type="button" data-slf-apply-formation="1" data-slf-preset="${RecommendationEngine.escapeHtml(presetName)}"${disabledAttr} style="padding:6px 11px;border-radius:4px;${buttonStyle}">${RecommendationEngine.escapeHtml(availability.label)}</button>
                    <span data-slf-formation-status style="font-size:11px;color:#aaa;"></span>
                </div>
            </div>`;
    }

    function normalizeUiText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function isVisibleElement(element) {
        if (!element || !element.isConnected) return false;
        const view = document.defaultView;
        const style = view?.getComputedStyle ? view.getComputedStyle(element) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)) return false;
        const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;
        return !rect || (rect.width > 0 && rect.height > 0);
    }

    function asClickable(element) {
        if (!element) return null;
        return element.closest('button,a,[role="button"],label,[onclick],input[type="button"],input[type="submit"]') || element;
    }

    function clickElement(element) {
        const clickable = asClickable(element);
        if (!clickable || !isVisibleElement(clickable)) return false;
        try {
            clickable.click();
            return true;
        } catch (error) {
            console.warn('[SLF formation apply] click failed', error);
            return false;
        }
    }

    function findVisibleTextElement(text, root = document) {
        const expected = normalizeUiText(text);
        const selector = 'button,a,[role="button"],label,[onclick],input[type="button"],input[type="submit"],span,div,td';
        const candidates = [...root.querySelectorAll(selector)]
            .filter(element => !element.closest('#slf-match-parser-panel'))
            .filter(isVisibleElement)
            .filter(element => normalizeUiText(element.value || element.textContent) === expected);
        return candidates.length ? asClickable(candidates[candidates.length - 1]) : null;
    }

    function delay(ms) {
        return new Promise(resolve => document.defaultView.setTimeout(resolve, ms));
    }

    function waitFor(check, timeoutMs = 2500, intervalMs = 100) {
        const startedAt = Date.now();
        return new Promise(resolve => {
            const tick = () => {
                let result = null;
                try {
                    result = check();
                } catch (error) {
                    console.warn('[SLF formation apply] wait check failed', error);
                }

                if (result) {
                    resolve(result);
                    return;
                }

                if (Date.now() - startedAt >= timeoutMs) {
                    resolve(null);
                    return;
                }

                document.defaultView.setTimeout(tick, intervalMs);
            };
            tick();
        });
    }

    function findPlayerTrigger(move) {
        const playerId = String(move?.playerId || '');
        if (!playerId) return null;
        const selectors = [
            `[data-player-id="${playerId}"]`,
            `[onclick*="playerCard(${playerId}"]`,
            `[onclick*="playerCard('${playerId}'"]`,
            `a[href*="player.php"][href*="id=${playerId}"]`,
            `#lineup_player_${playerId}`
        ];

        for (const selector of selectors) {
            const candidates = [...document.querySelectorAll(selector)]
                .filter(element => !element.closest('#slf-match-parser-panel'))
                .filter(isVisibleElement);
            if (candidates.length) {
                const candidate = candidates[candidates.length - 1];
                return asClickable(candidate.querySelector?.('[onclick],a,button,[role="button"]') || candidate);
            }
        }

        const expectedName = normalizeUiText(move.name);
        if (!expectedName) return null;
        const byName = [...document.querySelectorAll('[onclick],a,button,[role="button"],span,div')]
            .filter(element => !element.closest('#slf-match-parser-panel'))
            .filter(isVisibleElement)
            .filter(element => normalizeUiText(element.textContent) === expectedName);
        return byName.length ? asClickable(byName[byName.length - 1]) : null;
    }

    function findPositionTarget(slot) {
        const target = canonicalSlot(slot);
        const selectors = [
            `[data-position="${target}"]`,
            `[data-pos="${target}"]`,
            `[data-role="${target}"]`,
            `[pos="${target}"]`
        ];

        for (const selector of selectors) {
            const candidates = [...document.querySelectorAll(selector)]
                .filter(element => !element.closest('#slf-match-parser-panel'))
                .filter(isVisibleElement);
            if (candidates.length) return asClickable(candidates[candidates.length - 1]);
        }

        return findVisibleTextElement(target);
    }

    function readPlayerSlot(snapshot, playerId) {
        const row = (Array.isArray(snapshot?.lineupRows) ? snapshot.lineupRows : [])
            .find(player => String(player?.playerId || '') === String(playerId || ''));
        return canonicalSlot(row?.gridPosition || row?.position);
    }

    function waitForPlayerSlot(playerId, targetSlot) {
        const expected = canonicalSlot(targetSlot);
        return waitFor(() => {
            const snapshot = SnapshotEngine.build();
            return readPlayerSlot(snapshot, playerId) === expected ? snapshot : null;
        }, 3000, 120);
    }

    async function openFormationTab() {
        const tab = findVisibleTextElement('Расстановка');
        if (!tab) return false;
        if (!clickElement(tab)) return false;
        await delay(180);
        return true;
    }

    async function applyFormationMove(move) {
        const trigger = await waitFor(() => findPlayerTrigger(move), 2500, 100);
        if (!trigger || !clickElement(trigger)) {
            throw new Error(`Не найден игрок ${move.name}.`);
        }

        const changePosition = await waitFor(() => findVisibleTextElement('изменить позицию на поле'), 2500, 100);
        if (!changePosition || !clickElement(changePosition)) {
            throw new Error(`Не открыта смена позиции для ${move.name}.`);
        }

        const target = await waitFor(() => findPositionTarget(move.to), 2500, 100);
        if (!target || !clickElement(target)) {
            throw new Error(`Позиция ${move.to} недоступна для ${move.name}.`);
        }

        await delay(180);
        let verified = await waitForPlayerSlot(move.playerId, move.to);
        if (verified) return verified;

        const save = findVisibleTextElement('Применить') || findVisibleTextElement('Сохранить');
        if (save && clickElement(save)) {
            verified = await waitForPlayerSlot(move.playerId, move.to);
        }

        if (!verified) {
            throw new Error(`Игра не подтвердила ${move.name}: ${move.from} → ${move.to}.`);
        }

        return verified;
    }

    function setFormationStatus(button, text, isError = false) {
        const block = button?.closest('[data-slf-rec-section="formation"]');
        const status = block?.querySelector('[data-slf-formation-status]');
        if (!status) return;
        status.textContent = text;
        status.style.color = isError ? '#ff9090' : '#9f9';
    }

    async function applyRecommendedFormation(button) {
        const presetName = String(button?.dataset?.slfPreset || '');
        if (!presetName || button.disabled) return;

        const initial = SnapshotEngine.build();
        if (!initial || initial.status === 'finished') {
            setFormationStatus(button, 'Матч уже завершён.', true);
            return;
        }
        if (!initial.myTeam || initial.matchOwnership === 'foreign') {
            setFormationStatus(button, 'Применение доступно только в своём матче.', true);
            return;
        }

        const moves = getFormationMoves(initial, presetName);
        if (!moves.length) {
            setFormationStatus(button, 'Схема уже совпадает.');
            button.disabled = true;
            return;
        }

        const scheme = RecommendationEngine.getPresetScheme(presetName);
        const moveSummary = moves.map(move => `${move.name}: ${move.from} → ${move.to}`).join('\n');
        const confirmed = document.defaultView.confirm(`Применить рекомендованную схему?\n\n${scheme}\n\n${moveSummary}`);
        if (!confirmed) return;

        button.disabled = true;
        setFormationStatus(button, 'Открываю расстановку…');

        try {
            const tabOpened = await openFormationTab();
            if (!tabOpened) throw new Error('Не найдена вкладка «Расстановка».');

            for (const move of moves) {
                setFormationStatus(button, `${move.name}: ${move.from} → ${move.to}…`);
                await applyFormationMove(move);
            }

            const refreshed = SnapshotEngine.build();
            const remaining = getFormationMoves(refreshed, presetName);
            if (remaining.length) throw new Error('Часть перестановок не подтверждена игрой.');

            setFormationStatus(button, 'Схема применена.');
            UI.addParserLog(`Схема применена: ${RecommendationEngine.getPresetTitle(presetName)}`);
            RecommendationEngine.update(refreshed);
        } catch (error) {
            console.error('[SLF formation apply failed]', error);
            setFormationStatus(button, String(error?.message || error), true);
            UI.addParserLog(`Ошибка схемы: ${error?.message || error}`);
            button.disabled = false;
        }
    }

    function mountFormationApplyHandler() {
        const panel = document.getElementById('slf-match-parser-panel');
        if (!panel || panel.dataset.slfFormationApplyMounted === '1') return;
        panel.dataset.slfFormationApplyMounted = '1';
        panel.addEventListener('click', event => {
            const button = event.target?.closest?.('[data-slf-apply-formation="1"]');
            if (!button || !panel.contains(button)) return;
            void applyRecommendedFormation(button);
        });
    }

    function patchCompactCoachMode() {
        if (typeof RecommendationEngine === 'undefined' || RecommendationEngine.__compactCoachModePatchedV2) return;

        RecommendationEngine.compactPlan = function compactCoachPlan(plan, snapshot, primaryPresetName = '') {
            const clean = this.normalizePlan(plan);
            const context = buildCompactContext(snapshot);
            const generator = pickGeneratorSignals(clean.developer);
            const actions = buildActionRows(clean, snapshot);
            const signalText = generator.join(' ');
            const actionText = actions.join(' ');
            const mainBlock = `
                <div data-slf-rec-priority="1" data-slf-rec-section="combined" style="margin:5px 0;background:#151515;border:1px solid #444;border-radius:5px;color:#ddd;padding:9px;">
                    <div style="font-weight:bold;color:#75ff75;text-align:center;margin-bottom:7px;">Подсказка</div>
                    ${context ? `<div style="line-height:1.4;"><b style="color:#8fd3ff;">Ситуация:</b> ${this.escapeHtml(context)}</div>` : ''}
                    ${signalText ? `<div style="line-height:1.4;margin-top:5px;"><b style="color:#c8ff7a;">Сигналы:</b> ${this.escapeHtml(signalText)}</div>` : ''}
                    <div style="line-height:1.4;margin-top:5px;"><b style="color:#75ff75;">Действие:</b> ${this.escapeHtml(actionText)}</div>
                </div>`;
            return mainBlock + buildSchemeBlock(snapshot, primaryPresetName);
        };

        RecommendationEngine.__compactCoachModePatched = true;
        RecommendationEngine.__compactCoachModePatchedV2 = true;
    }

    function resetLiveOnlyRecommendationState() {
        if (typeof STATE === 'undefined') return;
        STATE.recommendationFreeze = null;
        STATE.pendingPresetEvent = null;
        STATE.liveWaitStatus = null;
    }

    function buildManualRecommendationHtml(snapshot) {
        if (typeof RecommendationEngine === 'undefined') {
            return '<div style="padding:7px 9px;background:#181818;border:1px solid #444;border-radius:5px;color:#ddd;">RecommendationEngine недоступен.</div>';
        }

        return RecommendationEngine.make(snapshot);
    }

    function rememberManualRecommendation(html, snapshot) {
        if (typeof STATE === 'undefined' || typeof RecommendationEngine === 'undefined') return;
        if (RecommendationEngine.isPlaceholderHtml && RecommendationEngine.isPlaceholderHtml(html)) return;

        STATE.lastRecommendationHtml = html;
        STATE.lastRecommendationMeta = {
            schema: 'slf_manual_hint_render_v1',
            savedAt: Date.now(),
            gameId: snapshot?.gameId || MatchStateParser.getGameId(),
            bucket: snapshot?.bucket || '',
            minute: snapshot?.minute ?? null,
            source: 'manual_hint_button'
        };
    }

    function renderManualRecommendation() {
        resetLiveOnlyRecommendationState();

        const snapshot = normalizeForeignSnapshot(SnapshotEngine.build());
        if (!snapshot) return;

        snapshot.recommendationSource = 'manual_hint_button';
        snapshot.manualRecommendationRefresh = true;

        if (typeof SnapshotEngine !== 'undefined' && SnapshotEngine.rememberLiveSnapshot) {
            SnapshotEngine.rememberLiveSnapshot(snapshot);
        }

        const el = document.getElementById('slf-parser-recommendation');
        const html = buildManualRecommendationHtml(snapshot);

        if (el) el.innerHTML = html;
        rememberManualRecommendation(html, snapshot);

        UI.addParserLog('Подсказка обновлена по текущему snapshot');
        UI.updateParserStatus('Подсказка обновлена вручную');
    }

    function mountManualButton() {
        if (!location.pathname.includes('/game.php')) return;
        const panel = document.getElementById('slf-match-parser-panel');
        if (!panel || document.getElementById('slf-manual-recommendation-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'slf-manual-recommendation-btn';
        btn.type = 'button';
        btn.textContent = '↻ Подсказка';
        btn.title = 'Собрать текущий snapshot и показать подсказку по текущему состоянию';
        btn.style.cssText = 'padding:5px 8px;background:#345;color:#fff;border:1px solid #79a;border-radius:3px;cursor:pointer;';
        btn.onclick = () => {
            btn.disabled = true;
            try {
                renderManualRecommendation();
            } catch (error) {
                console.error('[SLF] Manual recommendation refresh failed', error);
                UI.addParserLog('Подсказка: ошибка, см. console');
            } finally {
                btn.disabled = false;
            }
        };

        const status = document.getElementById('slf-parser-status');
        panel.insertBefore(btn, status || null);
    }

    function mountForeignSelector() {
        if (!location.pathname.includes('/game.php')) return;
        const panel = document.getElementById('slf-match-parser-panel');
        if (!panel || document.getElementById('slf-foreign-match-target')) return;

        const snapshot = SnapshotEngine.build();
        if (!snapshot || snapshot.matchOwnership !== 'foreign') return;

        const select = document.createElement('select');
        select.id = 'slf-foreign-match-target';
        select.title = 'Тестовый режим чужого матча: выбрать сторону для подсказок';
        select.style.cssText = 'padding:4px 6px;background:#333;color:#fff;border:1px solid #777;border-radius:3px;';
        select.innerHTML = '<option value="home">Анализ: хозяева</option><option value="away">Анализ: гости</option>';
        select.onchange = () => renderManualRecommendation();

        const status = document.getElementById('slf-parser-status');
        panel.insertBefore(select, status || null);
    }

    function mount() {
        patchSnapshotBuild();
        patchHasEnoughLiveData();
        patchLateLosingPressCooldownGuard();
        patchPresetOptions();
        patchCompactCoachMode();
        mountManualButton();
        mountForeignSelector();
        mountFormationApplyHandler();
    }

    const originalAddMatchParserPanel = UI.addMatchParserPanel;
    UI.addMatchParserPanel = function patchedTaskAAddMatchParserPanel() {
        const result = originalAddMatchParserPanel.apply(this, arguments);
        mount();
        return result;
    };

    mount();
})();

// ============================================================
