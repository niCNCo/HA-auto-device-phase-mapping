'use strict';
// A fresh dashboard component must restore Still Learning from localStorage.
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
const registry=new Map(), storage=new Map();
const still={open:false,listeners:{},addEventListener(event,fn){this.listeners[event]=fn;}};
class Element{
  constructor(){this.tagName='PHASE-MAPPER-PANEL';}
  attachShadow(){return this.shadowRoot={innerHTML:'',querySelector:sel=>sel==='#stillLearning'?still:null,querySelectorAll:()=>[]};}
}
const env={HTMLElement:Element,customElements:{get:k=>registry.get(k),define:(k,v)=>registry.set(k,v)},
window:{customCards:[],matchMedia:()=>({matches:true}),localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,v)}},Date,Math,Number,String,Intl,Set,Map,Event,console,setTimeout,clearTimeout};
vm.createContext(env);vm.runInContext(source,env);
const Panel=registry.get('phase-mapper-panel');
const key='ha_auto_device_phase_mapping.stillLearningExpanded';
const first=new Panel();
assert.equal(first._sections.learning,false);
first._wireIconPicker=()=>{};
first._wire();
assert.equal(typeof still.listeners.toggle,'function');
still.listeners.toggle({target:{open:true}});
assert.equal(storage.get(key),'true');
const restored=new Panel();
assert.equal(restored._sections.learning,true,'expanded preference restored after page navigation');
restored._wireIconPicker=()=>{};restored._wire();
still.listeners.toggle({target:{open:false}});
assert.equal(storage.get(key),'false');
assert.equal((new Panel())._sections.learning,false,'collapsed preference also restored');
console.log('v1.5.4 Still Learning persistence across recreated panel instances passed');
