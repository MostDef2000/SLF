// 14.5 Training Reference Guide
// ============================================================

const TrainingGuidePanel = {
    panelId: 'slf-training-guide-panel',
    cacheCollection: 'training_league_benchmarks_v1',
    cacheSchema: 'slf_training_league_benchmarks_v1',
    roles: ['GK','CD','LD / RD','DM','LM / RM','CM','AM','ST'],
    goalkeeperSkills: ['ПС','СВ','ТВ','СК','РЕ','ИВ','ВП','РМ','ПИ','ВВ'],
    fieldSkills: ['ПС','СУ','ТУ','СК','УС','ОТ','ВП','ТХ','БВ','КР'],
    currentPayload: null,
    sourceSlots: [
        ['Италия','54164'], ['Англия','53597'], ['Германия','53582'], ['Испания','54151'], ['Франция','53609']
    ],

    isPage() { return /\/train\.php$/i.test(location.pathname || '') && !(location.search || ''); },
    esc(v) { return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); },
    norm(v) { return String(v ?? '').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim(); },
    skillKey(v) { return this.norm(v).toUpperCase().replace(/^ВЫН$/,'ВЫН'); },

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
#slf-training-guide-panel .slf-apply-profile{margin:0;padding:3px 7px;font-size:11px;white-space:nowrap}
</style><div class="slf-title">Средние прокачки выбранных лиг</div><div class="slf-muted">Страницы статистики загружаются только после нажатия «Рассчитать». Динамический профиль можно применить к отмеченным игрокам без автоматического сохранения.</div><div id="slf-sources">${this.sourceRows()}</div><button id="slf-calc" type="button">Рассчитать</button><div id="slf-status" class="slf-status">Загрузка последнего результата с VPS…</div><div id="slf-result"></div>`;
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
            names.forEach((el,i) => { const skill=this.skillKey(el.textContent); const value=Number(this.norm(values[i]?.textContent).replace(',','.')); if (skill && Number.isFinite(value)) skills[skill]=value; });
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
            buckets.forEach((values,skill) => { skills[skill]={value:Math.round(values.reduce((s,x)=>s+x.value,0)/values.length),sample:values.length,values}; });
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
    setSource(source,text,type='') { const el=source.row.querySelector('.slf-source-state'); if(el){el.className=`slf-source-state ${type?'slf-'+type:''}`;el.textContent=text;} },

    render(payload, label) {
        if (payload?.schema!==this.cacheSchema || !Array.isArray(payload.profiles)) return false;
        this.currentPayload = payload;
        const total=(payload.sources||[]).length, ok=(payload.sources||[]).filter(x=>x.status==='ok').length;
        const rows=payload.profiles.map(profile => `<tr><td>${this.esc(profile.role)}</td><td>${Object.entries(profile.skills||{}).map(([skill,data]) => { const title=(data.values||[]).map(x=>`${x.source}: ${x.value}`).join('\n')||`Источников: ${data.sample}`; return `<span class="slf-pair" title="${this.esc(title)}"><b>${this.esc(skill)}</b> ${Math.round(Number(data.value))}<sup>${data.sample}/${total||data.sample}</sup></span>`; }).join('')}</td><td><button type="button" class="slf-apply-profile" data-role="${this.esc(profile.role)}">Применить к выбранным</button></td></tr>`).join('');
        document.getElementById('slf-result').innerHTML=`<div class="slf-muted">${label} · ${new Date(payload.calculatedAt).toLocaleString('ru-RU')} · источников ${ok}/${total}</div><table class="slf-table"><thead><tr><th>Роль</th><th>Средние значения</th><th>Действие</th></tr></thead><tbody>${rows}</tbody></table>`;
        return true;
    },

    applyIds(payload) {
        const ids=(payload?.championshipIds||[]).map(String);
        [...document.querySelectorAll('.slf-source')].forEach((row,i) => { if(ids[i]) row.querySelector('.slf-champ-id').value=ids[i]; this.updateLinks(row); });
    },

    async loadCache() {
        try {
            const {data}=await Api.getPromise(this.cacheCollection,'training league benchmarks cache');
            if (!this.render(data,'Кеш VPS')) return this.setStatus('VPS-кеш отсутствует. Выполните динамический расчёт лиг.','muted');
            this.applyIds(data); this.setStatus('Последний расчёт загружен с VPS.','ok');
        } catch(error) { this.setStatus(`VPS-кеш недоступен (${error?.kind||'error'}${error?.status?'/'+error.status:''}).`,'error'); }
    },

    planSkillLabel(cell) {
        const textNode=[...cell.childNodes].find(node=>node.nodeType===3 && this.norm(node.textContent));
        return this.skillKey(textNode?.textContent || '');
    },

    selectedTrainingTables() {
        const selected=[...document.querySelectorAll('#train input[name="pl_arr[]"]:checked')];
        if (!selected.length) return {selected, tables:[]};
        const tables=[];
        selected.forEach(box=>{
            const table=box.closest('table');
            if (table && !tables.includes(table)) tables.push(table);
        });
        return {selected,tables};
    },

    inspectGroupFooter(table) {
        const footer=table.tFoot || table.querySelector('tfoot');
        if (!footer) return {ok:false,reason:'Групповая таблица планирования не найдена.'};
        const controls=[...footer.querySelectorAll('.up[data-sk-up]')].map(cell=>({
            cell,
            index:Number(cell.dataset.skUp),
            skill:this.planSkillLabel(cell),
            input:cell.querySelector('input[name^="up["]'),
            order:cell.querySelector('select[name^="order["]')
        })).filter(x=>x.index>=1 && x.index<=10 && x.skill && x.input && x.order);
        if (controls.length!==10) return {ok:false,reason:'Не распознаны групповые тренировочные поля.'};
        const skillSet=new Set(controls.map(x=>x.skill));
        const type=this.goalkeeperSkills.every(skill=>skillSet.has(skill))?'GK':this.fieldSkills.every(skill=>skillSet.has(skill))?'FIELD':'';
        if (!type) return {ok:false,reason:'Не распознан тип групповой таблицы.'};
        return {ok:true,footer,controls,type};
    },

    restoreFooters(snapshots) {
        snapshots.forEach(snapshot=>{
            snapshot.controls.forEach(item=>{
                item.control.order.value=item.order;
                item.control.order.dispatchEvent(new Event('change',{bubbles:true}));
                item.control.input.value=item.value;
                item.control.input.dispatchEvent(new Event('input',{bubbles:true}));
                item.control.input.dispatchEvent(new Event('change',{bubbles:true}));
            });
            snapshot.footer.style.display=snapshot.display;
        });
    },

    applyProfile(role) {
        if (this.currentPayload?.schema!==this.cacheSchema) return this.setStatus('Динамический профиль недоступен. Выполните расчёт лиг.','error');
        const profile=(this.currentPayload.profiles||[]).find(item=>item.role===role);
        if (!profile) return this.setStatus(`Профиль ${role} не найден в динамическом расчёте.`,'error');
        const {selected,tables}=this.selectedTrainingTables();
        if (!selected.length) return this.setStatus('Сначала отметьте хотя бы одного игрока.','error');
        if (!tables.length) return this.setStatus('Не найдена таблица выбранных игроков.','error');
        const inspected=tables.map(table=>this.inspectGroupFooter(table));
        const failed=inspected.find(item=>!item.ok);
        if (failed) return this.setStatus(`Профиль ${role} не применён. ${failed.reason}`,'error');
        const profileType=role==='GK'?'GK':'FIELD';
        const incompatible=inspected.find(item=>item.type!==profileType);
        if (incompatible) return this.setStatus('Нельзя применить один профиль одновременно к вратарям и полевым игрокам.','error');
        const targets=Object.entries(profile.skills||{}).map(([skill,data])=>({skill:this.skillKey(skill),target:Math.round(Number(data?.value))})).filter(x=>Number.isFinite(x.target));
        if (targets.length!==10) return this.setStatus(`Профиль ${role} содержит неполный набор навыков.`,'error');
        const snapshots=inspected.map(item=>({
            footer:item.footer,
            display:item.footer.style.display,
            controls:item.controls.map(control=>({control,order:control.order.value,value:control.input.value}))
        }));
        for (const item of inspected) {
            const controls=targets.map(target=>item.controls.find(control=>control.skill===target.skill));
            if (controls.some(control=>!control)) { this.restoreFooters(snapshots); return this.setStatus(`Профиль ${role} не соответствует групповой таблице.`,'error'); }
            item.footer.style.display='table-footer-group';
            item.controls.forEach(control=>{
                control.order.value='';
                control.order.dispatchEvent(new Event('change',{bubbles:true}));
            });
            for (let index=0; index<targets.length; index++) {
                const target=targets[index];
                const control=controls[index];
                control.order.value=String(index+1);
                control.order.dispatchEvent(new Event('change',{bubbles:true}));
                if (control.input.disabled) { this.restoreFooters(snapshots); return this.setStatus(`Поле ${target.skill} в групповой таблице осталось недоступным.`,'error'); }
                control.input.value=Number(target.target).toFixed(3);
                control.input.dispatchEvent(new Event('input',{bubbles:true}));
                control.input.dispatchEvent(new Event('change',{bubbles:true}));
            }
        }
        this.setStatus(`Профиль ${role} подготовлен для ${selected.length} выбранных игроков. Заполнено групповых таблиц: ${inspected.length}. Нажмите штатную кнопку «Сохранить».`,'ok');
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
        document.getElementById('slf-result').addEventListener('click',event=>{const button=event.target.closest('.slf-apply-profile');if(button)this.applyProfile(button.dataset.role);});
        this.loadCache();
    }
};

TrainingGuidePanel.mount();
