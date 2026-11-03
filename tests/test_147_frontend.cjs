// Focused v1.4.7 contract for responsive navigation and merged sensor management.
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const src=fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
const classes=new Map();
class Base {constructor(){this.tagName='PHASE-MAPPER-PANEL';this.shadowRoot=null;}attachShadow(){this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};return this.shadowRoot;}}
const ctx={HTMLElement:Base,customElements:{get:n=>classes.get(n),define:(n,c)=>classes.set(n,c)},window:{customCards:[],matchMedia:()=>({matches:true})},console,Date,Number,Math,Set,Map,String,Intl,Event,setTimeout,clearTimeout};
vm.createContext(ctx);vm.runInContext(src,ctx);
const ui=new (classes.get('phase-mapper-panel'))();
const settings={phase_sensors:{L1:'sensor.l1',L2:'sensor.l2',L3:'sensor.l3'},grid_current_sensors:{L1:'',L2:'',L3:''},grid_voltage_sensors:{L1:'',L2:'',L3:''},phase_current_limits_a:{L1:25,L2:25,L3:25},excluded:[],display_names:{'sensor.test':'Lounge Airco'},timing_overrides:{},learning_enabled:true,minimum_change_w:100,dashboard_refresh_seconds:2,manual_assignments:{},manual_devices:[],battery_sources:{L1:[],L2:[],L3:[]},solar_sources:{L1:[],L2:[],L3:[],TOTAL:[]},solar_phase_estimation:{enabled:false,currents:{L1:'',L2:'',L3:''},voltages:{L1:'',L2:'',L3:''}}};
ui._hass={states:{},user:{is_admin:true},themes:{darkMode:true}};
ui._data={version:'1.4.7',settings,devices:[{entity_id:'sensor.test',name:'Airco Livingroom Power',phase:'L1',confidence:80,events:5,power_w:950,excluded:false,measured_refresh_seconds:300,timing_mode:'auto'},{entity_id:'sensor.unknown',name:'Still learning test',phase:'Unknown',confidence:0,events:0,power_w:70,excluded:false,measured_refresh_seconds:null,timing_mode:'auto'}],corrected_power:{L1:1000,L2:500,L3:250},power_breakdown:{L1:{grid:500,solar:500,battery:0,cleaned:1000},L2:{grid:500,solar:0,battery:0,cleaned:500},L3:{grid:250,solar:0,battery:0,cleaned:250}}};
ui._resetDraft();ui._tab='mapping';ui._render();
let html=ui.shadowRoot.innerHTML;
for(const token of ['topnav','navtabs','topstats','Detected','Mapped','Excluded','Lounge Airco','data-rename="sensor.test"','id="learningSearch"','Measured refresh: 300 s','Measured refresh: — s','triphase-label','powerline solar'])assert(html.includes(token),token);
assert(html.includes('data-rename="sensor.unknown"')); // v1.5 supports unmapped editing
assert(!html.includes('<div class="metrics">'));
ui._tab='settings';ui._render();html=ui.shadowRoot.innerHTML;
for(const token of ['Recognized Power Sensors','id="nameTags"','data-timing-mode="sensor.test"','data-exclude-toggle="sensor.test"','bulkExclude','bulkRestore','Measured refresh: 300 s'])assert(html.includes(token),token);
assert(!html.includes('Sensor reporting timing</h3>'));
assert(!html.includes('Excluded sensors</h3>'));
ui._learningFilter='airco';ui._tab='mapping';ui._render();
assert(ui.shadowRoot.innerHTML.includes('id="learningSearch"'));
console.log('v1.4.7 header, renaming, factual refresh, unified manager and learning search passed');
