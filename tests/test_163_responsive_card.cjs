'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
assert.match(js,/\.pm-compact-wrap\{container-type:inline-size/);
assert.match(js,/@container \(max-width:860px\)/);
assert.match(js,/@container \(max-width:740px\)/);
assert.match(js,/@container \(max-width:480px\)/);
assert.match(js,/@container \(max-width:345px\)/);
assert.match(js,/\.pm-compact-phase\.pm-total \.pm-coverage-item\{display:grid/);
assert.match(js,/\.pm-compact-phase\.pm-total \.pm-source-row\{display:grid/);
assert.match(js,/\.pm-compact-phase\.pm-total \.pm-ring-center strong/);
console.log('Responsive compact card CSS contracts passed');

assert.match(js,/repeat\(3,minmax\(0,1fr\)\) minmax\(0,2fr\)/);
assert.match(js,/\.pm-compact-phase\.pm-total \.pm-ring-wrap\{display:contents\}/);
