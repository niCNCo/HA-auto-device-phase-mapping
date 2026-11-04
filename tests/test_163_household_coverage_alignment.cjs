const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const js = fs.readFileSync(path.join(__dirname,'../custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js'),'utf8');
assert.match(js,/\.phasebox\.total \.phase-devices\{margin-top:0\}/);
assert.match(js,/\.phasebox\.total \.mapped-device-card\{margin-top:0\}/);
assert.match(js,/@container \(min-width:355px\)\{[\s\S]*?\.phasebox\.total \.pm-ring-wrap\{grid-template-columns:minmax\(0,1\.35fr\) minmax\(0,1fr\)\}/);
assert.match(js,/@container \(max-width:320px\)/);
console.log('Household coverage alignment and ring sizing CSS contracts passed');
