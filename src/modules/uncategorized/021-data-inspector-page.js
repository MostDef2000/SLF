// 11.5 Data Inspector Page
// ============================================================

const DataInspector = {
    tabId: 'slf-data-global-link',
    pageId: 'slf-data-page',

    addGlobalMenuButton() {
        if (document.getElementById(this.tabId)) return;

        const link = document.createElement('a');
        link.id = this.tabId;
        link.href = '#';
        link.textContent = 'SLF Data';
        link.style.cssText = `
            display:inline-flex;
            align-items:center;
            justify-content:center;
            height:22px;
            margin-left:8px;
            padding:0 10px;
            border:1px solid #666;
            border-radius:4px;
            background:#2b2b2b;
            color:#7cff7c;
            font-weight:bold;
            text-decoration:none;
            cursor:pointer;
            vertical-align:middle;
        `;

        link.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            this.show();
        });

        const searchForm = document.querySelector('.head-ui__search-form');

        if (searchForm) {
            searchForm.appendChild(link);
        } else {
            const searchMenu = [...document.querySelectorAll('a')]
                .find(a => (a.innerText || '').trim() === 'Поиск');

            if (!searchMenu || !searchMenu.parentNode) {
                console.warn('[SLF Data] search form/menu not found');
                return;
            }

            searchMenu.parentNode.insertBefore(link, searchMenu.nextSibling);
        }

        this.createPage();
    },

    createPage() {
        if (document.getElementById(this.pageId)) return;

        const page = document.createElement('div');
        page.id = this.pageId;
        page.style.cssText = `
            display:none;
            position:fixed;
            top:70px;
            left:50%;
            transform:translateX(-50%);
            width:980px;
            max-height:82vh;
            z-index:99999;
            padding:12px;
            background:#1f1f1f;
            color:#fff;
            border:1px solid #555;
            border-radius:6px;
            box-shadow:0 10px 30px rgba(0,0,0,0.7);
            font-family:Arial,sans-serif;
            font-size:13px;
        `;

        page.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
                <b style="font-size:15px;">SLF Data Inspector</b>
                <button id="slf-data-overview-btn">Overview</button>
                <button id="slf-data-players-btn">Players</button>
                <button id="slf-data-youth-btn">Youth</button>
                <button id="slf-data-presets-btn">Presets</button>
                <button id="slf-data-close-btn">Закрыть</button>
                <button id="slf-youth-reset-cache" title="Сбросить кэш проверки Youth Monitor">Сбросить кэш проверки</button>
            </div>
            <div id="slf-data-content" style="background:#111;border:1px solid #444;padding:10px;min-height:160px;max-height:66vh;overflow:auto;white-space:normal;">
                Нажми Overview, Players, Youth или Presets.
            </div>
        `;

        document.body.appendChild(page);

        document.getElementById('slf-data-overview-btn').onclick = () => this.renderOverview();
        document.getElementById('slf-data-players-btn').onclick = () => this.renderPlayers();
        document.getElementById('slf-data-youth-btn').onclick = () => this.renderYouth();
        document.getElementById('slf-data-presets-btn').onclick = () => this.renderPresets();
        document.getElementById('slf-data-close-btn').onclick = () => this.hide();
        document.getElementById('slf-youth-reset-cache').onclick = () => {
            YouthExternalMonitor.resetCache();
            this.setContent('Кэш Youth Monitor сброшен. Нажми Youth ещё раз.');
        };
    },

    show() {
        this.createPage();

        const page = document.getElementById(this.pageId);
        if (page) {
            page.style.display = 'block';
            this.renderOverview();
        }
    },

    hide() {
        const page = document.getElementById(this.pageId);
        if (page) page.style.display = 'none';
    },

    setContent(html) {
        const content = document.getElementById('slf-data-content');
        if (content) content.innerHTML = html;
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    },

    renderOverview() {
        this.setContent('Загрузка Overview v2...');

        fetchCanonicalApiStatus()
            .then(status => {
                const c = status.collections || {};

                this.setContent(`
                    <h3>Overview v2</h3>
                    <div style="margin-bottom:8px;color:#aaa;">
                        Канонические исторические коллекции: <b>match_snapshots_v2</b>, <b>match_results_v2</b>, <b>preset_events_v2</b>, <b>preset_effects_v2</b>.
                        Legacy-коллекции не учитываются.
                    </div>
                    <table style="width:100%;border-collapse:collapse;">
                        <tr><td>Unique games in v2 history</td><td>${status.games ?? 0}</td></tr>
                        <tr><td>Snapshots v2</td><td>${c.snapshots?.count ?? 0}</td></tr>
                        <tr><td>Match results v2</td><td>${c.results?.count ?? 0}</td></tr>
                        <tr><td>Preset events v2</td><td>${c.events?.count ?? 0}</td></tr>
                        <tr><td>Preset effects v2</td><td>${c.effects?.count ?? 0}</td></tr>
                        <tr><td>Player observations</td><td>${c.players?.count ?? 0}</td></tr>
                        <tr><td>Transfer history</td><td>${c.transfers?.count ?? 0}</td></tr>
                        <tr><td>Tactics</td><td>${c.tactics?.count ?? 0}</td></tr>
                    </table>
                `);
            })
            .catch(() => this.setContent('Ошибка загрузки Overview v2'));
    },

    renderPlayers() {
        this.setContent('Загрузка Players...');

        Api.get(
            'player_observations',
            data => {
                const rows = Array.isArray(data) ? data.slice(-50).reverse() : [];

                if (!rows.length) {
                    this.setContent('player_observations пусто');
                    return;
                }

                const htmlRows = rows.map(p => `
                    <tr>
                        <td>${p.playerId ?? ''}</td>
                        <td>${p.name ?? ''}</td>
                        <td>${p.teamId ?? ''}</td>
                        <td>${p.currentPosition ?? ''}</td>
                        <td>${Array.isArray(p.possiblePositions) ? p.possiblePositions.join('/') : ''}</td>
                        <td>${p.skill ?? ''}</td>
                        <td>${p.exactSlot ?? ''}</td>
                        <td>${p.gameId ?? ''}</td>
                        <td>${p.minute ?? ''}</td>
                    </tr>
                `).join('');

                this.setContent(`
                    <h3>Last 50 player observations</h3>
                    <table style="width:100%;border-collapse:collapse;font-size:12px;">
                        <thead>
                            <tr style="color:#ffd76a;">
                                <th>playerId</th>
                                <th>name</th>
                                <th>teamId</th>
                                <th>pos</th>
                                <th>possible</th>
                                <th>skill</th>
                                <th>slot</th>
                                <th>game</th>
                                <th>min</th>
                            </tr>
                        </thead>
                        <tbody>${htmlRows}</tbody>
                    </table>
                `);
            },
            () => this.setContent('Ошибка загрузки Players')
        );
    },

    renderYouth() {
        this.setContent('Проверяю молодёжные команды Transfermarkt...');

        YouthExternalMonitor.scanAll(
            msg => this.setContent(msg)
        )
            .then(result => {
                this.setContent(YouthExternalMonitor.renderResult(result));
                this.bindYouthFilters();
            })
            .catch(e => {
                console.error('[SLF Youth Monitor]', e);
                this.setContent(`Ошибка Youth Monitor: ${this.escapeHtml(e?.message || String(e))}. Частичные данные сохраняются в результате, если источники успели загрузиться.`);
            });
    },

    bindYouthFilters() {
        if (typeof YouthExternalMonitor !== 'undefined' && YouthExternalMonitor.bindRenderedFilters) {
            YouthExternalMonitor.bindRenderedFilters(document);
        }
    },

    renderPresetCard(name, meta, existsInStorage) {
        const groupColors = {
            defensive: '#9fd3ff',
            balance: '#ffd76a',
            attack: '#ff9f9f',
            henta: '#c6a6ff'
        };

        const color = groupColors[meta.group] || '#ddd';

        const statusText = existsInStorage
            ? 'есть в dropdown'
            : 'описание есть, пресет не импортирован';

        const statusColor = existsInStorage ? '#7cff7c' : '#ffb86c';

        return `
            <div style="
                background:#181818;
                border:1px solid #444;
                border-left:4px solid ${color};
                border-radius:6px;
                padding:9px 10px;
                margin:8px 0;
            ">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                    <div>
                        <div style="font-weight:bold;color:${color};font-size:14px;">
                            ${this.escapeHtml(name)}
                        </div>
                        <div style="font-size:11px;color:#aaa;margin-top:2px;">
                            ${this.escapeHtml(meta.title || '')}
                            · group: ${this.escapeHtml(meta.group || '')}
                            · rank: ${this.escapeHtml(meta.rank ?? '')}
                        </div>
                    </div>
                    <div style="font-size:11px;color:${statusColor};border:1px solid ${statusColor};border-radius:10px;padding:2px 7px;">
                        ${this.escapeHtml(statusText)}
                    </div>
                </div>

                <div style="margin-top:8px;line-height:1.4;">
                    <div><b style="color:#ddd;">Идея:</b> ${this.escapeHtml(meta.idea || '')}</div>
                    <div style="margin-top:4px;"><b style="color:#ddd;">Использовать:</b> ${this.escapeHtml(meta.use || '')}</div>
                    <div style="margin-top:4px;"><b style="color:#ddd;">Риск:</b> ${this.escapeHtml(meta.risk || '')}</div>
                </div>
            </div>
        `;
    },

    renderPresets() {
        const meta =
            typeof TacticPresetLibrary !== 'undefined' && TacticPresetLibrary.meta
                ? TacticPresetLibrary.meta
                : {};

        const presets =
            typeof PresetStorage !== 'undefined' && PresetStorage.getAllPresets
                ? PresetStorage.getAllPresets()
                : {};

        const names = Object.keys(meta);

        if (!names.length) {
            this.setContent(`
                <h3>Preset Library</h3>
                <div style="color:#f99;">TacticPresetLibrary пустой или не найден.</div>
            `);
            return;
        }

        const groups = [
            {
                id: 'defensive',
                title: 'Defensive / удержание',
                desc: 'Схемы для удержания счёта, снижения риска, компактности и игры против давления.'
            },
            {
                id: 'balance',
                title: 'Balance / контроль',
                desc: 'Схемы для равного матча, контроля центра, снижения брака и аккуратного вскрытия блока.'
            },
            {
                id: 'attack',
                title: 'Attack / давление',
                desc: 'Схемы для усиления давления, дожима, высокого прессинга и спасения матча.'
            },
            {
                id: 'henta',
                title: 'Henta Experimental',
                desc: 'Низкий блок, агрессивные отборы и ловушки через фланги, центр или контру.'
            }
        ];

        const groupHtml = groups.map(group => {
            const groupNames = names
                .filter(name => meta[name].group === group.id)
                .sort((a, b) => {
                    const ra = Number(meta[a].rank || 0);
                    const rb = Number(meta[b].rank || 0);
                    return rb - ra || a.localeCompare(b);
                });

            if (!groupNames.length) return '';

            const cards = groupNames
                .map(name => this.renderPresetCard(name, meta[name], !!presets[name]))
                .join('');

            return `
                <div style="margin-bottom:14px;">
                    <h3 style="margin:10px 0 4px 0;color:#ffd76a;">${this.escapeHtml(group.title)}</h3>
                    <div style="color:#aaa;margin-bottom:8px;">${this.escapeHtml(group.desc)}</div>
                    ${cards}
                </div>
            `;
        }).join('');

        const importedCount = names.filter(name => presets[name]).length;

        this.setContent(`
            <div>
                <h3 style="margin-top:0;">Preset Library</h3>

                <div style="
                    margin-bottom:10px;
                    padding:8px 10px;
                    background:#181818;
                    border:1px solid #444;
                    border-radius:6px;
                    color:#ddd;
                    line-height:1.4;
                ">
                    Здесь справочник авторских схем: что означает пресет, когда его использовать и какой риск.
                    <br>
                    Импортировано в dropdown: <b style="color:#7cff7c;">${importedCount}</b> из <b>${names.length}</b>.
                    Если у схемы статус “описание есть, пресет не импортирован”, значит она есть в справочнике рекомендаций, но её ещё нет в твоём JSON пресетов.
                </div>

                ${groupHtml}
            </div>
        `);
    }
};

// ============================================================
