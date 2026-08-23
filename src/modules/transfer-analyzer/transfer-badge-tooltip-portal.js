// Transfer Badge Tooltip Portal
// Part of the TransferMarketAnalyzer badge rendering subsystem (issue #275).
// Assigned onto the TransferMarketAnalyzer facade; behaviour unchanged.

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.badgeTooltipPortalApplied = true;

    Object.assign(TransferMarketAnalyzer, {
    ensureHtmlTooltipStyles() {
        if (document.getElementById('slf-transfer-html-tooltip-style')) return;

        const style = document.createElement('style');
        style.id = 'slf-transfer-html-tooltip-style';
        style.textContent = `
            .slf-transfer-chip-tooltip-host { overflow:visible !important; position:relative; outline:none; cursor:help; }
            .slf-transfer-decision-details-trigger { cursor:pointer !important; }
            .slf-transfer-mkt-leaf-badge { min-width:max-content !important; max-width:none !important; width:auto !important; white-space:nowrap !important; overflow:visible !important; text-overflow:clip !important; }
            .slf-transfer-analysis-badge, .slf-transfer-analysis-compact, .slf-transfer-marker-wrap, .ta-cell, .ta-line { overflow:visible !important; white-space:normal !important; }
            .slf-transfer-analysis-badge { min-width:0 !important; width:auto !important; max-width:none !important; }
            .ta-cell { display:inline-flex !important; flex-direction:column !important; align-items:flex-start !important; gap:3px !important; box-sizing:border-box !important; min-width:0 !important; width:max-content !important; max-width:100% !important; }
            .ta-line { display:flex !important; flex-wrap:wrap !important; align-items:center !important; justify-content:flex-start !important; gap:3px 4px !important; min-width:0 !important; box-sizing:border-box !important; width:max-content !important; max-width:100% !important; }
            .ta-primary { order:1; }
            .ta-secondary { order:2; opacity:.9; }
            .ta-secondary .slf-transfer-decision-details-trigger { display:inline-flex !important; width:max-content !important; max-width:max-content !important; white-space:nowrap !important; align-self:center !important; }
            .ta-secondary a { white-space:nowrap !important; }
            .slf-transfer-chip-tooltip-host .slf-transfer-html-tooltip { display:none !important; }
            .slf-transfer-html-tooltip-portal {
                position:fixed;
                z-index:2147483647;
                max-width:min(780px, calc(100vw - 24px));
                min-width:260px;
                width:auto;
                max-height:min(560px, calc(100vh - 24px));
                overflow:auto;
                padding:8px 10px;
                background:#181818;
                color:#ddd;
                border:1px solid #666;
                border-radius:6px;
                box-shadow:0 8px 24px rgba(0,0,0,0.75);
                white-space:normal;
                line-height:1.35;
                text-align:left;
                font-size:11px;
            }
            .slf-transfer-html-tooltip-portal.slf-transfer-tooltip-hover { pointer-events:none; }
            .slf-transfer-html-tooltip-portal.slf-transfer-tooltip-click { pointer-events:auto; }
        `;
        document.head.appendChild(style);
    },

    bindHtmlTooltipPortal(root = document) {
        if (window.__slf_transfer_html_tooltip_portal_bound) return;
        window.__slf_transfer_html_tooltip_portal_bound = true;

        let portal = null;
        let activeHost = null;
        let activeMode = '';

        const escape = value => String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');

        const isDetailsHost = host => !!host && (
            host.classList?.contains('slf-transfer-decision-details-trigger') ||
            host.closest?.('.slf-transfer-details') ||
            String(host.textContent || '').trim().toLowerCase() === 'подробнее'
        );

        const normalizeHostTitle = host => {
            if (!host) return;
            const title = host.getAttribute('title');
            if (title && !host.dataset.slfTip) host.dataset.slfTip = title;
            if (title) host.removeAttribute('title');
        };

        const getTooltipHtml = host => {
            if (!host) return '';
            normalizeHostTitle(host);
            const source = host.querySelector?.('.slf-transfer-html-tooltip');
            if (source) return source.innerHTML || '';
            const tip = host.dataset?.slfTip || host.getAttribute?.('data-tooltip') || host.getAttribute?.('aria-label') || '';
            return tip ? `<div>${escape(tip)}</div>` : '';
        };

        const close = () => {
            if (portal) {
                portal.remove();
                portal = null;
            }
            activeHost = null;
            activeMode = '';
        };

        const place = host => {
            if (!portal || !host) return;
            const rect = host.getBoundingClientRect();
            const margin = 8;
            const details = isDetailsHost(host);
            const preferredWidth = details ? 540 : 780;
            const minWidth = details ? 300 : 260;
            const width = Math.max(Math.min(preferredWidth, window.innerWidth - margin * 2), Math.min(minWidth, window.innerWidth - margin * 2));
            portal.style.width = width + 'px';
            portal.style.minWidth = Math.min(minWidth, width) + 'px';

            let left = Math.min(Math.max(rect.left, margin), window.innerWidth - width - margin);
            let top = rect.bottom + 6;
            portal.style.left = left + 'px';
            portal.style.top = top + 'px';

            let after = portal.getBoundingClientRect();
            if (after.right > window.innerWidth - margin) {
                left = Math.max(margin, window.innerWidth - after.width - margin);
                portal.style.left = left + 'px';
            }
            if (after.left < margin) {
                portal.style.left = margin + 'px';
            }
            after = portal.getBoundingClientRect();
            if (after.bottom > window.innerHeight - margin) {
                top = Math.max(margin, rect.top - after.height - 6);
                portal.style.top = top + 'px';
            }
        };

        const open = (host, mode) => {
            if (!host) return;
            const html = getTooltipHtml(host);
            if (!html) return;
            if (portal && activeHost === host && activeMode === mode) {
                place(host);
                return;
            }

            close();
            activeHost = host;
            activeMode = mode;
            portal = document.createElement('div');
            portal.className = 'slf-transfer-html-tooltip-portal ' + (mode === 'click' ? 'slf-transfer-tooltip-click' : 'slf-transfer-tooltip-hover');
            portal.innerHTML = html;
            document.body.appendChild(portal);
            place(host);
        };

        const getHoverHost = target => {
            const host = target?.closest?.('.slf-transfer-chip-tooltip-host');
            if (!host || isDetailsHost(host)) return null;
            return host;
        };

        document.addEventListener('mouseover', e => {
            const host = getHoverHost(e.target);
            if (!host) return;
            open(host, 'hover');
        }, true);

        document.addEventListener('mouseout', e => {
            const host = getHoverHost(e.target);
            if (!host) return;
            const related = e.relatedTarget;
            if (related && host.contains(related)) return;
            if (activeHost === host && activeMode === 'hover') close();
        }, true);

        document.addEventListener('focusin', e => {
            const host = getHoverHost(e.target);
            if (!host) return;
            open(host, 'hover');
        }, true);

        document.addEventListener('focusout', e => {
            const host = getHoverHost(e.target);
            if (!host) return;
            if (activeHost === host && activeMode === 'hover') close();
        }, true);

        document.addEventListener('click', e => {
            const host = e.target.closest?.('.slf-transfer-chip-tooltip-host');
            if (!host) {
                if (!e.target.closest?.('.slf-transfer-html-tooltip-portal')) close();
                return;
            }

            normalizeHostTitle(host);

            if (!isDetailsHost(host)) {
                return;
            }

            if (host === activeHost && portal && activeMode === 'click') close();
            else open(host, 'click');

            e.stopPropagation();
            e.preventDefault();
        }, true);

        window.addEventListener('scroll', () => activeHost ? place(activeHost) : null, true);
        window.addEventListener('resize', () => activeHost ? place(activeHost) : null);
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') close();
        }, true);
    },

    buildStructuredMarkerTooltipHtml(marker) {
        if (!marker) return '';

        const category = this.markerCategory(marker);
        const esc = value => this.escapeHtml(value == null || value === '' ? '—' : String(value));
        const row = (label, value) => `
            <div style="display:grid;grid-template-columns:145px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid #2b2b2b;text-align:left;">
                <span style="color:#aaa;">${esc(label)}</span>
                <span style="color:#ddd;">${esc(value)}</span>
            </div>
        `;
        const section = (title, rows) => `
            <div style="margin:0 0 8px 0;">
                <div style="font-weight:bold;color:#ffd76a;margin-bottom:4px;">${esc(title)}</div>
                ${(rows || []).filter(Boolean).join('')}
            </div>
        `;

        const label = marker.label || '';
        const score = Number(marker.score || 0);
        const baseRows = [
            row('Маркер', label),
            row('Тип', category || 'other'),
            row('Сила сигнала', `${score >= 0 ? '+' : ''}${score}`),
            marker.redFlag ? row('Риск', 'красный флаг') : '',
            marker.hardStop ? row('Стоп', 'hard-stop') : '',
            row('Смысл', marker.text || label)
        ];

        if (category === 'market') {
            const details = marker.marketDetails || {};
            const current = details.currentInfo || {};
            const baseline = details.baseline || null;
            const nominal = details.nominal || {};
            const comparison = baseline?.p75 && current?.value
                ? `текущая цена ${Number(current.value) > Number(baseline.p75) ? 'выше' : 'ниже'} p75 примерно в ${Number(current.value / baseline.p75).toFixed(2)}x`
                : 'нет достаточной базы для сравнения';

            return [
                section('Рынок SLF', [
                    row('Цена сейчас', this.formatSlfMoneyShort(current.value)),
                    row('База скилла MKT', details.skillBasis?.label || ''),
                    row('Рыночный ориентир p75', baseline ? this.formatSlfMoneyShort(baseline.p75) : 'нет выборки'),
                    baseline && current?.value ? row('Отношение к p75', details.ratioText || `${Number(current.value / baseline.p75).toFixed(2)}x`) : '',
                    baseline ? row('Диапазон продаж', `${this.formatSlfMoneyShort(baseline.min)} – ${this.formatSlfMoneyShort(baseline.max)}`) : '',
                    baseline ? row('Выборка', `${baseline.count || 0} продаж`) : '',
                    baseline ? row('Доверие', baseline.confidence || '') : ''
                ]),
                section('Номинал', [
                    row('Номинал', nominal.ratioText || ''),
                    row('Базовый номинал', this.formatSlfMoneyShort(nominal.baseNominal || 0))
                ]),
                section('Сравнение', [
                    row('К p75', comparison),
                    row('Вывод', details.conclusion || marker.text || '')
                ])
            ].join('');
        }

        if (category === 'slf') {
            return section('SLF alter.php', [
                row('SLF delta', label),
                row('Что значит', marker.text || 'сравнение current skill и ИТОГ'),
                row('Решение', score > 0 ? 'положительный внутренний сигнал' : score < 0 ? 'риск просадки относительно ИТОГ' : 'нейтрально')
            ]);
        }

        if (category === 'activity') {
            return section('Готовность / минуты', [
                row('MIN', label),
                row('Что значит', marker.text || ''),
                row('Влияние', score >= 3 ? 'готовность подтверждена' : score < 0 ? 'риск отсутствия актуальной практики' : 'нужна ручная проверка')
            ]);
        }

        if (category === 'tm') {
            return section('Transfermarkt value', [
                row('TM €', label),
                row('Источник', 'Transfermarkt как внешний ориентир, не SLF-цена'),
                row('Что значит', marker.text || '')
            ]);
        }

        if (category === 'trend') {
            return section('Пик / динамика цены', [
                row('Сигнал', label),
                row('Что значит', marker.text || ''),
                row('Влияние', String(label).toLowerCase().includes('fall') ? 'сильный риск падения/старого пика' : 'проверка актуальности относительно пика')
            ]);
        }

        if (category === 'age') {
            return section('Возраст / стадия', [
                row('Возрастной маркер', label),
                row('Стадия', marker.text || ''),
                row('Влияние', score >= 3 ? 'рост/перепродажа возможны' : score < 0 ? 'возрастной риск' : 'оценивать как текущую пользу')
            ]);
        }

        if (category === 'club' || category === 'agent') {
            return section(category === 'club' ? 'Клубный статус' : 'Агент', [
                row('Маркер', label),
                row('Что значит', marker.text || ''),
                row('Риск', marker.redFlag ? 'повышенный' : 'обычный / неизвестный')
            ]);
        }

        if (category === 'contract') {
            return section('Контракт', [
                row('Статус', label),
                row('Что значит', marker.text || ''),
                row('Влияние', marker.redFlag ? 'нужна ручная проверка срока/доступности' : 'положительный или нейтральный статус')
            ]);
        }

        if (category === 'why') {
            return section('Почему такой ранг', [
                row('why', label),
                row('Главные причины', marker.text || ''),
                row('Как использовать', 'быстрый сжатый вывод; подробная расшифровка остаётся в «подробнее»')
            ]);
        }

        if (category === 'talent' || category === 'league') {
            return section('Рост / уровень лиги', [
                row('Сигнал', label),
                row('Что значит', marker.text || ''),
                row('Влияние', score > 0 ? 'потенциальный плюс к развитию/таланту' : 'слабый или рискованный сигнал')
            ]);
        }

        if (category === 'academy') {
            return section('Академия / клубный след', [
                row('Сигнал', label),
                row('Что значит', marker.text || ''),
                row('Влияние', score > 0 ? 'добавляет доверия к профилю' : 'нейтральный или неизвестный след')
            ]);
        }

        if (category === 'rumor') {
            return section('Интерес / слухи', [
                row('Сигнал', label),
                row('Что значит', marker.text || ''),
                row('Влияние', score > 0 ? 'внешний спрос поддерживает актуальность' : 'слабый или отсутствующий сигнал')
            ]);
        }

        return section('Маркер анализа', baseRows);
    },

    renderCompactChip(marker) {
        const label = String(marker?.label || '');
        const structuredTooltip = this.buildStructuredMarkerTooltipHtml(marker);
        const category = this.markerCategory(marker);
        const isMarket = category === 'market';
        const priority = String(marker?.visualPriority || (['slf', 'market', 'tm', 'activity'].includes(category) ? 'high' : ['talent', 'league', 'trend'].includes(category) ? 'medium' : 'low'));
        const priorityCss = priority === 'high'
            ? 'font-weight:700;padding:1px 5px;min-height:18px;line-height:17px;'
            : priority === 'low'
                ? 'font-weight:400;opacity:.78;filter:saturate(.75);'
                : 'font-weight:500;';
        const chipBase = `
            box-sizing:border-box;
            margin:0;
            padding:0 4px;
            border:1px solid ${this.borderByLevel(marker.level)};
            border-radius:4px;
            color:${this.colorByLevel(marker.level)};
            background:${this.bgByLevel(marker.level)};
            vertical-align:middle;
            line-height:16px;
            min-height:17px;
            font-size:10px;
            ${priorityCss}
            text-align:center;
        `;
        const marketCss = `
            display:inline-flex;
            flex:0 0 auto;
            width:auto;
            min-width:max-content;
            max-width:none;
            white-space:nowrap;
            overflow:visible;
            text-overflow:clip;
            cursor:help;
        `;
        const normalCss = `
            display:inline-flex;
            flex:0 1 auto;
            min-width:38px;
            max-width:110px;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
            cursor:help;
        `;

        this.ensureHtmlTooltipStyles();

        return `
            <span class="slf-transfer-chip-tooltip-host slf-transfer-analysis-chip ${isMarket ? 'slf-transfer-mkt-leaf-badge' : ''}" data-slf-tip-category="${this.escapeHtml(category || 'other')}" tabindex="0" style="
                ${chipBase}
                ${isMarket ? marketCss : normalCss}
            ">
                <span style="display:inline-block;min-width:${isMarket ? 'max-content' : '0'};max-width:${isMarket ? 'none' : '100%'};white-space:nowrap;overflow:${isMarket ? 'visible' : 'hidden'};text-overflow:${isMarket ? 'clip' : 'ellipsis'};">${this.escapeHtml(label)}</span>
                <span class="slf-transfer-html-tooltip" style="display:none;">${structuredTooltip}</span>
            </span>
        `;
    },

    shouldShowCompactMarker(marker) {
        if (!marker) return false;

        const label = String(marker.label || '');
        const level = String(marker.level || '');

        if (marker.hardStop || marker.redFlag) return true;
        if (['skip', 'risk', 'hot', 'good', 'watch'].includes(level)) return true;

        if (label.startsWith('SLF ')) return true;
        if (label.includes('now ')) return true;
        if (label.includes('no current')) return true;
        if (label.includes('T') && label.includes('<L')) return true;
        if (label.includes('>') && /\d/.test(label)) return true;

        if (label.includes('TM €')) return true;
        if (label.includes('peak')) return true;
        if (label.includes('collapsed')) return true;
        if (label.includes('contract')) return true;
        if (label.includes('exp ')) return true;
        if (label.includes('rumors') && !label.includes('RUMORS 0')) return true;

        if (label.includes('elite')) return true;
        if (label.includes('strong')) return true;

        return false;
    },
    });
}
