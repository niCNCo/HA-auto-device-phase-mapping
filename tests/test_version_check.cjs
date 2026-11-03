// Regression: pre-release-aware version checking and failed lookup state.
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const classes=new Map();
class Element {
  constructor(){this.tagName='PHASE-MAPPER-CARD';this.isConnected=true;this.shadowRoot=null;}
  attachShadow(){this.shadowRoot={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};return this.shadowRoot;}
}
let requestCount=0;
const context={
  HTMLElement:Element,
  customElements:{get:n=>classes.get(n),define:(n,klass)=>classes.set(n,klass)},
  window:{customCards:[]},console,Date,Number,Math,Set,Map,String,Intl,Event,
  fetch:async(url)=>{
    assert(url.includes('/releases?'));
    requestCount++;
    return {ok:true,json:async()=>[
      {tag_name:'v1.6.2',draft:false,prerelease:true,html_url:'https://github.com/niCNCo/HA-auto-device-phase-mapping/releases/tag/v1.6.2'},
      {tag_name:'v1.6.3',draft:false,prerelease:true,html_url:'https://github.com/niCNCo/HA-auto-device-phase-mapping/releases/tag/v1.6.3'},
      {tag_name:'v9.0.0',draft:true,prerelease:false}
    ]};
  }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8'),context);
(async()=>{
  const card=new (classes.get('phase-mapper-card'))();
  card._tab='mapping';
  await card._checkLatestRelease(true);
  assert.equal(card._releaseStatus.latest,'1.6.3');
  assert.equal(card._releaseStatus.status,'current');
  assert.equal(card._releaseStatus.prerelease,true);
  assert.equal(requestCount,1);
  await card._checkLatestRelease();
  assert.equal(requestCount,1,'Normal checks must respect the three-hour cache');
  await card._checkLatestRelease(true);
  assert.equal(requestCount,2,'Manual refresh must bypass the cache');

  const old=new (classes.get('phase-mapper-panel'))();
  old._tab='mapping';
  // Compare a previous published version with the latest pre-release.
  const check=old._checkLatestRelease.bind(old);
  const originalLatest=old._releaseStatus;
  await check(true);
  assert.equal(old._releaseStatus.status,'current');

  context.fetch=async()=>({ok:false,status:403});
  await card._checkLatestRelease(true);
  assert.equal(card._releaseStatus.status,'unverified');
  console.log('Release check: pre-releases, draft filtering, cache, manual refresh and API failure passed');
})().catch(error=>{console.error(error);process.exitCode=1});
