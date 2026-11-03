'use strict';
// v1.5.6 visual and semantics contracts. Learning engine/storage are unchanged.
const assert=require('assert'), fs=require('fs'), vm=require('vm');
const source=fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
const registry=new Map();
class Element{constructor(){this.tagName='PHASE-MAPPER-PANEL';}attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}}
const store=new Map([['ha_auto_device_phase_mapping.settingsExpanded',JSON.stringify({p1:false,headroom:true,battery:false,solar:true,estimate:true,refresh:false,learning:true,recognized:false})]]);
const context={HTMLElement:Element,customElements:{get:n=>registry.get(n),define:(k,v)=>registry.set(k,v)},window:{customCards:[],matchMedia:()=>({matches:true}),localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}},console,Math,Date,Number,String,Intl,Set,Map,Event,setTimeout,clearTimeout};
vm.createContext(context);vm.runInContext(source,context);
const view=new (registry.get('phase-mapper-panel'))();
assert.equal(view._settingsSections.p1,false);
assert.equal(view._settingsSections.estimate,true);
assert.equal(view._settingsSections.recognized,false);
const settings={phase_sensors:{L1:'a',L2:'b',L3:'c'},grid_current_sensors:{L1:'',L2:'',L3:''},grid_voltage_sensors:{L1:'',L2:'',L3:''},phase_current_limits_a:{L1:25,L2:25,L3:25},excluded:[],manual_assignments:{},manual_devices:[],display_names:{},display_icons:{},solar_phase_estimation:{enabled:false,currents:{L1:'',L2:'',L3:''},voltages:{L1:'',L2:'',L3:''}},battery_sources:{L1:[],L2:[],L3:[]},solar_sources:{L1:[],L2:[],L3:[],TOTAL:[]},timing_overrides:{},learning_enabled:true,minimum_change_w:50,dashboard_refresh_seconds:2};
const power=w=>({grid:w,battery:0,solar:0,cleaned:w});
view._hass={states:{},user:{is_admin:true},themes:{darkMode:true}};
view._data={version:'1.5.6',settings,devices:[{entity_id:'sensor.heater',name:'Heater',phase:'L1',power_w:300,confidence:88,events:8,excluded:false},{entity_id:'sensor.learning',name:'Airco',phase:'Unknown',power_w:100,confidence:0,events:0,excluded:false}],power_breakdown:{L1:power(600),L2:power(200),L3:power(300)},corrected_power:{L1:600,L2:200,L3:300},grid_headroom:{}};
view._resetDraft();
let html=view._top(view._data);
assert(html.includes('v1.5.6'));
assert.equal((html.match(/class="phasebox /g)||[]).length,4);
assert.equal((html.match(/class="unknown-load"/g)||[]).length,4);
assert.equal((html.match(/class="mapped-device-card"/g)||[]).length,4);
assert(html.includes('class="headroom household-unmapped"'));
assert(html.includes('100 W <span>· 9.1%</span>'));
assert(html.indexOf('class="headroom household-unmapped"') < html.lastIndexOf('class="unknown-load"'));
assert(!html.includes('class="unknown-pair"'));
assert(html.includes('certainty-dot probable')); // mapped evidence dot is still semantic
const mapping=view._mapping(view._data);
for(const name of ['Mapped devices','Still learning','Add appliance','Learning diagnostics']) assert(mapping.includes(name));
assert(mapping.includes('mdi:layers-triple-outline')&&mapping.includes('mdi:book-open-variant-outline'));
assert(mapping.includes('mdi:plus-circle-outline')&&mapping.includes('mdi:chart-timeline-variant'));
assert(source.includes('#stillLearning .device-alias .name'));
assert(source.includes('color:#34c8b9'));
assert(source.includes('.phasebox .mapped-listing .device-alias .name'));
assert(source.includes('.phasebox .mapped-listing .device-icon'));
const settingsHtml=view._settings(view._data);
assert.equal((settingsHtml.match(/data-settings-section=/g)||[]).length,8);
assert(settingsHtml.includes('id="settings-p1"')&&settingsHtml.includes('id="settings-recognized"'));
assert(settingsHtml.includes('data-settings-section="p1" '));
assert(settingsHtml.includes('data-settings-section="headroom" open'));
assert(settingsHtml.includes('data-settings-section="p1" >')); // saved closed
assert(settingsHtml.includes('data-grid-current="L1"'));
assert(settingsHtml.includes('data-phase="L3"'));
assert(settingsHtml.includes('data-source-type="battery_sources"')===false); // empty source list is okay
assert(source.includes("localStorage?.setItem('ha_auto_device_phase_mapping.settingsExpanded'"));
console.log('v1.5.6 phase visual, neutral accordions, household alignment and settings collapse tests passed');
