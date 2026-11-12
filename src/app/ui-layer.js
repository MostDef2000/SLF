    // 11. UI Layer
    // ============================================================

    const UI = {
        __flatSortedTacticDropdownApplied: true,

        updateParserStatus(text) {
            const el = document.getElementById('slf-parser-status');
            if (el) el.textContent = text;
        },

        addParserLog(text) {
            const el = document.getElementById('slf-parser-log');
            if (!el) return;

            const time = new Date().toLocaleTimeString();
            el.textContent = `[${time}] ${text}`;
        },
        escapeHtml(value) {
            return String(value ?? '')
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;')
                .replaceAll("'", '&#039;');
        },

        getPresetDisplayRegistry() {
            if (typeof window === 'undefined') return null;
            return window['SLFActivePresetRegistry'] || null;
        },

        getVisiblePresetLabels() {
            const labels = PresetStorage.getAllLabels();
            const registry = this.getPresetDisplayRegistry();
            const retired = new Set(Array.isArray(registry?.removed) ? registry.removed : []);
            return Object.fromEntries(
                Object.entries(labels).filter(([key]) => !retired.has(key))
            );
        },

        addMatchParserPanel() {
            if (!location.pathname.includes('/game.php')) return;
            if (document.getElementById('slf-match-parser-panel')) return;

            const panel = document.createElement('div');
            panel.id = 'slf-match-parser-panel';
            panel.style.cssText =
                'width:800px;margin:8px auto;padding:8px 10px;background:#222;color:#fff;border:1px solid #555;border-radius:5px;font-family:Arial,sans-serif;font-size:13px;display:flex;align-items:center;align-content:flex-start;gap:8px;flex-wrap:wrap;height:auto;min-height:0;overflow:visible;box-sizing:border-box;';

            const status = MatchStateParser.getStatus();
            const gameId = MatchStateParser.getGameId();

            const info = document.createElement('div');
            info.textContent = `SLF Parser | game ${gameId} | ${status}`;
            info.style.cssText = 'font-weight:bold;margin-right:8px;';

            const parseBtn = document.createElement('button');
            parseBtn.textContent = 'Спарсить завершённый';
            parseBtn.style.cssText = 'padding:5px 8px;background:#444;color:#fff;border:1px solid #777;border-radius:3px;cursor:pointer;';
            parseBtn.onclick = () => {
                const snapshot = SnapshotEngine.build();
                void SnapshotEngine.sendMatchResult(snapshot)
                    .then(() => this.addParserLog('Финальный результат отправлен'))
                    .catch(error => {
                        this.addParserLog(`Ошибка отправки результата: ${error?.kind || 'unknown'}`);
                        console.warn('[SLF API] final result send error', error);
                    });
                RecommendationEngine.update(snapshot);
            };

            const statsBtn = document.createElement('button');
            statsBtn.textContent = 'API';
            statsBtn.style.cssText =
                'padding:5px 8px;background:#555;color:#fff;border:1px solid #888;border-radius:3px;cursor:pointer;';

            statsBtn.onclick = () => {
                fetchCanonicalApiStatus()
                    .then(status => {
                        const c = status.collections || {};
                        const fmt = key => {
                            const col = c[key];
                            if (!col) return '?';
                            if (col.missing) return 'missing';
                            if (col.corrupt) return 'corrupt';
                            if (!col.ok) return 'error';
                            return col.count;
                        };
                        const prefix = status.status === 'ok' ? 'API OK v2' : 'API WARN';
                        this.addParserLog(
                            `${prefix} | games:${status.games} snapshots:${fmt('snapshots')} results:${fmt('results')} events:${fmt('events')} effects:${fmt('effects')} players:${fmt('players')} transfers:${fmt('transfers')} tactics:${fmt('tactics')}`
                        );

                        debugLog('[SLF API v2 canonical]', status);
                    })
                    .catch(error => {
                        this.addParserLog(`API ERROR: ${error?.kind || 'unknown'}`);
                        console.warn('[SLF API v2 canonical error]', error);
                    });
            };

            const statusBox = document.createElement('div');
            statusBox.id = 'slf-parser-status';
            statusBox.textContent = 'ожидание';
            statusBox.style.cssText = 'color:#9f9;font-size:12px;';

            const recBox = document.createElement('div');
recBox.id = 'slf-parser-recommendation';
recBox.innerHTML = `
    <div style="padding:7px 9px;background:#181818;border:1px solid #444;border-radius:5px;color:#ddd;">
        Рекомендация появится после snapshot
    </div>
`;
recBox.style.cssText = `
    color:#ddd;
    font-size:12px;
    max-width:760px;
    width:100%;
    display:block;
    margin:0;
    padding:0;
`;

            const logBox = document.createElement('div');
            logBox.id = 'slf-parser-log';
            logBox.style.cssText = 'color:#9f9;font-size:12px;max-width:760px;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

            panel.append(info, parseBtn, statsBtn, statusBox, recBox, logBox);

            const head = document.querySelector('#head');
            if (head && head.parentNode) {
                head.parentNode.insertBefore(panel, head);
            } else {
                document.body.prepend(panel);
            }
        },

        showSaveDialog(currentTactic, callback) {
            const old = document.getElementById('slf-save-dialog');
            if (old) old.remove();

            const labels = this.getVisiblePresetLabels();

            const overlay = document.createElement('div');
            overlay.id = 'slf-save-dialog';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;';

            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#222;color:#fff;padding:20px;border-radius:8px;min-width:300px;font-family:Arial,sans-serif;box-shadow:0 0 20px rgba(0,0,0,0.8);';

            dialog.innerHTML = `
                <h3>Сохранить тактику</h3>
                <select id="slf-save-select" style="width:100%;padding:8px;margin-bottom:10px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;">
                    <option value="__new__">➕ Добавить новую тактику</option>
                    ${Object.keys(labels).map(k => `<option value="${this.escapeHtml(k)}">${this.escapeHtml(labels[k])}</option>`).join('')}
                </select>
                <div id="slf-new-name-block" style="display:none;margin-bottom:10px;">
                    <input type="text" id="slf-new-name" placeholder="Название" style="width:100%;padding:8px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;">
                </div>
                <div style="text-align:right;">
                    <button id="slf-cancel-btn" style="padding:8px 15px;margin-right:5px;background:#444;color:#fff;border:1px solid #666;border-radius:4px;cursor:pointer;">Отмена</button>
                    <button id="slf-save-btn" style="padding:8px 15px;background:#4a8;color:#fff;border:1px solid #6c6;border-radius:4px;cursor:pointer;">Сохранить</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const select = document.getElementById('slf-save-select');
            const newNameBlock = document.getElementById('slf-new-name-block');
            const newNameInput = document.getElementById('slf-new-name');
            const saveBtn = document.getElementById('slf-save-btn');
            const cancelBtn = document.getElementById('slf-cancel-btn');

            if (select.value === '__new__') {
                newNameBlock.style.display = 'block';
                setTimeout(() => newNameInput.focus(), 50);
            }

            select.addEventListener('change', () => {
                const isNew = select.value === '__new__';
                newNameBlock.style.display = isNew ? 'block' : 'none';
                if (isNew) setTimeout(() => newNameInput.focus(), 50);
            });

            cancelBtn.addEventListener('click', () => overlay.remove());

            saveBtn.addEventListener('click', () => {
                const selected = select.value;

                if (selected === '__new__') {
                    const name = newNameInput.value.trim();

                    if (!name) {
                        alert('Введите название');
                        newNameInput.focus();
                        return;
                    }

                    overlay.remove();
                    callback(name);
                } else {
                    overlay.remove();
                    callback(selected);
                }
            });
        },

        waitForTacticReady() {
            return new Promise(resolve => {
                let attempts = 0;
                const maxAttempts = 50;

                const check = () => {
                    const target =
                        document.querySelector('.team_general_content') ||
                        document.querySelector('.ui-tactic__wrap') ||
                        // fm2026 new design (dark mint tactic page, issue #370):
                        // hidden pill radios live inside the mint controls wrapper
                        document.querySelector('.tc.mint') ||
                        document.querySelector('.game_control') ||
                        document.querySelector('#game_control') ||
                        document.querySelector('.game_tab_content') ||
                        document.querySelector('.tabs_content') ||
                        document.querySelector('.match_content') ||
                        document.querySelector('.content');

                    if (
                        (target &&
                        target.querySelectorAll('input[type="radio"][name], input[type="checkbox"][name]').length >= 10) ||
                        TACTIC_CONTROL_KEYS.filter(key => !!findBetaTacticButton(key)).length >= 10 // β: tc-seg readiness
                    ) {
                        resolve();
                        return;
                    }

                    attempts++;

                    if (attempts >= maxAttempts) {
                        resolve();
                        return;
                    }

                    setTimeout(check, 100);
                };

                check();
            });
        },

        async addDropdown() {
            const isTacticPage =
    location.pathname.includes('/game.php') ||
    (
        location.pathname.includes('/team4.php') &&
        new URLSearchParams(location.search).get('action') === 'tactic'
    );

if (!isTacticPage) return;
            document.querySelectorAll('#slf-tactics-dropdown').forEach((el, i) => {
                if (i > 0) el.remove();
            });

            if (document.getElementById('slf-tactics-dropdown')) return;

            if (location.pathname.includes('/game.php')) {
                const ids = MatchStatsParser.getAllTeamIds();
                if (!MatchStatsParser.detectMyTeamId(ids, MatchStatsParser.readTeamNames())) return;
            }

            if (location.pathname.includes('/team4.php')) {
                await this.waitForTacticReady();
            }

            const isTeam4TacticPage = location.pathname.includes('/team4.php')
                && new URLSearchParams(location.search).get('action') === 'tactic';
            let target = location.pathname.includes('/game.php')
                ? null
                : document.querySelector('.team_general_content');

            if (!target && isTeam4TacticPage) {
                // fm2026v2 tactic cards (issue #370)
                const tacticWrap =
                    document.querySelector('form.tactics__form') ||
                    document.querySelector('.ui-tactic__wrap');
                target = tacticWrap?.closest('form') || tacticWrap || null;
            }

            if (!target && isTeam4TacticPage) {
                // fm2026 new design (dark mint tactic page, issue #370):
                // classic anchors are absent; DIV.tc.mint is the tactic
                // controls wrapper that hosts the «Мои тактики» card.
                target = document.querySelector('.tc.mint');
            }

            if (!target && location.pathname.includes('/game.php')) {
                const defInput = document.querySelector('input[name="def_line"]');

                if (defInput) {
                    // classic design: the panel sits next to the pill radios
                    target = defInput.closest('td, div');
                } else {
                    // fm2026 match tactic view (issue #370 follow-up): the
                    // DIV.tc.mint.tc--match container is pre-rendered HIDDEN
                    // until «Управление → тактика» opens the tab — mounting
                    // inside it shows the panel only when the tab view is
                    // open. No mint view → no mount (no top-of-page fallbacks:
                    // #slf-match-parser-panel / .control_field_1 removed).
                    target = document.querySelector('.tc.mint') || null;
                }
            }

            if (!target) return;

            const container = document.createElement('div');
            container.id = 'slf-tactics-dropdown';
            container.style.cssText =
                'margin-bottom:15px;padding:10px;background:#222;color:#fff;border:1px solid #555;border-radius:5px;font-family:Arial,sans-serif;font-size:14px;';

            const title = document.createElement('div');
            title.textContent = 'Быстрая смена тактики';
            title.style.cssText = 'margin-bottom:5px;font-weight:bold;';

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:5px;flex-wrap:wrap;';

            const select = document.createElement('select');
            select.style.cssText =
                'flex:1;min-width:120px;padding:5px;background:#333;color:#fff;border:1px solid #555;border-radius:3px;font-size:14px;';

            const displayRegistry = this.getPresetDisplayRegistry();
            const styleGroups = Array.isArray(displayRegistry?.styleGroups) && displayRegistry.styleGroups.length
                ? displayRegistry.styleGroups
                : [
                    { style: '5', label: 'Атака+ · _att2' },
                    { style: '4', label: 'Атака · _att1' },
                    { style: '3', label: 'Обычный · _neutr' },
                    { style: '2', label: 'Защита · _def1' },
                    { style: '1', label: 'Защ+ · _def2' }
                ];
            const displayMeta = displayRegistry?.displayMeta || {};
            const systemOrder = Array.isArray(displayRegistry?.displayOrder) ? displayRegistry.displayOrder : [];
            const systemOrderIndex = new Map(systemOrder.map((name, index) => [name, index]));

            function buildStyleGroupedOptions(labels) {
                const presets = PresetStorage.getAllPresets();
                const groups = Object.fromEntries(styleGroups.map(group => [String(group.style), []]));

                Object.entries(labels).forEach(([key, value]) => {
                    const preset = presets[key] || {};
                    const meta = displayMeta[key] || {};
                    const requestedStyle = String(preset.style || meta.style || '3');
                    const style = Object.prototype.hasOwnProperty.call(groups, requestedStyle) ? requestedStyle : '3';
                    const isSystem = Object.prototype.hasOwnProperty.call(BASE_PRESETS, key);
                    const trainer = String(meta.trainer || '').trim();
                    groups[style].push({ key, value, isSystem, trainer });
                });

                Object.values(groups).forEach(items => {
                    items.sort((a, b) => {
                        if (a.key === 'standard') return -1;
                        if (b.key === 'standard') return 1;

                        if (a.isSystem && b.isSystem) {
                            const ai = systemOrderIndex.has(a.key) ? systemOrderIndex.get(a.key) : Number.MAX_SAFE_INTEGER;
                            const bi = systemOrderIndex.has(b.key) ? systemOrderIndex.get(b.key) : Number.MAX_SAFE_INTEGER;
                            if (ai !== bi) return ai - bi;
                        }

                        if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;

                        const trainerDiff = a.trainer.localeCompare(b.trainer, 'en', { sensitivity: 'base' });
                        if (trainerDiff) return trainerDiff;
                        return String(a.value).localeCompare(String(b.value), 'ru', { sensitivity: 'base' });
                    });
                });

                return groups;
            }

            function refreshSelect(keepValue) {
                const labels = UI.getVisiblePresetLabels();
                const cur = keepValue || select.value;
                const groups = buildStyleGroupedOptions(labels);

                select.innerHTML = '';

                styleGroups.forEach(group => {
                    const items = groups[String(group.style)];
                    if (!items || items.length === 0) return;

                    const optgroup = document.createElement('optgroup');
                    optgroup.label = group.label;
                    optgroup.dataset.style = String(group.style);

                    items.forEach(item => {
                        const opt = document.createElement('option');
                        opt.value = item.key;
                        opt.textContent = item.value;
                        opt.dataset.systemPreset = item.isSystem ? '1' : '0';
                        optgroup.appendChild(opt);
                    });

                    select.appendChild(optgroup);
                });

                if (Object.prototype.hasOwnProperty.call(labels, cur)) {
                    select.value = cur;
                } else if (select.options.length > 0) {
                    select.value = select.options[0].value;
                }
            }

            const schemeLabel = document.createElement('div');
            schemeLabel.id = 'slf-tactics-scheme-label';
            schemeLabel.style.cssText = 'font-size:12px;color:#ffb86c;white-space:normal;width:100%;max-width:100%;line-height:1.3;margin-top:5px;box-sizing:border-box;';

            function updateSchemeLabel() {
                const scheme = TacticPresetLibrary?.getSchemeForPreset
                    ? TacticPresetLibrary.getSchemeForPreset(select.value)
                    : '';

                schemeLabel.textContent = scheme ? `Схема: ${scheme}` : '';
            }

            // Issue #419: mirror the site's active tactic into the plugin
            // dropdown. The site marks the loaded tactic with .tc-pill--cur
            // (on the [data-tc-load] button itself or on a row containing
            // it); resolve its name via the native cache and select the
            // matching option. Any miss (no marked button, no cache item,
            // no matching option) keeps the current select value.
            function syncSelectWithNativeActive() {
                try {
                    const marked = document.querySelector('[data-tc-load].tc-pill--cur')
                        || document.querySelector('.tc-pill--cur [data-tc-load]');
                    if (!marked) return;

                    const nativeId = marked.getAttribute('data-tc-load');
                    if (!nativeId) return;

                    const cached = PresetStorage.readScopedNativeCache();
                    const item = cached && Array.isArray(cached.items)
                        ? cached.items.find(entry => entry.id === nativeId)
                        : null;
                    if (!item || !item.name) return;

                    const option = Array.from(select.options).find(opt => opt.textContent === item.name);
                    if (!option) return;

                    // Guard against sync loops: mutate only on a real change
                    // (programmatic value assignment never fires 'change',
                    // but redundant label updates are skipped too).
                    if (select.value !== option.value) {
                        select.value = option.value;
                        updateSchemeLabel();
                    }
                } catch (_) { /* native → select sync is best-effort */ }
            }

            refreshSelect();
            updateSchemeLabel();
            syncSelectWithNativeActive();

            select.addEventListener('change', async () => {
                updateSchemeLabel();
                await applyPresetAsync(select.value);
                await syncWithNativeTactic(select.value);
                syncSelectWithNativeActive();
            });

            const applyBtn = document.createElement('button');
            applyBtn.textContent = '🔄';
            applyBtn.title = 'Применить выбранный пресет';
            applyBtn.style.cssText = 'padding:5px 8px;background:#444;color:#fff;border:1px solid #666;border-radius:3px;cursor:pointer;font-size:16px;';
            applyBtn.addEventListener('click', async () => {
                applyBtn.disabled = true;
                await applyPresetAsync(select.value);
                await syncWithNativeTactic(select.value);
                syncSelectWithNativeActive();
                applyBtn.disabled = false;
            });

            const saveBtn = document.createElement('button');
            saveBtn.textContent = '💾';
            saveBtn.title = 'Сохранить текущую тактику';
            saveBtn.style.cssText = 'padding:5px 8px;background:#444;color:#fff;border:1px solid #666;border-radius:3px;cursor:pointer;font-size:16px;';
            saveBtn.addEventListener('click', () => {
                const currentTactic = getCurrentTactic();

                if (Object.keys(currentTactic).length === 0) {
                    alert('Не удалось считать тактику.');
                    return;
                }

                this.showSaveDialog(currentTactic, async name => {
                    try {
                        const customPresets = PresetStorage.loadCustom();
                        customPresets[name] = currentTactic;
                        // Native write (#409): no optimistic success — the
                        // dropdown refreshes only after the site ack.
                        await PresetStorage.saveCustom(customPresets);
                        refreshSelect(name);
                        updateSchemeLabel();
                    } catch (error) {
                        alert(`Не удалось сохранить тактику: ${error && error.message ? error.message : 'неизвестная ошибка'}`);
                    }
                });
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '🗑️';
            deleteBtn.title = 'Удалить выбранный пресет';
            deleteBtn.style.cssText = 'padding:5px 8px;background:#444;color:#fff;border:1px solid #666;border-radius:3px;cursor:pointer;font-size:16px;';
            deleteBtn.addEventListener('click', async () => {
                const name = select.value;

                if (Object.prototype.hasOwnProperty.call(BASE_PRESETS, name)) {
                    alert('Встроенный пресет удалить нельзя.');
                    return;
                }

                const customPresets = PresetStorage.loadCustom();

                if (!customPresets.hasOwnProperty(name)) {
                    alert('Пресет не найден.');
                    return;
                }

                if (!confirm(`Удалить "${name}"?`)) return;

                try {
                    delete customPresets[name];
                    await PresetStorage.saveCustom(customPresets);
                    refreshSelect();
                    updateSchemeLabel();
                } catch (error) {
                    alert(`Не удалось удалить пресет: ${error && error.message ? error.message : 'неизвестная ошибка'}`);
                }
            });

            const exportBtn = document.createElement('button');
            exportBtn.textContent = '📥';
            exportBtn.title = 'Скачать резервную копию';
            exportBtn.style.cssText = 'padding:5px 8px;background:#444;color:#fff;border:1px solid #666;border-radius:3px;cursor:pointer;font-size:16px;';
            exportBtn.addEventListener('click', () => {
                const data = JSON.stringify(PresetStorage.loadCustom(), null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = 'slf_tactics_backup.json';
                a.click();

                setTimeout(() => URL.revokeObjectURL(url), 1000);
            });

            const importBtn = document.createElement('button');
            importBtn.textContent = '📤';
            importBtn.title = 'Загрузить пресеты из файла';
            importBtn.style.cssText = 'padding:5px 8px;background:#444;color:#fff;border:1px solid #666;border-radius:3px;cursor:pointer;font-size:16px;';
            importBtn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';

                input.onchange = e => {
                    const file = e.target.files[0];
                    if (!file) return;

                    const reader = new FileReader();

                    reader.onload = ev => {
                        let imported;
                        try {
                            imported = normalizePresets(JSON.parse(ev.target.result));
                        } catch (ex) {
                            alert('Ошибка: неверный формат файла.');
                            return;
                        }

                        // Native-store import (#409): replacement semantics
                        // apply only to the plugin-managed subset. Native
                        // templates absent from the file are never deleted —
                        // full reconciliation is the wave-2 migration's job.
                        const current = PresetStorage.loadCustom();
                        const managed = new Set(PresetStorage.getManagedPresetNames ? PresetStorage.getManagedPresetNames() : []);
                        const importedNames = Object.keys(imported);
                        const addNames = importedNames.filter(name => !Object.prototype.hasOwnProperty.call(current, name));
                        const updateNames = importedNames.filter(name => Object.prototype.hasOwnProperty.call(current, name));
                        const deleteNames = Object.keys(current).filter(name =>
                            !Object.prototype.hasOwnProperty.call(imported, name) && managed.has(name));

                        const previewParts = [
                            addNames.length ? `добавлены: ${addNames.join(', ')}` : null,
                            updateNames.length ? `обновлены: ${updateNames.join(', ')}` : null,
                            deleteNames.length ? `удалены (управляемые пресеты): ${deleteNames.join(', ')}` : null
                        ].filter(Boolean);
                        const previewText = previewParts.length ? previewParts.join('; ') : 'изменений нет';
                        if (!confirm(`Импорт пресетов из файла (${importedNames.length} шт.): ${previewText}. Сайтовые шаблоны, отсутствующие в файле, удалены не будут. Продолжить?`)) return;

                        (async () => {
                            try {
                                const result = await PresetStorage.saveCustom(imported, { deleteMissing: 'managed' });
                                refreshSelect();
                                updateSchemeLabel();
                                alert(`Пресеты импортированы: сохранено ${result.applied.length}, удалено ${result.removed.length}.`);
                            } catch (error) {
                                alert(`Импорт не завершён: ${error && error.message ? error.message : 'неизвестная ошибка'}`);
                            }
                        })();
                    };

                    reader.readAsText(file);
                };

                input.click();
            });

            // Migration to native site templates (#409 wave 2): the button
            // is the ONLY trigger — PresetMigration.run() never executes on
            // page load. Preview (dry-run) → explicit confirm → awaited run
            // → loud receipt summary, same alert() convention as the other
            // preset-store errors.
            const migrateBtn = document.createElement('button');
            migrateBtn.textContent = '⬆️';
            migrateBtn.title = 'Перенести пресеты в шаблоны сайта';
            migrateBtn.style.cssText = 'padding:5px 8px;background:#444;color:#fff;border:1px solid #666;border-radius:3px;cursor:pointer;font-size:16px;';
            migrateBtn.addEventListener('click', async () => {
                migrateBtn.disabled = true;
                try {
                    const preview = await PresetMigration.run({ dryRun: true });
                    if (preview.code === 'native_unavailable' || preview.code === 'native_stale') {
                        alert(`Миграция недоступна: ${preview.message || preview.code}`);
                        return;
                    }

                    const createText = preview.created.length
                        ? `Будут созданы шаблоны сайта: ${preview.created.map(entry =>
                            `${entry.name} [${PresetMigration.sourceLabel(entry.source)}]`).join(', ')}.`
                        : 'Новых шаблонов не будет.';
                    const skipText = preview.skipped.length
                        ? ` Пропущены (уже существуют/перенесены): ${preview.skipped.map(entry => entry.name).join(', ')}.`
                        : '';
                    const failText = preview.failed.length
                        ? ` Некорректные векторы: ${preview.failed.map(entry => entry.name).join(', ')}.`
                        : '';
                    if (!confirm(`Перенос пресетов в шаблоны сайта. ${createText}${skipText}${failText} Существующие шаблоны сайта не перезаписываются, удаления не выполняются. Если вы меняли шаблоны сайта в другой вкладке — обновите эту страницу и запустите перенос заново. Продолжить?`)) return;

                    const result = await PresetMigration.run();
                    if (result.ok === false && result.created.length === 0) {
                        // True failure (failUnavailable gate or an abort with
                        // nothing created): never show the success summary.
                        // A partial success (completed_with_errors with acked
                        // saves) falls through to the summary below, which
                        // already appends the first error.
                        alert(`Миграция не выполнена: ${result.message || result.code}`);
                        return;
                    }
                    refreshSelect();
                    updateSchemeLabel();
                    const firstError = result.failed.length
                        ? ` Первая ошибка: ${result.failed[0].message || result.failed[0].code}.`
                        : '';
                    const summaryHeader = result.ok === false ? 'Миграция частично выполнена' : 'Миграция завершена';
                    alert(`${summaryHeader}: создано ${result.created.length}, пропущено ${result.skipped.length}, ошибок ${result.failed.length}.${firstError}`);
                } catch (error) {
                    alert(`Миграция не выполнена: ${error && error.message ? error.message : 'неизвестная ошибка'}`);
                } finally {
                    migrateBtn.disabled = false;
                }
            });

            row.append(select, applyBtn, saveBtn, deleteBtn, exportBtn, importBtn, migrateBtn);
            container.append(title, row, schemeLabel);

            function getActiveTacticRow(rows) {
                if (!rows || rows.length === 0) return undefined;

                // The site's «сейчас» marker wins: .tc-pill--cur sits on the
                // row itself or on a button inside it.
                const marked = rows.find(row =>
                    row.classList.contains('tc-pill--cur') ||
                    row.querySelector('.tc-pill--cur')
                );
                if (marked) return marked;

                // Issue #421: rows[0] may be a header/control element rather
                // than a tactic row (4.4.370 regression: that fallback folded
                // every real tactic). Prefer the first row that actually
                // carries a tactic button before the last-resort fallback.
                const tacticLike = rows.find(row =>
                    row.getAttribute('data-tc-load') !== null ||
                    row.querySelector('[data-tc-load]')
                );
                if (tacticLike) return tacticLike;

                return rows[0];
            }

            // Issue #415: fold the native «Мои тактики» card — the site
            // renders one row per saved tactic, which pushes the plugin
            // panel far down the page. Issue #419: when collapsed, keep
            // ONLY the active tactic's row visible (never hide all rows)
            // and fold the rest behind a «показать ещё» toggle. Issue
            // #421: the fallback prefers a real tactic row ([data-tc-load])
            // over rows[0] — on 4.4.370 rows[0] can be a header/control
            // element, which folded every actual tactic. Best-effort:
            // no native card → no-op.
            const compactNativeTacticsBlock = () => {
                try {
                    const nativeCard = document.querySelector('.mint-card.tc-tactics');
                    const nativeList = document.querySelector('[data-tc-list]')
                        || (nativeCard ? nativeCard.querySelector('[data-tc-list]') : null);
                    const listRoot = nativeList || nativeCard;

                    if (!listRoot) return;

                    const rows = Array.from(listRoot.children);

                    // Issue #419: exactly one row stays visible when
                    // collapsed — the ACTIVE tactic's row (site marks it
                    // with .tc-pill--cur on the row or on a button inside
                    // it), falling back to the first row. Empty list →
                    // nothing to fold, never hide anything.
                    const activeRow = getActiveTacticRow(rows);

                    if (!activeRow) return;

                    const toggle = listRoot.parentElement
                        ? listRoot.parentElement.querySelector('[data-slf-tactics-toggle]')
                        : null;

                    const expanded = toggle?.dataset.slfExpanded === '1';

                    rows.forEach(row => {
                        row.style.display = (expanded || row === activeRow) ? '' : 'none';
                    });

                    // Single-row list: nothing to fold — hide a stale toggle.
                    if (rows.length <= 1) {
                        if (toggle) toggle.style.display = 'none';
                        return;
                    }

                    if (toggle) {
                        toggle.style.display = '';
                        toggle.textContent = expanded ? 'скрыть' : 'показать ещё';
                        return;
                    }

                    const toggleBtn = document.createElement('button');
                    toggleBtn.type = 'button';
                    toggleBtn.dataset.slfTacticsToggle = '1';
                    toggleBtn.dataset.slfExpanded = '0';
                    toggleBtn.textContent = 'показать ещё';
                    toggleBtn.style.cssText =
                        'margin:4px 0 0;padding:2px 8px;font-size:12px;cursor:pointer;background:#333;color:#fff;border:1px solid #555;border-radius:3px;';
                    toggleBtn.addEventListener('click', () => {
                        toggleBtn.dataset.slfExpanded = toggleBtn.dataset.slfExpanded === '1' ? '0' : '1';
                        compactNativeTacticsBlock();
                    });
                    listRoot.insertAdjacentElement('afterend', toggleBtn);
                } catch (_) { /* native block compaction is best-effort */ }
            };

            const installNativeTacticsCompaction = () => {
                if (typeof MutationObserver === 'undefined') return;
                if (!document.body) return;

                // The site renders the tactics list asynchronously and may
                // re-render it on its own actions: observe mutations and
                // re-fold. Start body-wide until the card shows up (scan
                // capped at 15s below), then re-scope to the card and
                // disconnect after 10 card mutations — enough to re-fold
                // re-renders from user actions (save/delete/move) without
                // perpetual observation.
                let scanningBody = !document.querySelector('.mint-card.tc-tactics');
                let cardMutations = 0;
                const observer = new MutationObserver(() => {
                    if (scanningBody) {
                        const card = document.querySelector('.mint-card.tc-tactics');
                        if (!card) return;
                        scanningBody = false;
                        observer.disconnect();
                        observer.observe(card, { childList: true, subtree: true });
                    } else {
                        cardMutations += 1;
                    }
                    compactNativeTacticsBlock();
                    syncSelectWithNativeActive();
                    if (cardMutations >= 10) observer.disconnect();
                });

                observer.observe(
                    scanningBody ? document.body : document.querySelector('.mint-card.tc-tactics'),
                    { childList: true, subtree: true }
                );
                compactNativeTacticsBlock();

                if (scanningBody) {
                    setTimeout(() => {
                        if (scanningBody) observer.disconnect();
                    }, 15000);
                }
            };

            installNativeTacticsCompaction();

            // fm2026 match tactic view (issue #370 follow-up): on radio-less
            // game.php pages the resolved target is the DIV.tc.mint.tc--match
            // container, which stays hidden until «Управление → тактика»
            // opens the tab — inserting inside it needs no tab-state tracking.
            // Insert before the .tc-cols card grid: the .mint-card.tc-block
            // cards are DIRECT children of that grid, so inserting before a
            // card would turn the panel into a cramped grid cell (live check
            // 2026-10-20, game.php?id=34923601). Fallbacks: first tactic card,
            // then first child of the mint wrapper. Header-selector mode
            // stays team4-only; without the mint view nothing mounts (no
            // top-of-page fallbacks).
            if (location.pathname.includes('/game.php') &&
                !document.querySelector('input[name="def_line"]')) {
                if (target.classList.contains('tc') && target.classList.contains('mint')) {
                    const tcCols = target.querySelector('.tc-cols');
                    const mintCard = target.querySelector('.mint-card.tc-block');
                    if (tcCols?.parentNode) {
                        tcCols.parentNode.insertBefore(container, tcCols);
                    } else if (mintCard?.parentNode) {
                        mintCard.parentNode.insertBefore(container, mintCard);
                    } else {
                        target.insertBefore(container, target.firstChild);
                    }
                }
                return;
            }

            if (location.pathname.includes('/game.php')) {
                const defInput = document.querySelector('input[name="def_line"]');

                // fm2026v2 tactic cards (issue #370): prefer the nearest tactic card as insertion root
                let controlRoot = defInput
                    ? defInput.closest('.ui-tactic__wrap, form.tactics__form, .team-control__block')
                    : null;

                if (!controlRoot) {
                    controlRoot = defInput;

                    while (
                        controlRoot &&
                        controlRoot !== document.body &&
                        !(
                            controlRoot.innerText &&
                            controlRoot.innerText.includes('Оборона') &&
                            controlRoot.innerText.includes('Построение атаки') &&
                            controlRoot.innerText.includes('Атака')
                        )
                    ) {
                        controlRoot = controlRoot.parentNode;
                    }

                    if (!controlRoot || controlRoot === document.body) return;
                }

                container.style.cssText =
                    'width:100%;box-sizing:border-box;margin:4px 0 8px 0;padding:6px 10px;background:#222;color:#fff;border:1px solid #555;border-radius:4px;font-family:Arial,sans-serif;font-size:13px;display:block;overflow:visible;';

                title.style.cssText = 'font-weight:bold;white-space:nowrap;margin:0;';
                row.style.cssText = 'display:flex;align-items:center;gap:5px;flex-wrap:nowrap;min-width:0;';
                schemeLabel.style.cssText = 'font-size:12px;color:#ffb86c;white-space:normal;width:100%;max-width:100%;line-height:1.3;margin-top:5px;box-sizing:border-box;';

                const topLine = document.createElement('div');
                topLine.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:nowrap;width:100%;min-width:0;';
                topLine.append(title, row);

                container.innerHTML = '';
                container.append(topLine, schemeLabel);

                controlRoot.parentNode.insertBefore(container, controlRoot);
            } else if (isTeam4TacticPage) {
                // fm2026 new design (dark mint tactic page, issue #370): the
                // panel belongs above the tactic cards — directly before the
                // «Мои тактики» mint card when present, otherwise as the first
                // child of the mint wrapper. Header-selector mode stays
                // classic-only.
                if (target.classList.contains('tc') && target.classList.contains('mint')) {
                    const mintCard = target.querySelector('.mint-card.tc-tactics');
                    if (mintCard?.parentNode) {
                        mintCard.parentNode.insertBefore(container, mintCard);
                    } else {
                        target.insertBefore(container, target.firstChild);
                    }
                    return;
                }

                const teamHeader = document.querySelector('.team > .team-head');
                const matches = teamHeader?.querySelector(':scope > .team-head__matches');
                const headerVisible = teamHeader && teamHeader.offsetParent !== null;
                if (!headerVisible) {
                    target.insertBefore(container, target.firstChild);
                    return;
                }

                const styleId = 'slf-team4-tactic-header-selector-style';
                if (!document.getElementById(styleId)) {
                    const style = document.createElement('style');
                    style.id = styleId;
                    style.textContent = `
                        .team > .team-head > #slf-tactics-dropdown.slf-team4-tactic-header-selector {
                            flex: 1 1 520px !important;
                            width: auto !important;
                            min-width: 360px !important;
                            max-width: 720px !important;
                            align-self: center !important;
                            margin: 0 12px !important;
                            padding: 8px 10px !important;
                            display: grid !important;
                            grid-template-columns: auto minmax(240px, 1fr) !important;
                            grid-template-areas: "title controls" "scheme scheme" !important;
                            align-items: center !important;
                            gap: 4px 10px !important;
                            overflow: hidden !important;
                            box-sizing: border-box !important;
                        }
                        .team > .team-head > #slf-tactics-dropdown.slf-team4-tactic-header-selector > div:first-child {
                            grid-area: title !important;
                            margin: 0 !important;
                            color: var(--slf-muted, #8b93ab) !important;
                            font-size: 10px !important;
                            font-weight: 700 !important;
                            letter-spacing: .08em !important;
                            text-transform: uppercase !important;
                            white-space: nowrap !important;
                        }
                        .team > .team-head > #slf-tactics-dropdown.slf-team4-tactic-header-selector > div:nth-child(2) {
                            grid-area: controls !important;
                            display: flex !important;
                            align-items: center !important;
                            gap: 5px !important;
                            flex-wrap: nowrap !important;
                            min-width: 0 !important;
                        }
                        .team > .team-head > #slf-tactics-dropdown.slf-team4-tactic-header-selector select {
                            flex: 1 1 auto !important;
                            width: auto !important;
                            min-width: 0 !important;
                            max-width: 100% !important;
                        }
                        .team > .team-head > #slf-tactics-dropdown.slf-team4-tactic-header-selector button {
                            flex: 0 0 30px !important;
                            width: 30px !important;
                            height: 30px !important;
                            min-width: 30px !important;
                            min-height: 30px !important;
                            padding: 0 !important;
                            line-height: 1 !important;
                        }
                        .team > .team-head > #slf-tactics-dropdown.slf-team4-tactic-header-selector #slf-tactics-scheme-label {
                            grid-area: scheme !important;
                            width: 100% !important;
                            min-width: 0 !important;
                            margin: 0 !important;
                            overflow: hidden !important;
                            text-overflow: ellipsis !important;
                            white-space: nowrap !important;
                            font-size: 10px !important;
                            line-height: 1.2 !important;
                        }
                        @media (max-width: 1300px) {
                            .team > .team-head > #slf-tactics-dropdown.slf-team4-tactic-header-selector {
                                grid-template-columns: minmax(0, 1fr) !important;
                                grid-template-areas: "controls" "scheme" !important;
                                min-width: 330px !important;
                                margin-left: auto !important;
                                margin-right: 8px !important;
                            }
                            .team > .team-head > #slf-tactics-dropdown.slf-team4-tactic-header-selector > div:first-child {
                                display: none !important;
                            }
                        }
                    `;
                    (document.head || document.documentElement).appendChild(style);
                }

                container.classList.add('slf-ui', 'slf-panel', 'slf-team4-tactic-header-selector');
                container.dataset.slfTeam4TacticHeader = '1';
                if (matches) teamHeader.insertBefore(container, matches);
                else teamHeader.appendChild(container);
            } else {
                target.insertBefore(container, target.firstChild);
            }
        }
    };

    // ============================================================