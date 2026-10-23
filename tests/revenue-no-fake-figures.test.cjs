'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const source=read('js/revenue.js');
const markup=read('pages/revenue.html');
const reports=read('js/reports.js');
test('revenue route retains its public loader without rendering static demo charts or amounts',()=>{
  assert.match(source,/async function loadRevenuePage\(\)/);
  assert.match(source,/window\.loadRevenuePage = loadRevenuePage/);
  assert.match(source,/fetch\('\/pages\/revenue\.html'/);
  assert.doesNotMatch(source, /const revenueOverviewData|const revenueLocationData|const paymentMethodData|new Chart\(/);
  assert.doesNotMatch(markup, /<canvas|SAR\s+[\d,.]+|Export CSV|Generate Report/);
  assert.match(markup,/Verified revenue integration pending/);
});
test('Revenue does not conflate booked amounts with settled transactions',()=>{
  assert.match(markup,/not confirmation that a payment was collected/);
  assert.match(markup,/authorized payment data source/);
  assert.match(reports,/PENDING_CATEGORIES = new Set\(\['revenue'\]\)/);
});
test('unavailable Revenue markup fails closed and does not claim records were loaded',()=>{
  assert.match(source,/response\.ok/);
  assert.match(source,/role', 'alert'/);
  assert.match(source,/container\.dataset\.loaded = 'false'/);
  assert.doesNotMatch(source,/fetch\(.*\/bookings/);
});
