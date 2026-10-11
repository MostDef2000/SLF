#!/usr/bin/env node
// #331: browser-native tactical control preflight and rollback boundaries.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const controls=['def_line','press_line','def_width','press_intense',
 'build_type','build_temp','build_long','build_fast','style',
 'pass_risk','dribble','cross','corner','shot'];
const allowed={
 def_line:['1','2','3'],press_line:['1','2','3'],def_width:['1','2','3'],
 press_intense:['1','2','3','4','5'],build_type:['1','2','3'],
 build_temp:['1','2','3'],build_long:['1','2','3'],build_fast:['1','2','3'],
 style:['1','2','3','4','5'],pass_risk:['1','2','3','4','5'],dribble:['1','2','3','4','5'],
 cross:['1','2','3'],corner:['1','2'],shot:['1','2','3']
};
const source=fs.readFileSync(path.join(root,'src/modules/tactics-presets/tactic-control-bridge.js'),'utf8');

function harness(){
 const current=Object.fromEntries(controls.map(key=>[key,'1']));
 current.priority=[];
 const missing=new Set();
 const writes=[];
 let fault=null;
 const document={
  querySelector(selector){
   const match=selector.match(/^input\[name="([^"]+)"\]\[value="([^"]+)"\]$/);
   if(match){
    const key=match[1],value=match[2];
    return allowed[key]?.includes(value)&&!missing.has(key+':'+value)?{}:null;
   }
   const checkbox=selector.match(/^input\[type="checkbox"\]\[name="(priority_[lcr])"\]$/);
   return checkbox?{}:null;
  }
 };
 const sandbox={console,document,Date,Math,JSON,Number,String,Object,Array,Set,Map,Promise,
  STATE:{},debugWarn(){},
  normalizePresets(data){return data;},
  getCurrentTactic(){return {...current,priority:current.priority.slice()};},
  async setControlAsync(key,value){
   writes.push([key,JSON.stringify(value)]);
   if(fault?.key===key && fault?.value===String(value) && fault.type==='reject') return false;
   if(fault?.key===key && fault?.value===String(value) && fault.type==='ignore') return true;
   if(key==='priority')current.priority=(Array.isArray(value)?value:[]).slice();
   else current[key]=String(value);
   return true;
  }
 };
 sandbox.window=sandbox;
 sandbox.globalThis=sandbox;
 vm.createContext(sandbox);
 vm.runInContext(source,sandbox,{filename:'tactic-control-bridge.js'});
 return {bridge:sandbox.STATE.tacticControlBridge,current,missing,writes,setFault(value){fault=value}};
}
const change={...Object.fromEntries(controls.map(key=>[key,'2'])),priority:[]};

{
 const h=harness();
 const invalid={...change,press_line:'5'};
 const result=await h.bridge.applyTacticObject(invalid,{strict:true,source:'preset:v10-invalid'});
 assert.equal(result.ok,false);
 assert.equal(result.reason,'preflight_failed');
 assert.equal(h.writes.length,0,'invalid native ordinal rejects before any click');
 assert.equal(h.current.def_line,'1');
}
{
 const h=harness();
 h.missing.add('def_width:2');
 const result=await h.bridge.applyTacticObject(change,{strict:true,source:'preset:v10-missing'});
 assert.equal(result.ok,false);
 assert.equal(result.reason,'preflight_failed');
 assert.equal(h.writes.length,0,'missing radio option cannot cause a partial apply');
}
{
 const h=harness();
 const result=await h.bridge.applyTacticObject(change,{strict:true,source:'preset:v10-valid'});
 assert.equal(result.ok,true);
 assert.equal(result.applicationStatus,'ui_readback_confirmed');
 assert.equal(result.verification,'native_control_dom_readback_only');
 assert.equal(h.current.def_line,'2');
 assert.equal(h.current.shot,'2');
 assert.equal(h.writes.length,15,'all slider/priority controls are checked');
}
{
 const h=harness();
 h.setFault({key:'press_line',value:'2',type:'reject'});
 const result=await h.bridge.applyTacticObject(change,{strict:true,source:'preset:v10-rejected'});
 assert.equal(result.ok,false);
 assert.equal(result.rolledBack,true,'failed mid-sequence apply must recover original state');
 assert.equal(h.current.def_line,'1');
 assert.equal(h.current.press_line,'1');
 assert.equal(h.current.shot,'1');
 assert.equal(h.bridge.schema,'slf_tactic_control_bridge_v1');
}
{
 const h=harness();
 h.setFault({key:'press_line',value:'2',type:'ignore'});
 const result=await h.bridge.applyTacticObject(change,{strict:true,source:'preset:v10-readback'});
 assert.equal(result.ok,false);
 assert.equal(result.rolledBack,true,'post-readback mismatch must rollback');
 assert.deepEqual(Object.values(h.current).slice(0,14),Array(14).fill('1'));
}
{
 const h=harness();
 h.missing.add('def_line:1');
 const result=await h.bridge.applyTacticObject(change,{strict:true,source:'preset:v10-original-missing'});
 assert.equal(result.ok,false);
 assert.equal(h.writes.length,0,'not safe to mutate without original rollback option');
}
console.log('v10 tactic bridge native preflight and rollback: OK');
