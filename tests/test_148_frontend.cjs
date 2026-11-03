// Regression contracts: draft-backed manual inventory, battery aliases and v1.4.8 styling.
const fs=require('fs'), vm=require('vm'), assert=require('assert');
const source=fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
const classes=new Map();
class Element {
  constructor(){this.tagName='PHASE-MAPPER-PANEL';}
  attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}
}
const env={HTMLElement:Element,customElements:{get:x=>classes.get(x),define:(x,y)=>classes.set(x,y)},window:{customCards:[],matchMedia:()=>({matches:true})},console,Math,Date,Set,Map,Number,String,Intl,Event,setTimeout,clearTimeout};
vm.createContext(env);vm.runInContext(source,env);
const ui=new (classes.get('phase-mapper-panel'))();
const settings={phase_sensors:{L1:'sensor.l1',L2:'sensor.l2',L3:'sensor.l3'},excluded:[],grid_current_sensors:{L1:'',L2:'',L3:''},grid_voltage_sensors:{L1:'',L2:'',L3:''},phase_current_limits_a:{L1:25,L2:25,L3:25},manual_devices:[],display_names:{},manual_assignments:{},battery_sources:{L1:[{entity_id:'sensor.battery',positive:true}],L2:[],L3:[]},solar_sources:{L1:[],L2:[],L3:[],TOTAL:[]},solar_phase_estimation:{enabled:false,currents:{L1:'',L2:'',L3:''},voltages:{L1:'',L2:'',L3:''}},timing_overrides:{},learning_enabled:true,minimum_change_w:100,dashboard_refresh_seconds:2};
ui._hass={states:{'sensor.battery':{state:'500',attributes:{friendly_name:'Original battery'}}},user:{is_admin:true},themes:{darkMode:true}};
ui._data={settings,devices:[{entity_id:'sensor.test',name:'A smart plug',phase:'L1',confidence:95,events:8,excluded:false,power_w:100}],power_breakdown:{L1:{grid:200,solar:300,battery:500,cleaned:1000},L2:{grid:0,solar:0,battery:0,cleaned:0},L3:{grid:0,solar:0,battery:0,cleaned:0}},corrected_power:{L1:1000,L2:0,L3:0},grid_headroom:{},version:'1.4.8'};
ui._resetDraft();
ui._draft.manual_devices.push({id:'manual_one',name:'Coffee maker',room:'Kitchen',phase:'L1'},{id:'manual_two',name:'Oven',room:'Kitchen',phase:'L2'});
// v1.5 manual rows have moved directly inside the L1/L2/L3/total phase tiles.
let html=ui._top(ui._data);
assert(html.includes('Coffee maker')&&html.includes('Oven'),'manual entries render from draft before server response');
assert(html.includes('phase-devices'),'devices are under their matching phase summaries');
ui._draft.manual_devices[0].phase='L3';html=ui._top(ui._data);
assert(html.includes('Coffee maker')&&html.includes('data-manual-phase="manual_one"'));
ui._draft.manual_devices=ui._draft.manual_devices.filter(x=>x.id!=='manual_two');
assert(!ui._top(ui._data).includes('Oven'),'manual deletion immediately reflected');
ui._draft.display_names['sensor.battery']='Zendure living room';
assert(ui._batterySystemRows('L1')[0].includes('Zendure living room'));
assert(ui._batterySystemRows('L1')[0].includes('data-battery-rename="sensor.battery"'));
assert(ui._batterySystemRows('L1')[0].includes('data-more="sensor.battery"'));
ui._render();html=ui.shadowRoot.innerHTML;
assert(html.includes('Sum of loads'));
assert(html.includes('powerline solar'));
assert(html.includes('--stat-color:#94a3b8'));
assert(html.includes('--stat-color:#22c55e'));
assert(html.includes('triphase-label'));
assert(html.includes('data-manual-edit="manual_one"'));
assert(!html.includes('System assigned')); // battery rows removed
console.log('v1.5 manual drafts, mapped phase tiles, battery omission and editable presentation passed');
