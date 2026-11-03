// v1.5.0: dashboard redesign, editable icons, unmapped names, version status.
const assert=require('assert'), fs=require('fs'),vm=require('vm');
const code=fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
const registry=new Map();
class Element { constructor(){this.tagName='PHASE-MAPPER-PANEL';}attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}}
const env={HTMLElement:Element,customElements:{get:k=>registry.get(k),define:(k,v)=>registry.set(k,v)},window:{customCards:[],matchMedia:()=>({matches:true})},console,Math,Date,Number,String,Intl,Set,Map,Event,setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>({tag_name:'v1.6.3'})})};
vm.createContext(env);vm.runInContext(code,env);
const ui=new (registry.get('phase-mapper-panel'))();
ui._hass={states:{'sensor.airco':{attributes:{icon:'mdi:air-conditioner'}}},themes:{darkMode:true},user:{is_admin:true}};
const settings={phase_sensors:{L1:'sensor.p1_l1',L2:'sensor.p1_l2',L3:'sensor.p1_l3'},grid_current_sensors:{},grid_voltage_sensors:{},phase_current_limits_a:{L1:25,L2:25,L3:25},battery_sources:{L1:[{entity_id:'sensor.battery',positive:true}],L2:[],L3:[]},solar_sources:{},solar_phase_estimation:{enabled:false},manual_assignments:{},manual_devices:[{id:'manual_1',name:'Coffee maker',room:'Kitchen',phase:'L2',icon:'mdi:coffee-maker'}],display_names:{'sensor.airco':'Lounge Airco'},display_icons:{'sensor.airco':'mdi:hvac'},excluded:[],timing_overrides:{},learning_enabled:true};
ui._data={version:'1.5.0',settings,devices:[{entity_id:'sensor.infra',name:'Heater',phase:'L3',power_w:800,events:5,confidence:71,excluded:false},{entity_id:'sensor.airco',name:'Airco',phase:'Unknown',power_w:250,events:0,confidence:0,excluded:false}],corrected_power:{L1:500,L2:100,L3:850},power_breakdown:{L1:{grid:500,battery:0,solar:0,cleaned:500},L2:{grid:100,battery:0,solar:0,cleaned:100},L3:{grid:850,battery:0,solar:0,cleaned:850}},grid_headroom:{}};
ui._resetDraft();
let html=ui._top(ui._data);
assert(html.includes('phase-devices'));
assert(html.includes('Heater')&&html.includes('Coffee maker'));
assert(html.includes('data-manual-phase="manual_1"')&&html.includes('value="__delete__"'));
assert(!html.includes('System assigned'));
assert(!html.includes('Not monitored'));
assert(!html.includes('observations'));
assert(html.includes('topVersionLink'));
html=ui._mapping(ui._data);
assert(html.indexOf('id="mappedDevices"')<html.indexOf('id="stillLearning"'));
assert(html.includes('id="learningSearch"'));
assert(!html.includes('class="scroll"')); // no capped inner scrolling for Still Learning
assert(html.includes('data-rename="sensor.airco"'));
assert(html.includes('Lounge Airco'));
assert(html.includes('mdi:hvac'));
ui._editor={kind:'sensor',id:'sensor.airco'};
html=ui._editDialog();
assert(html.includes('mdi:hvac')&&html.includes('Lounge Airco'));
ui._editor={kind:'manual',id:'manual_1'};
html=ui._editDialog();
assert(html.includes('id="editRoom"')&&html.includes('mdi:coffee-maker'));
ui._editor=null;
ui._tab='info';
(async()=>{
 await ui._checkLatestRelease();
 assert.equal(ui._releaseStatus.status,'outdated');
 assert.equal(ui._releaseStatus.latest,'1.6.3');
 const info=ui._info();
 assert(info.includes('v1.6.2')&&info.includes('v1.6.3'));
 assert(info.includes('niCNCo/HA-auto-device-phase-mapping'));
 console.log('v1.5.0 frontend and GitHub release comparisons passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
