#!/usr/bin/env node
// #333: legacy v10 names remain readable without re-entering active presets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const aliases = {
    MidBlock_Control4231_neutr: 'Emery_BalancedControl4231_neutr',
    MidBlock_Counter4411_neutr: 'Mourinho_CompactCounter4411_neutr',
    Lead_Outlet4141_def1: 'Allegri_LeadManagement4141_def1'
};
const legacyControls = {def_line:'1',press_line:'1',priority:[]};
const localKey = 'slf_custom_presets';
let persisted = JSON.stringify({
    MidBlock_Control4231_neutr:legacyControls,
    MidBlock_Counter4411_neutr:legacyControls,
    Lead_Outlet4141_def1:legacyControls,
    'Own Original Preset':{def_line:'2',press_line:'2',priority:['left']}
});
const saved = [];
const localStorage = {
    getItem(key) {return key === localKey ? persisted : null;},
    setItem(key,value) {assert.equal(key,localKey);persisted=value;saved.push(value);}
};
const sandbox = {
    console, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise, localStorage,
    CONFIG:{STORAGE_KEY:localKey,COLLECTIONS:{TACTICS:'tactics'}},
    DEFAULT_CUSTOM_PRESETS:{},
    BASE_PRESETS:{standard:{def_line:'2',priority:[]},...Object.fromEntries(Object.keys(aliases).map(name=>[name,legacyControls]))},
    BASE_LABELS:{standard:'Standard',...Object.fromEntries(Object.keys(aliases).map(name=>[name,name]))},
    Api:{get:()=>Promise.resolve(),post:()=>Promise.resolve()},
    debugWarn(){}, setTimeout:()=>0, clearTimeout:()=>{}
};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(read('src/modules/tactics-presets/preset-storage.js'),sandbox,{filename:'preset-storage.js'});
vm.runInContext(read('src/modules/tactics-presets/active-preset-registry.js'),sandbox,{filename:'active-preset-registry.js'});
const storage = vm.runInContext('PresetStorage',sandbox);
const registry = sandbox.SLFActivePresetRegistry;
const custom = storage.loadLocalRaw();
assert.deepEqual(Object.keys(custom),['Own Original Preset'],'unrelated user custom preset preserved');
assert.deepEqual(JSON.parse(JSON.stringify(custom['Own Original Preset'])),
    {def_line:'2',press_line:'2',priority:['left']});
assert.equal(saved.length,1,'one bounded local retired-key cleanup');
assert.deepEqual(Object.keys(JSON.parse(persisted)),['Own Original Preset']);
assert.equal(registry.active.length,12);
for(const [oldId,newId] of Object.entries(aliases)){
    assert.equal(storage.isRetiredBuiltInPreset(oldId),true,'retired generic ID hidden');
    assert.equal(storage.resolvePresetId(oldId),newId,'old stored selection resolves');
    assert.equal(registry.resolvePresetId(oldId),newId,'registry resolves same alias');
    assert.equal(sandbox.BASE_PRESETS[oldId],undefined,'old built-in removed');
    assert.equal(sandbox.BASE_LABELS[oldId],undefined,'old label removed');
    assert.equal(storage.getAllPresets()[oldId],undefined,'no duplicate menu item');
    assert.equal(storage.getAllLabels()[oldId],undefined,'no duplicate display label');
    assert.deepEqual(JSON.parse(JSON.stringify(storage.getAllPresets()[storage.resolvePresetId(oldId)])),
        JSON.parse(JSON.stringify(registry.presets[newId])),'legacy selection resolves to canonical v10 controls');
}
assert.equal(storage.resolvePresetId('Own Original Preset'),'Own Original Preset');
assert.equal(storage.resolvePresetId('not-a-preset'),'not-a-preset');
assert.equal(storage.isRetiredBuiltInPreset('Own Original Preset'),false);
assert.ok(storage.getAllPresets()['Own Original Preset']);
assert.equal(new Set(registry.active).size,12);
console.log('coach preset alias migration: OK');
