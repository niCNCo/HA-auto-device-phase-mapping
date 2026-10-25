const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
const classes=new Map();
class Base { constructor(){this.tagName='PHASE-MAPPER-PANEL';this.shadowRoot=null;}attachShadow(){this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};return this.shadowRoot;} }
const ctx={HTMLElement:Base,customElements:{get:n=>classes.get(n),define:(n,c)=>classes.set(n,c)},window:{customCards:[]},console,Date,Number,Math,Set,Map,String,Intl,Event};
vm.createContext(ctx);vm.runInContext(source,ctx);
const ui=new (classes.get('phase-mapper-panel'))();
const setting={phase_sensors:{L1:'sensor.test_power',L2:'',L3:''},grid_current_sensors:{L1:'sensor.test_current',L2:'',L3:''},grid_voltage_sensors:{L1:'sensor.test_voltage',L2:'',L3:''},phase_current_limits_a:{L1:25,L2:25,L3:25},excluded:[],learning_enabled:true,minimum_change_w:100,battery_sources:{L1:[{entity_id:'sensor.test_power',positive:true}],L2:[],L3:[]},solar_sources:{L1:[],L2:[],L3:[],TOTAL:[]},solar_phase_estimation:{enabled:false,currents:{L1:'',L2:'',L3:''},voltages:{L1:'',L2:'',L3:''}}};
ui._hass={states:{'sensor.test_power':{state:'-618',attributes:{unit_of_measurement:'W'},last_updated:new Date().toISOString()},'sensor.test_current':{state:'-2.90',attributes:{unit_of_measurement:'A'},last_updated:new Date().toISOString()},'sensor.test_voltage':{state:'unavailable',attributes:{unit_of_measurement:'V'},last_updated:new Date().toISOString()}},user:{is_admin:true}};
ui._data={settings:setting,devices:[],version:'1.4.3'};ui._resetDraft();ui._tab='settings';
const html=ui._settings(ui._data);
assert(html.includes('data-live-entity="sensor.test_power"'));
assert(html.includes('data-live-entity="sensor.test_current"'));
assert(html.includes('data-live-entity="sensor.test_voltage"'));
assert(html.includes('<button class="btn compactbtn" data-remove-source="battery_sources"'));
// Verify values update without a full render (mock only the reading text nodes).
const valueNode={textContent:''},statusNode={textContent:'',className:''};
const reading={dataset:{liveEntity:'sensor.test_current'},querySelector:(s)=>s==='.reading-value'?valueNode:statusNode};
ui.shadowRoot.querySelectorAll=(s)=>s==='.sensor-reading[data-live-entity]'?[reading]:[];
ui._updateLiveReadings();
assert(valueNode.textContent.includes('-2.9 A'),valueNode.textContent);
assert(statusNode.textContent.includes('Updated'));
reading.dataset.liveEntity='sensor.test_voltage';ui._updateLiveReadings();
assert.equal(valueNode.textContent,'—');assert.equal(statusNode.textContent,'Unavailable');
console.log('Live settings readings: signed values, selectors, unavailable cases passed');
