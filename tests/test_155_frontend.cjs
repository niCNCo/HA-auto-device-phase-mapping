'use strict';
// v1.5.5 consumer contracts: relative evidence colors and split household watts.
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
const registry=new Map();
class Element{constructor(){this.tagName='PHASE-MAPPER-PANEL';}attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}}
const env={HTMLElement:Element,customElements:{get:k=>registry.get(k),define:(k,v)=>registry.set(k,v)},window:{customCards:[],matchMedia:()=>({matches:true})},console,Math,Date,Number,String,Intl,Set,Map,Event,setTimeout,clearTimeout};
vm.createContext(env);vm.runInContext(src,env);
const view=new (registry.get('phase-mapper-panel'))();
view._hass={states:{},user:{is_admin:true}};
const settings={phase_sensors:{L1:'l1',L2:'l2',L3:'l3'},grid_current_sensors:{},grid_voltage_sensors:{},phase_current_limits_a:{},excluded:[],manual_assignments:{},manual_devices:[],display_names:{},display_icons:{},solar_phase_estimation:{},battery_sources:{L1:[],L2:[],L3:[]},solar_sources:{},timing_overrides:{},learning_enabled:true};
const p=x=>({grid:x,battery:0,solar:0,cleaned:x});
view._data={settings,devices:[
 {entity_id:'sensor.red',name:'Red',phase:'L1',power_w:100,confidence:60,excluded:false},
 {entity_id:'sensor.orange',name:'Orange',phase:'L2',power_w:200,confidence:80,excluded:false},
 {entity_id:'sensor.green',name:'Green',phase:'L3',power_w:300,confidence:95,excluded:false},
 {entity_id:'sensor.learning',name:'Learning',phase:'Unknown',power_w:250,confidence:0,excluded:false},
],corrected_power:{L1:300,L2:400,L3:500},power_breakdown:{L1:p(300),L2:p(400),L3:p(500)},grid_headroom:{}};
view._resetDraft();
let html=view._top(view._data);
assert(html.includes('certainty-dot tentative'));
assert(html.includes('certainty-dot probable'));
assert(html.includes('certainty-dot certain'));
assert.equal((html.match(/class="unknown-load/g)||[]).length,4);
assert(html.includes('Not yet mapped'));
assert(html.includes('250 W <span>· 20.8%</span>')); // new household-only Not yet mapped row
assert(html.includes('350 W <span class="contrib">· 29.2%</span>'));
assert(html.includes('class="headroom household-unmapped"')); // aligned with phase headroom
assert(src.includes('unknown-load:not(.total-unknown-split) .unknown-title{min-height:31px}'));
assert(src.includes('exportLearningDiagnostics'));
assert(src.includes("ha_auto_device_phase_mapping/diagnostics"));
// An unmapped sensor at > residual must cap the measured segment and leave 0 W unknown.
view._data.devices[3].power_w=10000;
html=view._top(view._data);
assert(html.includes('600 W <span>· 50.0%</span>')); // capped Not yet mapped
assert(html.includes('0 W <span class="contrib">· 0.0%</span>'));
console.log('v1.5.5 confidence indicators and household segmentation passed');
