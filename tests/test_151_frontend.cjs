// v1.5.1: residual arithmetic, phase-colored compact rows, manual styling and MDI suggestions.
'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const code=fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
const registry=new Map();
class Element{constructor(){this.tagName='PHASE-MAPPER-PANEL';}attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}}
const env={HTMLElement:Element,customElements:{get:k=>registry.get(k),define:(k,v)=>registry.set(k,v)},window:{customCards:[],matchMedia:()=>({matches:true})},console,Math,Date,Number,String,Intl,Set,Map,Event,setTimeout,clearTimeout};
vm.createContext(env);vm.runInContext(code,env);
const ui=new (registry.get('phase-mapper-panel'))();
ui._hass={states:{},themes:{darkMode:true},user:{is_admin:true}};
const settings={phase_sensors:{L1:'sensor.p1_1',L2:'sensor.p1_2',L3:'sensor.p1_3'},grid_current_sensors:{},grid_voltage_sensors:{},phase_current_limits_a:{L1:25,L2:25,L3:25},excluded:[],manual_assignments:{},manual_devices:[{id:'manual_coffee',name:'Coffee maker',room:'Kitchen',phase:'L1',icon:'mdi:coffee-maker'}],display_names:{},display_icons:{},solar_phase_estimation:{},battery_sources:{L1:[],L2:[],L3:[]},solar_sources:{},timing_overrides:{},learning_enabled:true};
const phase=(v)=>({grid:v,battery:0,solar:0,cleaned:v});
ui._data={version:'1.5.1',settings,devices:[
 {entity_id:'sensor.heater',name:'Yara Heater',phase:'L3',power_w:500,events:5,confidence:72,excluded:false},
 {entity_id:'sensor.tv',name:'TV',phase:'L1',power_w:100,events:8,confidence:90,excluded:false},
 {entity_id:'sensor.unknown',name:'Unmapped oven',phase:'Unknown',power_w:300,events:0,confidence:0,excluded:false},
 {entity_id:'sensor.exclude',name:'Excluded',phase:'L1',power_w:100,events:8,confidence:90,excluded:true}
],corrected_power:{L1:600,L2:200,L3:1000},power_breakdown:{L1:phase(600),L2:phase(200),L3:phase(1000)},grid_headroom:{}};
ui._resetDraft();
let html=ui._top(ui._data);
assert(html.includes('v1.6.2'));
assert(html.includes('Manual</option>'));
assert(html.includes('Kitchen'));
assert(html.includes('500 W <span class="contrib">· 50.0%</span>'));
assert(html.includes('100 W <span class="contrib">· 16.7% of L1'));
assert(html.includes('--phase-color:var(--phase-accent)'));
assert(html.includes('Unknown devices'));
assert(html.includes('500 W <span class="contrib">· 83.3%</span>'));
assert(html.includes('200 W <span class="contrib">· 100.0%</span>'));
assert(html.includes('500 W <span class="contrib">· 50.0%</span>'));
assert(html.includes('Not yet mapped')); // household residual is now split
assert(html.includes('600 W <span class="contrib">· 33.3%</span>'));
assert(html.includes('<span class="mapped-count">3</span>')); // Household total = coffee + TV + heater
assert(!html.includes('data-manual-id="manual_coffee" class="row manual-entry"')); // no old styling path
assert(html.includes('headroom household-unmapped')); // Household Not yet mapped replaces placeholder
// The missing phase must not become an accidental 0 W estimate.
ui._data.power_breakdown.L2.cleaned=null;
html=ui._top(ui._data);
assert(html.includes('— <span class="contrib">· —</span>'));
// A mapped three-phase device contributes once to the household and a third to each phase.
ui._data.power_breakdown.L2.cleaned=200;
ui._data.devices.push({entity_id:'sensor.3phase',name:'Heat pump',phase:'3-phase',power_w:300,events:9,confidence:90,excluded:false});
html=ui._top(ui._data);
assert(html.includes('900 W <span class="contrib">· 50.0%</span>'));
assert(html.includes('400 W <span class="contrib">· 66.7%</span>'));
assert(html.includes('100 W <span class="contrib">· 50.0%</span>'));
assert(html.includes('400 W <span class="contrib">· 40.0%</span>'));
assert(html.includes('900 W <span class="contrib">· 50.0%</span>'));
// The suggestion set renders icons, not a text-only browser datalist.
assert(ui._iconSuggestions('heat').includes('<ha-icon icon="mdi:heat-wave"'));
assert(ui._iconSuggestions('heat').includes('heat wave'));
ui._editor={kind:'manual',id:'manual_coffee'};
assert(ui._editDialog().includes('id="editIconSuggestions"'));
console.log('v1.5.1 mapped rows, total counts/power, unknown residuals, and icon options passed');
