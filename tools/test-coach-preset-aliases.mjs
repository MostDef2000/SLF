#!/usr/bin/env node
// #333: v10 built-in names remain readable by v11 without re-entering active presets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const aliases = {
    Arteta_Control433_bal3: 'Arteta_SafePossession_v11',
    Pep_BoxControl_bal2: 'Guardiola_PressEscape_v11',
    Pep_PressCooldown_bal2: 'Guardiola_PressCooldown_v11',
    Pep_ControlledPush_att3: 'Guardiola_ControlledPush_v11',
    Pep_TwoThreeFive_att3: 'Guardiola_PositionalSiege_v11',
    Conte_WingbackWidth_bal4: 'Conte_WideChannels_v11',
    Klopp_Gegenpress_att4: 'Klopp_LateGegenpress_v11',
    Simeone_Compact442_def4: 'Simeone_CompactLead_v11',
    Simeone_LowBlock_def5: 'Simeone_EmergencyBlock_v11',
    Emery_BalancedControl4231_neutr: 'Emery_BalancedBase_v11',
    Mourinho_CompactCounter4411_neutr: 'Mourinho_CleanCounter_v11',
    Allegri_LeadManagement4141_def1: 'Allegri_LeadOutlet_v11',
    MidBlock_Control4231_neutr: 'Emery_BalancedBase_v11',
    MidBlock_Counter4411_neutr: 'Mourinho_CleanCounter_v11',
    Lead_Outlet4141_def1: 'Allegri_LeadOutlet_v11'
};
const legacyControls = {def_line:'1',press_line:'1',priority:[]};
const localKey = 'slf_custom_presets';
let persisted = JSON.stringify({
    ...Object.fromEntries(Object.keys(aliases).map(name=>[name,legacyControls])),
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
        JSON.parse(JSON.stringify(registry.presets[newId])),'legacy selection resolves to canonical v11 controls');
}
assert.equal(storage.resolvePresetId('Own Original Preset'),'Own Original Preset');
assert.equal(storage.resolvePresetId('not-a-preset'),'not-a-preset');
assert.equal(storage.isRetiredBuiltInPreset('Own Original Preset'),false);
assert.ok(storage.getAllPresets()['Own Original Preset']);
assert.equal(new Set(registry.active).size,12);
console.log('coach preset alias migration: OK');
