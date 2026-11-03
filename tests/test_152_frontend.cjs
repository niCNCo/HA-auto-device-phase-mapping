'use strict';
// v1.5.2 contract: aligned unknown/aggregate summaries, shared mapped toggle,
// manual dropdown parity, HA-native MDI picker (with editable fallback).
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
function uiInstance(native=false){
  const registry=new Map();
  class Element{constructor(){this.tagName='PHASE-MAPPER-PANEL';}attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}}
  if(native)registry.set('ha-icon-picker',class NativeIconPicker{});
  const context={HTMLElement:Element,customElements:{get:x=>registry.get(x),define:(k,v)=>registry.set(k,v)},window:{customCards:[],matchMedia:()=>({matches:true})},Date,Math,Number,String,Intl,Set,Map,Event,console,setTimeout,clearTimeout};
  vm.createContext(context);vm.runInContext(source,context);
  const view=new (registry.get('phase-mapper-panel'))();
  view._hass={states:{},themes:{darkMode:true},user:{is_admin:true}};
  const settings={phase_sensors:{L1:'a',L2:'b',L3:'c'},grid_current_sensors:{},grid_voltage_sensors:{},phase_current_limits_a:{},excluded:[],manual_assignments:{},manual_devices:[{id:'cup',name:'Coffee',room:'Kitchen',phase:'L1',icon:'mdi:coffee-maker'}],display_names:{},display_icons:{},solar_phase_estimation:{},battery_sources:{L1:[],L2:[],L3:[]},solar_sources:{},timing_overrides:{},learning_enabled:true};
  const power=(w)=>({grid:w,battery:0,solar:0,cleaned:w});
  view._data={version:'1.5.2',settings,devices:[
    {entity_id:'sensor.heater',name:'Heater',phase:'L3',power_w:500,events:4,confidence:75,excluded:false},
    {entity_id:'sensor.tv',name:'TV',phase:'L1',power_w:150,events:7,confidence:90,excluded:false},
    {entity_id:'sensor.unknown',name:'Unmapped',phase:'Unknown',power_w:100,events:0,confidence:0,excluded:false},
  ],corrected_power:{L1:600,L2:200,L3:1000},power_breakdown:{L1:power(600),L2:power(200),L3:power(1000)},grid_headroom:{}};
  view._resetDraft();
  return view;
}
let ui=uiInstance();
let html=ui._top(ui._data);
const phaseHtml=phase=>html.match(new RegExp('<div class="phasebox '+phase+'"[^]*?(?=<div class="phasebox |</div></div>$)'))?.[0]||'';
assert(html.includes('v1.6.2'));
assert.equal((html.match(/class="unknown-load(?: total-unknown-split)?"/g)||[]).length,4);
assert.equal((html.match(/class="mapped-combined"/g)||[]).length,4);
assert.equal((html.match(/data-toggle-mapped="true"/g)||[]).length,4);
assert.equal((html.match(/aria-expanded="true"/g)||[]).length,4);
assert(html.indexOf('Unknown devices')<html.indexOf('Mapped devices'));
assert(!html.includes('mdi:help-circle-outline'));
assert(html.includes('450 W <span class="contrib">· 75.0%</span>')); // L1 residual
assert(html.includes('150 W <span class="contrib">· 25.0%</span>')); // L1 known
assert(html.includes('200 W <span class="contrib">· 100.0%</span>')); // L2 residual
assert(html.includes('500 W <span class="contrib">· 50.0%</span>')); // L3 known + residual
assert(html.includes('1,050 W <span class="contrib">· 58.3%</span>')); // household no-sensor unknown after 100 W not yet mapped
assert(html.includes('100 W <span>· 5.6%</span>')); // not yet mapped (in household headroom row)
assert(html.includes('650 W <span class="contrib">· 36.1%</span>')); // total known
assert(html.includes('Unknown devices</div>'));
assert(html.includes('class="manual-room">Kitchen'));
assert(html.includes('>Manual</option>'));
assert(html.includes('class="right"><select data-manual-phase='));
assert(html.includes('class="right"><select class="manualcontrol"'));
assert(source.includes('min-width:86px!important;max-width:86px!important'));
assert(source.includes('grid-template-columns:minmax(0,1fr) 86px'));
assert(source.includes('color:var(--secondary-text-color)'));
assert(html.includes('class="mapped-listing" >')); // expanded
ui._phaseMappedExpanded=false;
html=ui._top(ui._data);
assert.equal((html.match(/aria-expanded="false"/g)||[]).length,4);
assert.equal((html.match(/class="mapped-listing" hidden/g)||[]).length,4);
assert.equal((html.match(/class="mapped-combined"/g)||[]).length,4);
// No backend action is needed to toggle, only local display state.
assert(source.includes("this._phaseMappedExpanded=!this._phaseMappedExpanded"));
assert(source.includes("localStorage?.setItem('ha_auto_device_phase_mapping.mappedExpanded'"));
// Tested against live Home Assistant's native icon picker when registered.
ui=uiInstance(true);
ui._editor={kind:'manual',id:'cup'};
html=ui._editDialog();
assert(html.includes('ha-icon-picker id="editNativeIcon"'));
assert(html.includes('value="mdi:coffee-maker"'));
assert(source.includes("customElements.get('ha-icon-picker')"));
assert(source.includes("native.addEventListener('value-changed'"));
assert(ui._manualForm().includes('ha-icon-picker id="manualNativeIcon"'));
// Without the native picker, still handle direct icon codes and useful fallback search.
ui=uiInstance();
assert(ui._iconSuggestions('hu').includes('mdi:air-humidifier'));
assert(ui._iconSuggestions('de').includes('mdi:dehumidifier'));
assert(ui._iconSuggestions('heat').includes('mdi:heat-wave'));
// A monitored 3-phase device is counted once for household and distributed by thirds in each phase.
ui._data.devices.push({entity_id:'sensor.pump',name:'Pump',phase:'3-phase',power_w:300,events:4,confidence:72,excluded:false});
html=ui._top(ui._data);
assert(html.includes('250 W <span class="contrib">· 41.7%</span>')); // L1 known 150+100
assert(html.includes('100 W <span class="contrib">· 50.0%</span>')); // L2 known 100
assert(html.includes('600 W <span class="contrib">· 60.0%</span>')); // L3 known 500+100
assert(html.includes('950 W <span class="contrib">· 52.8%</span>')); // household 150+500+300
console.log('v1.5.2 summary/toggle/color/icon/three-phase contracts passed');
