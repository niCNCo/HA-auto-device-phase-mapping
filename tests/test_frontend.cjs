// Minimal registration/render smoke test without browser or Home Assistant.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const src = fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js', 'utf8');
const classes = new Map();
const baseElement = class {
  constructor(){this.tagName = 'PHASE-MAPPER-CARD';this.shadowRoot=null;}
  attachShadow(){this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};return this.shadowRoot;}
};
const context={HTMLElement:baseElement, customElements:{get:n=>classes.get(n),define:(n,c)=>classes.set(n,c)},
  window:{customCards:[],confirm:()=>false},console,Date,Number,Math,Set,Map,String,Intl,Event};
vm.createContext(context);
vm.runInContext(src,context);
vm.runInContext(src,context); // duplicate frontend script should not throw.
assert(classes.has('phase-mapper-card'));
assert(classes.has('phase-mapper-panel'));
assert(classes.has('phase-mapper-card-editor'));
assert.equal(context.window.customCards.length,1);
for(const type of ['phase-mapper-card','phase-mapper-panel']){
 const e=new (classes.get(type))();
 e.tagName=type.toUpperCase();
 e._hass={states:{},user:{is_admin:true}};
 e._data={version:'1.3.0',ready:true,devices:[{name:'Test heater',entity_id:'sensor.test_power',phase:'L2',confidence:90,events:15,excluded:false}],
   settings:{learning_enabled:true,phase_sensors:{L1:'sensor.l1',L2:'sensor.l2',L3:'sensor.l3'},excluded:[],minimum_change_w:100,battery_sensors:{L1:'',L2:'',L3:''},solar_sensor:'',battery_discharge_positive:true,solar_production_positive:true,battery_sources:{L1:[],L2:[],L3:[]},solar_sources:{L1:[],L2:[],L3:[],TOTAL:[]},manual_assignments:{}},
   phase_power:{L1:2,L2:500,L3:5}};
 e._resetDraft();e._render();
 if(type==='phase-mapper-card'){
   assert(e.shadowRoot.innerHTML.includes('pm-compact-grid'));
   assert(e.shadowRoot.innerHTML.includes('pm-ring-graphic'));
   assert(e.shadowRoot.innerHTML.includes('pm-ring-group'));
   assert(e.shadowRoot.innerHTML.includes('Phase distribution'));
   assert(e.shadowRoot.innerHTML.includes('Device coverage'));
   assert(!e.shadowRoot.innerHTML.includes('Battery idle'));
   assert(!e.shadowRoot.innerHTML.includes('Solar generation'));
   e.setConfig({view:'detailed'});
 }
 assert(e.shadowRoot.innerHTML.includes('Test heater'));
 e._tab='settings';e._render();
 assert(e.shadowRoot.innerHTML.includes('Recognized Power Sensors'));
 assert(e.shadowRoot.innerHTML.includes('Show excluded'));
 assert(e.shadowRoot.innerHTML.includes('Add battery'));
 assert(e.shadowRoot.innerHTML.includes('Add solar')); 
 assert(e.shadowRoot.innerHTML.includes('Battery compensation'));  
 if(type==='phase-mapper-panel'){
   e._tab='mapping';e._render();
   assert(e.shadowRoot.innerHTML.includes('Household total'));
   assert(e.shadowRoot.innerHTML.includes('pm-ring-graphic'));
   assert(!e.shadowRoot.innerHTML.includes('Battery idle'));
   assert(!e.shadowRoot.innerHTML.includes('Solar generation'));
 }
 // A connected battery shows its own SoC; solar is independent and optional.
 e._data.settings.battery_sources.L1=[{entity_id:'sensor.battery_power',positive:true,soc_entity_id:'sensor.battery_soc'}];
 e._data.settings.solar_sources.L2=[{entity_id:'sensor.solar_power',positive:true}];
 e._hass.states['sensor.battery_soc']={state:'74',attributes:{device_class:'battery',unit_of_measurement:'%'}};
 if(type==='phase-mapper-card')e.setConfig({view:'compact'});
 e._tab='mapping';e._render();
 assert(e.shadowRoot.innerHTML.includes('Battery'));
 assert(e.shadowRoot.innerHTML.includes('74%'));
 assert(e.shadowRoot.innerHTML.includes('Solar generation'));
 
}
console.log('Frontend registration, card, full panel, and settings smoke tests passed');
