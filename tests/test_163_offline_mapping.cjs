'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
const registry=new Map();
class Element { constructor(){this.tagName='PHASE-MAPPER-PANEL';} attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};} }
const env={HTMLElement:Element,customElements:{get:k=>registry.get(k),define:(k,v)=>registry.set(k,v)},window:{customCards:[],matchMedia:()=>({matches:true})},console,Math,Date,Number,String,Intl,Set,Map,Event,setTimeout,clearTimeout};
vm.createContext(env);vm.runInContext(src,env);
const view=new (registry.get('phase-mapper-panel'))();
view._hass={states:{},user:{is_admin:true}};
view._data={corrected_power:{L1:1000,L2:0,L3:0}};
const device={entity_id:'sensor.garage_fridge_power',name:'Garage fridge',phase:'L1',power_w:null,offline:true,confidence:93,events:8,excluded:false};
for(const compact of [true,false]){
 const html=view._row(device,compact);
 assert.match(html,/Garage fridge/);
 assert.match(html,/class="devpower offline">Offline<\/div>/);
 assert.doesNotMatch(html,/null W|0 W|NaN/);
 assert.doesNotMatch(html,/class="devicebar"/);
}
const live=view._row({...device,power_w:70,offline:false},true);
assert.match(live,/70 W/);assert.doesNotMatch(live,/devpower offline/);
assert.match(src,/\.devpower\.offline\{color:#ef4444!important\}/);
console.log('Offline device remains mapped and shows red Offline in detailed and compact views');
