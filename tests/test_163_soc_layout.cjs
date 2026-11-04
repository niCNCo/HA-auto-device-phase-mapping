'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
const reg=new Map();
class Element {constructor(){this.tagName='PHASE-MAPPER-PANEL';} attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}}
const ctx={HTMLElement:Element,customElements:{get:k=>reg.get(k),define:(k,v)=>reg.set(k,v)},window:{customCards:[]},console,Math,Date,Number,String,Intl,Set,Map,Event,setTimeout,clearTimeout};
vm.createContext(ctx);vm.runInContext(src,ctx);
const v=new (reg.get('phase-mapper-panel'))();
const original={L1:[{entity_id:'sensor.bat1_power',positive:true,soc_entity_id:'sensor.bat1_soc'}],L2:[],L3:[]};
const dropped={L1:[{entity_id:'sensor.bat1_power',positive:true}],L2:[],L3:[]};
const payload={type:'ha_auto_device_phase_mapping/set',battery_sources:original};
assert.equal(v._settingsAcknowledged(payload,{save_ack:{committed:true,fields:['battery_sources']},settings:{battery_sources:dropped}}),false,'missing SoC must fail green saved acknowledgement');
assert.deepEqual(Array.from(v._saveMismatch),['battery_sources (including selected SoC sensors)']);
assert.equal(v._settingsAcknowledged(payload,{save_ack:{committed:true,fields:['battery_sources']},settings:{battery_sources:original}}),true,'retained SoC must be accepted');
assert(src.includes('.pm-compact-phase.pm-total .pm-ring-wrap{display:grid'), 'compact household ring must have dedicated grid rules');
assert(src.includes('@container (max-width:1399px)'), 'household must move to its own row before four columns become cramped');
assert(src.includes('@container (min-width:380px)'), 'household ring must use two columns when enough card width exists');
console.log('SoC acknowledgement and responsive layout regression tests passed');
