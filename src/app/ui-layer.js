    // 11. UI Layer
    // ============================================================

    const UI = {
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

            const liveBtn = document.createElement('button');
            liveBtn.textContent = '▶ Live';
            liveBtn.style.cssText = 'padding:5px 8px;background:#285;color:#fff;border:1px solid #6c6;border-radius:3px;cursor:pointer;';
            liveBtn.onclick = () => SnapshotEngine.startLive();

            const stopBtn = document.createElement('button');
            stopBtn.textContent = '■ Stop';
            stopBtn.style.cssText = 'padding:5px 8px;background:#633;color:#fff;border:1px solid #966;border-radius:3px;cursor:pointer;';
            stopBtn.onclick = () => SnapshotEngine.stopLive();

            const parseBtn = document.createElement('button');
            parseBtn.textContent = 'Спарсить завершённый';
            parseBtn.style.cssText = 'padding:5px 8px;background:#444;color:#fff;border:1px solid #777;border-radius:3px;cursor:pointer;';
            parseBtn.onclick = () => {
                const snapshot = SnapshotEngine.build();
                SnapshotEngine.sendMatchResult(snapshot);
                RecommendationEngine.update(snapshot);
                this.addParserLog('Финальный результат отправлен');
            };

            const statsBtn = document.createElement('button');
            statsBtn.textContent = 'API';
            statsBtn.style.cssText =
                'padding:5px 8px;background:#555;color:#fff;border:1px solid #888;border-radius:3px;cursor:pointer;';

            statsBtn.onclick = () => {
                fetchCanonicalApiStatus()
                    .then(status => {
                        const c = status.collections || {};
                        this.addParserLog(
                            `API OK v2 | games:${status.games} snapshots:${c.snapshots?.count ?? 0} results:${c.results?.count ?? 0} events:${c.events?.count ?? 0} effects:${c.effects?.count ?? 0} players:${c.players?.count ?? 0}`
                        );

                        console.log('[SLF API v2 canonical]', status);
                    })
                    .catch(error => {
                        this.addParserLog('API v2 connection/parse error');
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

            panel.append(info, liveBtn, stopBtn, parseBtn, statsBtn, statusBox, recBox, logBox);

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

            const labels = PresetStorage.getAllLabels();

            const overlay = document.createElement('div');
            overlay.id = 'slf-save-dialog';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;';

            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#222;color:#fff;padding:20px;border-radius:8px;min-width:300px;font-family:Arial,sans-serif;box-shadow:0 0 20px rgba(0,0,0,0.8);';

            dialog.innerHTML = `
                <h3>Сохранить тактику</h3>
                <select id="slf-save-select" style="width:100%;padding:8px;margin-bottom:10px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;">
                    <option value="__new__">➕ Добавить новую тактику</option>
                    ${Object.keys(labels).map(k => `<option value="${k}">${labels[k]}</option>`).join('')}
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
                        document.querySelector('.game_control') ||
                        document.querySelector('#game_control') ||
                        document.querySelector('.game_tab_content') ||
                        document.querySelector('.tabs_content') ||
                        document.querySelector('.match_content') ||
                        document.querySelector('.content');

                    if (
                        target &&
                        target.querySelectorAll('input[type="radio"][name], input[type="checkbox"][name]').length >= 10
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

            let target = document.querySelector('.team_general_content');

            if (!target && location.pathname.includes('/game.php')) {
                const defInput = document.querySelector('input[name="def_line"]');
                target = defInput ? defInput.closest('td, div') : null;
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

            function getCoachGroup(key, label = '') {
                const l = String(label).toLowerCase();

                if (l.includes('bielsa')) return 'Bielsa';
                if (l.includes('conte')) return 'Conte';
                if (l.includes('de zerbi')) return 'De Zerbi';
                if (l.includes('klopp')) return 'Klopp';
                if (l.includes('mourinho')) return 'Mourinho';
                if (l.includes('pep')) return 'Pep';
                if (l.includes('simeone')) return 'Simeone';
                if (l.includes('xabi')) return 'Xabi Alonso';

                if (BASE_PRESETS.hasOwnProperty(key)) return 'Other';

                return 'Custom';
            }

            function buildGroupedOptions(labels) {
                const groups = {};

                Object.entries(labels).forEach(([key, value]) => {
                    const group = getCoachGroup(key, value);

                    if (!groups[group]) groups[group] = [];
                    groups[group].push({ key, value });
                });

                Object.keys(groups).forEach(groupName => {
                    groups[groupName].sort((a, b) =>
                        String(a.value).localeCompare(String(b.value), 'ru', { sensitivity: 'base' })
                    );
                });

                return groups;
            }

            function refreshSelect(keepValue) {
                const labels = PresetStorage.getAllLabels();
                const cur = keepValue || select.value;
                const groups = buildGroupedOptions(labels);

                select.innerHTML = '';

                const groupOrder = [
                    'Bielsa',
                    'Conte',
                    'De Zerbi',
                    'Klopp',
                    'Mourinho',
                    'Pep',
                    'Simeone',
                    'Xabi Alonso',
                    'Other',
                    'Custom'
                ];

                groupOrder.forEach(groupName => {
                    const items = groups[groupName];
                    if (!items || items.length === 0) return;

                    const optgroup = document.createElement('optgroup');
                    optgroup.label = groupName;

                    items.forEach(item => {
                        const opt = document.createElement('option');
                        opt.value = item.key;
                        opt.textContent = item.value;
                        optgroup.appendChild(opt);
                    });

                    select.appendChild(optgroup);
                });

                if (labels.hasOwnProperty(cur)) {
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

            refreshSelect();
            updateSchemeLabel();

            select.addEventListener('change', async () => {
                updateSchemeLabel();
                await applyPresetAsync(select.value);
            });

            const applyBtn = document.createElement('button');
            applyBtn.textContent = '🔄';
            applyBtn.title = 'Применить выбранный пресет';
            applyBtn.style.cssText = 'padding:5px 8px;background:#444;color:#fff;border:1px solid #666;border-radius:3px;cursor:pointer;font-size:16px;';
            applyBtn.addEventListener('click', async () => {
                applyBtn.disabled = true;
                await applyPresetAsync(select.value);
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

                this.showSaveDialog(currentTactic, name => {
                    const customPresets = PresetStorage.loadCustom();
                    customPresets[name] = currentTactic;
                    PresetStorage.saveCustom(customPresets);
                    refreshSelect(name);
                    updateSchemeLabel();
                });
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '🗑️';
            deleteBtn.title = 'Удалить выбранный пресет';
            deleteBtn.style.cssText = 'padding:5px 8px;background:#444;color:#fff;border:1px solid #666;border-radius:3px;cursor:pointer;font-size:16px;';
            deleteBtn.addEventListener('click', () => {
                const name = select.value;

                if (BASE_PRESETS.hasOwnProperty(name)) {
                    alert('Встроенный пресет удалить нельзя.');
                    return;
                }

                const customPresets = PresetStorage.loadCustom();

                if (!customPresets.hasOwnProperty(name)) {
                    alert('Пресет не найден.');
                    return;
                }

                if (!confirm(`Удалить "${name}"?`)) return;

                delete customPresets[name];
                PresetStorage.saveCustom(customPresets);
                refreshSelect();
                updateSchemeLabel();
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
                        try {
                            const imported = normalizePresets(JSON.parse(ev.target.result));
                            if (!confirm('Импорт заменит все пользовательские пресеты локально и на VPS. Продолжить?')) return;

                            PresetStorage.saveCustom(imported);
                            refreshSelect();
                            updateSchemeLabel();

                            alert('Пресеты импортированы!');
                        } catch (ex) {
                            alert('Ошибка: неверный формат файла.');
                        }
                    };

                    reader.readAsText(file);
                };

                input.click();
            });

            row.append(select, applyBtn, saveBtn, deleteBtn, exportBtn, importBtn);
            container.append(title, row, schemeLabel);

            if (location.pathname.includes('/game.php')) {
                const defInput = document.querySelector('input[name="def_line"]');

                let controlRoot = defInput;

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
            } else {
                target.insertBefore(container, target.firstChild);
            }
        }
    };

    // ============================================================
