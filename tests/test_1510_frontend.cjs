'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
const reg=new Map();
class Element { constructor(){this.tagName='PHASE-MAPPER-PANEL';} attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};} }
const ctx={HTMLElement:Element,customElements:{get:k=>reg.get(k),define:(k,v)=>reg.set(k,v)},window:{customCards:[]},console,Math,Date,Number,String,Intl,Set,Map,Event,setTimeout,clearTimeout};
vm.createContext(ctx);vm.runInContext(src,ctx);
const View=reg.get('phase-mapper-panel');
const v=new View();
// HA WebSocket mutates outbound request objects with an unrelated numeric `id`.
const payload={type:'ha_auto_device_phase_mapping/set',manual_devices:[],id:291};
assert.equal(v._settingsAcknowledged(payload,{save_ack:{committed:true,fields:['manual_devices']},settings:{manual_devices:[]}}),true,
   'WebSocket message id must never be interpreted as a settings field');
assert.equal(v._settingsAcknowledged(payload,{settings:{manual_devices:[]}}),true,
   'Fallback settings comparison must ignore the WebSocket message id too');
assert.equal(v._settingsAcknowledged(payload,{settings:{manual_devices:[{id:'manual_1'}]}}),false,
   'A truly rejected deletion must still be reported as failed');
assert.deepEqual(Array.from(v._saveMismatch),['manual_devices']);
assert(src.includes('.phasebox .mapped-listing .device-alias .name{color:var(--secondary-text-color)'),
   'Mapped names should match P1 secondary labels');
assert(src.includes('.phasebox .mapped-listing .device-icon{color:var(--phase-accent)'),
   'Mapped device icons should retain phase colors');
assert(src.includes('background:color-mix(in srgb,var(--phase-accent) 3%,color-mix('),
   'Mapped device container should be subtly darker');
// End-to-end autosave test: HA's callWS adds `id` directly to the request
// before the backend's committed-fields reply arrives.
const settings=JSON.parse(fs.readFileSync('tests/fixtures/save_settings.json','utf8'));
v._data={settings,devices:[],version:'1.5.10'};
v._resetDraft();v._render=()=>{};
let writes=0;
v._hass={user:{is_admin:true},callWS:async payload=>{
  payload.id=900+writes++;
  const committed=Object.keys(payload).filter(key=>key!=='type'&&key!=='id');
  const saved=JSON.parse(JSON.stringify(v._data.settings));
  for(const key of committed)saved[key]=JSON.parse(JSON.stringify(payload[key]));
  return {settings:saved,devices:[],version:'1.5.10',save_ack:{committed:true,fields:committed}};
}};
function cancelTimer(){if(v._autoTimer!==null)clearTimeout(v._autoTimer);v._autoTimer=null;}
(async()=>{
  v._draft.manual_devices=[];v._markDirty();cancelTimer();
  await v._autosave();cancelTimer();
  assert.equal(v._saveState,'saved','Actual mutated WebSocket payload must save deletion');
  assert.equal(v._data.settings.manual_devices.length,0);
  const nameId='sensor.example_device_007';
  v._draft.display_names[nameId]='My renamed plug';v._markDirty();cancelTimer();
  await v._autosave();cancelTimer();
  assert.equal(v._saveState,'saved','Actual mutated WebSocket payload must save renaming');
  assert.equal(v._data.settings.display_names[nameId],'My renamed plug');
  assert.equal(writes,2);
  console.log('v1.5.10 WebSocket id: deletion, renaming, styles and confirmations PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
