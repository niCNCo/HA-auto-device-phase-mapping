// Distinguish since-restart rejection checks from persistently learned evidence.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const source = fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js', 'utf8');
const registered = new Map();
class Element {
  constructor() { this.tagName = 'PHASE-MAPPER-PANEL'; }
  attachShadow() { return this.shadowRoot = { innerHTML: '', querySelector:()=>null, querySelectorAll:()=>[] }; }
}
const env = { HTMLElement:Element, customElements:{get:x=>registered.get(x),define:(x,y)=>registered.set(x,y)},
  window:{customCards:[]},console,Math,Date,Set,Map,Number,String,Intl,Event,setTimeout,clearTimeout };
vm.createContext(env); vm.runInContext(source,env);
const panel = new (registered.get('phase-mapper-panel'))();
panel._hass = {states:{},user:{is_admin:true},themes:{darkMode:true}};
panel._data = { corrected_power:{L1:900,L2:0,L3:0} };
const row = {name:'Airco Livingroom Power',entity_id:'sensor.airco_livingroom',phase:'Unknown',
  events:0,confidence:0,power_w:0,diagnostics:{last_reason:'slow_candidate',last_detail:'Tentative L2',counts:{slow_candidate:1,poor_correlation:3}},
  tentative_votes:2,tentative_phase:'L2'};
let html=panel._row(row);
assert(html.includes('Saved tentative slow matches: 2'));
assert(html.includes('candidate L2')); 
assert(html.includes('4 checks since restart'));
assert(!html.includes('4 recorded checks'));
let section=panel._learningDiagnostics({learning_diagnostics:{counts:{accepted:1,transitions_detected:20},
  accepted_total:8,tentative_votes_saved:4,tentative_devices:2,history:{ready:true,reason:'Valid corrected-power samples',samples:{L1:42,L2:42,L3:42}}}});
assert(section.includes('1 accepted since restart'));
assert(section.includes('Total accepted observations (saved):'));
assert(section.includes('Total accepted observations (saved):</strong> 8')); 
assert(section.includes('Saved tentative slow matches:'));
assert(section.includes('Saved tentative slow matches:</strong> 4'));
console.log('v1.4.9 saved tentative learning and session diagnostics UI passed');
