'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../js/reports.js'), 'utf8');
const html = fs.readFileSync(path.resolve(__dirname, '../pages/reports.html'), 'utf8');
const updater = source.slice(source.indexOf('  function updateBookingEmptyState('), source.indexOf('  function viewAllAuthorizedBookings()'));
const clearer = source.slice(source.indexOf('  function viewAllAuthorizedBookings()'), source.indexOf('  function renderTable(rows)'));
const hiddenSections = ['.pr-overview-header', '[data-kpis]', '.pr-chart-grid', '.pr-table-toolbar', '.pr-table-scroll', '.pr-table-footer'];

function harness({type='bookings', liveStatus='ready', liveRows=[], perms=[]}={}) {
  const els = new Map();
  const element = selector => {
    if(!els.has(selector)) els.set(selector, {hidden:false, textContent:'', value:''});
    return els.get(selector);
  };
  const state = {type,liveStatus,liveRows,search:'test',filters:null};
  const allowed = new Set(perms);
  let closed = 0, filtered = null;
  const context = {state,qs:element,hasReportPermission:code=>allowed.has(code),closeMenus:()=>closed++,defaultFilters:()=>({from:'2026-10-01',to:'2026-10-19',type:'',company:'',location:'',source:'',status:''}),populateFilters:()=>{},applyFilters:next=>{filtered=next;return true;},showFeedback:()=>{}};
  vm.runInNewContext(`${updater}\n${clearer}`, context);
  return {element,state,allowed,update:rows=>context.updateBookingEmptyState(rows),clear:()=>context.viewAllAuthorizedBookings(),getClosed:()=>closed,getFiltered:()=>filtered};
}

test('verified zero bookings hides the overview, charts, and normal table',()=>{
  const ui=harness();ui.update([]);
  assert.equal(ui.element('[data-bookings-empty]').hidden,false);
  for(const selector of hiddenSections) assert.equal(ui.element(selector).hidden,true,selector);
  assert.match(ui.element('[data-empty-description]').textContent,/permitted company and location/);
  assert.equal(ui.element('[data-empty-clear-filters]').hidden,true);
});

test('visible bookings restore all sections and hide the empty illustration',()=>{
  const ui=harness({liveRows:[{date:'2026-10-07'}]});ui.update([]);ui.update([{date:'2026-10-07'}]);
  assert.equal(ui.element('[data-bookings-empty]').hidden,true);
  for(const selector of hiddenSections) assert.equal(ui.element(selector).hidden,false,selector);
});

test('zero matches with existing authorized bookings offers View All',()=>{
  const ui=harness({liveRows:[{date:'2026-10-07'},{date:'2026-10-08'}]});ui.update([]);
  assert.equal(ui.element('[data-empty-clear-filters]').hidden,false);
  assert.match(ui.element('[data-empty-description]').textContent,/filters or search/);
  ui.clear();
  assert.equal(ui.getFiltered().from,'2026-10-07');
  assert.equal(ui.getFiltered().to,'2026-10-08');
  assert.equal(ui.state.search,'');
});

test('booking creation action only appears when the account can view customers AND create bookings',()=>{
  const none=harness({perms:['bookings.view']});none.update([]);
  assert.equal(none.element('[data-empty-add-booking]').hidden,true);
  const missingCustomer=harness({perms:['bookings.create']});missingCustomer.update([]);
  assert.equal(missingCustomer.element('[data-empty-add-booking]').hidden,true);
  const creator=harness({perms:['bookings.create','customers.view']});creator.update([]);
  assert.equal(creator.element('[data-empty-add-booking]').hidden,false);
  assert.equal(creator.element('[data-empty-hint]').hidden,false);
});

test('loading and failed API requests must not display a false no-bookings message',()=>{
  for(const liveStatus of ['idle','loading','error']){
    const ui=harness({liveStatus});ui.update([]);
    assert.equal(ui.element('[data-bookings-empty]').hidden,true,liveStatus);
    assert.equal(ui.element('.pr-overview-header').hidden,false,liveStatus);
  }
});

test('other sample report categories never use the Bookings empty state',()=>{
  const ui=harness({type:'locations'});ui.update([]);
  assert.equal(ui.element('[data-bookings-empty]').hidden,true);
});

test('empty state markup includes a real local image and no invented booking route',()=>{
  assert.match(html,/data-bookings-empty hidden/);
  assert.match(html,/assets\/illustrations\/reports-no-bookings\.png/);
  assert.match(source,/window\.location\.hash='#customers'/);
  assert.doesNotMatch(source,/#bookings\/add/);
  assert.ok(fs.statSync(path.resolve(__dirname, '../assets/illustrations/reports-no-bookings.png')).size>1000);
});
