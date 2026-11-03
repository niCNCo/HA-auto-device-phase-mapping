'use strict';
// Reproduce v1.5.7's reported error: a delete option inside a phase group
// bubbled to a generic [data-phase] handler, producing phase_sensors.undefined.
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
const registry=new Map();
class Element {constructor(){this.tagName='PHASE-MAPPER-PANEL';}attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}}
const ctx={HTMLElement:Element,customElements:{get:k=>registry.get(k),define:(k,v)=>registry.set(k,v)},window:{customCards:[],matchMedia:()=>({matches:true}),confirm:()=>true},console,Math,Date,Number,String,Intl,Set,Map,Event,setTimeout,clearTimeout};
vm.createContext(ctx);vm.runInContext(source,ctx);
const View=registry.get('phase-mapper-panel');
const original={phase_sensors:{L1:'sensor.p1_1',L2:'sensor.p1_2',L3:'sensor.p1_3'},
 grid_current_sensors:{L1:'',L2:'',L3:''},grid_voltage_sensors:{L1:'',L2:'',L3:''},phase_current_limits_a:{L1:25,L2:25,L3:25},
 battery_sources:{L1:[],L2:[],L3:[]},solar_sources:{L1:[],L2:[],L3:[],TOTAL:[]},
 solar_phase_estimation:{enabled:false,currents:{L1:'',L2:'',L3:''},voltages:{L1:'',L2:'',L3:''}},
 manual_assignments:{},manual_devices:[{id:'manual_coffee',name:'Coffee machine',room:'Kitchen',phase:'L1',icon:'mdi:coffee-maker'}],
 display_names:{},display_icons:{},excluded:[],timing_overrides:{},learning_enabled:true,minimum_change_w:50,dashboard_refresh_seconds:2};
function view(){const v=new View();v._data={settings:JSON.parse(JSON.stringify(original)),devices:[{entity_id:'sensor.tv',name:'TV cabinet',phase:'L1',events:6,confidence:80}]};v._resetDraft();v._render=()=>{};v._hass={user:{is_admin:true}};return v;}
function fakeControl(value,dataset={}){return {value,dataset,listeners:{},addEventListener(event,fn){(this.listeners[event]??=[]).push(fn);},trigger(event){for(const fn of this.listeners[event]||[])fn({target:this,currentTarget:this});},closest:()=>null};}
function attachEvents(v,control){
  const phaseGroup=fakeControl(null,{phase:'L1'});
  const selectors=[];
  v.shadowRoot={querySelector:()=>null,querySelectorAll:sel=>{
    selectors.push(sel);
    if(sel==='[data-manual-phase]'||sel==='select')return [control];
    if(sel==='[data-phase]')return [phaseGroup]; // old, BROAD handler regression
    if(sel==='.group[data-phase]')return [phaseGroup];
    return [];
  }};
  v._wire();
  return {phaseGroup,selectors};
}
function stop(v){if(v._autoTimer!==null)clearTimeout(v._autoTimer);v._autoTimer=null;}
(async()=>{
 const v=view();const manual=fakeControl('__delete__',{manualPhase:'manual_coffee'});
 const {phaseGroup,selectors}=attachEvents(v,manual);
 assert(!selectors.includes('[data-phase]'),'Never attach change listener to phase GROUPS');
 assert(selectors.includes('select[data-phase]'),'Actual phase power selectors are the only legal source editor');
 manual.trigger('change'); // simulated user Delete + confirmation
 // The real DOM would bubble this to phaseGroup after handling the select.
 phaseGroup.trigger('change');
 stop(v);
 assert.equal(v._draft.manual_devices.length,0);
 assert.deepEqual(Object.keys(v._draft.phase_sensors).sort(),['L1','L2','L3']);
 assert.equal(v._draft.phase_sensors.undefined,undefined);
 let payload=v._settingsPayload();
 assert.deepEqual(Object.keys(payload).sort(),['manual_devices','type']);
 const calls=[];
 v._hass.callWS=async p=>{
   calls.push(p);
   assert(!('phase_sensors' in p));
   const next=JSON.parse(JSON.stringify(v._data));
   for(const [key,value] of Object.entries(p))if(key!=='type')next.settings[key]=value;
   return next;
 };
 await v._autosave();
 assert.equal(v._saveState,'saved');
 assert.equal(v._dirty,false);
 assert.equal(calls.length,1);
 assert(!v._message.includes('Saving…'));

 // Subsequent rename and icon change cannot inherit the invalid phase value.
 v._draft.display_names['sensor.tv']='Television';
 v._draft.display_icons['sensor.tv']='mdi:television';
 v._markDirty();stop(v);
 payload=v._settingsPayload();
 assert.deepEqual(Object.keys(payload).sort(),['display_icons','display_names','type']);
 await v._autosave();
 assert.equal(v._data.settings.display_names['sensor.tv'],'Television');
 assert.equal(v._data.settings.display_icons['sensor.tv'],'mdi:television');
 assert.equal(v._saveState,'saved');

 // A backend rejection retains the user edit AND displays an error instead of
 // falsely reporting success. The next user-triggered retry can then succeed.
 v._draft.display_names['sensor.tv']='TV after rejection';v._markDirty();stop(v);
 v._hass.callWS=async()=>{throw Error('mock server rejection');};
 await v._autosave();
 assert.equal(v._saveState,'error');
 assert.equal(v._dirty,true);
 assert.equal(v._message,'');
 assert(v._error.includes('mock server rejection'));
 v._hass.callWS=async p=>{const next=JSON.parse(JSON.stringify(v._data));for(const [key,value] of Object.entries(p))if(key!=='type')next.settings[key]=value;return next;};
 await v._autosave();
 assert.equal(v._saveState,'saved');assert.equal(v._dirty,false);
 assert.equal(v._data.settings.display_names['sensor.tv'],'TV after rejection');
 console.log('v1.5.8 delete bubbling, rename/icon autosave, failure feedback, retry passed');
})().catch(err=>{console.error(err);process.exitCode=1;});
