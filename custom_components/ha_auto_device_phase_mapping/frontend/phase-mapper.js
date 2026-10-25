/* HA_auto_device_phase_mapping v1.4.4 — shared Home Assistant panel and dashboard card. */
(() => {
  'use strict';
  const VERSION = '1.4.4';
  const PHASES = ['L1', 'L2', 'L3'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmtW = value => value == null || !Number.isFinite(Number(value)) ? '—' : `${Math.round(Number(value)).toLocaleString()} W`;
  const icons = {L1:'①',L2:'②',L3:'③','3-phase':'ϟ',Unknown:'?'};

  const css = `<style>
    :host{display:block;color:var(--primary-text-color);--pm-primary:var(--primary-color,#4588d3);--pm-green:#3fa788;--pm-yellow:#f5ad4e;--pm-purple:#a489cf;--pm-border:var(--divider-color,#ddd);font-family:var(--paper-font-body1_-_font-family,Roboto,sans-serif)}
    *,*:before,*:after{box-sizing:border-box}
    .page{padding:16px 16px 56px;max-width:1450px;margin:0 auto}.surface{background:var(--card-background-color,#fff);box-shadow:var(--ha-card-box-shadow,0 1px 4px #0001);border-radius:var(--ha-card-border-radius,14px);padding:20px}
    .card{display:block}.card .surface{padding:16px}.paneltop{background:var(--app-header-background-color,var(--primary-color,#1864a8));color:var(--text-primary-color,#fff);padding:12px 20px;display:flex;align-items:center;gap:12px}
    .paneltop h2{margin:0;font-size:19px}.drawer{background:transparent;border:0;color:inherit;font-size:24px;cursor:pointer;min-width:38px;text-align:center}
    .head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:15px}
    .heading{display:flex;align-items:center;gap:14px}.symbol{width:54px;height:54px;background:var(--secondary-background-color);border-radius:13px;display:grid;place-items:center;overflow:hidden;padding:4px}.brandlogo{width:100%;height:100%;object-fit:contain}.headtitle{font-size:21px;font-weight:750;letter-spacing:-.35px}.headstatus{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.statusdot{height:8px;width:8px;border-radius:50%;background:var(--pm-green);display:inline-block}.info-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.info-section{background:var(--secondary-background-color);padding:16px;border-radius:12px;line-height:1.65;font-size:13px}.info-section h3{margin-bottom:8px}.info-section p{margin:6px 0}.info-section ol,.info-section ul{padding-left:20px;margin:8px 0}.info-section code{font-size:12px;overflow-wrap:anywhere}.info-section.wide{grid-column:1/-1}@media(max-width:680px){.info-grid{grid-template-columns:1fr}}
    h2,h3{margin:0}h2{font-size:20px;font-weight:650;letter-spacing:-.3px}h3{font-size:15px;font-weight:650}
    .sub{font-size:12px;color:var(--secondary-text-color);margin-top:4px}.pill{background:var(--secondary-background-color);color:var(--primary-text-color);padding:6px 10px;border-radius:40px;font-size:11px;font-weight:600;white-space:nowrap}
    .metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:17px}.metric{padding:14px;border-radius:12px;background:var(--secondary-background-color);text-align:center;min-width:0}
    .metric:nth-child(1){border-left:4px solid #3b82f6;background:color-mix(in srgb,#3b82f6 9%,var(--card-background-color,#fff))}.metric:nth-child(2){border-left:4px solid #16a34a;background:color-mix(in srgb,#16a34a 9%,var(--card-background-color,#fff))}.metric:nth-child(3){border-left:4px solid #c084fc;background:color-mix(in srgb,#c084fc 9%,var(--card-background-color,#fff))}
    .metric strong{font-size:27px;display:block;line-height:1.2}.metric span{font-size:11px;color:var(--secondary-text-color)}
    .phases{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}.phasebox{padding:14px;border:1px solid var(--pm-border);border-radius:12px;background:var(--card-background-color)}
    .phasebox{--phase-accent:#3b82f6;border-top:4px solid var(--phase-accent);background:linear-gradient(150deg,color-mix(in srgb,var(--phase-accent) 10%,var(--card-background-color,#fff)),var(--card-background-color,#fff) 70%)}
    .phasebox.l2{--phase-accent:#f59e0b}.phasebox.l3{--phase-accent:#a78bfa}.phasebox.total{--phase-accent:#14b8a6}
    .headroom{margin-top:12px;padding:10px;border-radius:9px;background:var(--secondary-background-color);font-size:12px}
    .headroom .headrow{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
    .headroom .meter{height:9px;background:var(--divider-color,#333);border-radius:9px;overflow:hidden}
    .headroom .meterfill{height:100%;border-radius:9px;transition:width .3s ease;background:#22c55e}
    .headroom.warning .meterfill{background:#f59e0b}.headroom.danger .meterfill{background:#ef4444}
    .headroom.warning strong{color:#f59e0b}.headroom.danger strong{color:#ef4444}
    .phasebox .phasehead strong{color:var(--phase-accent)}.phasebox .powerline.cleaned{border-top-color:color-mix(in srgb,var(--phase-accent) 35%,var(--pm-border))}.phasebox .powerline.cleaned strong{color:var(--phase-accent)}
    .phasebox .phasehead{display:flex;align-items:center;justify-content:space-between;gap:6px} .phasebox b{font-size:23px}.powerlines{margin-top:12px;display:grid;gap:8px}.powerline{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px}.powerline span{color:var(--secondary-text-color)}.powerline strong{font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap}.powerline.cleaned{border-top:1px solid var(--pm-border);padding-top:10px;margin-top:3px}.powerline.cleaned strong{font-size:19px}.phasebox small{display:block;color:var(--secondary-text-color);margin-top:5px;font-size:11px}
    .group{border-top:3px solid var(--pm-primary)}.group[data-phase="L1"]{border-top-color:#3b82f6}.group[data-phase="L2"]{border-top-color:#f59e0b}.group[data-phase="L3"]{border-top-color:#a78bfa}.group[data-phase="3-phase"]{border-top-color:#14b8a6}.group[data-phase="Unknown"]{border-top-color:#94a3b8}
    .sourceentry{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center}
    .systemdevice{background:color-mix(in srgb,#3b82f6 5%,var(--card-background-color));border-left:3px solid var(--phase-color,#3b82f6);padding:10px;border-radius:7px}
    .battery-direction.charge{color:#f59e0b}.battery-direction.discharge{color:#22c55e}
    .battery-direction.mixed{color:var(--secondary-text-color)}
    .battery-tag{font-size:10px;color:#38bdf8;font-weight:650}

    .sourceentry .sensor-reading{grid-column:1/-1;flex-basis:100%;margin:0 0 5px}
    .sensor-reading{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:5px;min-height:17px;font-size:11px;color:var(--secondary-text-color)}
    .sensor-reading .reading-value{font-weight:700;font-variant-numeric:tabular-nums;color:var(--primary-text-color)}
    .sensor-reading .reading-status{font-size:10px;border-radius:20px;padding:1px 6px;background:var(--secondary-background-color)}
    .sensor-reading .reading-status.fresh{color:#22c55e}.sensor-reading .reading-status.old{color:#f59e0b}.sensor-reading .reading-status.unavailable{color:#ef4444}
    .settingtitle{padding-left:10px;border-left:3px solid var(--pm-primary)}
    .tabs{display:flex;gap:8px;border-bottom:1px solid var(--pm-border);margin:8px 0 17px;padding-bottom:0}.tab{border:0;border-bottom:3px solid transparent;background:transparent;color:var(--secondary-text-color);padding:11px 14px;font-size:13px;cursor:pointer}
    .tab.active{border-bottom-color:var(--pm-primary);color:var(--pm-primary);font-weight:700;background:color-mix(in srgb,var(--pm-primary) 8%,transparent);border-radius:9px 9px 0 0}
    .tools{display:flex;gap:9px;align-items:center;margin:10px 0 12px;flex-wrap:wrap}.search{flex:1;min-width:170px}
    input[type=search],input[type=number],select{background:var(--card-background-color);color:var(--primary-text-color);border:1px solid var(--pm-border);border-radius:9px;padding:10px;width:100%;font-size:13px}
    input[type=checkbox]{width:16px;height:16px;accent-color:var(--pm-primary);cursor:pointer}
    button{cursor:pointer;font:inherit}.btn{font-size:12px;border:1px solid var(--pm-border);background:transparent;color:var(--primary-text-color);padding:10px 12px;border-radius:8px;white-space:nowrap}
    .btn.restore{background:color-mix(in srgb,#ef4444 17%,var(--card-background-color));color:#f87171;border-color:#ef4444;font-weight:700}
    .btn.included{background:color-mix(in srgb,#22c55e 15%,var(--card-background-color));color:#22c55e;border-color:#16a34a;font-weight:650}
    .excluded-row{border-left:3px solid #ef4444;padding-left:9px}.included-row{border-left:3px solid #16a34a;padding-left:9px}
    .save-status{font-size:12px;color:var(--secondary-text-color);display:flex;gap:8px;align-items:center}
    .save-status[data-state="saved"]{color:#22c55e}.save-status[data-state="error"]{color:#ef4444}
    .reset-backdrop{position:fixed;inset:0;background:#0009;display:grid;place-items:center;z-index:1000;padding:18px}
    .reset-modal{background:var(--card-background-color,#222);color:var(--primary-text-color,#fff);border:1px solid #ef4444;border-radius:14px;padding:22px;max-width:460px;width:100%;box-shadow:0 20px 55px #0007}
    .reset-modal h3{font-size:18px;color:#ef4444;margin:0 0 12px}.reset-modal p{line-height:1.6;font-size:13px}.btn.danger{background:#b91c1c;color:white;border-color:#b91c1c;font-weight:700}
    .btn:disabled{opacity:.4;cursor:default}.btn.primary{background:var(--pm-primary);color:var(--text-primary-color,#fff);border-color:var(--pm-primary);font-weight:650}
    .hint{font-size:12px;line-height:1.65;color:var(--secondary-text-color);margin:10px 0}.warn{border-left:3px solid var(--error-color,#b54d4d);background:var(--secondary-background-color);padding:10px;margin:10px 0;font-size:12px;line-height:1.4}
    .success{border-left:3px solid var(--pm-green);background:var(--secondary-background-color);padding:10px;margin:10px 0;font-size:12px}
    .row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--pm-border);min-width:0}.row:last-child{border-bottom:0}
    .row .left{min-width:0;flex:1}.name{font-size:13px;font-weight:600;overflow-wrap:anywhere}.meta{font-size:11px;color:var(--secondary-text-color);margin-top:4px;overflow-wrap:anywhere}
    .right{text-align:right;flex-shrink:0;max-width:120px}.ptext{font-size:13px;font-weight:700}.evidence{font-size:11px;color:var(--secondary-text-color);margin-top:2px}
    .devpower{font-weight:700;font-variant-numeric:tabular-nums}.contrib{font-size:11px;color:var(--secondary-text-color);margin-top:3px}.devicebar{height:5px;border-radius:5px;background:var(--divider-color);overflow:hidden;margin-top:4px}.devicebar>span{display:block;height:100%;background:var(--phase-color,#3b82f6)}
    .row[data-entity],.powerline[data-more]{cursor:pointer}.row[data-entity]:hover,.powerline[data-more]:hover{background:color-mix(in srgb,var(--primary-color) 9%,transparent)}
    .row[draggable="true"]{cursor:grab}.group.drop-target{outline:2px dashed var(--primary-color);background:color-mix(in srgb,var(--primary-color) 6%,transparent)}
    .settingsbox{background:color-mix(in srgb,var(--secondary-background-color) 70%,transparent);padding:15px;border-radius:13px;margin:12px 0 14px;border:1px solid var(--pm-border)}
    .settingsbox h3{margin-bottom:10px}.phasefield{border-left:4px solid var(--phase-color,#3b82f6);padding-left:10px}.sourceentry{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin:5px 0}.sourceentry select{flex:1;min-width:0}.sourceentry .checkline{white-space:nowrap}.compactbtn{padding:7px 9px!important}.sourcegroup{min-width:0}
    .manualcontrol{width:auto!important;max-width:120px;font-size:11px;padding:5px!important;margin-top:5px}.inlinehelp{font-size:11px;color:var(--secondary-text-color)}
    .bar{height:5px;width:95px;max-width:24vw;border-radius:4px;background:var(--divider-color);margin-top:6px;overflow:hidden;margin-left:auto}.bar span{display:block;height:100%;background:var(--pm-green);border-radius:4px}
    .unknown .bar span{background:var(--pm-yellow)}.empty{padding:24px;text-align:center;color:var(--secondary-text-color);font-size:13px}
    .cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.group{border:1px solid var(--pm-border);border-radius:12px;padding:13px 16px;min-width:0}
    .group[data-phase="L1"]{border-left:4px solid #3b82f6}.group[data-phase="L2"]{border-left:4px solid #e5a331}.group[data-phase="L3"]{border-left:4px solid #a78bfa}.group[data-phase="3-phase"]{border-left:4px solid #17a99c}.grouphead{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}.count{font-size:11px;color:var(--secondary-text-color)}
    .scroll{max-height:420px;overflow:auto}.panel .scroll{max-height:700px}.settingtitle{font-weight:700;margin:21px 0 9px;font-size:14px}
    .formgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.field label{display:block;font-size:12px;font-weight:600;margin-bottom:7px}
    .checkline{display:flex;gap:9px;align-items:center;font-size:13px;cursor:pointer}.actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin:15px 0}
    a{color:var(--primary-color)}.foot{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;margin-top:14px;gap:12px}.muted{opacity:.55}
    .spinner{display:inline-block;opacity:.7}.filter{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:11px 0;font-size:12px}
    @media(max-width:1050px){.phases{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:850px){.cols{grid-template-columns:1fr}.page{padding:12px}.formgrid{grid-template-columns:1fr}}
    @media(max-width:520px){.surface{padding:13px}.card .surface{padding:12px}.metrics,.phases{gap:6px}.metric{padding:11px 4px}.metric strong{font-size:23px}.phases{grid-template-columns:1fr}.phasebox{padding:12px}.phasebox b{font-size:18px}.phasebox .phasehead{font-size:12px}.right{max-width:100px}}
  </style>`;

  class PhaseMapperView extends HTMLElement {
    constructor(){
      super();this.attachShadow({mode:'open'});
      this._tab='mapping';this._filter='';this._excludeFilter='';this._showExcluded=false;
      this._showAll=false;this._showExcludedSettings=false;this._loading=false;this._busy=false;this._error='';this._message='';this._lastFetch=0;
      this._refreshTimer=null;this._autoTimer=null;this._draftRevision=0;this._confirmReset=false;this._resetAcknowledged=false;this._saveState='saved';
    }
    setConfig(config){this._config=config||{};this._render();}
    set hass(value){
      this._hass=value;
      // Update only the tiny value labels; never rebuild an open select or reset scroll.
      if (this._tab==='settings') this._updateLiveReadings();
      if (value?.callWS && !this._loading && Date.now()-this._lastFetch>this._refreshMs()) this._fetch();
    }
    getCardSize(){return 7;}
    static getStubConfig(){return {};}
    connectedCallback(){this._render();this._startRefresh();if(this._hass)this._fetch();}
    disconnectedCallback(){if(this._refreshTimer!==null){clearInterval(this._refreshTimer);this._refreshTimer=null;}}
    _refreshMs(){return 1000*(Number(this._draft?.dashboard_refresh_seconds ?? this._data?.settings?.dashboard_refresh_seconds)||2);}
    _startRefresh(){
      if(this._refreshTimer!==null)clearInterval(this._refreshTimer);
      if(!this.isConnected){this._refreshTimer=null;return;}
      this._refreshTimer=setInterval(()=>{
        if(this.isConnected && this._hass?.callWS && !this._loading && !this._busy){
          // Keep controls stable; settings readings update from HA's state stream.
          if(this._tab==='settings')this._updateLiveReadings();
          else void this._fetch();
        }
      },this._refreshMs());
    }
    get full(){return this.tagName.toLowerCase()==='phase-mapper-panel';}
    _resetDraft(){
      if(!this._data)return;
      const s=this._data.settings;
      this._draft={excluded:new Set(s.excluded),phase_sensors:{...s.phase_sensors},
                   learning_enabled:s.learning_enabled,minimum_change_w:s.minimum_change_w,
                   dashboard_refresh_seconds:s.dashboard_refresh_seconds||2,
                   grid_current_sensors:{...(s.grid_current_sensors||{})},
                   grid_voltage_sensors:{...(s.grid_voltage_sensors||{})},
                   phase_current_limits_a:{...(s.phase_current_limits_a||{})},
                   battery_sources:JSON.parse(JSON.stringify(s.battery_sources||{L1:[],L2:[],L3:[]})),
                   solar_sources:JSON.parse(JSON.stringify(s.solar_sources||{L1:[],L2:[],L3:[],TOTAL:[]})),
                   manual_assignments:{...(s.manual_assignments||{})},
                   solar_phase_estimation:JSON.parse(JSON.stringify(s.solar_phase_estimation||{enabled:false,currents:{L1:'',L2:'',L3:''},voltages:{L1:'',L2:'',L3:''}}))};
      this._dirty=false;this._saveState='saved';this._startRefresh();
    }
    async _fetch(){
      if(!this._hass?.callWS||this._loading||this._busy)return;
      this._loading=true;this._lastFetch=Date.now();
      try{this._data=await this._hass.callWS({type:'ha_auto_device_phase_mapping/get'});
        if(!this._draft||!this._dirty)this._resetDraft();this._error='';
      }catch(error){this._error=error.message||String(error);}
      finally{
        this._loading=false;
        // Never replace live settings controls while the user is choosing a sensor or exclusions.
        // The newly fetched data is used on the next deliberate render/tab change.
        const editingMapping=this._tab==='mapping' &&
          (this._dragging || ['SELECT','INPUT'].includes(this.shadowRoot?.activeElement?.tagName));
        if(!editingMapping && (this._tab!=='settings'||!this.shadowRoot?.querySelector('#excludeSearch')))this._render();
      }
    }
    _moreInfo(entityId){
      if(!entityId)return;
      this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId},bubbles:true,composed:true}));
    }
    _row(r){
      const confidence=Math.max(0,Math.min(100,Number(r.confidence)||0));
      const phase=r.phase;
      const cleaned=Number(this._data?.corrected_power?.[phase]);
      const power=Number(r.power_w);
      const valid=PHASES.includes(phase)&&Number.isFinite(cleaned)&&cleaned>50&&Number.isFinite(power)&&power>=0;
      const share=valid?100*power/cleaned:null;
      const percent=share!==null&&share<=100?`${share.toFixed(1)}% of ${phase}`:'—';
      const manual=!!r.manual;
      const phaseOptions=['','L1','L2','L3','3-phase'].map(p=>`<option value="${p}" ${manual&&p===phase?'selected':!manual&&!p?'selected':''}>${p||'Automatic'}</option>`).join('')+`<option value="__exclude__">Exclude device</option>`;
      return `<div class="row ${r.excluded?'muted':''} ${phase==='Unknown'?'unknown':''}" data-entity="${esc(r.entity_id)}" draggable="${this._hass?.user?.is_admin!==false}">
        <div class="left"><div class="name" title="${esc(r.entity_id)}">${esc(r.name)}</div><div class="meta">${r.events} observations${r.excluded?' · excluded':''}</div>
        <div class="devpower">${fmtW(r.power_w)} <span class="contrib">${esc(percent)}</span></div>
        ${share!==null&&share<=100?`<div class="devicebar" style="--phase-color:${phase==='L1'?'#3b82f6':phase==='L2'?'#f59e0b':'#a78bfa'}"><span style="width:${share}%"></span></div>`:''}
        </div>
        <div class="right"><div class="ptext">${manual?'Manual · ':''}${esc(phase==='Unknown'?'Learning…':phase)}</div>
        ${manual?'<div class="evidence">Manual override</div>':`<div class="evidence">${confidence.toFixed(0)}% evidence</div><div class="bar"><span style="width:${confidence}%"></span></div>`}
        <select class="manualcontrol" data-assign="${esc(r.entity_id)}" aria-label="Manual phase assignment">${phaseOptions}</select></div></div>`;
    }
    _top(d){
      const rows=d.devices||[],included=rows.filter(r=>!r.excluded),mapped=included.filter(r=>r.phase!=='Unknown');
      const stat=(number,label)=>`<div class="metric"><strong>${number}</strong><span>${label}</span></div>`;
      const breakdown=d.power_breakdown||{};
      const line=(label,value,entity,cleaned=false)=>`<div class="powerline${cleaned?' cleaned':''}" ${entity?`data-more="${esc(entity)}" title="Open more info"`:''}><span>${label}</span><strong>${fmtW(value)}</strong></div>`;
      const diag=(p,part)=>`sensor.ha_auto_device_phase_mapping_${p.toLowerCase()}_${part}_power`;
      const batteryFlow=(value,phase)=>{
        // Several batteries on one phase (or across the household) can flow in
        // opposite directions at the same moment; label their net honestly.
        const phases=phase==='TOTAL'?PHASES:[phase];
        const signed=[];
        for(const p of phases){
          for(const source of d.settings.battery_sources?.[p]||[]){
            const st=this._hass?.states?.[source.entity_id];
            const raw=Number(st?.state);
            if(st && !['unknown','unavailable'].includes(st.state) && Number.isFinite(raw))
              signed.push(raw*(source.positive?1:-1));
          }
        }
        if(signed.some(x=>x>1) && signed.some(x=>x < -1))return ['Battery net flow',value];
        if(value==null||!Number.isFinite(value))return ['Battery power',null];
        if(Math.abs(value)<1)return ['Battery idle',0];
        return value<0?['Battery charging',Math.abs(value)]:['Battery discharging',value];
      };
      const contents=(v,p)=>{
        const [label,watts]=batteryFlow(v?.battery,p);
        return `<div class="powerlines">${line('P1 grid power',v?.grid,p==='TOTAL'?diag(p,'grid'):d.settings.phase_sensors[p])}${line(label,watts,diag(p,'battery'))}${line('Solar generation',v?.solar,diag(p,'solar'))}${line('Cleaned household load',v?.cleaned,diag(p,'cleaned'),true)}</div>`;
      };
      const totals=Object.fromEntries(['grid','battery','solar','cleaned'].map(k=>[k,PHASES.every(p=>breakdown[p]?.[k]!=null&&Number.isFinite(breakdown[p][k]))?PHASES.reduce((sum,p)=>sum+breakdown[p][k],0):null]));
      const headroom=p=>{
        const h=d.grid_headroom?.[p];
        if(!h||h.current===null||h.current===undefined){return `<div class="headroom"><div class="headrow"><span>Grid current · headroom</span><strong>Unavailable</strong></div><div class="meter"></div></div>`;}
        const pct=Math.max(0,Number(h.utilization)||0), cls=pct>=90?'danger':pct>=70?'warning':'';
        const direction=Number(h.current)<0?'Exporting':Number(h.current)>0?'Importing':'Balanced';
        return `<div class="headroom ${cls}"><div class="headrow"><span>Grid current · ${direction}</span><strong>${Math.abs(Number(h.current)).toFixed(2)} / ${Number(h.limit).toFixed(1)} A</strong></div><div class="meter" role="progressbar" aria-label="${p} main connection current" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="meterfill" style="width:${Math.min(pct,100)}%"></div></div><div class="headrow" style="margin-top:6px;margin-bottom:0"><span>${h.voltage==null?'Voltage unavailable':Number(h.voltage).toFixed(0)+' V'} · ${pct.toFixed(0)}% used · ${Number(h.current).toFixed(2)} A signed</span><strong>${Number(h.remaining).toFixed(2)} A free</strong></div></div>`;
      };
      const phaseGrid=this.full?`<div class="phases">${PHASES.map(p=>`<div class="phasebox ${p.toLowerCase()}"><div class="phasehead"><strong>${p}</strong><span class="pill">${mapped.filter(r=>r.phase===p).length} mapped</span></div>${contents(breakdown[p],p)}${headroom(p)}</div>`).join('')}<div class="phasebox total"><div class="phasehead"><strong>Household total</strong><span class="pill">L1 + L2 + L3</span></div>${contents(totals,"TOTAL")}</div></div>`:'';
      return `<div class="head"><div class="heading"><div class="symbol"><img class="brandlogo" src="/ha_auto_device_phase_mapping_static/brand/icon.png?v=1.4.4" alt="Phase Mapper icon" /></div><div><div class="headtitle">Automatic Phase Mapper</div>
        <div class="sub">Passive Load Discovery</div></div></div>
        <div class="headstatus"><span class="pill"><span class="statusdot" style="${d.settings.learning_enabled?'':'background:#f59e0b'}"></span> ${d.settings.learning_enabled?'Learning':'Paused'}</span><span class="pill">v${esc(d.version)}</span></div></div>
        <div class="metrics">${stat(rows.length,'Detected')}${stat(mapped.length,'Mapped')}${stat(rows.filter(r=>r.excluded).length,'Excluded')}</div>${phaseGrid}${this.full&&d.settings.solar_phase_estimation?.enabled?`<p class="hint">SolarEdge phase allocation: ${d.solar_estimation_status==='estimated'?'estimated from inverter V × I proportions, normalized to total AC power':d.solar_estimation_status==='fallback_equal'?'SolarEdge phase measurements unavailable; equal split shown as an estimate, learning paused':d.solar_estimation_status==='zero_generation'?'solar production near zero':d.solar_estimation_status==='solar_source_unavailable'?'solar source unavailable — learning paused':'using equal third allocation'}. Phase allocations assume similar power factors.</p>`:''}`;
    }
    _batterySystemRows(phase){
      if(!PHASES.includes(phase))return [];
      const sources=this._data?.settings?.battery_sources?.[phase]||[];
      return sources.filter(source=>source.entity_id).map(source=>{
        const st=this._hass?.states?.[source.entity_id];
        const raw=Number(st?.state);
        const valid=st && !['unknown','unavailable'].includes(st.state) && Number.isFinite(raw);
        const signed=valid?raw*(source.positive?1:-1):null;
        const mode=signed==null?'Unavailable':Math.abs(signed)<1?'Idle':signed<0?'Charging':'Discharging';
        const watts=signed==null?'—':fmtW(Math.abs(signed));
        const name=st?.attributes?.friendly_name||source.entity_id;
        const cls=mode==='Charging'?'charge':mode==='Discharging'?'discharge':'mixed';
        return `<div class="row systemdevice" style="--phase-color:${phase==='L1'?'#3b82f6':phase==='L2'?'#f59e0b':'#a78bfa'}" data-more="${esc(source.entity_id)}" title="Open ${esc(source.entity_id)} More info"><div class="left"><div class="name">🔋 ${esc(name)}</div><div class="battery-tag">System assigned · ${esc(phase)}</div><div class="devpower">${watts} <span class="battery-direction ${cls}">${mode}</span></div></div></div>`;
      });
    }
    _mapping(d){
      const rows=(d.devices||[]).filter(r=>(this._showExcluded||!r.excluded)&&`${r.name} ${r.entity_id} ${r.phase}`.toLowerCase().includes(this._filter.toLowerCase()));
      const search=`<div class="tools"><input id="mappingSearch" class="search" type="search" placeholder="Search device, entity or phase" value="${esc(this._filter)}" aria-label="Search mapped devices"><button class="btn" id="refresh">Refresh</button></div>
        <label class="checkline"><input type="checkbox" id="showExcluded" ${this._showExcluded?'checked':''}> Show excluded devices</label>`;
      if(!this.full){
        const visible=this._showAll?rows:rows.slice(0,9);
        return `${search}<div class="scroll">${PHASES.map(p=>this._batterySystemRows(p).join('')).join('')}${visible.length?visible.map(r=>this._row(r)).join(''):'<div class="empty">No matching power sensors yet.</div>'}</div>
          <div class="foot"><span class="hint">${rows.length} matching sensors</span><div>${rows.length>9?`<button id="showAll" class="btn">${this._showAll?'Show fewer':'Show all'}</button>`:''} <a href="/ha-auto-device-phase-mapping">Open full dashboard</a></div></div>`;
      }
      const groups=[...PHASES,'3-phase','Unknown'];
      return `${search}<div class="cols">${groups.map(p=>{
        const arr=rows.filter(r=>r.phase===p);
        const batteries=this._batterySystemRows(p);
        return `<section class="group" data-phase="${esc(p)}" title="Drag a device here to manually assign its phase"><div class="grouphead"><h3>${esc(p==='Unknown'?'Still learning':p==='3-phase'?'Three-phase devices':p)}</h3><span class="count">${PHASES.includes(p)?fmtW(d.corrected_power?.[p])+' · ':''}${arr.length+batteries.length} devices</span></div>
        <div class="scroll">${batteries.join('')}${arr.length?arr.map(r=>this._row(r)).join(''):batteries.length?'':'<div class="empty">No devices mapped here yet</div>'}</div></section>`;
      }).join('')}</div><p class="hint">Evidence is based on repeated P1/device power transitions. Assignments are estimates and must not be used for electrical safety decisions.</p>`;
    }
    _liveReading(entityId){
      // Selected entity may be intentionally blank. Display its live state without
      // using backend corrected-power availability as a prerequisite.
      return `<div class="sensor-reading" data-live-entity="${esc(entityId||'')}"><span class="reading-value">—</span><span class="reading-status">${entityId?'Checking…':'Not selected'}</span></div>`;
    }
    _updateLiveReadings(){
      if(!this.shadowRoot||!this._hass)return;
      const now=Date.now();
      this.shadowRoot.querySelectorAll('.sensor-reading[data-live-entity]').forEach(el=>{
        const entityId=el.dataset.liveEntity;
        const valueEl=el.querySelector('.reading-value'),statusEl=el.querySelector('.reading-status');
        if(!valueEl||!statusEl)return;
        const st=entityId?this._hass.states?.[entityId]:null;
        const raw=st?.state;
        const valid=st&&raw!=='unknown'&&raw!=='unavailable'&&raw!==''&&Number.isFinite(Number(raw));
        const unit=st?.attributes?.unit_of_measurement||'';
        valueEl.textContent=valid?`${Number(raw).toLocaleString(undefined,{maximumFractionDigits:3})} ${unit}`.trim():'—';
        const age=st?.last_updated?Math.max(0,Math.round((now-new Date(st.last_updated).getTime())/1000)):null;
        let status='Not selected',cls='';
        if(entityId&&!st){status='Entity not found';cls='unavailable';}
        else if(entityId&&!valid){status=st?.state==='unavailable'?'Unavailable':st?.state==='unknown'?'Unknown':'Invalid reading';cls='unavailable';}
        else if(valid){
          status=age===null?'Live value':age>12?`Last update ${age}s ago`:`Updated ${age}s ago`;
          cls=age!==null&&age>12?'old':'fresh';
        }
        statusEl.textContent=status;
        statusEl.className=`reading-status ${cls}`;
        // Quick access to the native history and device link.
        el.title=entityId?`Click for ${entityId} more info`:'';
      });
    }
    _settings(d){
      if(!this._draft)return '<div class="empty">Loading settings…</div>';
      const draft=this._draft, all=d.devices||[];
      const extra=Object.entries(this._hass?.states||{}).filter(([id,st])=>id.startsWith('sensor.')&&st.attributes?.device_class==='power'&&st.attributes?.unit_of_measurement==='W')
        .map(([entity_id,st])=>[entity_id,st.attributes.friendly_name||entity_id]);
      const options=new Map([...extra,...all.map(r=>[r.entity_id,r.name])]);
      const sorted=[...options.entries()].sort((a,b)=>a[1].localeCompare(b[1]));
      const opts=(selected,label)=>`<option value="">${esc(label)}</option>${sorted.map(([id,name])=>`<option value="${esc(id)}" ${selected===id?'selected':''}>${esc(name)} (${esc(id)})</option>`).join('')}`;
      const viOpts=(selected,kind)=>{
        const unit=kind==='currents'?'A':'V',cls=kind==='currents'?'current':'voltage';
        const eligible=Object.entries(this._hass?.states||{}).filter(([id,st])=>id.startsWith('sensor.')&&st.attributes?.device_class===cls&&st.attributes?.unit_of_measurement===unit)
          .map(([id,st])=>[id,st.attributes.friendly_name||id]).sort((a,b)=>a[1].localeCompare(b[1]));
        return `<option value="">Select ${unit} sensor</option>`+eligible.map(([id,name])=>`<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(name)} (${esc(id)})</option>`).join('');
      };
      const est=draft.solar_phase_estimation;
      const viFields=PHASES.map(p=>`<div class="field phasefield" style="--phase-color:${({L1:'#3b82f6',L2:'#f59e0b',L3:'#a78bfa'})[p]}"><label>${p} · Inverter AC current</label><select data-solar-vi="currents" data-solar-vi-phase="${p}">${viOpts(est.currents[p],'currents')}</select>${this._liveReading(est.currents[p])}<label style="margin-top:9px">${p} · Inverter AC voltage</label><select data-solar-vi="voltages" data-solar-vi-phase="${p}">${viOpts(est.voltages[p],'voltages')}</select>${this._liveReading(est.voltages[p])}</div>`).join('');
      const colors={L1:'#3b82f6',L2:'#f59e0b',L3:'#a78bfa',TOTAL:'#14b8a6'};
      const sourceGroups=(type,groups)=>groups.map(p=>{
        const items=draft[type][p]||[];
        return `<div class="field phasefield sourcegroup" style="--phase-color:${colors[p]}"><label>${p==='TOTAL'?'Total 3-phase':p} · ${type==='battery_sources'?'battery':'solar'} power</label>
          ${items.map((item,i)=>`<div class="sourceentry"><select data-source-type="${type}" data-source-phase="${p}" data-source-index="${i}">${opts(item.entity_id,'Select source')}</select>
          <label class="checkline" title="Checked: discharge / generation reports positive watts"><input type="checkbox" data-source-sign="${type}" data-source-phase="${p}" data-source-index="${i}" ${item.positive?'checked':''}> +W</label>
          <button class="btn compactbtn" data-remove-source="${type}" data-remove-phase="${p}" data-remove-index="${i}" title="Remove source">×</button>${this._liveReading(item.entity_id)}</div>`).join('')}
          <button class="btn compactbtn" data-add-source="${type}" data-add-phase="${p}">+ Add ${type==='battery_sources'?'battery':'solar'}</button></div>`;
      }).join('');
      const headroomFields=PHASES.map(p=>`<div class="field phasefield" style="--phase-color:${colors[p]}"><label>${p} · P1 phase current (A)</label><select data-grid-current="${p}">${viOpts(draft.grid_current_sensors[p],'currents')}</select>${this._liveReading(draft.grid_current_sensors[p])}<label style="margin-top:8px">${p} · P1 phase voltage (V)</label><select data-grid-voltage="${p}">${viOpts(draft.grid_voltage_sensors[p],'voltages')}</select>${this._liveReading(draft.grid_voltage_sensors[p])}<label style="margin-top:8px">${p} · Maximum current (A)</label><input type="number" min="1" max="125" step="0.5" data-current-limit="${p}" value="${draft.phase_current_limits_a[p]}"></div>`).join('');
      const phaseSelect=PHASES.map(p=>`<div class="field phasefield" style="--phase-color:${colors[p]}"><label>${p} · P1 grid (W)</label><select data-phase="${p}">${opts(draft.phase_sensors[p],'Choose phase sensor')}</select>${this._liveReading(draft.phase_sensors[p])}</div>`).join('');
      const filter=this._excludeFilter.toLowerCase();
      const matches=all.filter(r=>(this._showExcludedSettings||!draft.excluded.has(r.entity_id))&&`${r.name} ${r.entity_id}`.toLowerCase().includes(filter));
      const isAdmin=this._hass?.user?.is_admin!==false;
      return `<div class="settingsbox"><h3>🔌 P1 measurement sources</h3><p class="hint">Choose the individual signed P1 grid sensor for each phase.</p><div class="formgrid">${phaseSelect}</div></div>
      <div class="settingsbox"><h3>📊 Main connection phase headroom</h3><p class="hint">Choose grid-meter current and voltage sensors (not SolarEdge inverter sensors). Set your main fuse limit for each phase. This display is monitoring-only, using measured grid current—not cleaned household watts.</p><div class="formgrid">${headroomFields}</div><p class="hint">Green below 70%, amber 70–90%, red at 90% or higher. These are visual warnings, not electrical protection.</p></div>
      <div class="settingsbox"><h3>🔋 Battery compensation</h3><p class="hint">Add multiple battery power sensors per phase. Each +W box sets that source's discharge sign; uncheck if discharging is negative.</p><div class="formgrid">${sourceGroups('battery_sources',PHASES)}</div></div>
      <div class="settingsbox"><h3>☀️ Solar compensation</h3><p class="hint">Add phase-specific solar sensors, or add total three-phase generation under TOTAL (divided equally between phases). Do not select the same production twice.</p><div class="formgrid">${sourceGroups('solar_sources',[...PHASES,'TOTAL'])}</div></div>
      <div class="settingsbox"><h3>☀️ SolarEdge phase power estimation</h3>
      <p class="hint">Optional: distribute your measured three-phase inverter AC power using each phase's AC voltage × current. The shares are normalized to the real inverter total, not calculated as V × I watts. Assumes approximately equal phase power factors; these are estimates.</p>
      <label class="checkline"><input id="solarEstimateEnabled" type="checkbox" ${est.enabled?'checked':''}> Use inverter V × I phase proportions instead of equal ⅓ distribution for TOTAL solar</label>
      <div class="formgrid" style="margin-top:12px">${viFields}</div>
      <p class="hint">Choose the SolarEdge inverter AC Current A/B/C and AC Voltage AN/BN/CN entities. Do not select Meter 1/2/3 entities. When SolarEdge phase measurements are stale, equal-third solar is shown as a fallback but no phase learning occurs for those samples.</p></div>
      <div class="settingsbox"><h3>🔄 Dashboard refresh</h3><p class="hint">Refresh live phase power and mapped-device values at the selected rate. The learning engine runs separately. Faster refresh uses more browser/network resources; the source sensors may update more slowly.</p>
      <div class="field" style="max-width:320px"><label>Dashboard update interval</label><select id="dashboardRefresh">${[1,2,5,10,30].map(n=>`<option value="${n}" ${Number(draft.dashboard_refresh_seconds)===n?'selected':''}>${n} second${n===1?'':'s'}${n===2?' · Recommended':''}</option>`).join('')}</select></div></div>
      <div class="settingsbox"><h3>🧠 Learning options</h3><div class="formgrid"><label class="checkline"><input type="checkbox" id="learning" ${draft.learning_enabled?'checked':''}> Learning enabled</label>
      <div class="field"><label for="threshold">Minimum device power change (W)</label><input id="threshold" type="number" min="30" max="2000" step="10" value="${draft.minimum_change_w}"></div></div>
      <p class="hint">Manual assignments take priority over automatic learning, and can be removed by choosing Automatic.</p></div>
      <div class="settingsbox"><h3>🚫 Excluded sensors</h3><p class="hint">Exclude duplicate and unwanted sensors. They disappear from this list until Show excluded is enabled. Source sensors are automatically ignored during learning.</p>
      <div class="tools"><input id="excludeSearch" class="search" type="search" placeholder="Search devices or entities…" value="${esc(this._excludeFilter)}"></div>
      <div class="actions"><label class="checkline"><input type="checkbox" id="showExcludedSettings" ${this._showExcludedSettings?'checked':''}> Show excluded</label><span class="pill" id="excludedCount">${draft.excluded.size} excluded</span></div>
      <div class="scroll">${matches.map(r=>{const isExcluded=draft.excluded.has(r.entity_id);return `<div class="row ${isExcluded?'excluded-row':'included-row'}"><span class="left"><span class="name">${esc(r.name)}</span><span class="meta" style="display:block">${esc(r.entity_id)} · ${isExcluded?'Excluded':'Included'}</span></span>
        <button class="btn compactbtn ${isExcluded?'restore':'included'}" data-exclude-toggle="${esc(r.entity_id)}">${isExcluded?'Restore':'Exclude'}</button></div>`;}).join('')||'<div class="empty">No matching devices.</div>'}</div></div>
      <div class="actions"><div id="saveStatus" class="save-status" data-state="${esc(this._saveState)}">${this._saveState==='saving'?'Saving…':this._saveState==='error'?'Save failed · changes retained':this._dirty?'Waiting to save…':'✓ All changes saved'}</div>
        <button class="btn" id="reset" ${this._busy||!isAdmin?'disabled':''}>Reset learned mappings</button></div>
      ${this._saveState==='error'?'<button class="btn" id="retrySave">Retry saving</button>':''}
      ${this._confirmReset?`<div class="reset-backdrop"><div class="reset-modal" role="dialog" aria-modal="true" aria-labelledby="resetTitle"><h3 id="resetTitle">⚠ Reset ALL automatic learning evidence?</h3><p>All automatic phase-learning observations, confidence scores and inferred assignments will be cleared. Relearning may take days. Manual phase assignments, exclusions, and measurement settings are preserved. An archive of prior evidence is retained in storage.</p><label class="checkline"><input id="resetAcknowledge" type="checkbox" ${this._resetAcknowledged?'checked':''}> I understand that automatic learning evidence will be reset.</label><div class="actions"><button class="btn" id="cancelReset">Cancel</button><button class="btn danger" id="confirmReset" ${this._resetAcknowledged?'':'disabled'}>Reset all learning</button></div></div></div>`:''}
      ${!isAdmin?'<div class="warn">Only Home Assistant administrators can save settings.</div>':''}
      <p class="hint">Changing measurement sources resets current correlation evidence (a backup is retained). Manual assignments and exclusions are preserved.</p>`;
    }
    _info(){
      return `<div class="info-grid">
      <section class="info-section wide"><h3>Welcome to Automatic Phase Mapper</h3><p>Passive monitoring only: the integration watches changes in Home Assistant device power sensors and compares them with corrected L1, L2 and L3 power changes. It does not switch or control equipment. Phase identification is an estimate, not suitable for electrical safety decisions.</p></section>
      <section class="info-section"><h3>1 · Initial setup</h3><ol><li>In <strong>Settings</strong>, choose the three individual P1 grid power sensors, measured in signed watts.</li><li>Optionally add battery and solar AC power sensors on their physical phases, with the correct sign for each sensor.</li><li>Enable learning and set the minimum device power change (100 W is a reasonable starting point).</li><li>The Settings selectors show live signed values, units and last-update age under each selected entity. Click a reading for More info. Adjust dashboard refresh speed (1–30 seconds) in Settings. Your changes are saved automatically. The mapper starts collecting evidence as devices change their consumption.</li></ol></section>
      <section class="info-section"><h3>2 · Map devices</h3><p>In <strong>Mapping</strong>, devices begin under <strong>Still learning</strong>. Multiple clean power transitions build evidence for an automatic assignment.</p><p><strong>Drag and drop</strong> a device from Still learning into L1, L2, L3, or the 3-phase group to assign it manually. You can also use each device’s assignment dropdown, including on mobile. Choose <strong>Automatic</strong> to remove an override and resume learning.</p><p>Click a device row or power value to open Home Assistant's native More info dialog.</p></section>
      <section class="info-section"><h3>3 · Live power and contribution</h3><p>Each phase tile shows grid power, battery charging or discharging, solar contribution and the cleaned household load. Configured batteries appear automatically in the appropriate phase device list, with direction and live watts separate from appliance percentage calculations. Mapped devices display their live measured watts and percentage of the cleaned load for that phase.</p><p>Each phase also shows a colored live grid-current bar, measured voltage, main fuse limit and remaining amperage. The bar is green below 70%, amber at 70–90% and red at 90% or more; it is informational and cannot protect circuits. Totals can differ when a load is unmetered, readings arrive at different times or sensors overlap. Do not treat percentages as metering-grade measurements.</p></section>
      <section class="info-section"><h3>4 · Exclude unwanted sensors</h3><p>Choose <strong>Exclude device</strong> from any device assignment dropdown, or use <strong>Settings → Excluded sensors</strong>. Excluded devices disappear from mapping. Turn on <strong>Show excluded</strong> in Settings to restore them.</p><p>Grid, battery and solar source entities are ignored as mapping candidates automatically. Avoid duplicated meters and whole-house total sensors as mapping candidates.</p></section>
      <section class="info-section"><h3>5 · SolarEdge phase measurement</h3><p>If you have one total three-phase SolarEdge AC power reading, the default assumes equal thirds. You can optionally enable phase allocation using the inverter’s AC Current A/B/C and AC Voltage AN/BN/CN sensors. Their V × I values determine proportional shares of the measured total real power; they are not themselves accurate real-power readings.</p><p>That allocation assumes broadly comparable power factors and should be treated as an estimate. Do not choose grid meter values in place of the inverter sensors.</p></section>
      <section class="info-section"><h3>6 · Use the dashboard card</h3><p>The full dashboard opens from the <strong>Phase Mapper</strong> Home Assistant sidebar entry. You can also add the compact view to another Lovelace dashboard using a <strong>Manual card</strong> with this YAML:</p><p><code>type: custom:phase-mapper-card</code></p><p>The integration serves the card script itself. If the card does not appear after updating, restart Home Assistant and force-refresh your browser with Ctrl + F5.</p></section>
      <section class="info-section"><h3>7 · Autosave and safe reset</h3><p>Settings and exclusion changes save automatically. Watch for <strong>All changes saved</strong>; an error retains your unsaved choices and offers a retry. Reset learned mappings requires a separate dialog, an acknowledgement checkbox, and a final confirmation. Manual assignments and exclusions are not erased.</p></section>
      <section class="info-section"><h3>8 · Persistence and updates</h3><p>Settings, manual assignments, exclusions and accumulated learning evidence are stored in Home Assistant’s <code>.storage</code> directory, separately from <code>custom_components</code>. Back up Home Assistant before an update. Replace the custom integration files via Samba, restart, and refresh the browser.</p><p>Changing the phase measurement method may invalidate previous evidence; the integration retains an evidence archive as a precaution.</p></section>
      </div>`;
    }
    _render(){
      if (!this.shadowRoot)return;
      const d=this._data;
      const shell=this.full?`<div class="paneltop"><button class="drawer" id="menu" aria-label="Open Home Assistant sidebar">☰</button><h2>Phase Mapper</h2></div>`:'';
      const display = !d ? `<div class="surface"><h2>Automatic Phase Mapper</h2><p class="hint">${esc(this._error||'Loading data from the integration…')}</p><button class="btn" id="refresh">Retry</button></div>`:
        `<div class="surface">${this._top(d)}<div class="tabs"><button data-tab="mapping" class="tab ${this._tab==='mapping'?'active':''}">🗺 Mapping</button><button data-tab="settings" class="tab ${this._tab==='settings'?'active':''}">⚙ Settings</button><button data-tab="info" class="tab ${this._tab==='info'?'active':''}">ⓘ Info</button></div>
        ${this._error?`<div class="warn">${esc(this._error)}</div>`:''}${this._message?`<div class="success">${esc(this._message)}</div>`:''}
        ${!Object.values(d.settings.phase_sensors).every(Boolean)?'<div class="warn">Setup required: choose L1, L2 and L3 P1 phase power sensors in Settings.</div>':''}
        ${this._tab==='mapping'?this._mapping(d):this._tab==='settings'?this._settings(d):this._info()}</div>`;
      // Preserve scroll state through intentional UI rerenders (filter, tab actions, etc.).
      const before=[...this.shadowRoot.querySelectorAll('.scroll')].map(e=>({top:e.scrollTop,left:e.scrollLeft}));
      this.shadowRoot.innerHTML=css+shell+(this.full?`<main class="page panel">${display}</main>`:`<div class="card">${display}</div>`);
      this.shadowRoot.querySelectorAll('.scroll').forEach((e,i)=>{if(before[i]){e.scrollTop=before[i].top;e.scrollLeft=before[i].left;}});
      this._wire();
      if(this._tab==='settings')this._updateLiveReadings();
    }
    _markDirty(){
      this._dirty=true;this._draftRevision++;
      const badge=this.shadowRoot?.querySelector('#excludedCount');
      if(badge)badge.textContent=`${this._draft.excluded.size} excluded`;
      this._setSaveState('pending');this._scheduleAutosave();
    }
    _setSaveState(state){
      this._saveState=state;
      const el=this.shadowRoot?.querySelector('#saveStatus');
      if(el){el.dataset.state=state;el.textContent=state==='saving'?'Saving…':state==='error'?'Save failed · changes retained':state==='pending'?'Waiting to save…':'✓ All changes saved';}
    }
    _scheduleAutosave(delay=450){
      if(this._autoTimer!==null)clearTimeout(this._autoTimer);
      this._autoTimer=setTimeout(()=>{this._autoTimer=null;void this._autosave();},delay);
    }
    _settingsPayload(){
      return {type:'ha_auto_device_phase_mapping/set',phase_sensors:{...this._draft.phase_sensors},
        excluded:[...this._draft.excluded],learning_enabled:this._draft.learning_enabled,
        battery_sources:Object.fromEntries(Object.entries(this._draft.battery_sources).map(([p,items])=>[p,items.filter(x=>x.entity_id).map(x=>({...x}))])),
        solar_sources:Object.fromEntries(Object.entries(this._draft.solar_sources).map(([p,items])=>[p,items.filter(x=>x.entity_id).map(x=>({...x}))])),
        solar_phase_estimation:JSON.parse(JSON.stringify(this._draft.solar_phase_estimation)),
        grid_current_sensors:{...this._draft.grid_current_sensors},grid_voltage_sensors:{...this._draft.grid_voltage_sensors},
        phase_current_limits_a:{...this._draft.phase_current_limits_a},
        minimum_change_w:Number(this._draft.minimum_change_w),
        dashboard_refresh_seconds:Number(this._draft.dashboard_refresh_seconds)};
    }
    async _autosave(){
      if(!this._dirty||!this._draft||!this._hass?.callWS)return;
      if(this._busy){this._scheduleAutosave(400);return;}
      const revision=this._draftRevision,payload=this._settingsPayload();
      this._busy=true;this._setSaveState('saving');this._error='';
      try{
        const result=await this._hass.callWS(payload);
        this._data=result;
        if(this._draftRevision===revision){this._resetDraft();this._setSaveState('saved');}
        else{this._setSaveState('pending');this._scheduleAutosave(150);}
      }catch(error){this._error=error.message||String(error);this._setSaveState('error');}
      finally{this._busy=false;}
    }
    _wire(){
      const root=this.shadowRoot;
      const bind=(selector,event,fn)=>{const el=root.querySelector(selector);if(el)el.addEventListener(event,fn);};
      bind('#menu','click',()=>this.dispatchEvent(new Event('hass-toggle-menu',{bubbles:true,composed:true})));
      root.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>{this._tab=el.dataset.tab;this._error='';this._message='';this._render();}));
      for(const [selector,key] of [['#mappingSearch','_filter'],['#excludeSearch','_excludeFilter']]){
        bind(selector,'input',ev=>{
          const position=ev.target.selectionStart;this[key]=ev.target.value;this._render();
          const refreshed=root.querySelector(selector);if(refreshed){refreshed.focus();refreshed.setSelectionRange(position,position);}
        });
      }
      bind('#refresh','click',()=>this._fetch());
      bind('#showExcluded','change',ev=>{this._showExcluded=ev.target.checked;this._render();});
      bind('#showAll','click',()=>{this._showAll=!this._showAll;this._render();});
      // A selection changes only its adjacent readout and existing draft state.
      root.querySelectorAll('select').forEach(el=>el.addEventListener('change',()=>{
        const reading=el.closest('.field, .sourceentry')?.querySelector('.sensor-reading');
        if(reading && (el.dataset.sourceType || el.dataset.solarVi || el.dataset.gridCurrent || el.dataset.gridVoltage || el.dataset.phase)){
          // For grouped sources the reading belongs to this specific entry.
          const target=el.dataset.sourceType?el.closest('.sourceentry')?.querySelector('.sensor-reading'):el.nextElementSibling?.matches('.sensor-reading')?el.nextElementSibling:null;
          if(target)target.dataset.liveEntity=el.value;
          this._updateLiveReadings();
        }
      }));
      root.querySelectorAll('[data-source-type]').forEach(el=>el.addEventListener('change',ev=>{
        const t=el.dataset.sourceType,p=el.dataset.sourcePhase,i=Number(el.dataset.sourceIndex);
        this._draft[t][p][i].entity_id=ev.target.value;this._markDirty();
      }));
      root.querySelectorAll('[data-source-sign]').forEach(el=>el.addEventListener('change',ev=>{
        this._draft[el.dataset.sourceSign][el.dataset.sourcePhase][Number(el.dataset.sourceIndex)].positive=ev.target.checked;this._markDirty();
      }));
      root.querySelectorAll('[data-add-source]').forEach(el=>el.addEventListener('click',()=>{
        this._draft[el.dataset.addSource][el.dataset.addPhase].push({entity_id:'',positive:true});this._render();
      }));
      root.querySelectorAll('[data-remove-source]').forEach(el=>el.addEventListener('click',()=>{
        this._draft[el.dataset.removeSource][el.dataset.removePhase].splice(Number(el.dataset.removeIndex),1);this._markDirty();this._render();
      }));
      root.querySelectorAll('[data-phase]').forEach(el=>el.addEventListener('change',ev=>{this._draft.phase_sensors[ev.target.dataset.phase]=ev.target.value;this._markDirty();}));
      bind('#showExcludedSettings','change',ev=>{this._showExcludedSettings=ev.target.checked;this._render();});
      root.querySelectorAll('[data-exclude-toggle]').forEach(el=>el.addEventListener('click',()=>{
        const id=el.dataset.excludeToggle;
        this._draft.excluded.has(id)?this._draft.excluded.delete(id):this._draft.excluded.add(id);
        this._markDirty();this._render();
      }));
      bind('#solarEstimateEnabled','change',ev=>{this._draft.solar_phase_estimation.enabled=ev.target.checked;this._markDirty();});
      root.querySelectorAll('[data-solar-vi]').forEach(el=>el.addEventListener('change',()=>{
        this._draft.solar_phase_estimation[el.dataset.solarVi][el.dataset.solarViPhase]=el.value;this._markDirty();
      }));
      root.querySelectorAll('[data-grid-current]').forEach(el=>el.addEventListener('change',()=>{this._draft.grid_current_sensors[el.dataset.gridCurrent]=el.value;this._markDirty();}));
      root.querySelectorAll('[data-grid-voltage]').forEach(el=>el.addEventListener('change',()=>{this._draft.grid_voltage_sensors[el.dataset.gridVoltage]=el.value;this._markDirty();}));
      root.querySelectorAll('[data-current-limit]').forEach(el=>el.addEventListener('change',()=>{this._draft.phase_current_limits_a[el.dataset.currentLimit]=Number(el.value);this._markDirty();}));
      bind('#dashboardRefresh','change',ev=>{this._draft.dashboard_refresh_seconds=Number(ev.target.value);this._markDirty();this._startRefresh();});
      bind('#learning','change',ev=>{this._draft.learning_enabled=ev.target.checked;this._markDirty();});
      bind('#threshold','change',ev=>{this._draft.minimum_change_w=Number(ev.target.value);this._markDirty();});
      root.querySelectorAll('.sensor-reading[data-live-entity]').forEach(el=>el.addEventListener('click',()=>{
        if(el.dataset.liveEntity)this._moreInfo(el.dataset.liveEntity);
      }));
      root.querySelectorAll('[data-more]').forEach(el=>el.addEventListener('click',()=>this._moreInfo(el.dataset.more)));
      root.querySelectorAll('[data-entity]').forEach(el=>{
        el.addEventListener('click',ev=>{if(!ev.target.closest('select,button'))this._moreInfo(el.dataset.entity);});
        el.addEventListener('dragstart',ev=>{this._dragging=true;ev.dataTransfer.setData('text/plain',el.dataset.entity);ev.dataTransfer.effectAllowed='move';});
        el.addEventListener('dragend',()=>{this._dragging=false;this._render();});
      });
      root.querySelectorAll('[data-assign]').forEach(el=>el.addEventListener('change',()=>this._assign(el.dataset.assign,el.value)));
      root.querySelectorAll('.group[data-phase]').forEach(el=>{
        el.addEventListener('dragover',ev=>{if(this._hass?.user?.is_admin===false)return;ev.preventDefault();el.classList.add('drop-target');});
        el.addEventListener('dragleave',()=>el.classList.remove('drop-target'));
        el.addEventListener('drop',ev=>{ev.preventDefault();this._dragging=false;el.classList.remove('drop-target');this._assign(ev.dataTransfer.getData('text/plain'),el.dataset.phase);});
      });
      bind('#retrySave','click',()=>this._scheduleAutosave(0));
      bind('#reset','click',()=>{this._confirmReset=true;this._resetAcknowledged=false;this._render();});
      bind('#cancelReset','click',()=>{this._confirmReset=false;this._resetAcknowledged=false;this._render();});
      bind('#resetAcknowledge','change',ev=>{this._resetAcknowledged=ev.target.checked;const btn=root.querySelector('#confirmReset');if(btn)btn.disabled=!this._resetAcknowledged;});
      bind('#confirmReset','click',async()=>{
        if(!this._resetAcknowledged||this._busy)return;
        if(this._dirty){await this._autosave();if(this._dirty||this._saveState==='error')return;}
        this._confirmReset=false;this._resetAcknowledged=false;
        await this._save(true);
      });
    }
    async _excludeEntity(entityId){
      if(!entityId||this._busy||this._hass?.user?.is_admin===false)return;
      const excluded=new Set(this._data?.settings?.excluded||[]);
      excluded.add(entityId);
      this._busy=true;this._error='';
      try{
        this._data=await this._hass.callWS({type:'ha_auto_device_phase_mapping/set',excluded:[...excluded]});
        if(this._draft)this._draft.excluded.add(entityId);
        if(!this._dirty)this._resetDraft();
        this._message='Device excluded. Restore it under Settings → Show excluded.';
      }catch(error){this._error=error.message||String(error);}
      finally{this._busy=false;this._render();}
    }
    async _assign(entityId,phase){
      if(!entityId||this._busy||this._hass?.user?.is_admin===false)return;
      if(phase==='__exclude__'){await this._excludeEntity(entityId);return;}
      if(phase && ![...PHASES,'3-phase'].includes(phase))return;
      const previous={...(this._data?.settings?.manual_assignments||{})};
      if(phase)previous[entityId]=phase;else delete previous[entityId];
      this._busy=true;
      try{
        this._data=await this._hass.callWS({type:'ha_auto_device_phase_mapping/set',manual_assignments:previous});
        if(!this._dirty)this._resetDraft();this._message=phase?'Manual phase assigned.':'Automatic learning restored.';
      }catch(error){this._error=error.message||String(error);}
      finally{this._busy=false;this._render();}
    }
    async _save(reset){
      if(this._busy||!this._draft)return;
      this._busy=true;this._error='';this._message='';this._render();
      try{
        this._data=await this._hass.callWS({type:'ha_auto_device_phase_mapping/set',phase_sensors:{...this._draft.phase_sensors},
          excluded:[...this._draft.excluded],learning_enabled:this._draft.learning_enabled,
          battery_sources:Object.fromEntries(Object.entries(this._draft.battery_sources).map(([p,items])=>[p,items.filter(x=>x.entity_id)])),
          solar_sources:Object.fromEntries(Object.entries(this._draft.solar_sources).map(([p,items])=>[p,items.filter(x=>x.entity_id)])),
          solar_phase_estimation:JSON.parse(JSON.stringify(this._draft.solar_phase_estimation)),
          grid_current_sensors:{...this._draft.grid_current_sensors},
          grid_voltage_sensors:{...this._draft.grid_voltage_sensors},
          phase_current_limits_a:{...this._draft.phase_current_limits_a},
          minimum_change_w:Number(this._draft.minimum_change_w),
        dashboard_refresh_seconds:Number(this._draft.dashboard_refresh_seconds),reset});
        this._resetDraft();this._lastFetch=Date.now();this._message=reset?'Learned mappings reset.':'Settings saved.';
      }catch(error){this._error=error.message||String(error);}
      finally{this._busy=false;this._render();}
    }
  }

  if(!customElements.get('phase-mapper-card'))customElements.define('phase-mapper-card',PhaseMapperView);
  if(!customElements.get('phase-mapper-panel'))customElements.define('phase-mapper-panel',class extends PhaseMapperView {});
  window.customCards=window.customCards||[];
  if(!window.customCards.some(card=>card.type==='phase-mapper-card')){
    window.customCards.push({type:'phase-mapper-card',name:'HA_auto_device_phase_mapping',description:'Passive L1/L2/L3 discovery; Mapping, Settings, and Info tabs',preview:false});
  }
  console.info(`%c HA_auto_device_phase_mapping %c v${VERSION} `,'background:#3777bd;color:#fff;font-weight:bold','background:#ddd;color:#111');
})();
