/* Confirm provisional phase hints are displayed without moving a device out of Still Learning. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
const registry=new Map();
class Element{
  constructor(){this.tagName='PHASE-MAPPER-PANEL';}
  attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}
}
const ctx={HTMLElement:Element,customElements:{get:k=>registry.get(k),define:(k,v)=>registry.set(k,v)},window:{customCards:[]}, console, Math,Date,Number,String,Intl,Set,Map,Event,setTimeout,clearTimeout};
vm.createContext(ctx);vm.runInContext(code,ctx);
const ui=new (registry.get('phase-mapper-panel'))();
ui._hass={states:{},user:{is_admin:true},themes:{darkMode:true}};
ui._data={corrected_power:{L1:1454,L2:30,L3:203}};
const r={name:'Airco Livingroom Power',entity_id:'sensor.airco',phase:'Unknown',manual:false,
  power_w:954,events:0,confidence:0,excluded:false,
  phase_hint:{phase:'L1',clues:3,step_matches:1,load_hints:2,confirmed:false},
  tentative_votes:1,tentative_phase:'L1',load_hints:2};
const html=ui._row(r);
assert(html.includes('Likely L1'),html);
assert(html.includes('0% confirmed evidence'));
assert(html.includes('3 provisional clues'));
assert(html.includes('Saved tentative slow matches: 1'));
assert(html.includes('ON-load feasibility clues: 2'));
assert(html.includes('value="" selected'), 'Must remain on Automatic / Still Learning');
const noHint=ui._row({...r,phase_hint:null,load_hints:0,tentative_votes:0});
assert(noHint.includes('Learning…')&&!noHint.includes('Likely L1'));
const diagnostics=ui._learningDiagnostics({learning_diagnostics:{counts:{accepted:0,queued_transition:3},
    queued_transitions:2, load_hints_saved:5,history:{ready:true,reason:'Cleaned phase samples',samples:{L1:50,L2:50,L3:50}}}});
assert(diagnostics.includes('Queued transitions'));
assert(diagnostics.includes('Saved load feasibility hints'));
assert(diagnostics.includes('Waiting in transition queues'));
console.log('v1.4.10 provisional learning UI passed');
