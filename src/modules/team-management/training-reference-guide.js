// 14.5 Training Reference Guide
// ============================================================

const SLF_TRAINING_PROFILES_V1 = [
    { role: 'GK', normal: [['ПС',8],['СВ',7],['ТВ',7],['СК',6],['РЕ',23],['ИВ',22],['ВП',22],['РМ',6],['ПИ',2],['ВВ',58]], top: [['ПС',9],['СВ',8],['ТВ',8],['СК',8],['РЕ',26],['ИВ',26],['ВП',26],['РМ',8],['ПИ',2],['ВВ',66]] },
    { role: 'CD', normal: [['ПС',15],['СУ',4],['ТУ',4],['СК',19],['УС',19],['ОТ',25],['ВП',24],['ТХ',11],['БВ',23],['КР',14]], top: [['ПС',18],['СУ',5],['ТУ',5],['СК',23],['УС',23],['ОТ',30],['ВП',28],['ТХ',12],['БВ',27],['КР',17]] },
    { role: 'LD / RD', normal: [['ПС',17],['СУ',4],['ТУ',4],['СК',22],['УС',22],['ОТ',25],['ВП',23],['ТХ',13],['БВ',16],['КР',16]], top: [['ПС',20],['СУ',5],['ТУ',5],['СК',25],['УС',25],['ОТ',30],['ВП',26],['ТХ',15],['БВ',18],['КР',18]] },
    { role: 'DM', normal: [['ПС',23],['СУ',8],['ТУ',8],['СК',19],['УС',20],['ОТ',24],['ВП',23],['ТХ',18],['БВ',11],['КР',18]], top: [['ПС',26],['СУ',10],['ТУ',10],['СК',23],['УС',23],['ОТ',29],['ВП',27],['ТХ',21],['БВ',12],['КР',21]] },
    { role: 'CM', normal: [['ПС',26],['СУ',16],['ТУ',16],['СК',20],['УС',20],['ОТ',4],['ВП',18],['ТХ',22],['БВ',8],['КР',22]], top: [['ПС',30],['СУ',19],['ТУ',19],['СК',23],['УС',23],['ОТ',5],['ВП',20],['ТХ',25],['БВ',9],['КР',25]] },
    { role: 'LM / RM', normal: [['ПС',25],['СУ',15],['ТУ',15],['СК',23],['УС',22],['ОТ',3],['ВП',15],['ТХ',22],['БВ',8],['КР',21]], top: [['ПС',28],['СУ',18],['ТУ',18],['СК',26],['УС',25],['ОТ',3],['ВП',18],['ТХ',25],['БВ',9],['КР',24]] },
    { role: 'LW / RW', normal: [['ПС',24],['СУ',20],['ТУ',20],['СК',22],['УС',22],['ОТ',2],['ВП',16],['ТХ',22],['БВ',8],['КР',21]], top: [['ПС',27],['СУ',24],['ТУ',24],['СК',25],['УС',25],['ОТ',2],['ВП',19],['ТХ',25],['БВ',9],['КР',24]] },
    { role: 'AM', normal: [['ПС',22],['СУ',22],['ТУ',22],['СК',19],['УС',19],['ОТ',2],['ВП',17],['ТХ',20],['БВ',9],['КР',19]], top: [['ПС',27],['СУ',26],['ТУ',26],['СК',23],['УС',23],['ОТ',2],['ВП',20],['ТХ',24],['БВ',11],['КР',23]] },
    { role: 'ST', normal: [['ПС',11],['СУ',25],['ТУ',25],['СК',18],['УС',18],['ОТ',2],['ВП',20],['ТХ',18],['БВ',20],['КР',16]], top: [['ПС',13],['СУ',29],['ТУ',29],['СК',22],['УС',21],['ОТ',2],['ВП',23],['ТХ',21],['БВ',26],['КР',18]] }
];

const TrainingGuidePanel = {
    panelId: 'slf-training-guide-panel',
    cacheCollection: 'training_league_benchmarks_v1',
    cacheSchema: 'slf_training_league_benchmarks_v1',
    roles: ['GK','CD','LD / RD','DM','LM / RM','CM','AM','ST'],
    sourceSlots: [
        ['Италия','54164'], ['Англия','53597'], ['Германия','53582'], ['Испания','54151'], ['Франция','53609']
    ],

    isPage() { return /\/train\.php$/i.test(location.pathname || '') && !(location.search || ''); },
    esc(v) { return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); },
    norm(v) { return String(v ?? '').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim(); },

    formatPairs(role, column, pairs) {
        return (pairs || []).map(([skill,value]) => `<span class="slf-pair" data-slf-role="${this.esc(role)}" data-slf-col="${column}" data-slf-skill="${this.esc(skill)}" data-slf-value="${value}"><b>${this.esc(skill)}</b> ${value}</span>`).join('');
    },

    staticTable() {
        const rows = SLF_TRAINING_PROFILES_V1.map(row => `<tr data-slf-training-role="${this.esc(row.role)}"><td>${this.esc(row.role)}</td><td>${this.formatPairs(row.role,'normal',row.normal)}</td><td>${this.formatPairs(row.role,'top',row.top)}</td></tr>`).join('');
        return `<details id="slf-static-profiles" open><summary>Статический справочник SLF Training Profiles v1</summary><table class="slf-table"><thead><tr><th>Роль</th><th>normal</th><th>top</th></tr></thead><tbody>${rows}</tbody></table></details>`;
    },

    sourceRows() {
        return this.sourceSlots.map(([name,id],index) => `<div class="slf-source" data-index="${index}"><label>${name}</label><input class="slf-champ-id" value="${id}" inputmode="numeric" maxlength="10"><a class="slf-league" href="/champ.php?action=view&id=${id}" target="_blank">Чемпионат</a><a class="slf-stats" href="/champ.stat.php?id=${id}" target="_blank">Статистика</a><span class="slf-source-state"></span></div>`).join('');
    },

    content() {
        return `<style>
#slf-training-guide-panel{flex:0 0 720px;width:720px;margin:0 0 12px 18px;padding:10px;background:#222;color:#fff;border:1px solid #555;border-radius:6px;font:12px Arial;box-sizing:border-box}
#slf-training-guide-panel a{color:#9ccfff}#slf-training-guide-panel .slf-title{color:#7cff7c;font-weight:bold;font-size:14px;margin-bottom:6px}
#slf-training-guide-panel .slf-source{display:grid;grid-template-columns:80px 90px 78px 78px 1fr;gap:6px;align-items:center;margin:3px 0}
#slf-training-guide-panel input{width:84px}#slf-training-guide-panel button{margin-top:7px;padding:5px 10px;cursor:pointer}
#slf-training-guide-panel .slf-status{margin:7px 0;padding:5px;background:#191919;border:1px solid #444}.slf-ok{color:#78e46d}.slf-error{color:#f1aaaa}.slf-muted{color:#aaa}
#slf-training-guide-panel .slf-table{width:100%;border-collapse:collapse;font-size:11px;margin-top:6px}#slf-training-guide-panel th,#slf-training-guide-panel td{padding:4px 5px;border-bottom:1px solid #444;text-align:left;vertical-align:top}
#slf-training-guide-panel th{color:#8cf}#slf-training-guide-panel td:first-child{color:#ffd76a;font-weight:bold;white-space:nowrap}#slf-training-guide-panel .slf-pair{display:inline-block;margin:0 6px 3px 0;white-space:nowrap}#slf-training-guide-panel .slf-pair b{color:#8cf}
#slf-training-guide-panel details{margin-top:8px}#slf-training-guide-panel summary{cursor:pointer}
</style><div class="slf-title">Средние прокачки выбранных лиг</div><div class="slf-muted">Страницы статистики загружаются только после нажатия «Рассчитать».</div><div id="slf-sources">${this.sourceRows()}</div><button id="slf-calc" type="button">Рассчитать</button><div id="slf-status" class="slf-status">Загрузка последнего результата с VPS…</div><div id="slf-result"></div>${this.staticTable()}`;
    },

    updateLinks(row) {
        const id = this.norm(row.querySelector('.slf-champ-id')?.value).replace(/\D+/g,'');
        row.querySelector('.slf-league').href = `/champ.php?action=view&id=${encodeURIComponent(id)}`;
        row.querySelector('.slf-stats').href = `/champ.stat.php?id=${encodeURIComponent(id)}`;
    },

    readSources() {
        const sources = [...document.querySelectorAll('.slf-source')].map((row,index) => ({ row, index, name:this.norm(row.querySelector('label')?.textContent)||`Лига ${index+1}`, id:this.norm(row.querySelector('.slf-champ-id')?.value) })).filter(x => x.id);
        if (!sources.length) throw new Error('Укажите хотя бы один ID чемпионата.');
        const invalid = sources.find(x => !/^\d+$/.test(x.id));
        if (invalid) throw new Error(`Некорректный ID у «${invalid.name}».`);
        const seen = new Set();
        const duplicate = sources.find(x => seen.has(x.id) || !seen.add(x.id));
        if (duplicate) throw new Error(`ID ${duplicate.id} указан несколько раз.`);
        return sources;
    },

    parseDocument(doc, source) {
        const heading = [...doc.querySelectorAll('.h3,h1,h2,h3')].find(el => /средние прокачки по лиге/i.test(this.norm(el.textContent)));
        let block = heading?.nextElementSibling;
        if (!block?.classList?.contains('stat-position-compare')) block = doc.querySelector('.stat-position-compare');
        if (!block) throw new Error('Блок средних прокачек не найден.');
        const parsed = [...block.querySelectorAll('.stat-position-compare__item')].map(item => {
            const role = this.norm(item.querySelector('.stat-position-compare__head')?.textContent).toUpperCase();
            const names = [...item.querySelectorAll('.stat-position-compare__skill-name')];
            const values = [...item.querySelectorAll('.stat-position-compare__skill-block')];
            const skills = {};
            names.forEach((el,i) => { const skill=this.norm(el.textContent).toUpperCase(); const value=Number(this.norm(values[i]?.textContent).replace(',','.')); if (skill && Number.isFinite(value)) skills[skill]=value; });
            return role && Object.keys(skills).length ? {role,skills} : null;
        }).filter(Boolean);
        const map = new Map(parsed.map(x => [x.role,x]));
        const missing = this.roles.filter(role => !map.has(role));
        if (missing.length) throw new Error(`Не найдены роли: ${missing.join(', ')}`);
        return { championshipId:Number(source.id), name:source.name, profiles:this.roles.map(role => map.get(role)) };
    },

    parseHtml(html, source) { return this.parseDocument(new DOMParser().parseFromString(String(html),'text/html'), source); },

    aggregate(results) {
        return this.roles.map(role => {
            const buckets = new Map();
            results.forEach(result => Object.entries(result.profiles.find(x => x.role===role)?.skills || {}).forEach(([skill,value]) => {
                if (!buckets.has(skill)) buckets.set(skill,[]);
                buckets.get(skill).push({source:result.name,championshipId:result.championshipId,value:Number(value)});
            }));
            const skills = {};
            buckets.forEach((values,skill) => { skills[skill]={value:Math.round(values.reduce((s,x)=>s+x.value,0)/values.length*10)/10,sample:values.length,values}; });
            return {role,skills};
        });
    },

    payload(configured, settled, profiles) {
        return { schema:this.cacheSchema, championshipIds:configured.map(x=>Number(x.id)), sources:settled.map(x=>({championshipId:Number(x.id),name:x.name,leagueUrl:`/champ.php?action=view&id=${x.id}`,statsUrl:`/champ.stat.php?id=${x.id}`,status:x.status,error:x.error||''})), profiles, calculatedAt:new Date().toISOString() };
    },

    async fetchSource(source) {
        const response = await fetch(`/champ.stat.php?id=${encodeURIComponent(source.id)}`, {credentials:'include',cache:'no-store'});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return this.parseHtml(await response.text(), source);
    },

    setStatus(text,type='') { const el=document.getElementById('slf-status'); if(el){el.className=`slf-status ${type?'slf-'+type:''}`;el.textContent=text;} },
    setSource(source,text,type='') { const el=source.row.querySelector('.slf-source-state'); el.className=`slf-source-state ${type?'slf-'+type:''}`;el.textContent=text; },

    render(payload, label) {
        if (payload?.schema!==this.cacheSchema || !Array.isArray(payload.profiles)) return false;
        const total=(payload.sources||[]).length, ok=(payload.sources||[]).filter(x=>x.status==='ok').length;
        const rows=payload.profiles.map(profile => `<tr><td>${this.esc(profile.role)}</td><td>${Object.entries(profile.skills||{}).map(([skill,data]) => { const title=(data.values||[]).map(x=>`${x.source}: ${x.value}`).join('\n')||`Источников: ${data.sample}`; return `<span class="slf-pair" title="${this.esc(title)}"><b>${this.esc(skill)}</b> ${Number(data.value).toFixed(1)}<sup>${data.sample}/${total||data.sample}</sup></span>`; }).join('')}</td></tr>`).join('');
        document.getElementById('slf-result').innerHTML=`<div class="slf-muted">${label} · ${new Date(payload.calculatedAt).toLocaleString('ru-RU')} · источников ${ok}/${total}</div><table class="slf-table"><thead><tr><th>Роль</th><th>Средние значения</th></tr></thead><tbody>${rows}</tbody></table>`;
        document.getElementById('slf-static-profiles').open=false;
        return true;
    },

    applyIds(payload) {
        const ids=(payload?.championshipIds||[]).map(String);
        [...document.querySelectorAll('.slf-source')].forEach((row,i) => { if(ids[i]) row.querySelector('.slf-champ-id').value=ids[i]; this.updateLinks(row); });
    },

    async loadCache() {
        try {
            const {data}=await Api.getPromise(this.cacheCollection,'training league benchmarks cache');
            if (!this.render(data,'Кеш VPS')) return this.setStatus('VPS-кеш отсутствует. Показан статический справочник.','muted');
            this.applyIds(data); this.setStatus('Последний расчёт загружен с VPS.','ok');
        } catch(error) { this.setStatus(`VPS-кеш недоступен (${error?.kind||'error'}${error?.status?'/'+error.status:''}).`,'error'); }
    },

    async calculate() {
        let configured;
        try { configured=this.readSources(); } catch(error) { return this.setStatus(error.message,'error'); }
        const button=document.getElementById('slf-calc'); button.disabled=true;
        let done=0; this.setStatus(`Загрузка источников: 0/${configured.length}…`);
        const settled=await Promise.all(configured.map(async source => {
            this.setSource(source,'загрузка…');
            try { const parsed=await this.fetchSource(source); done++; this.setSource(source,'✓','ok'); this.setStatus(`Загрузка источников: ${done}/${configured.length}…`); return {...source,status:'ok',parsed}; }
            catch(error) { done++; const message=this.norm(error?.message||error); this.setSource(source,`ошибка: ${message}`,'error'); this.setStatus(`Загрузка источников: ${done}/${configured.length}…`); return {...source,status:'error',error:message}; }
        }));
        const successful=settled.filter(x=>x.status==='ok').map(x=>x.parsed);
        if (!successful.length) { button.disabled=false; return this.setStatus('Ни один источник не разобран. Предыдущий VPS-кеш не изменён.','error'); }
        const payload=this.payload(configured,settled,this.aggregate(successful)); this.render(payload,'Новый расчёт');
        try { await Api.postPromise(this.cacheCollection,payload,'training league benchmarks cache'); this.setStatus(`Расчёт завершён: ${successful.length}/${configured.length}. Сохранено на VPS.`,'ok'); }
        catch(error) { this.setStatus(`Расчёт готов, но VPS-кеш не сохранён (${error?.kind||'error'}${error?.status?'/'+error.status:''}).`,'error'); }
        finally { button.disabled=false; }
    },

    mount() {
        if (!this.isPage() || document.getElementById(this.panelId)) return;
        const train=document.querySelector('#train'), pad=train?.closest('.pad2')||document.querySelector('.pad2'), panel=document.createElement('div');
        panel.id=this.panelId; panel.innerHTML=this.content();
        if (train && pad) { const wrapper=document.createElement('div'),left=document.createElement('div'); wrapper.id='slf-training-guide-layout'; wrapper.style.cssText='display:flex;align-items:flex-start;gap:18px;width:100%'; left.id='slf-training-left-column'; pad.insertBefore(wrapper,train); left.appendChild(train); wrapper.append(left,panel); }
        else (document.querySelector('.pad2')||document.body).appendChild(panel);
        document.getElementById('slf-calc').addEventListener('click',()=>this.calculate());
        document.getElementById('slf-sources').addEventListener('input',event=>{const row=event.target.closest('.slf-source');if(row)this.updateLinks(row);});
        this.loadCache();
    }
};

TrainingGuidePanel.mount();
