// 11.6 Youth Application Autofill
// ============================================================

const YouthApplicationAutofill = {
    isPage() {
        const params = new URLSearchParams(location.search);

        return location.pathname.includes('/youngs2.php') &&
            params.get('action') === 'new' &&
            !!params.get('slf_tm_url');
    },

    getParams() {
        const params = new URLSearchParams(location.search);

        return {
            tmId: params.get('slf_tm_id') || '',
            tmUrl: params.get('slf_tm_url') || '',
            name: params.get('slf_name') || '',
            sourceTeam: params.get('slf_source_team') || '',
            sourceLabel: params.get('slf_source_label') || ''
        };
    },

    // Логика имени как у Хенты:
    // full name -> first/last
    splitName(full) {
        const parts = String(full || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        if (!parts.length) {
            return { first: '', last: '' };
        }

        const first = parts[0] || '';

        if (parts.length <= 1) {
            return { first, last: '' };
        }

        return {
            first,
            last: parts.slice(1).join(' ')
        };
    },

    // Логика Хенты: убираем диакритику и приводим к ASCII.
    toAscii(s) {
        if (!s) return '';

        let t = String(s)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        t = t
            .replace(/ß/g, 'ss')
            .replace(/ø/g, 'o')
            .replace(/đ/g, 'd')
            .replace(/ł/g, 'l')
            .replace(/ð/g, 'd')
            .replace(/þ/g, 'th');

        return t;
    },

    // Логика Хенты: простая русификация латиницы.
    translitRU(s) {
        if (!s) return '';

        const map = {
            sch: 'щ',
            sh: 'ш',
            ch: 'ч',
            zh: 'ж',
            yo: 'ё',
            yu: 'ю',
            ya: 'я',
            ts: 'ц',
            th: 'т',

            a: 'а',
            b: 'б',
            c: 'к',
            d: 'д',
            e: 'е',
            f: 'ф',
            g: 'г',
            h: 'х',
            i: 'и',
            j: 'й',
            k: 'к',
            l: 'л',
            m: 'м',
            n: 'н',
            o: 'о',
            p: 'п',
            q: 'к',
            r: 'р',
            s: 'с',
            t: 'т',
            u: 'у',
            v: 'в',
            w: 'в',
            x: 'кс',
            y: 'и',
            z: 'з'
        };

        const orig = this.toAscii(s).replace(/\./g, '');
        const low = orig.toLowerCase();

        let out = '';
        let i = 0;

        while (i < low.length) {
            const tri = low.slice(i, i + 3);

            if (map[tri]) {
                out += map[tri];
                i += 3;
                continue;
            }

            const di = low.slice(i, i + 2);

            if (map[di]) {
                out += map[di];
                i += 2;
                continue;
            }

            const ch = low[i];
            out += map[ch] || ch;
            i++;
        }

        out = out.replace(/(^|\s|-)([а-яё])/g, (m, before, c) => {
            return before + c.toUpperCase();
        });

        return out;
    },

    getNameVariants(fullName) {
        const split = this.splitName(fullName);

        const firstLat = this.toAscii(split.first).replace(/\./g, '');
        const lastLat = this.toAscii(split.last).replace(/\./g, '');

        return {
            firstLat,
            lastLat,
            firstRu: this.translitRU(firstLat),
            lastRu: this.translitRU(lastLat)
        };
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    },

    injectPageScript(tmUrl) {
        const code = `
            (function () {
                const tmUrl = ${JSON.stringify(tmUrl)};

                const vipTab = document.querySelector('div[onclick*="vipwant"]');

                if (vipTab) {
                    try {
                        vipTab.click();
                        console.log('[SLF Youth Autofill PAGE] vipTab.click() done');
                    } catch (e) {
                        console.warn('[SLF Youth Autofill PAGE] vipTab.click() failed', e);
                    }
                } else {
                    console.warn('[SLF Youth Autofill PAGE] vipTab not found');
                }

                setTimeout(function () {
                    const input = document.querySelector('#tmlink');

                    if (input) {
                        input.value = tmUrl;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        input.dispatchEvent(new Event('keyup', { bubbles: true }));

                        try {
                            input.focus();
                            input.select();
                        } catch (e) {}

                        console.log('[SLF Youth Autofill PAGE] #tmlink filled', input.value);
                    } else {
                        console.warn('[SLF Youth Autofill PAGE] #tmlink not found');
                    }

                    const vipRows = Array.from(document.querySelectorAll('.vipauto'))
                        .map(x => getComputedStyle(x).display);

                    console.log('[SLF Youth Autofill PAGE] state', {
                        vipTab,
                        input,
                        vipRows
                    });
                }, 300);
            })();
        `;

        const script = document.createElement('script');
        script.textContent = code;
        document.documentElement.appendChild(script);
        script.remove();
    },

    forceFallback(tmUrl) {
        const vipTab = document.querySelector('div[onclick*="vipwant"]');
        const manualTab = document.querySelector('div[onclick*="tomanual"]');

        if (manualTab) {
            manualTab.classList.remove('changed');
            manualTab.classList.add('notchanged');
        }

        if (vipTab) {
            vipTab.classList.remove('notchanged');
            vipTab.classList.add('changed');
        }

        document.querySelectorAll('.nonactive').forEach(el => {
            el.style.display = 'none';
        });

        document.querySelectorAll('.vipauto').forEach(el => {
            el.style.display = el.tagName.toLowerCase() === 'tr'
                ? 'table-row'
                : 'block';
        });

        const input = document.querySelector('#tmlink');

        if (input) {
            input.value = tmUrl;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));

            try {
                input.focus();
                input.select();
            } catch (e) {}
        }

        console.log('[SLF Youth Autofill] fallback state', {
            vipTab,
            manualTab,
            input,
            inputValue: input?.value,
            vipRows: [...document.querySelectorAll('.vipauto')].map(x => getComputedStyle(x).display)
        });
    },

    copyText(value, button) {
        const text = String(value || '');

        if (!text) return;

        const done = () => {
            if (!button) return;

            const old = button.textContent;
            button.textContent = 'Скопировано';
            setTimeout(() => {
                button.textContent = old;
            }, 900);
        };

        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => {});
            return;
        }

        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();

        try {
            document.execCommand('copy');
            done();
        } catch (e) {}

        ta.remove();
    },

    showPanel(data) {
        const old = document.getElementById('slf-youth-autofill-panel');
        if (old) old.remove();

        const input = document.querySelector('#tmlink');
        const vipVisible = [...document.querySelectorAll('.vipauto')]
            .some(x => getComputedStyle(x).display !== 'none');

        const ok = !!input && input.value === data.tmUrl && vipVisible;
        const names = this.getNameVariants(data.name);

        const latinFull = `${names.firstLat || ''} ${names.lastLat || ''}`.trim();
        const ruFull = `${names.firstRu || ''} ${names.lastRu || ''}`.trim();

        const panel = document.createElement('div');
        panel.id = 'slf-youth-autofill-panel';
        panel.style.cssText = `
            position:fixed;
            right:12px;
            bottom:12px;
            z-index:999999;
            width:410px;
            background:#1f1f1f;
            color:#fff;
            border:1px solid #555;
            border-radius:6px;
            padding:10px;
            font-family:Arial,sans-serif;
            font-size:12px;
            box-shadow:0 8px 24px rgba(0,0,0,0.65);
        `;

        panel.innerHTML = `
            <div style="font-weight:bold;color:#7cff7c;margin-bottom:6px;">
                SLF Youth Autofill
            </div>

            <div style="margin-bottom:4px;">
                VIP:
                <b style="color:${vipVisible ? '#7cff7c' : '#ff9f9f'};">
                    ${vipVisible ? 'открыта' : 'не открыта'}
                </b>
            </div>

            <div style="margin-bottom:4px;">
                TM:
                <b style="color:${ok ? '#7cff7c' : '#ff9f9f'};">
                    ${ok ? 'вставлена' : 'не вставлена'}
                </b>
            </div>

            <div style="margin-bottom:4px;">
                Игрок TM: <b>${this.escapeHtml(data.name || '')}</b>
            </div>

            <div style="
                margin:7px 0;
                padding:7px;
                background:#181818;
                border:1px solid #444;
                border-radius:5px;
                line-height:1.45;
            ">
                <div style="color:#aaa;margin-bottom:4px;">Транслитерация как у Хенты:</div>

                <div>
                    Имя RU:
                    <b style="color:#ffd76a;">${this.escapeHtml(names.firstRu || '')}</b>
                    <button id="slf-copy-first-ru" style="margin-left:6px;padding:1px 5px;">copy</button>
                </div>

                <div>
                    Фамилия RU:
                    <b style="color:#ffd76a;">${this.escapeHtml(names.lastRu || '')}</b>
                    <button id="slf-copy-last-ru" style="margin-left:6px;padding:1px 5px;">copy</button>
                </div>

                <div style="margin-top:4px;color:#aaa;">
                    Полностью: <b>${this.escapeHtml(ruFull)}</b>
                    <button id="slf-copy-full-ru" style="margin-left:6px;padding:1px 5px;">copy</button>
                </div>
            </div>

            <div style="margin-bottom:4px;">
                Latin:
                <b>${this.escapeHtml(latinFull)}</b>
            </div>

            <div style="margin-bottom:4px;">
                TM ID: <b>${this.escapeHtml(data.tmId || '')}</b>
            </div>

            <div style="margin-bottom:6px;color:#aaa;">
                ${this.escapeHtml(data.sourceTeam || '')}
                ${data.sourceLabel ? '· ' + this.escapeHtml(data.sourceLabel) : ''}
            </div>

            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <a href="${this.escapeHtml(data.tmUrl || '#')}" target="_blank" style="color:#8cf;">Открыть TM</a>
                <button id="slf-youth-autofill-retry" style="padding:3px 7px;">Повторить</button>
                <button id="slf-youth-autofill-close" style="padding:3px 7px;">Закрыть</button>
            </div>
        `;

        document.body.appendChild(panel);

        const firstBtn = document.getElementById('slf-copy-first-ru');
        if (firstBtn) firstBtn.onclick = () => this.copyText(names.firstRu, firstBtn);

        const lastBtn = document.getElementById('slf-copy-last-ru');
        if (lastBtn) lastBtn.onclick = () => this.copyText(names.lastRu, lastBtn);

        const fullBtn = document.getElementById('slf-copy-full-ru');
        if (fullBtn) fullBtn.onclick = () => this.copyText(ruFull, fullBtn);

        const retry = document.getElementById('slf-youth-autofill-retry');
        if (retry) {
            retry.onclick = () => this.run(true);
        }

        const close = document.getElementById('slf-youth-autofill-close');
        if (close) {
            close.onclick = () => panel.remove();
        }
    },

    run(force = false) {
        if (!this.isPage()) return;

        const data = this.getParams();

        if (!data.tmUrl) return;

        if (!force && window.__slfYouthAutofillDone === location.href) return;

        window.__slfYouthAutofillDone = location.href;

        console.log('[SLF Youth Autofill] run', data);

        this.injectPageScript(data.tmUrl);

        setTimeout(() => this.injectPageScript(data.tmUrl), 500);
        setTimeout(() => this.forceFallback(data.tmUrl), 1100);
        setTimeout(() => this.showPanel(data), 1600);
    },

    start() {
        if (!this.isPage()) return;

        console.log('[SLF Youth Autofill] start', location.href);

        this.run();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.run(true));
        }

        window.addEventListener('load', () => this.run(true));

        setTimeout(() => this.run(true), 700);
        setTimeout(() => this.run(true), 1500);
        setTimeout(() => this.run(true), 3000);
    }
};

/*
 * Отдельный bootstrap.
 * Не зависит от App.mountUI(), чтобы работало на youngs2.php?action=new.
 */
try {
    YouthApplicationAutofill.start();
} catch (e) {
    console.error('[SLF Youth Autofill] bootstrap failed', e);
}



// ============================================================
