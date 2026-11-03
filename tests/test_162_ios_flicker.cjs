'use strict';
// Regression coverage for flicker-free incremental updates. The mock DOM
// implements only the node operations used by the anti-flicker reconciler.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
const registry = new Map();
class TextNode {
  constructor(value){this.nodeType=3;this.nodeName='#text';this.nodeValue=value;this.childNodes=[];}
}
class Elem {
  constructor(tag,attrs={},children=[]){this.nodeType=1;this.nodeName=tag.toUpperCase();this.tagName=this.nodeName;this.childNodes=children;this.map={...attrs};this.scrollTop=0;this.scrollLeft=0;this.isConnected=true;}
  get attributes(){return Object.entries(this.map).map(([name,value])=>({name,value}));}
  getAttribute(k){return this.map[k]??null;}
  setAttribute(k,v){this.map[k]=v;}
  hasAttribute(k){return Object.hasOwn(this.map,k);}
  removeAttribute(k){delete this.map[k];}
}
class Fragment {
  constructor(children=[]){this.nodeType=11;this.nodeName='#document-fragment';this.childNodes=children;}
}
const text=v=>new TextNode(v);
const fixtures=new Map();
class HTMLElementMock {
  constructor(){this.tagName='PHASE-MAPPER-PANEL';this.isConnected=true;this.shadowRoot=null;this.listeners=[];}
  attachShadow(){this.shadowRoot=new Fragment();this.shadowRoot.listeners=[];this.shadowRoot.addEventListener=(...a)=>this.shadowRoot.listeners.push(a);this.shadowRoot.querySelector=()=>null;this.shadowRoot.querySelectorAll=()=>[];return this.shadowRoot;}
  addEventListener(...a){this.listeners.push(a);}
}
const scroller={scrollHeight:3000,clientHeight:400,scrollTop:420,scrollLeft:0,isConnected:true};
const dom={createElement(name){
  assert.equal(name,'template');
  return {set innerHTML(value){this.content=fixtures.get(value);assert(this.content,`Unexpected mock markup: ${value}`);}};
},scrollingElement:scroller};
const ctx={HTMLElement:HTMLElementMock,document:dom,
 customElements:{get:name=>registry.get(name),define:(name,ctor)=>registry.set(name,ctor)},
 window:{customCards:[],matchMedia:()=>({matches:false})},
 console,Math,Date,Number,String,Intl,Set,Map,Event,setTimeout,clearTimeout,
 requestAnimationFrame:fn=>fn()};
vm.createContext(ctx);vm.runInContext(source,ctx);
const view=new (registry.get('phase-mapper-panel'))();
function setCurrent(t,open='open') {
 const meter=new Elem('strong',{},[text(t)]);
 const details=new Elem('details',{id:'stillLearning', ...(open?{open:''}:{})},[new Elem('summary',{},[text('Still learning')])]);
 const input=new Elem('input',{type:'search',value:'user entry'});
 const old=new Elem('main',{class:'page panel'},[meter,details,input]);
 view.shadowRoot.childNodes=[old];
 return {old,meter,details,input};
}
const existing=setCurrent('120 W');
fixtures.set('update',new Fragment([new Elem('main',{class:'page panel'},[
 new Elem('strong',{},[text('567 W')]),
 new Elem('details',{id:'stillLearning'},[new Elem('summary',{},[text('Still learning')])]),
 new Elem('input',{type:'search',value:'remote entry'})
])]));
assert.equal(view._pmPatchPassiveHTML('update'),true);
assert.equal(existing.meter.childNodes[0].nodeValue,'567 W');
assert.equal(view.shadowRoot.childNodes[0],existing.old,'root must not be replaced');
assert.equal(existing.details.hasAttribute('open'),true,'expanded details must stay expanded');
assert.equal(existing.input.getAttribute('value'),'user entry','input state must be preserved');
assert.equal(view._pmPendingStructure,false);
// An added mapped row must not prevent unrelated live power values updating.
const liveRow=new Elem('div',{'data-entity':'sensor.first'},[text('first')]);
const current=new Elem('main',{},[new Elem('strong',{},[text('400 W')]),new Elem('div',{},[liveRow])]);
view.shadowRoot.childNodes=[current];
fixtures.set('new-device',new Fragment([new Elem('main',{},[
 new Elem('strong',{},[text('625 W')]),new Elem('div',{},[new Elem('div',{'data-entity':'sensor.first'},[text('first')]),new Elem('div',{'data-entity':'sensor.second'},[text('second')])])
])]));
assert.equal(view._pmPatchPassiveHTML('new-device'),false);
assert.equal(current.childNodes[0].childNodes[0].nodeValue,'625 W','meters update even when list changes');
assert.equal(current.childNodes[1].childNodes.length,1,'rows should not change during scroll');
// Background updates don't replace a scrollable page during touch interaction.
view._pmLastInteraction=Date.now();
view._pmPassiveRefresh=true;
view._pmRenderTarget.innerHTML='new-device';
assert.equal(view.shadowRoot.childNodes[0],current);
assert.equal(view._pmSkipWire,true,'existing listeners must not be duplicated');
view._pmSkipWire=false;
// After a quiet period, structural changes may be applied, restoring HA scroll.
view._pmLastInteraction=Date.now()-10000;
let rebuilt=false;
Object.defineProperty(view.shadowRoot,'innerHTML',{set(html){assert.equal(html,'new-device');rebuilt=true;scroller.scrollTop=0;this.childNodes=fixtures.get(html).childNodes;}});
view._pmRenderTarget.innerHTML='new-device';
assert.equal(rebuilt,true);
assert.equal(scroller.scrollTop,420,'HA external scroll position must survive rebuild');
assert.equal(view._pmPendingStructure,false);
// Panel and card rendering share the same updater.
assert(source.includes("this._pmRenderTarget.innerHTML=css+shell"));
assert(source.includes('if(forceRender)this._render()'));
console.log('v1.6.2 iOS in-place refresh, disclosure, focus, stable live values, structural idle, and HA scroll tests passed');
