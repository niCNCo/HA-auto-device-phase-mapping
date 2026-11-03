'use strict';
// Browser round trip using a copy of the user's real persisted settings:
// nested keys can change order during Python->WebSocket->JavaScript encoding.
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
const registry=new Map();
class Element{constructor(){this.tagName='PHASE-MAPPER-PANEL';}attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}}
const ctx={HTMLElement:Element,customElements:{get:k=>registry.get(k),define:(k,v)=>registry.set(k,v)},window:{customCards:[]},console,Math,Date,Number,String,Intl,Set,Map,Event,setTimeout,clearTimeout};
vm.createContext(ctx);vm.runInContext(source,ctx);
const View=registry.get('phase-mapper-panel');
const stored={settings:JSON.parse(fs.readFileSync('tests/fixtures/save_settings.json','utf8'))};
const copy=x=>JSON.parse(JSON.stringify(x));
const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?
  Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reorder(v)])):value;
function create(){const v=new View();v._data={settings:copy(stored.settings),devices:[]};v._resetDraft();v._render=()=>{};return v;}
function stop(v){if(v._autoTimer!==null)clearTimeout(v._autoTimer);v._autoTimer=null;}
async function test(){
  const v=create();const commits=[];
  v._hass={user:{is_admin:true},callWS:async payload=>{
    commits.push(copy(payload));
    const saved=copy(v._data.settings);
    for(const [key,value] of Object.entries(payload))if(key!=='type')saved[key]=copy(value);
    // Model the backend and WebSocket round trip that may change key order.
    const result={settings:reorder(saved),version:'1.5.9',devices:[]};
    // Every other request includes explicit server commit acknowledgement.
    if(commits.length%2===0)result.save_ack={committed:true,fields:Object.keys(payload).filter(k=>k!=='type').reverse()};
    return result;
  }};
  assert.equal(v._draft.manual_devices.length,1);
  v._draft.manual_devices=[];v._markDirty();stop(v);
  assert.deepEqual(Object.keys(v._settingsPayload()).sort(),['manual_devices','type']);
  await v._autosave();stop(v);
  assert.equal(v._saveState,'saved','Deletion of coffee maker must confirm');
  assert.equal(v._dirty,false);
  assert.equal(v._data.settings.manual_devices.length,0);
  assert.deepEqual(Object.keys(v._settingsPayload()), ['type'],'Unchanged sources must not be resubmitted after reordered WS result');
  assert.equal(v._data.settings.display_names['sensor.example_device_007'],'Appliance 007');

  v._draft.display_names['sensor.example_device_007']='Appliance renamed';
  v._draft.display_icons['sensor.example_device_007']='mdi:television-classic';
  v._markDirty();stop(v);
  assert.deepEqual(Object.keys(v._settingsPayload()).sort(),['display_icons','display_names','type']);
  await v._autosave();stop(v);
  assert.equal(v._saveState,'saved','Name/icon edit must confirm through backend ack');
  assert.equal(v._data.settings.display_names['sensor.example_device_007'],'Appliance renamed');
  assert.equal(v._data.settings.display_icons['sensor.example_device_007'],'mdi:television-classic');
  assert.deepEqual(Object.keys(v._settingsPayload()), ['type'],'Rename must not leave unrelated dirty settings');

  v._draft.display_names['sensor.example_device_007']='Appliance updated again';
  v._markDirty();stop(v);
  await v._autosave();stop(v);
  assert.equal(v._saveState,'saved','Key-order-independent legacy fallback must confirm');
  assert.equal(v._dirty,false);
  assert.equal(v._data.settings.display_names['sensor.example_device_007'],'Appliance updated again');

  v._draft.display_names['sensor.example_device_007']='Unsaved changed name';
  v._markDirty();stop(v);
  v._hass.callWS=async p=>({settings:copy(v._data.settings),version:'1.5.8'});
  await v._autosave();stop(v);
  assert.equal(v._saveState,'error');assert.equal(v._dirty,true);
  assert(v._error.includes('display_names'), 'Error must identify the actual field rejected');
  assert(v._error.includes('1.5.8'), 'Version mismatch must be visible for browser cache diagnosis');
  assert.equal(v._data.settings.display_names['sensor.example_device_007'],'Appliance updated again');

  v._hass.callWS=async p=>{const next=copy(v._data);for(const [key,value] of Object.entries(p))if(key!=='type')next.settings[key]=value;
    next.save_ack={committed:true,fields:Object.keys(p).filter(k=>k!=='type')};return next;};
  await v._autosave();stop(v);
  assert.equal(v._saveState,'saved');assert.equal(v._dirty,false);
  assert.equal(v._data.settings.display_names['sensor.example_device_007'],'Unsaved changed name');
  const reload=create();reload._data=copy(v._data);reload._resetDraft();
  assert.equal(reload._draft.manual_devices.length,0,'Manual deletion survives fresh UI instance');
  assert.equal(reload._draft.display_names['sensor.example_device_007'],'Unsaved changed name','Rename survives fresh UI instance');
  console.log('v1.5.9 user-setting structure: delete, rename, icon, key order, explicit commit and retry PASS');
}
test().catch(e=>{console.error(e);process.exitCode=1});
