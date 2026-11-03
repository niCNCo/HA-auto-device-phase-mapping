'use strict';
// v1.5.7: persist partial settings even if unchanged sensors become unavailable;
// one reset option with explicit confirmation; no stale GET rollback.
const assert=require('assert'), fs=require('fs'), vm=require('vm');
const source=fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
const registry=new Map();
class Element {constructor(){this.tagName='PHASE-MAPPER-PANEL';}attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}}
const ctx={HTMLElement:Element,customElements:{get:k=>registry.get(k),define:(k,v)=>registry.set(k,v)},window:{customCards:[],matchMedia:()=>({matches:true})},console,Math,Date,Number,String,Intl,Set,Map,Event,setTimeout,clearTimeout};
vm.createContext(ctx);vm.runInContext(source,ctx);
const View=registry.get('phase-mapper-panel');
function settings(){return {
  phase_sensors:{L1:'sensor.p1_1',L2:'sensor.p1_2',L3:'sensor.p1_3'},
  grid_current_sensors:{L1:'',L2:'',L3:''},grid_voltage_sensors:{L1:'',L2:'',L3:''},
  phase_current_limits_a:{L1:25,L2:25,L3:25},
  battery_sources:{L1:[{entity_id:'sensor.offline_battery',positive:false}],L2:[],L3:[]},
  solar_sources:{L1:[],L2:[],L3:[],TOTAL:[{entity_id:'sensor.offline_solar',positive:true}]},
  solar_phase_estimation:{enabled:false,currents:{L1:'',L2:'',L3:''},voltages:{L1:'',L2:'',L3:''}},
  manual_assignments:{},manual_devices:[],display_names:{},display_icons:{},
  excluded:[],timing_overrides:{},learning_enabled:true,minimum_change_w:50,dashboard_refresh_seconds:2,
};}
function create(){
  const view=new View();const d={settings:settings(),devices:[{entity_id:'sensor.bed',name:'Bed Plug',phase:'L3',events:5,confidence:77,excluded:false}],corrected_power:{L1:0,L2:0,L3:110},power_breakdown:{},grid_headroom:{}};
  view._data=d;view._render=()=>{};view._resetDraft();return view;
}
function clearTimer(view){if(view._autoTimer!==null){clearTimeout(view._autoTimer);view._autoTimer=null;}}
(async()=>{
  const view=create();const calls=[];
  view._hass={user:{is_admin:true},callWS:async payload=>{
    calls.push(payload);
    assert.equal(payload.type,'ha_auto_device_phase_mapping/set');
    // Offline power sources make a full source revalidation fail: only updates
    // to a changed source should send phase/battery/solar settings.
    if('battery_sources' in payload||'solar_sources' in payload||'phase_sensors' in payload)throw new Error('offline source');
    const next=JSON.parse(JSON.stringify(view._data));
    if(payload.reset_device){
      next.devices=[{...next.devices[0],phase:'Unknown',events:0,confidence:0}];
      delete next.settings.manual_assignments[payload.reset_device];
    }else for(const [key,val] of Object.entries(payload))if(key!=='type')next.settings[key]=val;
    return next;
  }};
  view._draft.display_names['sensor.bed']='Reused Zigbee Plug';
  view._draft.display_icons['sensor.bed']='mdi:power-socket-eu';
  view._markDirty();clearTimer(view);
  let payload=view._settingsPayload();
  assert.deepEqual(Object.keys(payload).sort(),['display_icons','display_names','type'].sort());
  await view._autosave();
  assert.equal(view._dirty,false);
  assert.equal(view._data.settings.display_names['sensor.bed'],'Reused Zigbee Plug');
  assert.equal(view._saveState,'saved');
  assert.equal(calls.length,1);
  await view._assign('sensor.bed','L1');clearTimer(view);
  payload=view._settingsPayload();assert.equal(payload.manual_assignments['sensor.bed'],'L1');
  await view._autosave();
  assert.equal(view._data.settings.manual_assignments['sensor.bed'],'L1');
  await view._excludeEntity('sensor.bed');clearTimer(view);
  payload=view._settingsPayload();assert.deepEqual(Array.from(payload.excluded),['sensor.bed']);
  await view._autosave();assert.deepEqual(Array.from(view._data.settings.excluded),['sensor.bed']);
  // Unchanged timing, icon, name and exclusion must survive the isolated reset.
  view._resetDeviceTarget={id:'sensor.bed',name:'Reused Zigbee Plug'};
  const dialog=view._resetDeviceDialogHtml();
  assert(dialog.includes('Reset learning for Reused Zigbee Plug'));
  assert(dialog.includes('confirmDeviceReset')&&dialog.includes('cancelDeviceReset'));
  await view._resetOneDevice();
  assert.deepEqual(Object.keys(calls.at(-1)).sort(),['reset_device','type'].sort());
  assert.equal(view._data.devices[0].phase,'Unknown');
  assert.equal(view._data.settings.display_names['sensor.bed'],'Reused Zigbee Plug');
  assert.equal(view._data.settings.display_icons['sensor.bed'],'mdi:power-socket-eu');
  assert.deepEqual(Array.from(view._data.settings.excluded),['sensor.bed']);
  assert.equal(view._data.settings.manual_assignments['sensor.bed'],undefined);
  assert.equal(view._resetDeviceTarget,null);
  // Native Settings dropdown contains the required extra option.
  view._showExcludedSettings=true;
  const html=view._settings({...view._data,devices:view._data.devices});
  assert(html.includes('value="__reset_learning__">Reset learning…</option>'));
  console.log('v1.5.7 partial autosave and single-device reset passed');

  // GET initiated before a save must not roll back the confirmed new setting.
  const race=create();let resolveOld;
  const stale=new Promise(resolve=>{resolveOld=resolve;});
  race._hass={user:{is_admin:true},callWS:payload=>{
    if(payload.type.endsWith('/get'))return stale;
    const next=JSON.parse(JSON.stringify(race._data));
    for(const [key,value] of Object.entries(payload))if(key!=='type')next.settings[key]=value;
    return Promise.resolve(next);
  }};
  const oldData=JSON.parse(JSON.stringify(race._data));
  const fetchPromise=race._fetch();
  race._draft.display_names['sensor.bed']='Persistent New Name';race._markDirty();clearTimer(race);
  await race._autosave();
  resolveOld(oldData);await fetchPromise;
  assert.equal(race._data.settings.display_names['sensor.bed'],'Persistent New Name');
  assert.equal(race._draft.display_names['sensor.bed'],'Persistent New Name');
  console.log('v1.5.7 stale-fetch rejection passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
