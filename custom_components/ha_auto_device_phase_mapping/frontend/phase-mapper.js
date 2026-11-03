/* HA_auto_device_phase_mapping v1.6.2 — shared Home Assistant panel and dashboard card. */
(() => {
  'use strict';
  const VERSION = '1.6.5';
  const PHASES = ['L1', 'L2', 'L3'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmtW = value => value == null || !Number.isFinite(Number(value)) ? '—' : `${Math.round(Number(value)).toLocaleString()} W`;
  const icons = {L1:'①',L2:'②',L3:'③','3-phase':'ϟ',Unknown:'?'};
  const REPOSITORY = 'https://github.com/niCNCo/HA-auto-device-phase-mapping';
  const ICON_CHOICES = ['mdi:power-plug','mdi:power-socket-eu','mdi:lightbulb','mdi:lamp','mdi:ceiling-light','mdi:television','mdi:air-conditioner','mdi:hvac','mdi:air-humidifier','mdi:air-humidifier-off','mdi:humidifier','mdi:humidifier-off','mdi:dehumidifier','mdi:air-filter','mdi:air-purifier','mdi:air-conditioner','mdi:radiator','mdi:heat-wave','mdi:fridge','mdi:fridge-outline','mdi:stove','mdi:microwave','mdi:coffee-maker','mdi:washing-machine','mdi:tumble-dryer','mdi:dishwasher','mdi:water-boiler','mdi:fan','mdi:desktop-classic','mdi:laptop','mdi:router-wireless','mdi:car-electric','mdi:ev-station','mdi:solar-power','mdi:battery','mdi:flash','mdi:home','mdi:bed','mdi:desk','mdi:devices','mdi:motion-sensor','mdi:power','mdi:lightning-bolt'];
  const validMdi = icon => /^mdi:[a-z0-9][a-z0-9-]{0,79}$/.test(icon||'');


  const css = `<style>
    :host{display:block;color:var(--primary-text-color);--pm-primary:var(--primary-color,#4588d3);--pm-green:#3fa788;--pm-yellow:#f5ad4e;--pm-purple:#a489cf;--pm-border:var(--divider-color,#ddd);font-family:var(--paper-font-body1_-_font-family,Roboto,sans-serif)}
    *,*:before,*:after{box-sizing:border-box}

    .pm-compact-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}
    .pm-compact-heading{display:flex;justify-content:space-between;gap:8px;margin-bottom:10px;font-size:13px}
    .pm-compact-heading span{color:var(--secondary-text-color);font-size:11px}
    .pm-compact-phase{--pm-phase:#14b8a6;background:color-mix(in srgb,var(--pm-phase) 8%,var(--card-background-color,#181818));border:1px solid color-mix(in srgb,var(--pm-phase) 42%,transparent);border-top:3px solid var(--pm-phase);border-radius:9px;padding:12px;min-width:0}
    .pm-l1{--pm-phase:#3b82f6}.pm-l2{--pm-phase:#f59e0b}.pm-l3{--pm-phase:#a78bfa}.pm-total{--pm-phase:#14b8a6}
    .pm-compact-phase>header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:9px;gap:6px;color:var(--pm-phase)}
    .pm-compact-phase>header small{font-size:10px;color:var(--secondary-text-color)}
    .pm-compact-line{display:flex;justify-content:space-between;gap:7px;font-size:11px;line-height:1.9}
    .pm-compact-line span{color:var(--secondary-text-color);overflow-wrap:anywhere}
    .pm-compact-line strong{white-space:nowrap}
    .pm-compact-sum{border-top:1px solid var(--pm-border);padding-top:5px;margin-top:5px;color:var(--pm-phase)}
    .pm-compact-sum strong{font-size:15px}
    .pm-compact-headroom{font-size:10px;margin:8px 0;color:var(--secondary-text-color)}
    .pm-compact-track{height:5px;border-radius:10px;overflow:hidden;background:color-mix(in srgb,var(--pm-phase) 14%,var(--card-background-color));margin-top:4px}
    .pm-compact-track i{height:100%;display:block;background:var(--pm-phase);border-radius:10px}
    .pm-compact-devices{margin-top:8px;padding-top:7px;border-top:1px solid var(--pm-border);font-size:11px}
    .pm-compact-devices summary{cursor:pointer;font-weight:600}
    .pm-compact-footer{text-align:right;margin-top:11px;font-size:12px}
    /* The mockup had a much wider household tile. The real 4-column panel is
       narrower, so give the chart a full-width row rather than crushing the
       circle alongside the legend. Both compact and panel views share this. */
    .pm-ring-wrap{display:grid;grid-template-columns:minmax(0,1fr);gap:13px;min-width:0}
    .pm-ring-graphic{width:min(100%,248px);aspect-ratio:1;position:relative;margin:0 auto}
    .pm-ring-graphic svg{display:block;width:100%;height:100%;overflow:visible}
    .pm-ring-glow{filter:drop-shadow(0 0 2px currentColor);stroke-linecap:butt}
    .pm-ring-center{position:absolute;inset:25%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:3px}
    .pm-ring-center strong{font-size:clamp(20px,1.7vw,25px);white-space:nowrap;letter-spacing:-.5px;font-variant-numeric:tabular-nums}
    .pm-ring-center span{font-size:11px;color:var(--secondary-text-color);white-space:nowrap}
    .pm-ring-legends{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:9px;min-width:0;width:100%}
    .pm-ring-group{min-width:0;border:1px solid var(--pm-border);border-radius:9px;padding:9px;background:color-mix(in srgb,var(--card-background-color) 84%,transparent)}
    .pm-ring-label{font-weight:650;font-size:11px;color:var(--secondary-text-color);margin:0 0 7px}
    .pm-ring-legend{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;column-gap:5px;row-gap:1px;font-size:11px;padding:4px 0}
    .pm-ring-legend span{display:flex;align-items:center;gap:6px;min-width:0}
    .pm-ring-legend i{height:8px;width:8px;display:inline-block;border-radius:50%;flex:none}
    .pm-ring-legend strong{font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap}
    .pm-ring-legend small{color:var(--secondary-text-color);font-weight:400;font-size:10px}
    .pm-household-graphic{margin:14px 0;padding:15px 0;border-top:1px solid var(--pm-border)}
    .pm-household-graphic .pm-ring-graphic{width:min(100%,240px)}
    @media(max-width:420px){.pm-ring-legends{grid-template-columns:1fr}}

    @media(max-width:1150px){.pm-compact-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:570px){.pm-compact-grid{grid-template-columns:1fr}}
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
    .diagnostics{border:1px solid var(--pm-border);border-left:3px solid #38bdf8;border-radius:10px;padding:12px;margin:10px 0 14px;background:var(--secondary-background-color)}
    .diagnostics summary{font-size:13px;font-weight:700;cursor:pointer}
    .diaggrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px;margin-top:10px}
    .diagstat{background:var(--card-background-color);border:1px solid var(--pm-border);border-radius:8px;padding:8px;font-size:11px}
    .diagstat strong{display:block;font-size:19px;margin-top:3px}
    .diagdetail{font-size:11px;color:var(--secondary-text-color);margin-top:10px;overflow-wrap:anywhere}
    .manual-entry{background:transparent;border-left:0;padding:8px 0;border-radius:0}.manual-form{display:grid;grid-template-columns:2fr 1.3fr 1fr auto;gap:8px;align-items:end;margin-top:12px}.manual-form label{display:block;font-size:11px;color:var(--secondary-text-color);margin-bottom:4px}@media(max-width:700px){.manual-form{grid-template-columns:1fr 1fr}.manual-form>div:first-child{grid-column:span 2}} .device-diagnostic{margin:7px 0;font-size:11px}.device-diagnostic summary{cursor:pointer;color:var(--secondary-text-color)}
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
    input[type=search],input[type=number],input[type=text],select{background:var(--card-background-color);color:var(--primary-text-color);border:1px solid var(--pm-border);border-radius:9px;padding:10px;width:100%;font-size:13px}
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
    .save-pending{border-left:3px solid var(--pm-primary);background:var(--secondary-background-color);padding:10px;margin:10px 0;font-size:12px;color:var(--secondary-text-color)}
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
    .unknown .bar span{background:var(--pm-yellow)}.ptext.provisional{color:var(--pm-yellow)}.provisional-note{color:var(--pm-yellow);font-weight:600}.empty{padding:24px;text-align:center;color:var(--secondary-text-color);font-size:13px}
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
    /* Responsive single-row navigation: logo and tabs left, mini status cards right. */
    .topnav{display:flex;align-items:stretch;gap:clamp(5px,1vw,17px);padding:0 clamp(10px,2vw,26px);margin-bottom:18px;
      background:var(--card-background-color);border:0;border-bottom:1px solid var(--pm-border);border-radius:0;
      position:sticky;top:0;z-index:7;min-width:0;min-height:70px;isolation:isolate}
    .panel .surface{background:transparent;box-shadow:none;border-radius:0;padding:0 16px 30px}
    .panel .topnav{margin-left:-16px;margin-right:-16px}
    .page.panel{max-width:none;padding:0 0 48px}
    .panel .surface>.phases{margin-top:8px}
    .topbrand{display:flex;align-items:center;flex-shrink:0;min-width:0;text-decoration:none;border:0;background:transparent;padding:0;color:inherit;cursor:pointer}
    .topbrand .wide-logo{display:block;width:196px;height:51px;object-fit:contain}
    .topbrand .mini-logo{display:none;width:37px;height:37px;object-fit:contain}
    .navtabs{display:flex;align-items:stretch;gap:2px;min-width:0;flex-shrink:0}
    .navtab{background:transparent;border:0;border-bottom:2px solid transparent;color:var(--secondary-text-color);
      font-size:13px;font-weight:600;padding:15px clamp(10px,1.5vw,25px);cursor:pointer;white-space:nowrap;
      border-radius:0;align-self:stretch}
    .navtab.active{border-bottom-color:#2dd4bf;color:#14b8a6;background:transparent;border-radius:0}
    .navtab:hover{color:var(--primary-text-color);background:color-mix(in srgb,var(--primary-text-color) 4%,transparent)}
    .topstats{margin-left:auto;display:flex;align-items:center;gap:6px;min-width:0;align-self:center}
    .topstat{min-width:72px;padding:7px 10px;background:color-mix(in srgb,var(--card-background-color) 85%,#0b1621);
      border:1px solid var(--pm-border);border-top:3px solid var(--stat-color);border-radius:9px;text-align:center}
    .topstat strong{display:block;color:var(--stat-color);font-size:19px;line-height:1.1;font-variant-numeric:tabular-nums}
    .topstat span{font-size:10px;color:var(--secondary-text-color)}
    .topstatus{font-size:10px;color:var(--secondary-text-color);white-space:nowrap;align-self:center}
    .topstatus .statusdot{margin-right:4px}
    .device-details{margin-left:12px;padding-left:9px;border-left:1px solid var(--pm-border)}
    .systemdevice .device-details,.manual-entry .device-details{margin-top:5px}
    .manual-entry .name{cursor:default}
    .device-alias{display:flex;align-items:center;gap:6px;min-width:0}.device-alias .name{cursor:pointer}
    .alias-edit{border:1px solid transparent;background:transparent;color:var(--secondary-text-color);font-size:15px;line-height:1.1;cursor:pointer;padding:5px 8px;border-radius:7px;min-width:30px;min-height:29px}
    .alias-edit:hover,.alias-edit:focus-visible{color:var(--primary-color);border-color:var(--pm-border);background:var(--secondary-background-color)}
    .powerline.solar strong,.powerline.battery-discharge strong{color:#22c55e;font-weight:500}
    .powerline.battery-charge strong{color:#f59e0b;font-weight:500}
    .powerline.battery-net strong{font-weight:500}
    .triphase-label,.triphase-label span{color:var(--primary-text-color)!important}
    .triphase-label .plus{margin:0 3px}
    .sensor-manager .row{gap:8px}.sensor-manager .row .left{overflow-wrap:anywhere}
    .sensor-actions{display:flex;gap:6px;align-items:center;flex-shrink:0}
    .sensor-actions select{width:116px;padding:6px;font-size:11px}
    .sensor-actions button{min-width:73px}
    .timing-measured{font-size:11px;color:var(--secondary-text-color);margin-top:4px}
    .learning-search{width:100%;min-width:0;margin:6px 0 8px}
    .mapping-tools-bottom{margin-top:20px;padding-top:8px;border-top:1px solid var(--pm-border);display:grid;gap:9px}
    .mapping-tools-bottom .tools{margin:0}
    .mapping-tools-bottom .diagnostics{margin:0}
    .navmenu{font-size:20px;min-width:23px;padding:0;line-height:1;color:var(--primary-text-color)}
    @media(max-width:1190px){.topbrand .wide-logo{display:none}.topbrand .mini-logo{display:block}.topstatus{display:none}}
    @media(min-width:1250px){.navtab{min-width:102px}}
    @media(max-width:740px){.topnav{gap:5px;padding:0 6px;min-height:48px}.navtab{font-size:11px;padding:11px 7px}.topstat{min-width:50px;padding:6px 4px}.topstat strong{font-size:16px}.topstat span{font-size:9px}.topstats{gap:3px}.topbrand .mini-logo{width:29px;height:29px}.sensor-actions select{width:89px}.sensor-actions button{min-width:60px}}
    /* v1.5: mapped device cards directly beneath their matching phase meters. */
    .manual-form{grid-template-columns:minmax(0,1.5fr) minmax(0,1fr) minmax(0,.8fr) minmax(0,1.2fr) auto}
    @media(max-width:850px){.manual-form{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:520px){.manual-form{grid-template-columns:1fr}.manual-form>div:first-child{grid-column:auto}}
    .phasebox .phase-devices{border:0;border-top:1px solid var(--pm-border);margin-top:14px;padding:10px 0 0;min-height:50px;background:transparent;border-radius:0}
    .phase-devices .phase-list-head{font-weight:700;font-size:12px;display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:5px}
    .phase-devices .phase-list-head small{font-size:10px}
    .phase-devices .row{padding:8px 0;gap:6px}.phase-devices .name{font-size:12px}
    .phase-devices .device-details{margin-left:20px;padding-left:0;border-left:0}
    .phase-devices .right{max-width:96px}.phase-devices .manualcontrol{max-width:96px}
    .phase-devices .devpower{font-size:12px;white-space:normal}.phase-devices .contrib{display:inline;margin-left:3px}.device-icon{display:inline-flex;align-items:center;vertical-align:middle;flex-shrink:0;margin-right:4px}
    .device-icon ha-icon{--mdc-icon-size:18px;width:18px;height:18px}
    .mapped-summary,.learning-summary{border:1px solid var(--pm-border);border-left:4px solid var(--pm-primary);border-radius:12px;margin:12px 0;background:var(--card-background-color);padding:12px}
    .learning-summary{border-left-color:#94a3b8}.mapped-summary>summary,.learning-summary>summary{cursor:pointer;font-size:14px;font-weight:700;list-style-position:inside}
    .mapped-summary .device-list,.learning-summary .device-list{margin-top:10px;overflow:visible!important;max-height:none!important}
    .mapped-summary .row,.learning-summary .row{max-width:100%}
    .editor-backdrop{position:fixed;inset:0;background:#0009;z-index:999;display:grid;place-items:center;padding:16px}
    .editor-dialog{background:var(--card-background-color,#fff);color:var(--primary-text-color);border-radius:14px;padding:20px;width:min(430px,100%);box-shadow:0 12px 45px #0005;max-height:90vh;overflow:auto}
    .editor-dialog label{display:block;margin-top:13px;margin-bottom:5px;font-size:12px;font-weight:700}
    .editor-dialog .icon-preview{display:flex;align-items:center;gap:10px;margin-top:10px;font-size:12px;color:var(--secondary-text-color)}
    .editor-dialog .icon-preview ha-icon{--mdc-icon-size:26px;width:26px;height:26px}
    .editor-dialog .actions{justify-content:flex-end}.editor-dialog h3{font-size:17px}
    /* Mapped rows share a common flat presentation, including manual appliances. */
    .phase-devices .row.manual-entry{padding:8px 0;border-left:0;background:transparent;border-radius:0}
    .phase-devices .manual-entry .device-details{margin-top:5px}
    .phase-devices .devicebar{width:100%;height:5px;margin-top:6px}
    .phase-devices .devicebar>span{border-radius:5px}
    .phase-devices .right select{max-width:100%;font-size:11px}
    .manual-entry .manual-room{color:var(--secondary-text-color);font-size:11px}
    .manual-entry .name{cursor:default}
    .total-mapped-watts{margin-top:7px;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}
    .total-mapped-watts small{display:inline;margin-left:5px;font-weight:400;font-size:10px}
    .unknown-load{margin-top:9px;padding-top:10px;border-top:1px solid var(--pm-border);color:#94a3b8}
    .unknown-load .unknown-title{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:#94a3b8}
    .unknown-load .devpower{font-size:12px;margin-top:5px;color:#94a3b8;font-variant-numeric:tabular-nums}
    .unknown-load .contrib{color:#94a3b8}
    .unknown-load .devicebar{--phase-color:#94a3b8;width:100%}
    .headroom-placeholder{visibility:hidden;pointer-events:none}
    /* Search suggestions are custom rows so HA's real MDI icons are visible. */
    .icon-choice-container{position:relative}
    .icon-suggestions{position:absolute;top:calc(100% + 3px);left:0;right:0;z-index:30;
      border:1px solid var(--pm-border);border-radius:9px;background:var(--card-background-color,#222);
      max-height:190px;overflow:auto;box-shadow:0 10px 24px #0006;padding:3px}
    .icon-suggestions[hidden]{display:none}
    .icon-option{display:flex;align-items:center;gap:10px;width:100%;padding:8px 9px;border:0;
      background:transparent;color:var(--primary-text-color);font-size:12px;text-align:left;border-radius:6px;cursor:pointer}
    .icon-option:hover,.icon-option:focus-visible,.icon-option[aria-selected="true"]{background:var(--secondary-background-color)}
    .icon-option ha-icon{--mdc-icon-size:21px;width:22px;height:22px;flex-shrink:0}
    .icon-option .icon-label{display:flex;flex-direction:column;gap:1px}
    .icon-option .icon-code{font-size:10px;color:var(--secondary-text-color)}
    /* v1.5.2: identical phase columns with unknown first and one shared mapped toggle. */
    .phase-devices .phase-list-head{margin:12px 0 6px}
    .phase-devices .phase-list-head:first-child{margin-top:0}
    .phase-devices .right{width:106px;min-width:106px;max-width:106px}
    .phase-devices .right select,.phase-devices .right select.manualcontrol{display:block;width:106px!important;max-width:none!important;min-width:106px;height:34px;min-height:34px;margin:0;padding:5px 6px!important;font-size:11px;line-height:1.3}
    .phase-devices .row{align-items:center;gap:6px}
    .phase-devices .row .left{min-width:0}
    .phase-devices .device-details{margin-left:20px}
    .phase-devices .devicebar{width:100%;height:5px;margin-top:6px}
    .unknown-load{color:var(--secondary-text-color);margin:0;padding:0 0 12px;border:0;border-bottom:1px solid var(--pm-border)}
    .unknown-load .unknown-title{font-size:12px;font-weight:700;color:var(--secondary-text-color);margin-bottom:5px}
    .unknown-load .unknown-details,.mapped-combined .combined-details{display:grid;grid-template-columns:minmax(0,1fr) 106px;column-gap:6px;min-width:0}
    .unknown-load .unknown-data,.mapped-combined .combined-data{min-width:0;padding-left:20px}
    .unknown-load .devpower,.unknown-load .contrib{color:var(--secondary-text-color);font-size:11px;font-weight:500;white-space:nowrap}
    .unknown-load .devicebar{--phase-color:#94a3b8}
    .unknown-load .devicebar>span{background:#94a3b8}
    .mapped-section-head{display:flex;gap:6px;align-items:center;justify-content:space-between;margin:10px 0 6px;font-size:12px;font-weight:700}
    .mapped-section-head .mapped-count{font-size:10px;color:var(--secondary-text-color);margin-left:auto}
    .mapped-toggle{border:1px solid var(--pm-border);border-radius:6px;background:transparent;color:var(--secondary-text-color);font-size:11px;padding:3px 6px;white-space:nowrap;min-width:52px;cursor:pointer}
    .mapped-toggle:hover,.mapped-toggle:focus-visible{color:var(--primary-text-color);background:var(--secondary-background-color)}
    .mapped-combined .devpower{font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap}
    .mapped-combined .devicebar{--phase-color:var(--phase-accent);margin-top:6px}
    .mapped-listing{margin-top:7px}
    .mapped-listing[hidden]{display:none}
    .phasebox .headroom{min-height:78px}
    .native-icon-field{display:block;width:100%;min-height:40px}
    .native-icon-field:not(:defined){display:none}
    .native-icon-field:defined + .icon-choice-container{display:none}
    .version-link{background:transparent;border:0;color:var(--primary-color);padding:0;text-decoration:underline;font-weight:700;cursor:pointer}
    .version-link.version-current{color:#22c55e}.version-link.version-outdated{color:#ef4444}.version-link.version-unverified{color:var(--secondary-text-color)}
    .version-status{font-size:12px}.version-status.current{color:#22c55e}.version-status.outdated{color:#ef4444}.version-status.unverified{color:var(--secondary-text-color)}
    @media(max-width:390px){.navmenu{font-size:16px;min-width:15px}.page{padding:0}.surface{padding:9px}.topnav{gap:2px;padding:0 4px;min-height:43px}.topbrand .mini-logo{width:21px;height:21px}.navtab{font-size:9.5px;padding:9px 3px}.topstat{min-width:35px;width:35px;padding:4px 0}.topstat strong{font-size:13px}.topstat span{font-size:7.5px}.topstats{gap:2px}.sensor-actions select{width:79px}.sensor-actions button{min-width:54px;font-size:10px;padding:6px}}

    /* v1.5.3: slim controls, correct natural word wrapping and matching progress bars. */
    .phase-devices{container-type:inline-size}
    .phase-devices .right{flex:0 0 86px;width:86px;min-width:86px;max-width:86px}
    .phase-devices .right select,.phase-devices .right select.manualcontrol{
      display:block;width:86px!important;min-width:86px!important;max-width:86px!important;
      height:28px!important;min-height:28px!important;margin:0;padding:3px 5px!important;
      font-size:10px!important;line-height:1.2;border-radius:7px;
      border-color:color-mix(in srgb,var(--pm-border) 65%,transparent);
      background:var(--card-background-color)
    }
    .phase-devices .right select:focus-visible{outline:2px solid var(--pm-primary);outline-offset:1px}
    .phase-devices .row{align-items:center;gap:6px;min-width:0}
    .phase-devices .row .left{min-width:0;flex:1 1 0}
    .phase-devices .device-alias{display:flex;align-items:flex-start;gap:5px;min-width:0}
    .phase-devices .device-alias .name{
      flex:1 1 0;min-width:0;max-width:100%;display:-webkit-box;-webkit-line-clamp:2;
      -webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;
      white-space:normal;word-break:normal;overflow-wrap:normal;hyphens:none;line-height:1.3
    }
    .phase-devices .device-icon{flex:0 0 auto;margin-right:1px}
    .phase-devices .alias-edit{flex:0 0 25px;min-width:25px;min-height:25px;padding:3px 4px}
    .phase-devices .device-details{margin-left:20px;min-width:0}
    .phase-devices .devicebar{
      display:block;box-sizing:border-box;width:100%;height:6px!important;
      min-height:6px!important;max-height:6px!important;flex-shrink:0;
      overflow:hidden;border-radius:4px!important;margin-top:6px
    }
    .phase-devices .devicebar>span{display:block;height:100%;border-radius:4px!important}
    .unknown-load .unknown-title{color:var(--primary-text-color);font-weight:700;font-size:12px}
    .unknown-load .unknown-details,.mapped-combined .combined-details{
      display:grid;grid-template-columns:minmax(0,1fr) 86px;column-gap:6px;min-width:0
    }
    .unknown-load .unknown-data,.mapped-combined .combined-data{min-width:0;padding-left:20px}
    .unknown-load .devpower,.unknown-load .contrib{color:var(--secondary-text-color)}
    .unknown-load .devicebar>span{background:#94a3b8}
    .mapped-summary-wrap[hidden],.mapped-listing[hidden]{display:none!important}
    /* When a phase tile is extremely narrow, move the selector below its name.
       Preserve full-width names and align the summary bars with device bars. */
    @container (max-width:250px){
      .mapped-listing .row{display:flex;flex-wrap:wrap;align-items:flex-start}
      .mapped-listing .row .left{flex:1 0 100%;width:100%}
      .mapped-listing .row .right{flex:0 0 86px;margin-left:auto}
      .unknown-load .unknown-details,.mapped-combined .combined-details{grid-template-columns:minmax(0,1fr)}
      .unknown-load .unknown-details>span,.mapped-combined .combined-details>span{display:none}
    }
    /* v1.5.5: compact color-coded evidence and household unknown split. */
    .phase-devices .device-alias .certainty-dot{flex:0 0 8px;width:8px;height:8px;
      align-self:center;border-radius:50%;border:1px solid color-mix(in srgb,currentColor 28%,transparent);
      background:#ef4444;box-shadow:0 0 0 1px #0002;margin:0 1px}
    .phase-devices .certainty-dot.probable{background:#f59e0b}
    .phase-devices .certainty-dot.certain{background:#22c55e}
    .device-alias .certainty-dot{display:inline-block;width:8px;height:8px;flex-shrink:0;border-radius:50%;background:#ef4444;margin-left:3px}
    .device-alias .certainty-dot.probable{background:#f59e0b}
    .device-alias .certainty-dot.certain{background:#22c55e}
    .phase-devices .unknown-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;min-width:0}
    .phase-devices .unknown-pair .unknown-segment{min-width:0}
    .phase-devices .unknown-pair .unknown-title{white-space:normal;line-height:1.3;min-height:31px}
    .phase-devices .unknown-load:not(.total-unknown-split) .unknown-title{min-height:31px}
    .phase-devices .unknown-pair .unknown-data{padding-left:0;min-width:0}
    .phase-devices .unknown-pair .devpower{font-size:11px;white-space:nowrap}
    .phase-devices .unknown-pair .contrib{font-size:10px;margin-left:1px}
    .phase-devices .unknown-pair .devicebar{width:100%;height:6px!important;margin-top:6px}
    @container (max-width:250px){.phase-devices .unknown-pair{gap:4px}.phase-devices .unknown-pair .unknown-data .devpower{font-size:10px}}

    /* v1.5.6 · restrained phase tint, soft cards and uniform phase device identity. */
    .phasebox{
      border:1px solid color-mix(in srgb,var(--phase-accent) 27%,var(--pm-border));
      border-top:3px solid var(--phase-accent);
      background:linear-gradient(148deg,
        color-mix(in srgb,var(--phase-accent) 13%,var(--card-background-color,#1e1e1e)) 0%,
        color-mix(in srgb,var(--phase-accent) 5%,var(--card-background-color,#1e1e1e)) 56%,
        var(--card-background-color,#1e1e1e) 100%);
      box-shadow:0 3px 14px #00000012;
    }
    .phasebox .phasehead strong{font-size:16px;letter-spacing:.1px}
    .phasebox .pill{border:1px solid color-mix(in srgb,var(--phase-accent) 15%,transparent);background:color-mix(in srgb,var(--phase-accent) 6%,var(--card-background-color));}
    .phasebox .headroom{
      background:color-mix(in srgb,var(--phase-accent) 6%,var(--secondary-background-color));
      border:1px solid color-mix(in srgb,var(--phase-accent) 12%,var(--pm-border));
      min-height:78px;
    }
    .phasebox .powerline.cleaned strong{font-weight:750}
    .phasebox .unknown-load{
      padding:10px 11px 11px;margin-top:0;
      border:1px solid color-mix(in srgb,var(--phase-accent) 16%,var(--pm-border));
      border-radius:10px;background:color-mix(in srgb,var(--phase-accent) 7%,var(--card-background-color));
    }
    .phasebox .unknown-load .unknown-title{color:var(--phase-accent);font-weight:700;min-height:auto}
    .phasebox .unknown-load .devpower,.phasebox .unknown-load .contrib{color:var(--secondary-text-color)}
    .phasebox .unknown-load .devicebar>span{background:#94a3b8}
    .phasebox .phase-devices{margin-top:14px;padding:0;border:none;overflow:visible}
    .phasebox .mapped-device-card{
      margin-top:9px;padding:10px 11px 9px;
      border-radius:10px;
      border:1px solid color-mix(in srgb,var(--phase-accent) 19%,var(--pm-border));
      /* Subtle inset: darker than the outer phase gradient without extra neon tint. */
      background:color-mix(in srgb,var(--phase-accent) 3%,color-mix(in srgb,var(--card-background-color,#1e1e1e) 78%,#000 22%));
    }
    .phasebox .mapped-section-head{margin:0 0 7px;color:var(--phase-accent);}
    .phasebox .mapped-section-head .mapped-count{color:var(--secondary-text-color)}
    /* Only the device icons use phase colors. Names match P1's muted labels. */
    .phasebox .mapped-listing .device-alias .name{color:var(--secondary-text-color);font-weight:700}
    .phasebox .mapped-listing .device-icon{color:var(--phase-accent);font-weight:700}
    .phasebox .mapped-listing .device-icon ha-icon{color:var(--phase-accent)}
    .phasebox .mapped-listing .row{border-color:color-mix(in srgb,var(--phase-accent) 11%,var(--pm-border))}
    .phasebox .mapped-listing .row:hover{background:color-mix(in srgb,var(--phase-accent) 6%,transparent)}
    .phasebox .mapped-listing .devicebar{background:color-mix(in srgb,var(--phase-accent) 9%,var(--divider-color))}
    .phasebox .mapped-listing .certainty-dot{box-shadow:0 0 0 1px #0003} /* meaningful confidence colors kept */
    .phasebox .mapped-toggle{border-color:color-mix(in srgb,var(--phase-accent) 19%,var(--pm-border));}
    .household-unmapped{display:flex;flex-direction:column;justify-content:center;gap:5px;}
    .household-unmapped .household-unmapped-title{font-size:12px;font-weight:700;color:var(--phase-accent)}
    .household-unmapped .household-unmapped-data{font-size:11px;font-weight:700;font-variant-numeric:tabular-nums}
    .household-unmapped .household-unmapped-data span{font-weight:500;color:var(--secondary-text-color)}
    .household-unmapped .devicebar{height:6px!important;min-height:6px!important;max-height:6px!important;margin-top:0;background:var(--divider-color)}
    .household-unmapped .devicebar>span{height:100%;background:var(--phase-accent)}
    /* Muted utility accordions: intentionally distinct from electrical phase colors. */
    .mapping-tools-bottom{gap:10px;margin-top:17px;padding-top:13px}
    .mapping-tools-bottom>.tools{margin:0 0 1px}
    .mapping-tools-bottom>.checkline{margin-bottom:2px}
    .mapping-tools-bottom>details{
      --utility-accent:#a7b2bd;
      margin:0!important;padding:0!important;
      border:1px solid color-mix(in srgb,var(--utility-accent) 25%,var(--pm-border));
      border-left:3px solid var(--utility-accent);border-radius:10px;
      background:linear-gradient(100deg,color-mix(in srgb,var(--utility-accent) 7%,var(--card-background-color)) 0%,var(--card-background-color) 90%);
      overflow:visible;
    }
    .mapping-tools-bottom>#mappedDevices{--utility-accent:#9daebb}
    .mapping-tools-bottom>#stillLearning{--utility-accent:#a2abb4}
    .mapping-tools-bottom>#addManualDevice{--utility-accent:#b2aca4}
    .mapping-tools-bottom>#learningDiagnostics{--utility-accent:#ada8b6}
    .mapping-tools-bottom>details>summary{
      display:flex;align-items:center;gap:12px;min-height:48px;
      padding:11px 13px;list-style:none;cursor:pointer;color:var(--primary-text-color);font-size:13px;font-weight:650;
    }
    .mapping-tools-bottom>details>summary::-webkit-details-marker{display:none}
    .mapping-tools-bottom>details>summary::marker{content:''}
    .mapping-tools-bottom>details>summary .section-icon{color:var(--utility-accent);--mdc-icon-size:20px;flex:0 0 20px}
    .mapping-tools-bottom>details>summary .section-label{white-space:normal;overflow-wrap:break-word}
    .mapping-tools-bottom>details>summary .section-subtitle{color:var(--secondary-text-color);font-size:11px;font-weight:400;border-left:1px solid var(--pm-border);padding-left:12px;line-height:1.35}
    .mapping-tools-bottom>details>summary .section-chevron{margin-left:auto;color:var(--secondary-text-color);--mdc-icon-size:18px;transition:transform .16s ease}
    .mapping-tools-bottom>details[open]>summary .section-chevron{transform:rotate(180deg)}
    .mapping-tools-bottom>details[open]>summary{border-bottom:1px solid color-mix(in srgb,var(--utility-accent) 16%,var(--pm-border))}
    .mapping-tools-bottom>details>.device-list,.mapping-tools-bottom>details>.manual-form,.mapping-tools-bottom>details>.diaggrid{margin:9px 13px 13px}
    .mapping-tools-bottom>details>.learning-search{width:calc(100% - 26px);margin:12px 13px 0}
    .mapping-tools-bottom>details>.hint,.mapping-tools-bottom>details>.actions,.mapping-tools-bottom>details>.diagdetail{margin-left:13px;margin-right:13px}
    .mapping-tools-bottom>#stillLearning .device-alias .name,
    .mapping-tools-bottom>#stillLearning .device-icon{color:#34c8b9;font-weight:700}
    .mapping-tools-bottom>#stillLearning .device-icon ha-icon{color:#34c8b9}
    /* Settings sections fold independently; phase sensor fields carry a modest tint. */
    .settingsbox.settings-collapsible{padding:0;overflow:visible}
    .settings-collapsible>summary.settings-heading{display:flex;align-items:center;gap:10px;list-style:none;cursor:pointer;min-height:49px;padding:14px 16px;font-size:14px;font-weight:700}
    .settings-collapsible>summary.settings-heading::-webkit-details-marker{display:none}
    .settings-collapsible>summary.settings-heading::marker{content:''}
    .settings-heading>ha-icon:first-child{color:var(--secondary-text-color);--mdc-icon-size:20px}
    .settings-heading>.settings-chevron{margin-left:auto;color:var(--secondary-text-color);--mdc-icon-size:19px;transition:transform .16s ease}
    .settings-collapsible[open] .settings-chevron{transform:rotate(180deg)}
    .settings-collapsible[open]>.settings-heading{border-bottom:1px solid var(--pm-border)}
    .settings-content{padding:4px 15px 15px}
    .settings-content .formgrid{row-gap:12px}
    .settingsbox .phasefield{
      padding:11px 10px 11px 12px;
      border:1px solid color-mix(in srgb,var(--phase-color,#94a3b8) 24%,var(--pm-border));
      border-left:3px solid var(--phase-color,#94a3b8);border-radius:10px;
      background:linear-gradient(135deg,color-mix(in srgb,var(--phase-color,#94a3b8) 7%,var(--card-background-color)) 0%,var(--card-background-color) 100%);
      min-width:0;
    }
    .settingsbox .phasefield>label:first-child{color:var(--phase-color,#94a3b8);font-weight:700}
    .settingsbox .phasefield select,.settingsbox .phasefield input[type=number]{
      border-color:color-mix(in srgb,var(--phase-color,#94a3b8) 31%,var(--pm-border));
      background:color-mix(in srgb,var(--phase-color,#94a3b8) 5%,var(--card-background-color));
    }
    .settingsbox .phasefield select:focus-visible,.settingsbox .phasefield input:focus-visible{outline:2px solid var(--phase-color,#94a3b8);outline-offset:1px}
    .settingsbox .sourceentry{min-width:0}
    @media(max-width:740px){
      .mapping-tools-bottom>details>summary{gap:8px;padding:10px}
      .mapping-tools-bottom>details>summary .section-subtitle{font-size:10px;padding-left:8px}
      .settings-content{padding:3px 10px 10px}
    }
    @media(max-width:520px){
      .mapping-tools-bottom>details>summary{flex-wrap:wrap}
      .mapping-tools-bottom>details>summary .section-subtitle{flex:1 0 70%;margin-left:28px;border:0;padding-left:0}
      .mapping-tools-bottom>details>summary .section-chevron{margin-left:auto}
    }
  </style>`;

  class PhaseMapperView extends HTMLElement {
    constructor(){
      super();this.attachShadow({mode:'open'});
      this._tab='mapping';this._filter='';this._learningFilter='';this._excludeFilter='';this._nameTags='';this._showExcluded=false;this._lastPointerType='mouse';
      this._showAll=false;this._showExcludedSettings=false;
      this._sections={mapped:false,learning:false,addManual:false,diagnostics:false};
      this._settingsSections={p1:true,headroom:true,battery:true,solar:true,estimate:false,refresh:false,learning:true,recognized:false};
      try{const stored=JSON.parse(window.localStorage?.getItem('ha_auto_device_phase_mapping.settingsExpanded')||'null');if(stored&&typeof stored==='object'){for(const k of Object.keys(this._settingsSections))if(typeof stored[k]==='boolean')this._settingsSections[k]=stored[k];}}catch(_err){}
      try{const stored=window.localStorage?.getItem('ha_auto_device_phase_mapping.stillLearningExpanded');if(stored!==null&&stored!==undefined)this._sections.learning=stored==='true';}catch(_err){}
      // One shared toggle ensures the same summary alignment in all four power tiles.
      this._phaseMappedExpanded=true;
      try{const preference=window.localStorage?.getItem('ha_auto_device_phase_mapping.mappedExpanded');if(preference!==null&&preference!==undefined)this._phaseMappedExpanded=preference==='true';}catch(_err){}
      this._editor=null;this._versionDialog=false;this._releaseStatus=null;this._lastReleaseCheck=0;this._releaseLoading=false;this._releaseTimer=null;
this._loading=false;this._busy=false;this._error='';this._message='';this._lastFetch=0;
      this._pmSkipWire=false;this._pmLastInteraction=0;this._pmTrackingInstalled=false;this._pmPendingStructure=false;
      this._refreshTimer=null;this._autoTimer=null;this._saveMismatch=[];this._draftRevision=0;this._serverRevision=0;this._confirmReset=false;this._resetAcknowledged=false;this._resetDeviceTarget=null;this._saveState='saved';
    }
    setConfig(config){this._config=config||{};this._render();}
    static getConfigElement(){return document.createElement('phase-mapper-card-editor');}
    set hass(value){
      this._hass=value;
      // Update only the tiny value labels; never rebuild an open select or reset scroll.
      if (this._tab==='settings') this._updateLiveReadings();
      if (value?.callWS && !this._loading && Date.now()-this._lastFetch>this._refreshMs()) this._fetch();
    }
    getCardSize(){return this._config?.view==='detailed'?7:5;}
    static getStubConfig(){return {view:'compact'};}
    connectedCallback(){this._pmTrackInteraction();this._render();this._startRefresh();void this._checkLatestRelease();if(this._releaseTimer===null)this._releaseTimer=setInterval(()=>{if(this.isConnected)void this._checkLatestRelease();},3*60*60*1000);if(this._hass)this._fetch();}
    disconnectedCallback(){if(this._refreshTimer!==null){clearInterval(this._refreshTimer);this._refreshTimer=null;}if(this._releaseTimer!==null){clearInterval(this._releaseTimer);this._releaseTimer=null;}if(this._dirty&&!this._busy)void this._autosave();}
    _refreshMs(){return 1000*(Number(this._draft?.dashboard_refresh_seconds ?? this._data?.settings?.dashboard_refresh_seconds)||2);}
    _startRefresh(){
      if(this._refreshTimer!==null)clearInterval(this._refreshTimer);
      if(!this.isConnected){this._refreshTimer=null;return;}
      this._refreshScheduledMs=this._refreshMs();
      this._refreshTimer=setInterval(()=>{
        if(this.isConnected && this._hass?.callWS && !this._loading && !this._busy){
          // Keep controls stable; settings readings update from HA's state stream.
          if(this._tab==='settings')this._updateLiveReadings();
          else void this._fetch();
        }
      },this._refreshScheduledMs);
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
                   timing_overrides:{...(s.timing_overrides||{})},
                   manual_devices:JSON.parse(JSON.stringify(s.manual_devices||[])),
                   display_names:{...(s.display_names||{})},
                   display_icons:{...(s.display_icons||{})},
                   solar_phase_estimation:JSON.parse(JSON.stringify(s.solar_phase_estimation||{enabled:false,currents:{L1:'',L2:'',L3:''},voltages:{L1:'',L2:'',L3:''}}))};
      this._dirty=false;this._saveState='saved';
      if(this._refreshTimer===null||this._refreshScheduledMs!==this._refreshMs())this._startRefresh();
    }
    async _fetch(forceRender=false){
      if(!this._hass?.callWS||this._loading||this._busy)return;
      this._loading=true;this._lastFetch=Date.now();
      const startedAtRevision=this._serverRevision;
      try{const fresh=await this._hass.callWS({type:'ha_auto_device_phase_mapping/get'});
        // An older GET may complete after a successful settings write. Ignore it.
        if(startedAtRevision!==this._serverRevision)return;
        this._data=fresh;
        if(!this._draft||!this._dirty)this._resetDraft();if(this._saveState!=='error')this._error='';
      }catch(error){this._error=error.message||String(error);}
      finally{
        this._loading=false;
        // Never replace live settings controls while the user is choosing a sensor or exclusions.
        // The newly fetched data is used on the next deliberate render/tab change.
        const editingMapping=this._editor!==null || this._versionDialog || (this._tab==='mapping' &&
          (this._dragging || ['SELECT','INPUT'].includes(this.shadowRoot?.activeElement?.tagName)));
        if(!editingMapping && (this._tab!=='settings'||!this.shadowRoot?.querySelector('#excludeSearch'))){
          if(forceRender)this._render();
          else this._pmLiveRender();
        }
      }
    }
    _moreInfo(entityId){
      if(!entityId)return;
      this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId},bubbles:true,composed:true}));
    }
    _mouseCapable(){
      return typeof window!=='undefined' && typeof window.matchMedia==='function' &&
             window.matchMedia('(any-pointer: fine) and (any-hover: hover)').matches;
    }
    _row(r,compact=false){
      const confidence=Math.max(0,Math.min(100,Number(r.confidence)||0));
      const phase=r.phase;
      const cleaned=Number(this._data?.corrected_power?.[phase]);
      const power=r.power_w==null?null:Number(r.power_w);
      const valid=PHASES.includes(phase)&&Number.isFinite(cleaned)&&cleaned>0&&power!==null&&Number.isFinite(power)&&power>=0;
      const share=valid?100*power/cleaned:(cleaned===0&&power===0?0:null);
      const percent=share!==null&&share<=100?`${share.toFixed(1)}% of ${phase}`:'—';
      const manual=!!r.manual;
      const hint=!manual&&phase==='Unknown'&&r.phase_hint&&PHASES.includes(r.phase_hint.phase)?r.phase_hint:null;
      const phaseOptions=['','L1','L2','L3','3-phase'].map(p=>`<option value="${p}" ${manual&&p===phase?'selected':!manual&&!p?'selected':''}>${p||'Automatic'}</option>`).join('')+`<option value="__exclude__">Exclude device</option>`;
      const canDrag=this._hass?.user?.is_admin!==false && this._mouseCapable();
      const shownName=this._draft?.display_names?.[r.entity_id]||r.display_name||r.name;
      const aliasButton=this._hass?.user?.is_admin!==false?`<button class="alias-edit" data-rename="${esc(r.entity_id)}" title="Edit name and icon in Phase Mapper" aria-label="Edit ${esc(shownName)}">✎</button>`:'';
      const icon=this._deviceIcon(r.entity_id,r.display_icon);
      const iconMarkup=`<span class="device-icon"><ha-icon icon="${esc(icon)}"></ha-icon></span>`;
      const certaintyDot=(!manual && phase!=='Unknown')
        ?`<span class="certainty-dot ${confidence>=90?'certain':confidence>=70?'probable':'tentative'}" title="Mapping evidence ${confidence.toFixed(0)}% · ${confidence>=90?'High':confidence>=70?'Medium':'Lower'} certainty" aria-label="${confidence.toFixed(0)} percent phase-mapping evidence"></span>`:'';
      if(compact){
        const ratio=share===null?null:Math.max(0,share);
        const pct=ratio===null?'—':`${ratio.toFixed(1)}% of ${phase}`;
        const barWidth=ratio===null?0:Math.min(100,ratio);
        return `<div class="row ${r.excluded?'muted':''}" data-entity="${esc(r.entity_id)}" draggable="${canDrag}"><div class="left"><div class="device-alias">${iconMarkup}<div class="name" title="${esc(r.name)} · ${esc(r.entity_id)}">${esc(shownName)}</div>${certaintyDot}${aliasButton}</div><div class="device-details"><div class="devpower">${fmtW(r.power_w)} <span class="contrib">· ${esc(pct)}</span></div><div class="devicebar" style="--phase-color:var(--phase-accent)"><span style="width:${barWidth}%"></span></div></div></div><div class="right"><select class="manualcontrol" data-assign="${esc(r.entity_id)}" aria-label="Manual phase assignment">${phaseOptions}</select></div></div>`;
      }
      return `<div class="row ${r.excluded?'muted':''} ${phase==='Unknown'?'unknown':''}" data-entity="${esc(r.entity_id)}" draggable="${canDrag}">
        <div class="left"><div class="device-alias">${iconMarkup}<div class="name" title="${esc(r.name)} · ${esc(r.entity_id)}">${esc(shownName)}</div>${certaintyDot}${aliasButton}</div><div class="${phase==='Unknown'?'':'device-details'}"><div class="meta">${r.events} observations${r.excluded?' · excluded':''}</div>${r.diagnostics?.last_reason?`<div class="meta" title="${esc(r.diagnostics.last_detail||'')}">Last learning result: ${esc(r.diagnostics.last_reason.replaceAll('_',' '))} · ${Object.values(r.diagnostics.counts||{}).reduce((a,b)=>a+Number(b||0),0)} checks since restart</div>`:''}
        ${r.tentative_votes?`<div class="meta">Saved tentative slow matches: ${Number(r.tentative_votes)}${r.tentative_phase?' · candidate '+esc(r.tentative_phase):''} (ON/OFF correlation)</div>`:''}
        ${r.load_hints?`<div class="meta">ON-load feasibility clues: ${Number(r.load_hints)} (not accepted observations)</div>`:''}
        ${Number(r.diagnostics?.queue_depth||0)>0?`<div class="meta" title="Queued changes are processed by the device's learning worker">Queue: ${Number(r.diagnostics.queue_depth)} waiting · worker active${r.diagnostics.pending_age_seconds!=null?` for ${Number(r.diagnostics.pending_age_seconds).toFixed(0)} s`:''}</div>`:''}
        <div class="meta" title="Measured Home Assistant report interval, not the interval between wattage changes">Measured refresh: ${r.measured_refresh_seconds==null?'—':r.measured_refresh_seconds} s · ${esc(!r.timing_mode||r.timing_mode==='auto'?'Automatic timing':r.timing_mode+' override')}</div>
        <div class="devpower">${fmtW(r.power_w)} <span class="contrib">${esc(percent)}</span></div>
        ${share!==null&&share<=100?`<div class="devicebar" style="--phase-color:${phase==='L1'?'#3b82f6':phase==='L2'?'#f59e0b':'#a78bfa'}"><span style="width:${share}%"></span></div>`:''}</div>
        </div>
        <div class="right"><div class="ptext${hint?' provisional':''}" title="${hint?'Provisional phase suggestion only — not verified wiring':''}">${manual?'Manual · ':''}${esc(phase==='Unknown'?(hint?'Likely '+hint.phase:'Learning…'):phase)}</div>
        ${manual?'<div class="evidence">Manual override</div>':`<div class="evidence">${confidence.toFixed(0)}% confirmed evidence</div>${hint?`<div class="evidence provisional-note" title="Only independently timed matches are counted. Not an automatic mapping.">${Number(hint.clues)} provisional clues · unconfirmed</div>`:''}<div class="bar"><span style="width:${confidence}%"></span></div>`}
        <select class="manualcontrol" data-assign="${esc(r.entity_id)}" aria-label="Manual phase assignment">${phaseOptions}</select></div></div>`;
    }
    _deviceIcon(entityId,exported){
      const selected=this._draft?.display_icons?.[entityId]||exported;
      if(validMdi(selected))return selected;
      const native=this._hass?.states?.[entityId]?.attributes?.icon;
      return validMdi(native)?native:'mdi:power-plug';
    }
    _batterySoc(phase){
      const sources=this._data?.settings?.battery_sources?.[phase]||[];
      const values=sources.map(source=>{
        const entity=source.soc_entity_id;
        const state=entity?this._hass?.states?.[entity]:null;
        const number=Number(state?.state);
        return state && !['unknown','unavailable',''].includes(state.state)
          && Number.isFinite(number) && number>=0 && number<=100
          ? Math.round(number)+'%' : null;
      }).filter(Boolean);
      return values.join(' / ');
    }
    _top(d){
      const rows=d.devices||[],included=rows.filter(r=>!r.excluded),mapped=included.filter(r=>r.phase!=='Unknown');
      const stat=(number,label)=>`<div class="metric"><strong>${number}</strong><span>${label}</span></div>`;
      const breakdown=d.power_breakdown||{};
      const line=(label,value,entity,cleaned=false)=>{
        const kind=label==='Solar generation'?'solar':label==='Battery charging'?'battery-charge':label==='Battery discharging'?'battery-discharge':label==='Battery net flow'?'battery-net':'';
        return `<div class="powerline${cleaned?' cleaned':''} ${kind}" ${entity?`data-more="${esc(entity)}" title="Open more info"`:''}><span>${label}</span><strong>${fmtW(value)}</strong></div>`;
      };
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
        const relevant=p==='TOTAL'?PHASES:[p];
        const batteryConfigured=relevant.some(phase=>(d.settings.battery_sources?.[phase]||[]).some(source=>!!source.entity_id));
        const solarConfigured=relevant.some(phase=>(d.settings.solar_sources?.[phase]||[]).some(source=>!!source.entity_id))
          ||(d.settings.solar_sources?.TOTAL||[]).some(source=>!!source.entity_id);
        const soc=p==='TOTAL'?PHASES.map(k=>this._batterySoc(k)).filter(Boolean).join(' · '):this._batterySoc(p);
        return `<div class="powerlines">${line('P1 grid power',v?.grid,p==='TOTAL'?diag(p,'grid'):d.settings.phase_sensors[p])}${batteryConfigured?line(soc?label+' · SoC '+soc:label,watts,diag(p,'battery')):''}${solarConfigured?line('Solar generation',v?.solar,diag(p,'solar')):''}${line('Sum of loads',v?.cleaned,diag(p,'cleaned'),true)}</div>`;
      };
      const totals=Object.fromEntries(['grid','battery','solar','cleaned'].map(k=>[k,PHASES.every(p=>breakdown[p]?.[k]!=null&&Number.isFinite(breakdown[p][k]))?PHASES.reduce((sum,p)=>sum+breakdown[p][k],0):null]));
      const headroom=p=>{
        const h=d.grid_headroom?.[p];
        if(!h||h.current===null||h.current===undefined){return `<div class="headroom"><div class="headrow"><span>Grid current · headroom</span><strong>Unavailable</strong></div><div class="meter"></div></div>`;}
        const pct=Math.max(0,Number(h.utilization)||0), cls=pct>=90?'danger':pct>=70?'warning':'';
        const direction=Number(h.current)<0?'Exporting':Number(h.current)>0?'Importing':'Balanced';
        return `<div class="headroom ${cls}"><div class="headrow"><span>Grid current · ${direction}</span><strong>${Math.abs(Number(h.current)).toFixed(2)} / ${Number(h.limit).toFixed(1)} A</strong></div><div class="meter" role="progressbar" aria-label="${p} main connection current" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="meterfill" style="width:${Math.min(pct,100)}%"></div></div><div class="headrow" style="margin-top:6px;margin-bottom:0"><span>${h.voltage==null?'Voltage unavailable':Number(h.voltage).toFixed(0)+' V'} · ${pct.toFixed(0)}% used · ${Number(h.current).toFixed(2)} A signed</span><strong>${Number(h.remaining).toFixed(2)} A free</strong></div></div>`;
      };
      const manualList=this._draft?.manual_devices||d.manual_devices||[];
      // These figures are display-only residual estimates from live sensor snapshots.
      // A three-phase meter is split equally as an explicit assumption; we do not
      // claim this proves each phase uses exactly one third of the physical load.
      const positivePower=r=>r.power_w!==null&&r.power_w!==undefined&&Number.isFinite(Number(r.power_w))?Math.max(0,Number(r.power_w)):0;
      const mappedWatts=mapped.reduce((sum,r)=>sum+positivePower(r),0);
      const threePhaseWatts=mapped.filter(r=>r.phase==='3-phase').reduce((sum,r)=>sum+positivePower(r),0);
      const assignedWatts=p=>mapped.filter(r=>r.phase===p).reduce((sum,r)=>sum+positivePower(r),0)+threePhaseWatts/3;
      const mappedCount=p=>mapped.filter(r=>r.phase===p).length+manualList.filter(r=>r.phase===p).length;
      const allMappedCount=mapped.length+manualList.length;
      const residual=p=>{
        const load=breakdown[p]?.cleaned;
        if(load===null||load===undefined||!Number.isFinite(Number(load)))return {watts:null,pct:null};
        const positiveLoad=Math.max(0,Number(load));
        const watts=Math.max(0,positiveLoad-assignedWatts(p));
        return {watts,pct:positiveLoad>0?Math.min(100,100*watts/positiveLoad):0};
      };
      const loadPct=(watts,load)=>load===null||load===undefined||!Number.isFinite(Number(load))?null:
        Number(load)>0?100*watts/Math.max(0,Number(load)):0;
      const residuals=PHASES.map(p=>residual(p));
      const allResidualsValid=residuals.every(v=>v.watts!==null);
      const totalUnknown=allResidualsValid?residuals.reduce((sum,v)=>sum+v.watts,0):null;
      const totalPositiveLoad=PHASES.every(p=>breakdown[p]?.cleaned!=null&&Number.isFinite(Number(breakdown[p].cleaned)))
        ?PHASES.reduce((sum,p)=>sum+Math.max(0,Number(breakdown[p].cleaned)),0):null;
      const totalUnknownPercent=totalUnknown===null||totalPositiveLoad===null?null:totalPositiveLoad>0?Math.min(100,100*totalUnknown/totalPositiveLoad):0;
      // 'Not yet mapped' is measured W from included HA sensors without a phase.
      // Cap it to the positive residual so overlapping/aggregated sensors never
      // make the displayed household categories exceed total consumption.
      const unassignedMeasured=rows.filter(r=>r.phase==='Unknown'&&!r.excluded)
        .reduce((sum,r)=>sum+positivePower(r),0);
      const notYetMapped=totalUnknown==null?null:Math.min(totalUnknown,unassignedMeasured);
      const notYetMappedPercent=notYetMapped==null||totalPositiveLoad==null?null:loadPct(notYetMapped,totalPositiveLoad);
      const noSensorUnknown=totalUnknown==null?null:Math.max(0,totalUnknown-notYetMapped);
      const noSensorUnknownPercent=noSensorUnknown==null||totalPositiveLoad==null?null:loadPct(noSensorUnknown,totalPositiveLoad);
      const phaseDevices=p=>{
        const total=p==='TOTAL';
        const sensors=mapped.filter(r=>r.phase===(total?'3-phase':p));
        const manual=manualList.filter(r=>r.phase===(total?'3-phase':p));
        const count=total?allMappedCount:sensors.length+manual.length;
        const remaining=total?{watts:totalUnknown,pct:totalUnknownPercent}:residual(p);
        const combinedWatts=total?mappedWatts:assignedWatts(p);
        const combinedPct=loadPct(combinedWatts,total?totalPositiveLoad:breakdown[p]?.cleaned);
        const label=total?'household':p;
        const unknownDetail=(label,watts,pct)=>`<div class="unknown-segment"><div class="unknown-title">${label}</div><div class="unknown-data"><div class="devpower">${fmtW(watts)} <span class="contrib">· ${pct==null?'—':pct.toFixed(1)+'%'}</span></div><div class="devicebar" style="--phase-color:#94a3b8"><span style="width:${pct==null?0:Math.min(100,Math.max(0,pct))}%"></span></div></div></div>`;
        const unknown=total
          ?`<div class="unknown-load" title="Estimated household consumption without an identified Home Assistant power sensor. Duplicate or overlapping sensors can affect this estimate.">
          <div class="unknown-title">Unknown devices</div>
          <div class="unknown-details"><div class="unknown-data"><div class="devpower">${fmtW(noSensorUnknown)} <span class="contrib">· ${noSensorUnknownPercent==null?'—':noSensorUnknownPercent.toFixed(1)+'%'}</span></div><div class="devicebar"><span style="width:${noSensorUnknownPercent==null?0:Math.min(100,noSensorUnknownPercent)}%"></span></div></div><span aria-hidden="true"></span></div></div>`
          :`<div class="unknown-load" title="Estimated residual: cleaned phase consumption minus mapped device power sensors.">
          <div class="unknown-title">Unknown devices</div>
          <div class="unknown-details"><div class="unknown-data"><div class="devpower">${fmtW(remaining.watts)} <span class="contrib">· ${remaining.pct==null?'—':remaining.pct.toFixed(1)+'%'}</span></div><div class="devicebar" style="--phase-color:#94a3b8"><span style="width:${remaining.pct==null?0:Math.min(100,remaining.pct)}%"></span></div></div><span aria-hidden="true"></span></div></div>`;
        const phaseRows=total
          ?`${sensors.length||manual.length?`<div class="sub">Three-phase appliances</div>${sensors.map(r=>this._row(r,true)).join('')}${this._manualRows('3-phase')}`:'<div class="sub">Individual devices are listed under L1, L2 and L3.</div>'}`
          :`${sensors.map(r=>this._row(r,true)).join('')}${this._manualRows(p)}${!sensors.length&&!manual.length?'<div class="sub">No mapped devices</div>':''}`;
        const heading=`<div class="mapped-section-head"><span>Mapped devices</span><span class="mapped-count">${count}</span><button type="button" class="mapped-toggle" data-toggle-mapped="true" aria-label="${this._phaseMappedExpanded?'Hide':'Show'} mapped devices in all phases" aria-expanded="${this._phaseMappedExpanded}">${this._phaseMappedExpanded?'Hide ▴':'Show ▾'}</button></div>`;
        const summary=`<div class="mapped-combined"><div class="combined-details"><div class="combined-data"><div class="devpower">${fmtW(combinedWatts)} <span class="contrib">· ${combinedPct==null?'—':combinedPct.toFixed(1)+'%'}</span></div><div class="devicebar"><span style="width:${combinedPct==null?0:Math.min(100,Math.max(0,combinedPct))}%"></span></div></div><span aria-hidden="true"></span></div></div>`;
        return `<div class="phase-devices group" data-phase="${esc(total?'3-phase':p)}">${unknown}<section class="mapped-device-card">${heading}<div class="mapped-summary-wrap" ${this._phaseMappedExpanded?'hidden':''}>${summary}</div><div class="mapped-listing" ${this._phaseMappedExpanded?'':'hidden'}>${phaseRows}</div></section></div>`;
      };
      // Household "Not yet mapped" lives at the same height as the phase headroom
      // cards. The four Unknown devices sections therefore start on the same row.
      const householdUnmapped=`<div class="headroom household-unmapped" title="Measured Home Assistant devices whose electrical phase has not yet been learned."><div class="household-unmapped-title">Not yet mapped</div><div class="household-unmapped-data">${fmtW(notYetMapped)} <span>· ${notYetMappedPercent==null?'—':notYetMappedPercent.toFixed(1)+'%'}</span></div><div class="devicebar"><span style="width:${notYetMappedPercent==null?0:Math.min(100,notYetMappedPercent)}%"></span></div></div>`;
      const phaseGrid=this.full?`<div class="phases">${PHASES.map(p=>`<div class="phasebox ${p.toLowerCase()}"><div class="phasehead"><strong>${p}</strong><span class="pill">${mappedCount(p)} mapped</span></div>${contents(breakdown[p],p)}${headroom(p)}${phaseDevices(p)}</div>`).join('')}<div class="phasebox total"><div class="phasehead"><strong>Household total</strong><span class="pill triphase-label"><span class="ph-l1">L1</span><span class="plus">+</span><span class="ph-l2">L2</span><span class="plus">+</span><span class="ph-l3">L3</span></span></div>${contents(totals,"TOTAL")}<div class="pm-household-graphic">${this._householdRing(d)}</div>${householdUnmapped}${phaseDevices('TOTAL')}</div></div>`:'';
      const logoTheme=this._hass?.themes?.darkMode?'dark_':'';
      const statCard=(number,label,color)=>`<div class="topstat" style="--stat-color:${color}" title="${label}: ${number}"><strong>${number}</strong><span>${label}</span></div>`;
      const tabs=['mapping','settings','info'].map(t=>`<button data-tab="${t}" class="navtab ${this._tab===t?'active':''}">${t==='mapping'?'Mapping':t==='settings'?'Settings':'Info'}</button>`).join('');
      const header=`<nav class="topnav" aria-label="Phase Mapper navigation"><${this.full?'button':'div'} class="topbrand" ${this.full?'id="menu" aria-label="Open Home Assistant sidebar"':''} title="Automatic Phase Mapper · Passive Load Discovery · v${esc(d.version)}">
        <img class="wide-logo" src="/ha_auto_device_phase_mapping_static/brand/${logoTheme}logo@2x.png?v=${VERSION}" alt="Automatic Phase Mapper" />
        <img class="mini-logo" src="/ha_auto_device_phase_mapping_static/brand/${logoTheme}icon.png?v=${VERSION}" alt="Phase Mapper" /></${this.full?'button':'div'}>
        <div class="navtabs">${tabs}</div><span class="topstatus"><span class="statusdot" style="${d.settings.learning_enabled?'':'background:#f59e0b'}"></span>${d.settings.learning_enabled?'Learning':'Paused'} · <button class="version-link version-${this._releaseStatus?.status||'unverified'}" id="topVersionLink" title="${esc(this._releaseStatus?.note||'Release not checked')}">v${VERSION}</button></span><div class="topstats">${statCard(rows.length,'Detected','#94a3b8')}${statCard(mapped.length,'Mapped','#22c55e')}${statCard(rows.filter(r=>r.excluded).length,'Excluded','#94a3b8')}</div></nav>`;
      return header+(this._tab==='mapping'?phaseGrid+`${this.full&&d.settings.solar_phase_estimation?.enabled?`<p class="hint">SolarEdge phase allocation: ${d.solar_estimation_status==='estimated'?'estimated from inverter V × I proportions, normalized to total AC power':d.solar_estimation_status==='fallback_equal'?'SolarEdge phase measurements unavailable; equal split shown as an estimate, learning paused':d.solar_estimation_status==='zero_generation'?'solar production near zero':d.solar_estimation_status==='solar_source_unavailable'?'solar source unavailable — learning paused':'using equal third allocation'}. Phase allocations assume similar power factors.</p>`:''}`:'');
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
        const original=st?.attributes?.friendly_name||source.entity_id;
        const name=this._draft?.display_names?.[source.entity_id]||original;
        const cls=mode==='Charging'?'charge':mode==='Discharging'?'discharge':'mixed';
        const edit=this._hass?.user?.is_admin===false?'':`<button class="alias-edit" data-battery-rename="${esc(source.entity_id)}" title="Rename battery in Phase Mapper" aria-label="Rename ${esc(name)}">✎</button>`;
        return `<div class="row systemdevice" style="--phase-color:${phase==='L1'?'#3b82f6':phase==='L2'?'#f59e0b':'#a78bfa'}" data-more="${esc(source.entity_id)}" title="Open ${esc(source.entity_id)} More info"><div class="left"><div class="device-alias"><div class="name" title="${esc(original)} · ${esc(source.entity_id)}">🔋 ${esc(name)}</div>${edit}</div><div class="device-details"><div class="battery-tag">System assigned · ${esc(phase)}</div><div class="devpower">${watts} <span class="battery-direction ${cls}">${mode}</span></div></div></div></div>`;
      });
    }
    _manualRows(phase){
      const list=this._draft?.manual_devices||this._data?.manual_devices||[];
      return list.filter(d=>d.phase===phase).map(d=>`<div class="row manual-entry" data-manual-id="${esc(d.id)}">
        <div class="left"><div class="device-alias"><span class="device-icon"><ha-icon icon="${esc(validMdi(d.icon)?d.icon:'mdi:power-plug')}"></ha-icon></span><div class="name">${esc(d.name)}</div><button class="alias-edit" data-manual-edit="${esc(d.id)}" title="Edit name, room and icon" aria-label="Edit ${esc(d.name)}">✎</button></div><div class="device-details">${d.room?`<div class="manual-room">${esc(d.room)}</div>`:'<div class="manual-room">Manual appliance</div>'}</div></div>
        <div class="right"><select data-manual-phase="${esc(d.id)}" aria-label="Change phase or delete ${esc(d.name)}"><option value="__manual__" selected>Manual</option>${[...PHASES,'3-phase'].map(p=>`<option value="${p}">${p===d.phase?'Keep on ':'Move to '}${p}</option>`).join('')}<option value="__delete__">Delete device…</option></select></div>
      </div>`).join('');
    }
    _iconOptions(){return ICON_CHOICES.map(i=>`<option value="${esc(i)}">${esc(i.slice(4).replaceAll('-',' '))}</option>`).join('');}
    _iconSuggestions(query){
      const q=String(query||'').trim().toLowerCase().replace(/^mdi:/,'').replaceAll(' ','-');
      const matched=ICON_CHOICES.filter(icon=>icon.slice(4).includes(q)).slice(0,12);
      return matched.map((icon,index)=>`<button type="button" class="icon-option" data-pick-icon="${esc(icon)}" role="option" aria-selected="${index===0?'true':'false'}"><ha-icon icon="${esc(icon)}"></ha-icon><span class="icon-label"><span>${esc(icon.slice(4).replaceAll('-',' '))}</span><span class="icon-code">${esc(icon)}</span></span></button>`).join('');
    }
    _manualForm(){
      return `<details class="diagnostics" id="addManualDevice"><summary><ha-icon icon="mdi:plus-circle-outline" class="section-icon"></ha-icon><span class="section-label">Add appliance without a Home Assistant power sensor</span><ha-icon icon="mdi:chevron-down" class="section-chevron"></ha-icon></summary>
        <div class="manual-form"><div><label for="manualName">Device name</label><input id="manualName" maxlength="100" placeholder="Coffee maker"></div>
        <div><label for="manualRoom">Room (optional)</label><input id="manualRoom" maxlength="80" placeholder="Kitchen"></div>
        <div><label for="manualPhase">Electrical phase</label><select id="manualPhase">${[...PHASES,'3-phase'].map(p=>`<option>${p}</option>`).join('')}</select></div>
        <div><label for="manualIcon">Home Assistant icon (mdi:)</label><ha-icon-picker id="manualNativeIcon" class="native-icon-field" value="mdi:power-plug" label="Search icons"></ha-icon-picker><div class="icon-choice-container"><input id="manualIcon" autocomplete="off" value="mdi:power-plug" placeholder="mdi:coffee-maker"><div class="icon-suggestions" id="manualIconSuggestions" role="listbox" hidden></div></div></div>
        <button class="btn included" id="manualAdd">Add device</button></div><p class="hint">Search the full MDI icon library using Home Assistant’s native picker (or enter an mdi: name when the native picker is unavailable). Manual entries do not affect measured watts or learning.</p></details>`;
    }
    _editDialog(){
      if(!this._editor)return '';
      const editor=this._editor;
      const device=editor.kind==='manual'?this._draft?.manual_devices?.find(r=>r.id===editor.id):this._data?.devices?.find(r=>r.entity_id===editor.id);
      if(!device)return '';
      const manual=editor.kind==='manual';
      const name=manual?device.name:(this._draft?.display_names?.[editor.id]||device.display_name||device.name);
      const icon=manual?(device.icon||'mdi:power-plug'):this._deviceIcon(editor.id,device.display_icon);
      return `<div class="editor-backdrop"><div class="editor-dialog" role="dialog" aria-modal="true" aria-labelledby="editorTitle">
        <h3 id="editorTitle">Edit ${manual?'manual appliance':'device'} appearance</h3><p class="hint">Names and icons are changed only in Phase Mapper; Home Assistant entities are not renamed.</p>
        <label for="editName">Display name</label><input id="editName" type="text" maxlength="100" value="${esc(name)}">
        ${manual?`<label for="editRoom">Room (optional)</label><input id="editRoom" type="text" maxlength="80" value="${esc(device.room||'')}">`:''}
        <label for="editIcon">Home Assistant icon</label><ha-icon-picker id="editNativeIcon" class="native-icon-field" value="${esc(icon)}" label="Search icons"></ha-icon-picker><div class="icon-choice-container"><input id="editIcon" type="text" autocomplete="off" maxlength="84" value="${esc(icon)}" placeholder="mdi:power-plug" aria-controls="editIconSuggestions" aria-autocomplete="list"><div class="icon-suggestions" id="editIconSuggestions" role="listbox" hidden></div></div>
        <div class="icon-preview"><ha-icon id="editIconPreview" icon="${esc(icon)}"></ha-icon><span>Search the complete Home Assistant icon library or enter any mdi: name.</span></div>
        <div class="actions"><button class="btn" id="cancelDeviceEdit">Cancel</button><button class="btn included" id="saveDeviceEdit">Save changes</button></div>
      </div></div>`;
    }
    _resetDeviceDialogHtml(){
      if(!this._resetDeviceTarget)return '';
      const {id,name}=this._resetDeviceTarget;
      return `<div class="editor-backdrop"><div class="editor-dialog" role="dialog" aria-modal="true" aria-labelledby="resetDeviceTitle">
        <h3 id="resetDeviceTitle">Reset learning for ${esc(name)}?</h3>
        <p>This clears only this device's accepted observations, confidence, tentative matches, phase hints and learned phase. Any manual phase override for this device is also removed so it can relearn.</p>
        <p class="hint">Your custom name, icon, timing mode and exclusion setting will remain. All other devices are unaffected. This cannot be undone.</p>
        <div class="actions"><button class="btn" id="cancelDeviceReset">Cancel</button><button class="btn danger" id="confirmDeviceReset" data-reset-id="${esc(id)}">Reset this device</button></div>
      </div></div>`;
    }
    _versionDialogHtml(){
      if(!this._versionDialog)return '';
      return `<div class="editor-backdrop"><div class="editor-dialog" role="dialog" aria-modal="true"><h3>Open GitHub repository?</h3><p>${this._releaseStatus?.status==='outdated'?'Open the newer version v'+esc(this._releaseStatus.latest)+' release page?':'Open the Automatic Phase Mapper repository in a new browser tab?'}</p><p class="hint">${esc(this._releaseStatus?.status==='outdated'?this._releaseStatus.url:REPOSITORY)}</p><div class="actions"><button class="btn" id="cancelVersionLink">Cancel</button><a class="btn included" href="${esc(this._releaseStatus?.status==='outdated'?this._releaseStatus.url:REPOSITORY)}" target="_blank" rel="noopener noreferrer" id="openVersionLink">Open repository</a></div></div></div>`;
    }
    _updateVersionIndicator(){
      const status=this._releaseStatus?.status||'unverified';
      for(const id of ['topVersionLink','versionLink']){
        const el=this.shadowRoot?.querySelector('#'+id);
        if(!el)continue;
        if(el.classList){
          el.classList.remove('version-current','version-outdated','version-unverified');
          el.classList.add('version-'+status);
        }
        el.title=this._releaseStatus?.note||'Release status not checked';
      }
    }
    async _checkLatestRelease(force=false){
      // /releases/latest excludes pre-releases. The published releases list
      // includes betas, while drafts must be ignored.
      if(this._releaseLoading||(!force&&Date.now()-this._lastReleaseCheck<3*60*60*1000))return;
      this._releaseLoading=true;
      this._lastReleaseCheck=Date.now();
      try{
        const response=await fetch('https://api.github.com/repos/niCNCo/HA-auto-device-phase-mapping/releases?per_page=50',
          {headers:{Accept:'application/vnd.github+json'}});
        if(!response.ok)throw new Error('GitHub API: '+response.status);
        const releases=await response.json();
        if(!Array.isArray(releases))throw new Error('Invalid GitHub releases response');
        const parse=tag=>{
          const match=/^v?(\d+)\.(\d+)\.(\d+)(?:[-+][a-z0-9.-]+)?$/i.exec(String(tag||''));
          return match?[Number(match[1]),Number(match[2]),Number(match[3])]:null;
        };
        const compare=(a,b)=>{
          for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]-b[i];
          return 0;
        };
        const available=releases.filter(release=>release&&!release.draft&&parse(release.tag_name))
          .map(release=>({release,parts:parse(release.tag_name)}))
          .sort((a,b)=>compare(b.parts,a.parts));
        if(!available.length)throw new Error('No published version tags');
        const latest=available[0],local=parse(VERSION);
        if(!local)throw new Error('Invalid installed version');
        const newer=compare(latest.parts,local)>0;
        const version=String(latest.release.tag_name).replace(/^v/i,'');
        this._releaseStatus={
          latest:version,status:newer?'outdated':'current',
          note:newer?'Newer GitHub release available'+(latest.release.prerelease?' (pre-release)':''):'No newer published release',
          prerelease:!!latest.release.prerelease,
          url:typeof latest.release.html_url==='string'&&latest.release.html_url.startsWith(REPOSITORY+'/releases/')?latest.release.html_url:REPOSITORY
        };
      }catch(error){
        // Network, GitHub rate limits, and private repositories are unverified;
        // never mark an unverified check as up-to-date.
        this._releaseStatus={latest:null,status:'unverified',
          note:'Release check unavailable ('+String(error?.message||error)+')'};
      }finally{
        this._releaseLoading=false;
        if(this._tab==='info'&&!this._editor)this._render();
        else this._updateVersionIndicator();
      }
    }
    _learningDiagnostics(d){
      const stats=d.learning_diagnostics||{},count=stats.counts||{},history=stats.history||{};
      const backendVersion=String(d.version||'unavailable');
      const versionMismatch=!!d.version&&backendVersion!==VERSION;
      const labels=[['transitions_detected','Transitions since restart'],['evaluations_started','Evaluations started'],['accepted','Accepted since restart'],['missing_baseline','Missing baseline'],['missing_end_sample','Missing end sample'],['overlapping_changes','Overlapping changes'],['unstable_device','Unstable load'],['queued_transition','Queued transitions'],['evaluations_completed','Evaluations completed'],['watchdog_orphan_queue','Orphan queues recovered'],['watchdog_stalled_worker','Stalled workers restarted'],['worker_unfinished_recovered','Interrupted steps retried'],['queued_steps_combined','Staged reports combined'],['worker_start_error','Worker start errors'],['worker_timed_out','Worker timeouts'],['fast_episode_match','Combined heating pulses'],['stale_pending_recovered','Recovered completed workers'],['queue_full','Queue overflows'],['worker_error','Worker errors'],['statistical_average_match','Average power matches'],['statistical_already_counted','Average events already counted'],['slow_on_off_pattern','ON/OFF steps'],['slow_profile_match','Delayed ON/OFF cycles'],['slow_isolated_step','Historical isolated steps'],['fast_lagged_step','Late HA reports matched'],['slow_duplicate_step','Repeated step rejected'],['slow_no_matching_step','Delayed steps not found'],['high_power_confirmed','Strong high-power confirmations'],['load_feasibility_hint','Load hints'],['poor_correlation','Poor correlation'],['history_interrupted','History interruptions'],['error','Errors']];
      return `<details class="diagnostics" id="learningDiagnostics"><summary><ha-icon icon="mdi:chart-timeline-variant" class="section-icon"></ha-icon><span class="section-label">Learning diagnostics</span><span class="section-subtitle">${Number(count.accepted||0)} accepted since restart / ${Number(count.transitions_detected||0)} transitions · corrected history ${history.ready?'ready':'not ready'}</span><ha-icon icon="mdi:chevron-down" class="section-chevron"></ha-icon></summary>
        <div class="diaggrid">${labels.map(([k,label])=>`<div class="diagstat">${label}<strong>${Number(count[k]||0)}</strong></div>`).join('')}</div>
        <div class="actions"><button type="button" class="btn" id="exportLearningDiagnostics">Export learning diagnostics (.json)</button><span class="hint">Local download only; no automatic transmission.</span></div>
        <div class="diagdetail"><strong>Learning engine:</strong> backend v${esc(backendVersion)} · frontend v${esc(VERSION)}${versionMismatch?` · <strong style="color:var(--error-color,#f87171)">Version mismatch: restart Home Assistant and hard-refresh this dashboard.</strong>`:` · <span style="color:var(--success-color,#34d399)">Versions match</span>`}</div>
        <div class="diagdetail"><strong>Corrected phase history:</strong> ${esc(history.reason||'Awaiting data')} · Samples: ${PHASES.map(p=>`${p} ${Number(history.samples?.[p]||0)}`).join(', ')}${stats.night_solar_zero_fallback_active?' · Nighttime stale 0 W solar sensor safely treated as zero':''}</div>
        <div class="diagdetail"><strong>Total accepted observations (saved):</strong> ${Number(stats.accepted_total||0)} · <strong>Saved tentative slow matches:</strong> ${Number(stats.tentative_votes_saved||0)} across ${Number(stats.tentative_devices||0)} sensors · <strong>Saved load feasibility hints:</strong> ${Number(stats.load_hints_saved||0)} · <strong>Waiting in transition queues:</strong> ${Number(stats.queued_transitions||0)} · <strong>Active learning workers:</strong> ${Number(stats.active_workers||0)} · <strong>Orphan queues:</strong> ${Number(stats.orphan_queues||0)} · <strong>In-flight evaluations:</strong> ${Number(stats.inflight_evaluations||0)} · <strong>Oldest worker:</strong> ${Number(stats.oldest_pending_seconds||0).toFixed(0)} s.</div>
        <div class="diagdetail">Rejection and transition counters are <strong>since restart</strong>. v1.6.1 adds two independent watchdog checks (1 s and 15 s), stalled-worker cancellation, retries of interrupted steps, bounded queue compaction, and a frontend/backend version mismatch warning. The existing staged fast heating-pulse matching remains enabled. Accepted observations and tentative slow-sensor matches are stored across restarts. Tentative ON/OFF matches and repeated ON-load hints are not proof of a phase; they expire after 14 days. They never assign a phase automatically without accepted correlation evidence. A clean corrected-power history must be rebuilt after startup. v1.5.5 uses a default 50 W change floor and compares averages across independent ON/OFF reporting periods when exact step matching fails. Click Export to download recent corrected phase power and device reports for debugging; the export includes entity names and usage timestamps.</div>
      </details>`;
    }

    _householdRing(d){
      const breakdown=d.power_breakdown||{};
      const phases=PHASES.map(p=>Math.max(0,Number(breakdown[p]?.cleaned)||0));
      const measured=PHASES.every(p=>breakdown[p]?.cleaned!=null && Number.isFinite(Number(breakdown[p].cleaned)));
      const total=phases.reduce((sum,v)=>sum+v,0);
      const included=(d.devices||[]).filter(r=>!r.excluded);
      const watt=r=>Math.max(0,Number(r.power_w)||0);
      const threePhase=included.filter(r=>r.phase==='3-phase').reduce((sum,r)=>sum+watt(r),0)/3;
      const mapped=PHASES.reduce((sum,p,i)=>{
        const assigned=included.filter(r=>r.phase===p).reduce((acc,r)=>acc+watt(r),0)+threePhase;
        return sum+Math.min(phases[i],assigned);
      },0);
      const residual=Math.max(0,total-mapped);
      const waiting=included.filter(r=>r.phase==='Unknown').reduce((sum,r)=>sum+watt(r),0);
      const notYet=Math.min(residual,waiting);
      const unknown=Math.max(0,residual-notYet);
      const percent=value=>total>0?(100*value/total).toFixed(1)+'%':'0.0%';
      const arcs=(values,colors,radius)=>{
        const circumference=2*Math.PI*radius;
        let cursor=0;
        return values.map((watts,index)=>{
          const fraction=total>0?Math.max(0,watts)/total:0;
          const length=fraction*circumference;
          const offset=-cursor*circumference;
          cursor+=fraction;
          if(length<=0.1)return '';
          return `<circle cx="60" cy="60" r="${radius}" fill="none" stroke="${colors[index]}" stroke-width="9" stroke-dasharray="${Math.max(0,length-.8)} ${circumference}" stroke-dashoffset="${offset}" transform="rotate(-90 60 60)" class="pm-ring-glow"/>`;
        }).join('');
      };
      const legend=(label,watts,color)=>`<div class="pm-ring-legend"><span><i style="background:${color}"></i>${esc(label)}</span><strong>${measured?fmtW(watts):'—'} <small>${measured?percent(watts):'—'}</small></strong></div>`;
      return `<div class="pm-ring-wrap"><div class="pm-ring-graphic"><svg viewBox="0 0 120 120" role="img" aria-label="Household load phase and mapping distribution">
          <circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" stroke-opacity=".10" stroke-width="9"/>
          <circle cx="60" cy="60" r="32" fill="none" stroke="currentColor" stroke-opacity=".10" stroke-width="9"/>
          ${measured?arcs(phases,['#3b82f6','#f59e0b','#a78bfa'],46):''}
          ${measured?arcs([mapped,unknown,notYet],['#34d399','#fb7185','#94a3b8'],32):''}
          </svg><div class="pm-ring-center"><strong>${measured?fmtW(total):'—'}</strong><span>Household total</span></div></div>
          <div class="pm-ring-legends"><div class="pm-ring-group"><div class="pm-ring-label">Phase distribution</div>
          ${PHASES.map((p,i)=>legend(p,phases[i],['#3b82f6','#f59e0b','#a78bfa'][i])).join('')}</div>
          <div class="pm-ring-group"><div class="pm-ring-label">Device coverage</div>
          ${legend('Mapped',mapped,'#34d399')}
          ${legend('Unknown',unknown,'#fb7185')}
          ${legend('Not yet mapped',notYet,'#94a3b8')}</div></div></div>`;
    }
    _compactCard(d){
      const breakdown=d.power_breakdown||{};
      const included=(d.devices||[]).filter(r=>!r.excluded);
      const devices=phase=>included.filter(r=>r.phase===phase);
      const batteryConfigured=p=>(d.settings?.battery_sources?.[p]||[]).some(source=>!!source.entity_id);
      const solarConfigured=p=>(d.settings?.solar_sources?.[p]||[]).some(source=>!!source.entity_id)
        ||(d.settings?.solar_sources?.TOTAL||[]).some(source=>!!source.entity_id);
      const phaseTile=p=>{
        const v=breakdown[p]||{};
        const h=d.grid_headroom?.[p];
        const count=devices(p).length+(this._draft?.manual_devices||[]).filter(r=>r.phase===p).length;
        const soc=this._batterySoc(p);
        const current=h?Math.abs(Number(h.current)).toFixed(2)+' / '+Number(h.limit).toFixed(1)+' A':'Unavailable';
        const used=h?Math.min(100,Math.max(0,Number(h.utilization)||0)):0;
        const assigned=devices(p).reduce((sum,r)=>sum+Math.max(0,Number(r.power_w)||0),0)
           +devices('3-phase').reduce((sum,r)=>sum+Math.max(0,Number(r.power_w)||0),0)/3;
        const unknown=v.cleaned==null?null:Math.max(0,Number(v.cleaned)-assigned);
        return `<section class="pm-compact-phase pm-${p.toLowerCase()}"><header><b>${p}</b><small>${count} mapped</small></header>
          <div class="pm-compact-line"><span>P1 grid power</span><strong>${fmtW(v.grid)}</strong></div>
          ${batteryConfigured(p)?`<div class="pm-compact-line"><span>Battery ${soc?'· SoC '+esc(soc):''}</span><strong>${fmtW(v.battery)}</strong></div>`:'' }
          ${solarConfigured(p)?`<div class="pm-compact-line"><span>Solar generation</span><strong>${fmtW(v.solar)}</strong></div>`:'' }
          <div class="pm-compact-line pm-compact-sum"><span>Sum of loads</span><strong>${fmtW(v.cleaned)}</strong></div>
          <div class="pm-compact-headroom"><span>Grid current · ${current}</span><div class="pm-compact-track"><i style="width:${used}%"></i></div></div>
          <div class="pm-compact-line"><span>Unknown devices</span><strong>${fmtW(unknown)}</strong></div>
          <details class="pm-compact-devices"><summary>Mapped devices · ${count}</summary>
          ${devices(p).map(r=>`<div class="pm-compact-line"><span>${esc(r.name)}</span><strong>${fmtW(r.power_w)}</strong></div>`).join('')||'<span class="hint">No mapped devices</span>'}</details>
          </section>`;
      };
      return `<div class="pm-compact-wrap"><header class="pm-compact-heading"><b>Automatic Phase Mapper</b><span>${d.settings.learning_enabled?'● Learning':'Paused'} · v${VERSION}</span></header>
        <div class="pm-compact-grid">${PHASES.map(phaseTile).join('')}
        <section class="pm-compact-phase pm-total"><header><b>Household total</b><small>L1 + L2 + L3</small></header>${this._householdRing(d)}</section></div>
        <div class="pm-compact-footer"><a href="/ha-auto-device-phase-mapping">Open full dashboard</a></div></div>`;
    }
    _mapping(d){
      const rows=(d.devices||[]).filter(r=>(this._showExcluded||!r.excluded)&&`${r.name} ${this._draft?.display_names?.[r.entity_id]||''} ${r.entity_id} ${r.phase}`.toLowerCase().includes(this._filter.toLowerCase()));
      const search=`<div class="tools"><input id="mappingSearch" class="search" type="search" placeholder="Search device, entity or phase" value="${esc(this._filter)}" aria-label="Search mapped devices"><button class="btn" id="refresh">Refresh</button></div>
        <label class="checkline"><input type="checkbox" id="showExcluded" ${this._showExcluded?'checked':''}> Show excluded devices</label>`;
      if(!this.full){
        const visible=this._showAll?rows:rows.slice(0,9);
        return `${search}<div class="scroll">${visible.length?visible.map(r=>this._row(r)).join(''):'<div class="empty">No matching power sensors yet.</div>'}</div>
          <div class="foot"><span class="hint">${rows.length} matching sensors</span><div>${rows.length>9?`<button id="showAll" class="btn">${this._showAll?'Show fewer':'Show all'}</button>`:''} <a href="/ha-auto-device-phase-mapping">Open full dashboard</a></div></div>`;
      }
      const mapped=rows.filter(r=>r.phase!=='Unknown');
      const unknown=rows.filter(r=>r.phase==='Unknown'&&`${r.name} ${this._draft?.display_names?.[r.entity_id]||''} ${r.entity_id}`.toLowerCase().includes(this._learningFilter.toLowerCase()));
      return `<div class="mapping-tools-bottom">${search}
        <details id="mappedDevices" class="mapped-summary"><summary><ha-icon icon="mdi:layers-triple-outline" class="section-icon"></ha-icon><span class="section-label">Mapped devices</span><span class="section-subtitle">${mapped.length} power sensors · learning evidence</span><ha-icon icon="mdi:chevron-down" class="section-chevron"></ha-icon></summary>
          <div class="device-list">${mapped.length?mapped.map(r=>this._row(r)).join(''):'<div class="empty">No mapped power sensors yet.</div>'}</div></details>
        <details id="stillLearning" class="learning-summary group" data-phase="Unknown"><summary><ha-icon icon="mdi:book-open-variant-outline" class="section-icon"></ha-icon><span class="section-label">Still learning</span><span class="section-subtitle">${rows.filter(r=>r.phase==='Unknown').length} devices</span><ha-icon icon="mdi:chevron-down" class="section-chevron"></ha-icon></summary>
          <input id="learningSearch" class="learning-search" type="search" placeholder="Filter Still learning by name or entity ID…" value="${esc(this._learningFilter)}" aria-label="Filter still learning devices">
          <div class="device-list">${unknown.length?unknown.map(r=>this._row(r)).join(''):'<div class="empty">No matching devices still learning.</div>'}</div></details>
        ${this._manualForm()}${this._learningDiagnostics(d)}</div><p class="hint">Evidence is based on repeated P1/device power transitions. Assignments are estimates and must not be used for electrical safety decisions.</p>`;
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
      const socOptions=selected=>{
         const available=Object.entries(this._hass?.states||{}).filter(([id,state])=>
           id.startsWith('sensor.') && (state.attributes?.unit_of_measurement==='%' ||
           state.attributes?.device_class==='battery'))
           .map(([id,state])=>[id,state.attributes?.friendly_name||id])
           .sort((a,b)=>a[1].localeCompare(b[1]));
         if(selected&&!available.some(([id])=>id===selected))
           available.unshift([selected,selected+' (unavailable)']);
         return '<option value="">No SoC sensor</option>'+available.map(([id,name])=>
           `<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(name)} (${esc(id)})</option>`).join('');
       };
       const sourceGroups=(type,groups)=>groups.map(p=>{
        const items=draft[type][p]||[];
        return `<div class="field phasefield sourcegroup" style="--phase-color:${colors[p]}"><label>${p==='TOTAL'?'Total 3-phase':p} · ${type==='battery_sources'?'battery':'solar'} power</label>
          ${items.map((item,i)=>`<div class="sourceentry"><select data-source-type="${type}" data-source-phase="${p}" data-source-index="${i}">${opts(item.entity_id,'Select source')}</select>
          <label class="checkline" title="Checked: discharge / generation reports positive watts"><input type="checkbox" data-source-sign="${type}" data-source-phase="${p}" data-source-index="${i}" ${item.positive?'checked':''}> +W</label>
          <button class="btn compactbtn" data-remove-source="${type}" data-remove-phase="${p}" data-remove-index="${i}" title="Remove source">×</button>${this._liveReading(item.entity_id)}${type==='battery_sources'?`<label class="pm-soc-label">Battery SoC sensor (optional)</label><select data-battery-soc-phase="${p}" data-battery-soc-index="${i}">${socOptions(item.soc_entity_id||'')}</select>${item.soc_entity_id?this._liveReading(item.soc_entity_id):''}`:''}</div>`).join('')}
          <button class="btn compactbtn" data-add-source="${type}" data-add-phase="${p}">+ Add ${type==='battery_sources'?'battery':'solar'}</button></div>`;
      }).join('');
      const headroomFields=PHASES.map(p=>`<div class="field phasefield" style="--phase-color:${colors[p]}"><label>${p} · P1 phase current (A)</label><select data-grid-current="${p}">${viOpts(draft.grid_current_sensors[p],'currents')}</select>${this._liveReading(draft.grid_current_sensors[p])}<label style="margin-top:8px">${p} · P1 phase voltage (V)</label><select data-grid-voltage="${p}">${viOpts(draft.grid_voltage_sensors[p],'voltages')}</select>${this._liveReading(draft.grid_voltage_sensors[p])}<label style="margin-top:8px">${p} · Maximum current (A)</label><input type="number" min="1" max="125" step="0.5" data-current-limit="${p}" value="${draft.phase_current_limits_a[p]}"></div>`).join('');
      const phaseSelect=PHASES.map(p=>`<div class="field phasefield" style="--phase-color:${colors[p]}"><label>${p} · P1 grid (W)</label><select data-phase="${p}">${opts(draft.phase_sensors[p],'Choose phase sensor')}</select>${this._liveReading(draft.phase_sensors[p])}</div>`).join('');
      const filter=this._excludeFilter.trim().toLowerCase();
      // Comma-separated naming tags match ANY tag; name search matches as well.
      const tags=this._nameTags.split(',').map(t=>t.trim().toLowerCase()).filter(Boolean);
      const tagMatches=r=>!tags.length||tags.some(t=>`${r.name} ${r.entity_id}`.toLowerCase().includes(t));
      const matches=all.filter(r=>(this._showExcludedSettings||!draft.excluded.has(r.entity_id))&&`${r.name} ${r.entity_id}`.toLowerCase().includes(filter)&&tagMatches(r));
      const isAdmin=this._hass?.user?.is_admin!==false;
      return `<details id="settings-p1" class="settingsbox settings-collapsible" data-settings-section="p1" ${this._settingsSections.p1?'open':''}><summary class="settings-heading"><ha-icon icon="mdi:transmission-tower"></ha-icon><span>🔌 P1 measurement sources</span><ha-icon icon="mdi:chevron-down" class="settings-chevron"></ha-icon></summary><div class="settings-content"><p class="hint">Choose the individual signed P1 grid sensor for each phase.</p><div class="formgrid">${phaseSelect}</div></div></details>
      <details id="settings-headroom" class="settingsbox settings-collapsible" data-settings-section="headroom" ${this._settingsSections.headroom?'open':''}><summary class="settings-heading"><ha-icon icon="mdi:gauge"></ha-icon><span>📊 Main connection phase headroom</span><ha-icon icon="mdi:chevron-down" class="settings-chevron"></ha-icon></summary><div class="settings-content"><p class="hint">Choose grid-meter current and voltage sensors (not SolarEdge inverter sensors). Set your main fuse limit for each phase. This display is monitoring-only, using measured grid current—not cleaned household watts.</p><div class="formgrid">${headroomFields}</div><p class="hint">Green below 70%, amber 70–90%, red at 90% or higher. These are visual warnings, not electrical protection.</p></div></details>
      <details id="settings-battery" class="settingsbox settings-collapsible" data-settings-section="battery" ${this._settingsSections.battery?'open':''}><summary class="settings-heading"><ha-icon icon="mdi:battery-charging"></ha-icon><span>🔋 Battery compensation</span><ha-icon icon="mdi:chevron-down" class="settings-chevron"></ha-icon></summary><div class="settings-content"><p class="hint">Add multiple battery power sensors per phase. Each +W box sets that source's discharge sign; uncheck if discharging is negative. Optional SoC sensors are displayed only and never used for learning.</p><div class="formgrid">${sourceGroups('battery_sources',PHASES)}</div></div></details>
      <details id="settings-solar" class="settingsbox settings-collapsible" data-settings-section="solar" ${this._settingsSections.solar?'open':''}><summary class="settings-heading"><ha-icon icon="mdi:solar-power"></ha-icon><span>☀️ Solar compensation</span><ha-icon icon="mdi:chevron-down" class="settings-chevron"></ha-icon></summary><div class="settings-content"><p class="hint">Add phase-specific solar sensors, or add total three-phase generation under TOTAL (divided equally between phases). Do not select the same production twice.</p><div class="formgrid">${sourceGroups('solar_sources',[...PHASES,'TOTAL'])}</div></div></details>
      <details id="settings-estimate" class="settingsbox settings-collapsible" data-settings-section="estimate" ${this._settingsSections.estimate?'open':''}><summary class="settings-heading"><ha-icon icon="mdi:chart-bell-curve-cumulative"></ha-icon><span>☀️ SolarEdge phase power estimation</span><ha-icon icon="mdi:chevron-down" class="settings-chevron"></ha-icon></summary><div class="settings-content">
      <p class="hint">Optional: distribute your measured three-phase inverter AC power using each phase's AC voltage × current. The shares are normalized to the real inverter total, not calculated as V × I watts. Assumes approximately equal phase power factors; these are estimates.</p>
      <label class="checkline"><input id="solarEstimateEnabled" type="checkbox" ${est.enabled?'checked':''}> Use inverter V × I phase proportions instead of equal ⅓ distribution for TOTAL solar</label>
      <div class="formgrid" style="margin-top:12px">${viFields}</div>
      <p class="hint">Choose the SolarEdge inverter AC Current A/B/C and AC Voltage AN/BN/CN entities. Do not select Meter 1/2/3 entities. When SolarEdge phase measurements are stale, equal-third solar is shown as a fallback but no phase learning occurs for those samples.</p></div></details>
      <details id="settings-refresh" class="settingsbox settings-collapsible" data-settings-section="refresh" ${this._settingsSections.refresh?'open':''}><summary class="settings-heading"><ha-icon icon="mdi:refresh"></ha-icon><span>🔄 Dashboard refresh</span><ha-icon icon="mdi:chevron-down" class="settings-chevron"></ha-icon></summary><div class="settings-content"><p class="hint">Refresh live phase power and mapped-device values at the selected rate. The learning engine runs separately. Faster refresh uses more browser/network resources; the source sensors may update more slowly.</p>
      <div class="field" style="max-width:320px"><label>Dashboard update interval</label><select id="dashboardRefresh">${[1,2,5,10,30].map(n=>`<option value="${n}" ${Number(draft.dashboard_refresh_seconds)===n?'selected':''}>${n} second${n===1?'':'s'}${n===2?' · Recommended':''}</option>`).join('')}</select></div></div></details>
      <details id="settings-learning" class="settingsbox settings-collapsible" data-settings-section="learning" ${this._settingsSections.learning?'open':''}><summary class="settings-heading"><ha-icon icon="mdi:brain"></ha-icon><span>🧠 Learning options</span><ha-icon icon="mdi:chevron-down" class="settings-chevron"></ha-icon></summary><div class="settings-content"><div class="formgrid"><label class="checkline"><input type="checkbox" id="learning" ${draft.learning_enabled?'checked':''}> Learning enabled</label>
      <div class="field"><label for="threshold">Minimum device power change (W)</label><input id="threshold" type="number" min="30" max="2000" step="10" value="${draft.minimum_change_w}"></div></div>
      <p class="hint">Manual assignments take priority over automatic learning, and can be removed by choosing Automatic.</p></div></details>
      <details id="settings-recognized" class="settingsbox settings-collapsible sensor-manager" data-settings-section="recognized" ${this._settingsSections.recognized?'open':''}><summary class="settings-heading"><ha-icon icon="mdi:format-list-bulleted"></ha-icon><span>🔎 Recognized Power Sensors</span><ha-icon icon="mdi:chevron-down" class="settings-chevron"></ha-icon></summary><div class="settings-content">
      <p class="hint">Every recognized watt sensor in one list. Search by name/ID or filter using comma-separated naming tags. Exclude unwanted or duplicate sensors, and set Automatic/Fast/Slow timing alongside each entity. Choose Reset learning… in the same menu to clear one device after confirmation. Source sensors are ignored for phase learning automatically.</p>
      <div class="tools"><input id="excludeSearch" class="search" type="search" placeholder="Search sensor name or entity ID…" value="${esc(this._excludeFilter)}" aria-label="Search recognized sensors"></div>
      <div class="tools"><input id="nameTags" class="search" type="text" placeholder="Naming tags, e.g. total, energy, inverter" value="${esc(this._nameTags)}" aria-label="Comma-separated naming tags" title="Comma-separated tags; sensors matching any of them will be shown"></div>
      <div class="actions"><label class="checkline"><input type="checkbox" id="showExcludedSettings" ${this._showExcludedSettings?'checked':''}> Show excluded</label><span class="pill" id="excludedCount">${draft.excluded.size} excluded · ${matches.length} shown</span></div>
      <div class="tools"><button class="btn" id="bulkExclude" ${!matches.some(r=>!draft.excluded.has(r.entity_id))?'disabled':''}>Exclude matching</button><button class="btn" id="bulkRestore" ${!matches.some(r=>draft.excluded.has(r.entity_id))?'disabled':''}>Restore matching</button></div>
      <div class="scroll" id="recognizedScroll" style="max-height:520px">${matches.map(r=>{
        const isExcluded=draft.excluded.has(r.entity_id),mode=draft.timing_overrides?.[r.entity_id]||'auto';
        return `<div class="row ${isExcluded?'excluded-row':'included-row'}" data-recognized="${esc(r.entity_id)}"><span class="left"><span class="name" title="${esc(r.entity_id)}">${esc(r.name)}</span><span class="meta" style="display:block" title="${esc(r.entity_id)}">${esc(r.entity_id)} · ${isExcluded?'Excluded':'Included'}</span><span class="timing-measured">Measured refresh: ${r.measured_refresh_seconds==null?'—':r.measured_refresh_seconds} s</span></span>
        <div class="sensor-actions"><select data-timing-mode="${esc(r.entity_id)}" aria-label="Timing mode for ${esc(r.name)}"><option value="auto" ${mode==='auto'?'selected':''}>Automatic</option><option value="slow" ${mode==='slow'?'selected':''}>Slow</option><option value="fast" ${mode==='fast'?'selected':''}>Fast</option><option value="__reset_learning__">Reset learning…</option></select>
        <button class="btn compactbtn ${isExcluded?'restore':'included'}" data-exclude-toggle="${esc(r.entity_id)}">${isExcluded?'Restore':'Exclude'}</button></div></div>`;
      }).join('')||'<div class="empty">No matching power sensors.</div>'}</div></div></details>
      <div class="actions"><div id="saveStatus" class="save-status" data-state="${esc(this._saveState)}">${this._saveState==='saving'?'Saving…':this._saveState==='error'?'Save failed · changes retained':this._dirty?'Waiting to save…':'✓ All changes saved'}</div>
        <button class="btn" id="reset" ${this._busy||!isAdmin?'disabled':''}>Reset learned mappings</button></div>
      ${this._saveState==='error'?'<button class="btn" id="retrySave">Retry saving</button>':''}
      ${this._confirmReset?`<div class="reset-backdrop"><div class="reset-modal" role="dialog" aria-modal="true" aria-labelledby="resetTitle"><h3 id="resetTitle">⚠ Reset ALL automatic learning evidence?</h3><p>All automatic phase-learning observations, confidence scores and inferred assignments will be cleared. Relearning may take days. Manual phase assignments, exclusions, and measurement settings are preserved. An archive of prior evidence is retained in storage.</p><label class="checkline"><input id="resetAcknowledge" type="checkbox" ${this._resetAcknowledged?'checked':''}> I understand that automatic learning evidence will be reset.</label><div class="actions"><button class="btn" id="cancelReset">Cancel</button><button class="btn danger" id="confirmReset" ${this._resetAcknowledged?'':'disabled'}>Reset all learning</button></div></div></div>`:''}
      ${!isAdmin?'<div class="warn">Only Home Assistant administrators can save settings.</div>':''}
      <p class="hint">Changing measurement sources resets current correlation evidence (a backup is retained). Manual assignments and exclusions are preserved.</p>`;
    }
    _info(){
      if(!this._releaseStatus&&!this._releaseLoading)void this._checkLatestRelease();
      const status=this._releaseStatus||{status:'unverified',note:'Checking for published GitHub releases…',latest:null};
      return `<div class="info-grid">
      <section class="info-section wide"><h3>Version and repository</h3><p><strong>Installed:</strong> <button class="version-link version-${status.status}" id="versionLink" title="${esc(status.note)}">v${VERSION}</button> · <strong>Latest published:</strong> ${status.latest?'v'+esc(status.latest)+(status.prerelease?' (pre-release)':''):'Not verified'}</p>
      <p><span class="version-status ${esc(status.status)}">${esc(status.note)}</span> <button class="btn compactbtn" id="checkReleaseNow" ${this._releaseLoading?'disabled':''}>${this._releaseLoading?'Checking…':'Check now'}</button></p>
      <p><strong>GitHub repository:</strong> <button class="version-link" id="repositoryLink">${esc(REPOSITORY)}</button></p>
      <p class="hint">Version comparison checks published GitHub releases, including pre-releases, on dashboard load and every three hours while open. Use Check now to refresh. It does not compare unpublished commits. Private repositories and repositories without releases cannot be verified anonymously. Unknown is not treated as up-to-date.</p></section>
      <section class="info-section wide"><h3>Welcome to Automatic Phase Mapper</h3><p>Passive monitoring only: the integration watches changes in Home Assistant device power sensors and compares them with corrected L1, L2 and L3 power changes. It does not switch or control equipment. Phase identification is an estimate, not suitable for electrical safety decisions.</p></section>
      <section class="info-section"><h3>1 · Initial setup</h3><ol><li>In <strong>Settings</strong>, choose the three individual P1 grid power sensors, measured in signed watts.</li><li>Optionally add battery and solar AC power sensors on their physical phases, with the correct sign for each sensor.</li><li>Enable learning and set the minimum device power change (50 W is the default starting point).</li><li>The Settings selectors show live signed values, units and last-update age under each selected entity. Click a reading for More info. Adjust dashboard refresh speed (1–30 seconds) in Settings. Your changes are saved automatically. The mapper starts collecting evidence as devices change their consumption.</li></ol></section>
      <section class="info-section"><h3>2 · Map devices</h3><p>In <strong>Mapping</strong>, devices begin under <strong>Still learning</strong>. Multiple clean power transitions build evidence for an automatic assignment. Slowly polled sensors can show <strong>Likely L1/L2/L3</strong> based on repeated preliminary clues without being automatically assigned. Learning combines clean ON/OFF events with averaged power-pattern changes, allowing delayed reporting and a 50 W default change threshold. Confidence converges more quickly when repeated changes clearly favor one phase; mapped device names show a red, orange, or green evidence dot. These indicate relative strength of evidence, not a calibrated probability.</p><p><strong>Drag and drop</strong> a device from Still learning into L1, L2, L3, or the 3-phase group to assign it manually. You can also use each device’s assignment dropdown, including on mobile. Choose <strong>Automatic</strong> to remove an override and resume learning.</p><p>Use <strong>Add appliance without a Home Assistant power sensor</strong> to register unmetered devices such as a coffee maker. Any power sensor (including Still learning) can have its display name and MDI icon customized with the pencil button without renaming its Home Assistant entity; clicking the device name still opens More info.</p><p>Mouse users can drag devices between phase lists. On touchscreens use the phase dropdown. Expand Still learning for the entire unmapped list, with no internal scroll bar. Its open/closed state is remembered when you navigate away and return in the same browser. Expand Mapped devices to see full learning evidence for mapped sensors.</p><p>Click a device row or power value to open Home Assistant's native More info dialog.</p></section>
      <section class="info-section"><h3>3 · Live power and contribution</h3><p>Each phase tile shows grid power, battery charging or discharging, solar contribution and the Sum of loads. Configured batteries are reflected in the phase summary tiles but intentionally omitted from mapped appliance lists. Unknown devices appears first as a grey residual estimate; Household total separates the residual into Unknown devices (unmeasured) and Not yet mapped (power sensors still learning), both as proportions of total household consumption. Overlapping power sensors can affect this estimate. The synchronized Show/Hide controls collapse all four mapped lists to a combined wattage, share and color-coded bar, with your selection remembered locally in this browser. Mapped devices display their live measured watts and percentage of the cleaned load for that phase.</p><p>Each phase also shows a colored live grid-current bar, measured voltage, main fuse limit and remaining amperage. The bar is green below 70%, amber at 70–90% and red at 90% or more; it is informational and cannot protect circuits. Totals can differ when a load is unmetered, readings arrive at different times or sensors overlap. Do not treat percentages as metering-grade measurements.</p></section>
      <section class="info-section"><h3>4 · Exclude unwanted sensors</h3><p>Choose <strong>Exclude device</strong> from an assignment dropdown, or use <strong>Settings → Recognized Power Sensors</strong>. Search by name/ID or enter comma-separated naming tags to filter; use Exclude/Restore per sensor, or confirm a bulk action. Automatic/Fast/Slow selection is adjacent to each sensor, with a per-device Reset learning confirmation option. Excluded devices disappear until Show excluded is enabled.</p><p>Measured refresh reports the actual time between Home Assistant sensor reports when available, and displays — s until there is a measured interval. This is different from how often the appliance's power changes.</p><p>Grid, battery and solar source entities are ignored as mapping candidates automatically. Avoid duplicated meters and whole-house total sensors as mapping candidates.</p></section>
      <section class="info-section"><h3>5 · SolarEdge phase measurement</h3><p>If you have one total three-phase SolarEdge AC power reading, the default assumes equal thirds. You can optionally enable phase allocation using the inverter’s AC Current A/B/C and AC Voltage AN/BN/CN sensors. Their V × I values determine proportional shares of the measured total real power; they are not themselves accurate real-power readings.</p><p>That allocation assumes broadly comparable power factors and should be treated as an estimate. Do not choose grid meter values in place of the inverter sensors.</p></section>
      <section class="info-section"><h3>6 · Use the dashboard card</h3><p>The full dashboard opens from the <strong>Phase Mapper</strong> Home Assistant sidebar entry. You can also add the compact view to another Lovelace dashboard using a <strong>Manual card</strong> with this YAML:</p><p><code>type: custom:phase-mapper-card</code></p><p>The integration serves the card script itself. If the card does not appear after updating, restart Home Assistant and force-refresh your browser with Ctrl + F5.</p></section>
      <section class="info-section"><h3>7 · Autosave and safe reset</h3><p>Settings and exclusion changes save automatically. Watch for <strong>All changes saved</strong>; an error retains your unsaved choices and offers a retry. Individual device learning can be reset from Settings → Recognized Power Sensors → Automatic / Slow / Fast → Reset learning… after confirming the warning. It removes that device’s evidence and manual phase override but preserves its name, icon, timing and other devices. Reset ALL learned mappings requires a separate dialog, an acknowledgement checkbox, and a final confirmation. Manual assignments and exclusions are not erased.</p></section>
      <section class="info-section"><h3>8 · Persistence and updates</h3><p>Settings, manual assignments, exclusions and accumulated learning evidence are stored in Home Assistant’s <code>.storage</code> directory, separately from <code>custom_components</code>. Back up Home Assistant before an update. Replace the custom integration files via Samba, restart, and refresh the browser.</p><p>Changing the phase measurement method may invalidate previous evidence; the integration retains an evidence archive as a precaution.</p></section>
      </div>`;
    }

    // v1.6.2 — update live data without destroying the iOS WebView's scroll
    // target, text selection, native input controls, or click handlers.
    _pmLiveRender(){
      if(!this.isConnected)return;
      this._pmPassiveRefresh=true;
      try{this._render();}
      finally{this._pmPassiveRefresh=false;}
    }
    _pmTrackInteraction(){
      if(this._pmTrackingInstalled)return;
      this._pmTrackingInstalled=true;
      const mark=()=>{this._pmLastInteraction=Date.now();};
      // iOS often scrolls a parent element belonging to Home Assistant, not
      // the card's own shadow root. Capture touch/wheel events at both levels.
      for(const target of [this,this.shadowRoot]){
        if(!target?.addEventListener)continue;
        for(const name of ['touchstart','touchmove','touchend','touchcancel','wheel','pointerdown']){
          target.addEventListener(name,mark,{passive:true,capture:true});
        }
        target.addEventListener('scroll',mark,{passive:true,capture:true});
      }
    }
    _pmExternalScroll(){
      const items=[];
      let el=this;
      const seen=new Set();
      while(el&&!seen.has(el)){
        seen.add(el);
        if(el.scrollHeight>el.clientHeight+2 && typeof el.scrollTop==='number'){
          items.push({element:el,top:el.scrollTop,left:el.scrollLeft});
        }
        el=el.parentNode || (el.getRootNode?.().host||null);
      }
      const doc=typeof document!=='undefined'?document.scrollingElement:null;
      if(doc&&!seen.has(doc))items.push({element:doc,top:doc.scrollTop,left:doc.scrollLeft});
      return items;
    }
    _pmRestoreExternalScroll(items){
      for(const item of items){
        if(item.element?.isConnected){
          if(item.element.scrollTop!==item.top)item.element.scrollTop=item.top;
          if(item.element.scrollLeft!==item.left)item.element.scrollLeft=item.left;
        }
      }
    }
    _pmPatchPassiveHTML(html){
      const root=this.shadowRoot;
      if(!root?.childNodes?.length||typeof document==='undefined')return false;
      const template=document.createElement('template');
      template.innerHTML=html;
      const compatible=(oldNode,newNode)=>{
        if(oldNode.nodeType!==newNode.nodeType||oldNode.nodeName!==newNode.nodeName)return false;
        if(oldNode.nodeType===1){
          // Never reuse a row's event listeners for a different entity.
          for(const key of ['id','data-entity','data-phase','data-more','data-assign',
                            'data-manual-phase','data-rename','data-exclude-toggle',
                            'data-battery-rename','data-timing-mode','data-settings-section']){
            if(oldNode.getAttribute(key)!==newNode.getAttribute(key))return false;
          }
        }
        return oldNode.childNodes.length===newNode.childNodes.length;
      };
      // Patch stable subtrees independently. If device rows are added or move
      // while scrolling, the existing phase meters still update live; only
      // the structurally changed subtree waits for a safe full redraw.
      let changedStructure=false;
      const sync=(oldNode,newNode)=>{
        if(!compatible(oldNode,newNode)){changedStructure=true;return;}
        if(oldNode.nodeType===3){
          if(oldNode.nodeValue!==newNode.nodeValue)oldNode.nodeValue=newNode.nodeValue;
        }else if(oldNode.nodeType===1){
          const tag=oldNode.tagName;
          const frozen=name => (tag==='DETAILS'&&name==='open') ||
            (['INPUT','TEXTAREA','SELECT','OPTION'].includes(tag) &&
             ['value','checked','selected'].includes(name));
          // This preserves the native open state of <details> and retains iOS
          // caret/selection/keyboard state while power values refresh.
          for(const attr of [...oldNode.attributes]){
            if(!frozen(attr.name)&&!newNode.hasAttribute(attr.name))oldNode.removeAttribute(attr.name);
          }
          for(const attr of [...newNode.attributes]){
            if(!frozen(attr.name)&&oldNode.getAttribute(attr.name)!==attr.value){
              oldNode.setAttribute(attr.name,attr.value);
            }
          }
        }
        for(let i=0;i<oldNode.childNodes.length;i++)sync(oldNode.childNodes[i],newNode.childNodes[i]);
      };
      sync(root,template.content);
      this._pmPendingStructure=changedStructure;
      return !changedStructure;
    }
    get _pmRenderTarget(){
      if(!this._pmPassiveRefresh)return this.shadowRoot;
      this._pmTrackInteraction();
      if(!this._pmRenderSink){
        const view=this;
        this._pmRenderSink={set innerHTML(html){
          if(view._pmPatchPassiveHTML(html)){
            // Updating existing DOM nodes preserves their original listeners.
            view._pmSkipWire=true;
            return;
          }
          view._pmPendingStructure=true;
          // Structural changes are rare (e.g. a newly mapped device). Don't
          // replace the page during finger scrolling or momentum scrolling.
          // Current power values stay visible until a safe idle moment.
          if(Date.now()-view._pmLastInteraction<8000){
            view._pmSkipWire=true;
            const refresh=view.shadowRoot?.querySelector('#refresh');
            if(refresh)refresh.textContent='Refresh · updated mapping';
            return;
          }
          const position=view._pmExternalScroll();
          view.shadowRoot.innerHTML=html;
          view._pmPendingStructure=false;
          view._pmRestoreExternalScroll(position);
          if(typeof requestAnimationFrame==='function'){
            requestAnimationFrame(()=>view._pmRestoreExternalScroll(position));
          }
        }};
      }
      return this._pmRenderSink;
    }
    _render(){
      const remembered=[['mapped','mappedDevices'],['learning','stillLearning'],['addManual','addManualDevice'],['diagnostics','learningDiagnostics']];
      for(const [key,id] of remembered){const el=this.shadowRoot?.querySelector('#'+id);if(el)this._sections[key]=!!el.open;}
      this.shadowRoot?.querySelectorAll('details[data-settings-section]').forEach(el=>{this._settingsSections[el.dataset.settingsSection]=!!el.open;});
      if (!this.shadowRoot)return;
      const d=this._data;
      const shell='';
      const compact=!this.full && this._config?.view!=='detailed';
      const display = !d ? `<div class="surface"><h2>Automatic Phase Mapper</h2><p class="hint">${esc(this._error||'Loading data from the integration…')}</p><button class="btn" id="refresh">Retry</button></div>`:
        `<div class="surface">${compact?"":this._top(d)}
        ${this._error?`<div class="warn" role="alert">${esc(this._error)}${this._saveState==='error'?' — changes have NOT been saved.':''}</div>`:''}
        ${this._dirty&&this._saveState!=='error'?`<div class="save-pending" role="status">${this._saveState==='saving'?'Saving changes to Home Assistant…':'Changes pending save…'}</div>`:''}
        ${this._message&&!this._dirty&&this._saveState==='saved'?`<div class="success" role="status">${esc(this._message)}</div>`:''}
        ${this._saveState==='error'&&this._dirty&&this._tab!=='settings'?'<button class="btn save-retry" id="retrySaveMapping">Retry saving changes</button>':''}
        ${!Object.values(d.settings.phase_sensors).every(Boolean)?'<div class="warn">Setup required: choose L1, L2 and L3 P1 phase power sensors in Settings.</div>':''}
        ${compact?this._compactCard(d):this._tab==='mapping'?this._mapping(d):this._tab==='settings'?this._settings(d):this._info()}</div>`;
      // Preserve both inner lists and the enclosing Home Assistant mobile scroller
      // during deliberate actions such as changing tabs, searching or editing.
      const externalBefore=this._pmPassiveRefresh?null:this._pmExternalScroll();
      const before=[...this.shadowRoot.querySelectorAll('.scroll')].map(e=>({top:e.scrollTop,left:e.scrollLeft}));
      this._pmRenderTarget.innerHTML=css+shell+(this.full?`<main class="page panel">${display}</main>`:`<div class="card">${display}</div>`)+this._editDialog()+this._versionDialogHtml()+this._resetDeviceDialogHtml();
      this.shadowRoot.querySelectorAll('.scroll').forEach((e,i)=>{if(before[i]){e.scrollTop=before[i].top;e.scrollLeft=before[i].left;}});
      if(externalBefore)this._pmRestoreExternalScroll(externalBefore);
      this._wire();
      for(const [key,id] of remembered){const box=this.shadowRoot.querySelector('#'+id);if(box)box.open=!!this._sections[key];}
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
    _scheduleAutosave(delay=90){
      if(this._autoTimer!==null)clearTimeout(this._autoTimer);
      this._autoTimer=setTimeout(()=>{this._autoTimer=null;void this._autosave();},delay);
    }
    _settingsPayload(){
      // PATCH changed fields only. Compare nested settings structurally:
      // serialization may reorder dictionary keys even when values are equal.
      // JSON.stringify comparison used to resend unchanged P1/battery/solar
      // sources after an innocent rename or deletion; a temporarily unavailable
      // source then rejected the entire settings write.
      const current={phase_sensors:Object.fromEntries(PHASES.map(p=>[p,this._draft.phase_sensors[p]||''])), 
        excluded:[...this._draft.excluded],learning_enabled:this._draft.learning_enabled,
        battery_sources:Object.fromEntries(Object.entries(this._draft.battery_sources).map(([p,items])=>[p,items.filter(x=>x.entity_id).map(x=>({...x}))])),
        solar_sources:Object.fromEntries(Object.entries(this._draft.solar_sources).map(([p,items])=>[p,items.filter(x=>x.entity_id).map(x=>({...x}))])),
        solar_phase_estimation:JSON.parse(JSON.stringify(this._draft.solar_phase_estimation)),
        grid_current_sensors:{...this._draft.grid_current_sensors},grid_voltage_sensors:{...this._draft.grid_voltage_sensors},
        phase_current_limits_a:{...this._draft.phase_current_limits_a},
        minimum_change_w:Number(this._draft.minimum_change_w),
        dashboard_refresh_seconds:Number(this._draft.dashboard_refresh_seconds),
        manual_devices:this._draft.manual_devices.map(x=>({...x})),
        timing_overrides:{...this._draft.timing_overrides},
        manual_assignments:{...this._draft.manual_assignments},
        display_names:{...this._draft.display_names},
        display_icons:{...this._draft.display_icons}};
      const payload={type:'ha_auto_device_phase_mapping/set'};
      const previous=this._data?.settings||{};
      for(const [key,value] of Object.entries(current)){
        const existing=previous[key];
        const different=(key==='excluded'&&Array.isArray(value)&&Array.isArray(existing))
          ? !this._sameSetting([...value].sort(),[...existing].sort())
          : !this._sameSetting(value,existing);
        if(different)payload[key]=value;
      }
      return payload;
    }
    _sameSetting(a,b){
      // Compare saved values structurally, not by JSON.stringify. Home Assistant
      // serializes Python dicts, which may legitimately have a different key
      // insertion order from the browser draft. String comparison falsely
      // reported failed saves after rename/icon updates in populated installs.
      if(a===b)return true;
      if(Array.isArray(a)||Array.isArray(b)){
        return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&
          a.every((value,index)=>this._sameSetting(value,b[index]));
      }
      if(a&&b&&typeof a==='object'&&typeof b==='object'){
        const left=Object.keys(a),right=Object.keys(b);
        return left.length===right.length&&left.every(key=>
          Object.prototype.hasOwnProperty.call(b,key)&&this._sameSetting(a[key],b[key]));
      }
      return false;
    }
    _settingsAcknowledged(payload,result){
      const changed=Object.keys(payload).filter(key=>key!=='type'&&key!=='id');
      const ack=result?.save_ack;
      // New servers confirm only AFTER awaiting the .storage save operation.
      // This acknowledgement is separate from the in-memory snapshot and
      // avoids a false rejection caused by JSON serialization differences.
      if(ack?.committed===true&&Array.isArray(ack.fields)&&
          changed.every(key=>ack.fields.includes(key))){
        this._saveMismatch=[];
        return true;
      }
      // Older server versions do not have save_ack. For backwards compatibility,
      // confirm the actual settings structurally and diagnose which keys differ.
      const settings=result?.settings;
      if(!settings){this._saveMismatch=['missing server settings'];return false;}
      const different=changed.filter(key=>{
        const value=payload[key], actual=settings[key];
        if(key==='excluded'&&Array.isArray(value)&&Array.isArray(actual)){
          return !this._sameSetting([...value].sort(),[...actual].sort());
        }
        return !this._sameSetting(value,actual);
      });
      this._saveMismatch=different;
      return different.length===0;
    }
    async _autosave(){
      if(!this._dirty||!this._draft||!this._hass?.callWS)return;
      if(this._busy){this._scheduleAutosave(400);return;}
      const revision=this._draftRevision,payload=this._settingsPayload();
      this._busy=true;this._setSaveState('saving');this._error='';
      try{
        const result=await this._hass.callWS(payload);
        if(!this._settingsAcknowledged(payload,result))throw new Error('Home Assistant did not confirm these changed settings: '+(this._saveMismatch||[]).join(', ')+'. Edits retained for retry. Installed integration version: '+(result?.version||'unknown')+'.');
        this._serverRevision++;
        this._data=result;
        if(this._draftRevision===revision){
          // All changes in this snapshot are committed; the server is now authoritative.
          this._resetDraft();this._setSaveState('saved');
          // Update feedback in-place without interrupting open dropdowns or scrolling.
          this._message='Changes saved.';
          // Rebuild the feedback without requiring a user navigation; the
          // frontend must not claim success while a save is pending or failed.
          this._render();
        } else {
          // Never discard edits made while this request was in flight.
          this._setSaveState('pending');this._scheduleAutosave(150);
        }
      }catch(error){
        this._error=error.message||String(error);this._message='';this._setSaveState('error');
        // Keep the pending draft, make the failure prominent, and expose Retry.
        this._render();
      }
      finally{this._busy=false;}
    }
    _wireIconPicker(inputId,listId,previewId){
      const root=this.shadowRoot;
      const input=root.querySelector('#'+inputId),menu=root.querySelector('#'+listId);
      if(!input||!menu)return;
      const close=()=>{menu.hidden=true;menu.innerHTML='';};
      const open=()=>{menu.innerHTML=this._iconSuggestions(input.value);menu.hidden=!menu.children.length;};
      const choose=icon=>{
        input.value=icon;
        if(previewId){const preview=root.querySelector('#'+previewId);if(preview)preview.setAttribute('icon',icon);}
        close();input.focus();
      };
      input.addEventListener('focus',open);
      input.addEventListener('input',()=>{
        if(previewId&&validMdi(input.value.trim())){const preview=root.querySelector('#'+previewId);if(preview)preview.setAttribute('icon',input.value.trim());}
        open();
      });
      input.addEventListener('keydown',ev=>{
        if(ev.key==='Escape'){close();return;}
        if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){
          if(menu.hidden)open();
          const buttons=[...menu.querySelectorAll('[data-pick-icon]')];
          if(!buttons.length)return;
          ev.preventDefault();
          const current=buttons.findIndex(b=>b.getAttribute('aria-selected')==='true');
          const next=(current+(ev.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
          buttons.forEach((b,i)=>b.setAttribute('aria-selected',String(i===next)));
          buttons[next].scrollIntoView?.({block:'nearest'});
        }
        if(ev.key==='Enter'&&!menu.hidden){
          const selected=menu.querySelector('[data-pick-icon][aria-selected="true"]');
          if(selected){ev.preventDefault();choose(selected.dataset.pickIcon);}
        }
      });
      menu.addEventListener('pointerdown',ev=>ev.preventDefault()); // keep focus while selecting
      menu.addEventListener('click',ev=>{
        const option=ev.target.closest('[data-pick-icon]');if(option)choose(option.dataset.pickIcon);
      });
      input.addEventListener('blur',()=>{ // permit click selection without losing focus
        if(!menu.matches(':hover'))close();
      });
    }
    _wire(){
      this.shadowRoot.querySelectorAll('[data-battery-soc-phase]').forEach(select=>
        select.addEventListener('change',()=>{
          const item=this._draft?.battery_sources?.[select.dataset.batterySocPhase]?.[Number(select.dataset.batterySocIndex)];
          if(item){item.soc_entity_id=select.value;this._markDirty();}
        }));
      if(this._pmSkipWire){this._pmSkipWire=false;return;}
      const root=this.shadowRoot;
      this._wireIconPicker('editIcon','editIconSuggestions','editIconPreview');
      this._wireIconPicker('manualIcon','manualIconSuggestions',null);
      for(const [nativeId,fallbackId,previewId] of [['editNativeIcon','editIcon','editIconPreview'],['manualNativeIcon','manualIcon',null]]){
        const native=root.querySelector('#'+nativeId), fallback=root.querySelector('#'+fallbackId);
        if(!native||!fallback)continue;
        native.addEventListener('value-changed',ev=>{
          const chosen=String(ev.detail?.value||native.value||'');
          if(validMdi(chosen)){
            fallback.value=chosen;
            if(previewId)root.querySelector('#'+previewId)?.setAttribute('icon',chosen);
          }
        });
      }
      const bind=(selector,event,fn)=>{const el=root.querySelector(selector);if(el)el.addEventListener(event,fn);};
      for(const [id,key] of [['mappedDevices','mapped'],['stillLearning','learning'],['addManualDevice','addManual'],['learningDiagnostics','diagnostics']]){
        bind('#'+id,'toggle',ev=>{this._sections[key]=ev.target.open;if(key==='learning'){try{window.localStorage?.setItem('ha_auto_device_phase_mapping.stillLearningExpanded',String(ev.target.open));}catch(_err){}}});
      }
      root.querySelectorAll('details[data-settings-section]').forEach(el=>el.addEventListener('toggle',()=>{
        const key=el.dataset.settingsSection;
        if(!Object.prototype.hasOwnProperty.call(this._settingsSections,key))return;
        this._settingsSections[key]=el.open;
        try{window.localStorage?.setItem('ha_auto_device_phase_mapping.settingsExpanded',JSON.stringify(this._settingsSections));}catch(_err){}
      }));
      root.querySelectorAll('[data-toggle-mapped]').forEach(el=>el.addEventListener('click',()=>{this._phaseMappedExpanded=!this._phaseMappedExpanded;try{window.localStorage?.setItem('ha_auto_device_phase_mapping.mappedExpanded',String(this._phaseMappedExpanded));}catch(_err){}this._render();}));
      bind('#menu','click',()=>this.dispatchEvent(new Event('hass-toggle-menu',{bubbles:true,composed:true})));
      root.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>{this._tab=el.dataset.tab;this._error='';this._message='';this._render();}));
      for(const [selector,key] of [['#mappingSearch','_filter'],['#learningSearch','_learningFilter'],['#excludeSearch','_excludeFilter'],['#nameTags','_nameTags']]){
        bind(selector,'input',ev=>{
          const position=ev.target.selectionStart;this[key]=ev.target.value;this._render();
          const refreshed=root.querySelector(selector);if(refreshed){refreshed.focus();refreshed.setSelectionRange(position,position);}
        });
      }
      bind('#refresh','click',()=>this._fetch(true));
      bind('#exportLearningDiagnostics','click',async()=>{
        if(!this._hass?.callWS)return;
        try{
          const payload=await this._hass.callWS({type:'ha_auto_device_phase_mapping/diagnostics'});
          const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
          const url=URL.createObjectURL(blob);
          const link=document.createElement('a');
          link.href=url;link.download='phase-mapper-learning-diagnostics-'+new Date().toISOString().slice(0,10)+'.json';
          document.body.appendChild(link);link.click();link.remove();
          setTimeout(()=>URL.revokeObjectURL(url),1000);
        }catch(error){this._message='Diagnostics export failed: '+String(error?.message||error);this._render();}
      });

      bind('#manualAdd','click',()=>{
        if(this._hass?.user?.is_admin===false||!this._draft)return;
        const name=root.querySelector('#manualName')?.value.trim()||'';
        const room=root.querySelector('#manualRoom')?.value.trim()||'';
        const phase=root.querySelector('#manualPhase')?.value||'L1';
        const native=root.querySelector('#manualNativeIcon');
        const icon=(customElements.get('ha-icon-picker')?native?.value:root.querySelector('#manualIcon')?.value)?.trim()||'mdi:power-plug';
        if(!validMdi(icon)){this._error='Select a valid Home Assistant icon (mdi:icon-name).';this._render();return;}
        if(!name||name.length>100||room.length>80||this._draft.manual_devices.length>=500){
          this._error='Enter a device name (1–100 characters), room (max 80), and keep below 500 manual devices.';this._render();return;
        }
        const id='manual_'+(globalThis.crypto?.randomUUID?.()||(''+Date.now()+'_'+Math.floor(Math.random()*1000000)));
        this._draft.manual_devices.push({id,name,room,phase,icon});
        this._message=`Added ${name} to ${phase}. Saving…`;
        this._markDirty();this._render();
      });
      root.querySelectorAll('[data-manual-phase]').forEach(el=>el.addEventListener('change',()=>{
        if(this._hass?.user?.is_admin===false)return;
        const item=this._draft.manual_devices.find(x=>x.id===el.dataset.manualPhase);
        if(!item)return;
        if(el.value==='__delete__'){
          if(window.confirm(`Delete manual appliance "${item.name}"? This does not affect Home Assistant entities.`)){
            this._draft.manual_devices=this._draft.manual_devices.filter(x=>x.id!==item.id);
            this._message=`Deleted ${item.name}. Saving…`;this._markDirty();
          }
          this._render();return;
        }
        if([...PHASES,'3-phase'].includes(el.value)){
          if(item.phase!==el.value){item.phase=el.value;this._message=`Moved ${item.name} to ${item.phase}. Saving…`;this._markDirty();}
          this._render();
        }else this._render();
      }));
      root.querySelectorAll('[data-manual-edit]').forEach(el=>el.addEventListener('click',ev=>{
        ev.stopPropagation();if(this._hass?.user?.is_admin===false)return;
        this._editor={kind:'manual',id:el.dataset.manualEdit};this._render();
      }));
      root.querySelectorAll('[data-timing-mode]').forEach(el=>el.addEventListener('change',()=>{
        const id=el.dataset.timingMode;
        if(el.value==='__reset_learning__'){
          const row=this._data?.devices?.find(r=>r.entity_id===id);
          // Do not inadvertently change Automatic/Slow/Fast when cancelling.
          el.value=this._draft?.timing_overrides?.[id]||'auto';
          if(this._hass?.user?.is_admin===false)return;
          this._resetDeviceTarget={id,name:this._draft?.display_names?.[id]||row?.name||id};
          this._render();return;
        }
        if(el.value==='auto')delete this._draft.timing_overrides[id];
        else this._draft.timing_overrides[id]=el.value;
        this._markDirty();
      }));
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
      root.querySelectorAll('select[data-phase]').forEach(el=>el.addEventListener('change',ev=>{
        // Only the actual Settings P1 selectors may edit phase_sensors.
        // Device dropdown events bubble through .group[data-phase] containers;
        // listening to all [data-phase] used to inject an 'undefined' phase
        // whose value was e.g. '__delete__', blocking EVERY subsequent save.
        const phase=ev.currentTarget.dataset.phase;
        if(!PHASES.includes(phase))return;
        this._draft.phase_sensors[phase]=ev.currentTarget.value;
        this._markDirty();
      }));
      bind('#showExcludedSettings','change',ev=>{this._showExcludedSettings=ev.target.checked;this._render();});
      const bulkAction=(restore)=>{
        if(!this._draft||this._hass?.user?.is_admin===false)return;
        const query=this._excludeFilter.trim().toLowerCase();
        const tags=this._nameTags.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
        const eligible=(this._data?.devices||[]).filter(row=>`${row.name} ${row.entity_id}`.toLowerCase().includes(query)&&
          (!tags.length||tags.some(t=>`${row.name} ${row.entity_id}`.toLowerCase().includes(t)))&&
          (restore?this._draft.excluded.has(row.entity_id):!this._draft.excluded.has(row.entity_id)));
        if(!eligible.length)return;
        if(!window.confirm(`${restore?'Restore':'Exclude'} ${eligible.length} matching power sensors?`))return;
        for(const row of eligible){if(restore)this._draft.excluded.delete(row.entity_id);else this._draft.excluded.add(row.entity_id);}
        this._markDirty();this._render();
      };
      bind('#bulkExclude','click',()=>bulkAction(false));
      bind('#bulkRestore','click',()=>bulkAction(true));
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
      root.querySelectorAll('[data-more]').forEach(el=>el.addEventListener('click',ev=>{if(!ev.target.closest('button,select,input'))this._moreInfo(el.dataset.more);}));
      root.querySelectorAll('[data-battery-rename]').forEach(el=>el.addEventListener('click',ev=>{
        ev.stopPropagation();if(this._hass?.user?.is_admin===false)return;
        const entityId=el.dataset.batteryRename;
        const source=this._hass?.states?.[entityId];
        const original=source?.attributes?.friendly_name||entityId;
        const current=this._draft.display_names[entityId]||original;
        const entered=window.prompt('Battery display name in Phase Mapper (blank restores original)',current);
        if(entered===null)return;
        if(entered.trim().length>100){this._error='Display name must be 100 characters or fewer.';this._render();return;}
        if(entered.trim())this._draft.display_names[entityId]=entered.trim();
        else delete this._draft.display_names[entityId];
        this._markDirty();this._render();
      }));
      root.querySelectorAll('[data-rename]').forEach(el=>el.addEventListener('click',ev=>{
        ev.stopPropagation();if(this._hass?.user?.is_admin===false)return;
        this._editor={kind:'sensor',id:el.dataset.rename};this._render();
      }));
      bind('#cancelDeviceEdit','click',()=>{this._editor=null;this._render();});
      bind('#saveDeviceEdit','click',()=>{
        if(!this._editor||this._hass?.user?.is_admin===false)return;
        const name=root.querySelector('#editName')?.value.trim()||'';
        const native=root.querySelector('#editNativeIcon');
        const icon=(customElements.get('ha-icon-picker')?native?.value:root.querySelector('#editIcon')?.value)?.trim()||'';
        if(!name||name.length>100||!validMdi(icon)){
          this._error='Choose a display name (1–100 characters) and a valid icon (mdi:icon-name).';this._render();return;
        }
        if(this._editor.kind==='manual'){
          const item=this._draft.manual_devices.find(x=>x.id===this._editor.id);
          const room=root.querySelector('#editRoom')?.value.trim()||'';
          if(!item||room.length>80){this._error='Room must be 80 characters or fewer.';this._render();return;}
          item.name=name;item.room=room;item.icon=icon;
        }else{
          const row=this._data?.devices?.find(x=>x.entity_id===this._editor.id);
          if(!row)return;
          if(name===row.name)delete this._draft.display_names[this._editor.id];
          else this._draft.display_names[this._editor.id]=name;
          const nativeIcon=this._hass?.states?.[this._editor.id]?.attributes?.icon||'mdi:power-plug';
          if(icon===nativeIcon)delete this._draft.display_icons[this._editor.id];
          else this._draft.display_icons[this._editor.id]=icon;
        }
        this._editor=null;this._message='Device appearance updated. Saving…';this._markDirty();this._render();
      });
      bind('#checkReleaseNow','click',()=>{void this._checkLatestRelease(true);});
      bind('#versionLink','click',()=>{this._versionDialog=true;this._render();});
      bind('#topVersionLink','click',()=>{this._versionDialog=true;this._render();});
      bind('#repositoryLink','click',()=>{this._versionDialog=true;this._render();});
      bind('#cancelVersionLink','click',()=>{this._versionDialog=false;this._render();});
      bind('#openVersionLink','click',()=>{this._versionDialog=false;});
      root.querySelectorAll('[data-entity]').forEach(el=>{
        el.addEventListener('click',ev=>{if(!ev.target.closest('select,button'))this._moreInfo(el.dataset.entity);});
        el.addEventListener('pointerdown',ev=>{this._lastPointerType=ev.pointerType;el.draggable=ev.pointerType==='mouse'&&this._mouseCapable()&&this._hass?.user?.is_admin!==false;});
        el.addEventListener('dragstart',ev=>{
          if(this._lastPointerType!=='mouse'||!this._mouseCapable()){ev.preventDefault();return;}
          this._dragging=true;ev.dataTransfer.setData('text/plain',el.dataset.entity);ev.dataTransfer.effectAllowed='move';
        });
        el.addEventListener('dragend',()=>{this._dragging=false;this._render();});
      });
      root.querySelectorAll('[data-assign]').forEach(el=>el.addEventListener('change',()=>this._assign(el.dataset.assign,el.value)));
      root.querySelectorAll('.group[data-phase]').forEach(el=>{
        el.addEventListener('dragover',ev=>{if(this._hass?.user?.is_admin===false||!this._mouseCapable()||this._lastPointerType!=='mouse')return;ev.preventDefault();el.classList.add('drop-target');});
        el.addEventListener('dragleave',()=>el.classList.remove('drop-target'));
        el.addEventListener('drop',ev=>{ev.preventDefault();this._dragging=false;el.classList.remove('drop-target');if(this._mouseCapable()&&this._lastPointerType==='mouse')this._assign(ev.dataTransfer.getData('text/plain'),el.dataset.phase==='Unknown'?'':el.dataset.phase);});
      });
      bind('#cancelDeviceReset','click',()=>{this._resetDeviceTarget=null;this._render();});
      bind('#confirmDeviceReset','click',()=>{void this._resetOneDevice();});
      bind('#retrySave','click',()=>this._scheduleAutosave(0));
      bind('#retrySaveMapping','click',()=>this._scheduleAutosave(0));
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
      if(!entityId||this._hass?.user?.is_admin===false||!this._draft)return;
      this._draft.excluded.add(entityId);
      this._message='Device excluded. Saving…';
      this._markDirty();this._render();
    }
    async _assign(entityId,phase){
      if(!entityId||this._hass?.user?.is_admin===false||!this._draft)return;
      if(phase==='__exclude__'){await this._excludeEntity(entityId);return;}
      if(phase && ![...PHASES,'3-phase'].includes(phase))return;
      if(phase)this._draft.manual_assignments[entityId]=phase;
      else delete this._draft.manual_assignments[entityId];
      this._message=phase?'Manual phase assignment saving…':'Automatic learning restored. Saving…';
      this._markDirty();this._render();
    }
    async _resetOneDevice(){
      const target=this._resetDeviceTarget;
      if(!target||!this._hass?.callWS||this._hass?.user?.is_admin===false)return;
      // A per-device reset must never overtake an unsaved editing transaction.
      if(this._busy){this._error='Settings are still saving. Retry reset after saving completes.';this._render();return;}
      if(this._dirty){
        await this._autosave();
        if(this._busy||this._dirty||this._saveState!=='saved'){
          this._error='Save pending settings before resetting this device.';this._render();return;
        }
      }
      this._busy=true;this._error='';
      try{
        const result=await this._hass.callWS({type:'ha_auto_device_phase_mapping/set',reset_device:target.id});
        if(!result?.settings||!result?.devices)throw new Error('Home Assistant did not confirm the reset.');
        this._serverRevision++;
        this._data=result;this._resetDraft();
        this._resetDeviceTarget=null;
        this._message=`Learning reset for ${target.name}. This device is starting from zero evidence.`;
      }catch(error){this._error=error?.message||String(error);}
      finally{this._busy=false;this._render();}
    }
    async _save(reset){
      if(this._busy||!this._hass?.callWS)return;
      if(this._dirty){
        await this._autosave();
        if(this._dirty||this._saveState==='error')return;
      }
      this._busy=true;this._error='';this._message='';this._render();
      try{
        // This command resets learning only; it must not resend and validate
        // stale battery/PV/P1 sources or overwrite unrelated settings.
        const updated=await this._hass.callWS({type:'ha_auto_device_phase_mapping/set',reset:!!reset});
        if(!updated?.settings)throw new Error('Home Assistant did not confirm the reset.');
        this._serverRevision++;
        this._data=updated;this._resetDraft();this._lastFetch=Date.now();
        this._message=reset?'All automatic learning evidence reset.':'Settings saved.';
      }catch(error){this._error=error?.message||String(error);}
      finally{this._busy=false;this._render();}
    }

  }


  class PhaseMapperCardEditor extends HTMLElement {
    setConfig(config){this._config=config||{};this._render();}
    connectedCallback(){this._render();}
    _render(){
      this.innerHTML='<div style="padding:12px 0"><label for="pm-card-view">Card layout</label><select id="pm-card-view" style="display:block;width:100%;padding:10px;margin-top:8px"><option value="compact">Compact phase overview</option><option value="detailed">Detailed device list</option></select></div>';
      const select=this.querySelector('#pm-card-view');
      select.value=this._config?.view==='detailed'?'detailed':'compact';
      select.addEventListener('change',()=>{
        this._config={...this._config,view:select.value};
        this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:this._config},bubbles:true,composed:true}));
      });
    }
  }
  if(!customElements.get('phase-mapper-card-editor'))customElements.define('phase-mapper-card-editor',PhaseMapperCardEditor);
  if(!customElements.get('phase-mapper-card'))customElements.define('phase-mapper-card',PhaseMapperView);
  if(!customElements.get('phase-mapper-panel'))customElements.define('phase-mapper-panel',class extends PhaseMapperView {});
  window.customCards=window.customCards||[];
  if(!window.customCards.some(card=>card.type==='phase-mapper-card')){
    window.customCards.push({type:'phase-mapper-card',name:'HA_auto_device_phase_mapping',description:'Passive L1/L2/L3 discovery; Mapping, Settings, and Info tabs',preview:false});
  }
  console.info(`%c HA_auto_device_phase_mapping %c v${VERSION} `,'background:#3777bd;color:#fff;font-weight:bold','background:#ddd;color:#111');
})();
