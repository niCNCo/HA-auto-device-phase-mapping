'use strict';
// The backend diagnostic export from the live user environment stated 1.5.11
// despite the dashboard having newer markup. Detect this condition explicitly.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
const registry = new Map();
class Element {
  constructor(){this.tagName='PHASE-MAPPER-PANEL';}
  attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};}
}
const ctx={HTMLElement:Element,
  customElements:{get:k=>registry.get(k),define:(k,v)=>registry.set(k,v)},
  window:{customCards:[],matchMedia:()=>({matches:true})},
  console,Math,Date,Number,String,Intl,Set,Map,Event,setTimeout,clearTimeout};
vm.createContext(ctx);vm.runInContext(source,ctx);
const View=registry.get('phase-mapper-panel');
const view=new View();
function diag(version){
  return view._learningDiagnostics({version,learning_diagnostics:{
    counts:{watchdog_orphan_queue:2,watchdog_stalled_worker:1,
      evaluations_completed:10,worker_unfinished_recovered:1},
    queued_transitions:0,active_workers:0,orphan_queues:0,
    inflight_evaluations:0,history:{ready:true,samples:{L1:100,L2:100,L3:100}}
  }});
}
const mismatch=diag('1.5.11');
assert(mismatch.includes('backend v1.5.11'));
assert(mismatch.includes('frontend v1.6.2'));
assert(mismatch.includes('Version mismatch'));
const matching=diag('1.6.2');
assert(matching.includes('Versions match'));
assert(!matching.includes('Version mismatch'));
assert(matching.includes('Orphan queues recovered'));
assert(matching.includes('Stalled workers restarted'));
assert(matching.includes('In-flight evaluations'));
console.log('v1.6.2 frontend/backend version mismatch and recovery diagnostics passed');
