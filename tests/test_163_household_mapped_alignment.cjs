'use strict';
const fs=require('node:fs');const assert=require('node:assert/strict');
const source=fs.readFileSync('custom_components/ha_auto_device_phase_mapping/frontend/phase-mapper.js','utf8');
assert.match(source,/@container \(max-width:345px\)\{\s*\.phasebox\.total \.pm-coverage-panel\{display:none\}/,
  'Hide the coverage breakdown when the household ring stacks');
assert.match(source,/\.phasebox\.total \.pm-household-graphic\.pm-aligned\{[^}]*flex:0 0 auto!important/,
  'Freeze calculated height rather than allow flex stretch');
assert.match(source,/_pmAlignHouseholdMapped\(\)\{[\s\S]*?\.phasebox\.l1 \.mapped-device-card/,
  'Use L1 mapped summary as alignment reference');
assert.match(source,/const target=reference\.getBoundingClientRect\(\)\.top/);
assert.match(source,/const desired=Math\.max\(natural,Math\.round\(target-graphicTop-marginBottom\)\)/);
assert.match(source,/this\._pmResizeObserver=new ResizeObserver/);
assert.match(source,/graphic\.classList\.remove\('pm-aligned'\);graphic\.style\.removeProperty\('height'\);return;/,
  'Return to natural heights on one- or two-column layouts');
console.log('Household mapped alignment, expanded-list behavior and breakpoint contracts passed');
