const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
const classes=new Map();
class HTMLElementMock{constructor(){this.tagName='PHASE-MAPPER-CARD';this.shadowRoot=null;}attachShadow(){this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};return this.shadowRoot;}}
const c={HTMLElement:HTMLElementMock,customElements:{get:n=>classes.get(n),define:(n,k)=>classes.set(n,k)},window:{customCards:[]},console,Date,Number,Math,Set,Map,String,Intl,Event,setTimeout,clearTimeout};
vm.createContext(c);vm.runInContext(src,c);
(async()=>{
 const el=new (classes.get('phase-mapper-panel'))();el.tagName='PHASE-MAPPER-PANEL';
 const settings={excluded:[],phase_sensors:{L1:'sensor.l1',L2:'sensor.l2',L3:'sensor.l3'},grid_current_sensors:{L1:'',L2:'',L3:''},grid_voltage_sensors:{L1:'',L2:'',L3:''},phase_current_limits_a:{L1:25,L2:25,L3:25},battery_sources:{L1:[],L2:[],L3:[]},solar_sources:{L1:[],L2:[],L3:[],TOTAL:[]},solar_phase_estimation:{enabled:false,currents:{L1:'',L2:'',L3:''},voltages:{L1:'',L2:'',L3:''}},learning_enabled:true,minimum_change_w:100,manual_assignments:{}};
 const calls=[];el._hass={states:{},user:{is_admin:true},callWS:async x=>{calls.push(x);settings.excluded=[...(x.excluded||settings.excluded)];return {...el._data,settings:{...settings}};}};
 el._data={version:'1.4.0',settings,devices:[{entity_id:'sensor.test',name:'Test device',phase:'Unknown',events:3,confidence:8,power_w:25,excluded:false}],grid_headroom:{L1:{current:10,voltage:230,limit:25,remaining:15,utilization:40}}};
 el._resetDraft();el._tab='settings';el._render();
 assert(el.shadowRoot.innerHTML.includes('included-row'));
 assert(el.shadowRoot.innerHTML.includes('btn compactbtn included'));
 el._draft.excluded.add('sensor.test');el._showExcludedSettings=true;el._markDirty();el._render();
 assert(el.shadowRoot.innerHTML.includes('excluded-row'));
 assert(el.shadowRoot.innerHTML.includes('btn compactbtn restore'));
 await el._autosave();
 assert.equal(calls.length,1);assert(calls[0].excluded.includes('sensor.test'));
 assert.equal(el._dirty,false);
 el._confirmReset=true;el._render();
 assert(el.shadowRoot.innerHTML.includes('resetAcknowledge'));
 assert(el.shadowRoot.innerHTML.includes('id="confirmReset" disabled'));
 el._confirmReset=false;
 el._tab='info';el._render();assert(el.shadowRoot.innerHTML.includes('saved automatically'));
 console.log('v1.4.0: autosave, red restore, green included, reset confirmation, Info tab checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
