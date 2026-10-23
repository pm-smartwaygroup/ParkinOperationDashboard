'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../js/reports.js'),'utf8');
const page = fs.readFileSync(path.join(__dirname,'../pages/reports.html'),'utf8');
const styles = fs.readFileSync(path.join(__dirname,'../css/reports.css'),'utf8');
const pendingCategories = ['revenue'];
const DIRECTORY_CATEGORIES = new Set(['locations','customers','vehicles','companies','drivers','users']);
function extract(from,to) {
  const start=source.indexOf(from),end=source.indexOf(to,start);
  assert.ok(start>=0 && end>start,`Could not extract ${from}..${to}`);
  return source.slice(start,end);
}
const scopeFns = extract('  function getReportRows(filtered) {','  function summary(rows, bookings) {');
const renderFn = extract('  function renderAll(){','  function switchCategory(id){');
const exportFn = extract('  function exportAction(id){','  function showDetails(id){');

test('no generated bookings, synthetic users, or mock operational values ship to production', () => {
  assert.doesNotMatch(source, /makeBookings|const BOOKINGS|const USERS|Visible sample users|const CUSTOMERS = \[|const LOCATIONS = \[|const COMPANIES = \[/);
  assert.match(page,/data-report-pending hidden/);
  assert.match(styles,/\.pr-release-pending/);
});

test('unintegrated revenue report never treats booking rows as payment records', () => {
  const row={date:'2026-10-20',companyId:'company-a',locationId:'location-a',source:'Customer App',status:'Confirmed',type:'Valet Parking',id:'BK-1'};
  const f={from:'2026-10-01',to:'2026-10-21',company:'',location:'',source:'',status:'',type:''};
  for(const type of pendingCategories){
    const ctx={state:{type,liveRows:[row],applied:f},DIRECTORY_CATEGORIES};
    vm.runInNewContext(scopeFns,ctx);
    assert.equal(ctx.filteredBookings().length,0,type);
    assert.equal(ctx.getReportRows([row]).length,0,type);
  }
});

test('live booking filters still use company and location ID, not display text',()=>{
  const row={date:'2026-10-20',companyId:'c1',company:'c1',locationId:'l1',location:'Riyadh Boulevard',source:'Customer App',status:'Confirmed',type:'Valet Parking'};
  const ctx={state:{type:'bookings',liveRows:[row],applied:{from:'2026-10-01',to:'2026-10-21',company:'c1',location:'l1',source:'',status:'',type:''}}};
  vm.runInNewContext(scopeFns,ctx);
  assert.equal(ctx.filteredBookings().length,1);
  ctx.state.applied.location='Riyadh Boulevard';
  assert.equal(ctx.filteredBookings().length,0);
  ctx.state.applied.location='l1';ctx.state.applied.company='c2';
  assert.equal(ctx.filteredBookings().length,0);
});

function rendering(type){
  const state={type,viewRecords:[{id:'old'}],filteredBookings:[{id:'old'}],selected:new Set(['old']),liveStatus:'ready'};
  const els=new Map(); const touched=[];
  function qs(selector){if(!els.has(selector))els.set(selector,{hidden:false});return els.get(selector);}
  const ctx={state,qs,DIRECTORY_CATEGORIES,renderTabs:()=>touched.push('tabs'),displayRows:()=>[{id:'actual'}],
    renderKpis:()=>touched.push('kpis'),renderCharts:()=>touched.push('charts'),renderTable:()=>touched.push('table'),renderColumnMenu:()=>touched.push('columns'),getReportRows:()=>[],};
  vm.runInNewContext(renderFn,ctx);
  return {ctx,state,qs,touched};
}

test('each unfinished category hides overview, controls, charts and table, displaying only pending message',()=>{
  for(const type of pendingCategories){
    const ui=rendering(type);ui.ctx.renderAll();
    assert.equal(ui.qs('[data-report-pending]').hidden,false,type);
    for(const selector of ['.pr-filters','.pr-overview-header','[data-kpis]','.pr-chart-grid','.pr-table-panel']){
      assert.equal(ui.qs(selector).hidden,true,`${type}: ${selector}`);
    }
    assert.deepEqual(ui.touched,['tabs']);
    assert.equal(ui.state.viewRecords.length,0);
    assert.equal(ui.state.filteredBookings.length,0);
    assert.equal(ui.state.selected.size,0);
  }
});

test('returning to Bookings restores all report sections and live renderer',()=>{
  const ui=rendering('revenue');ui.ctx.renderAll();ui.state.type='bookings';ui.ctx.renderAll();
  assert.equal(ui.qs('[data-report-pending]').hidden,true);
  for(const selector of ['.pr-filters','.pr-overview-header','[data-kpis]','.pr-chart-grid','.pr-table-panel']){
    assert.equal(ui.qs(selector).hidden,false,selector);
  }
  assert.deepEqual(ui.touched,['tabs','tabs','kpis','charts','table','columns']);
});

test('direct export events cannot generate fake revenue records',()=>{
  for(const type of pendingCategories){
    const feedback=[],actions=[];
    const ctx={state:{type,liveStatus:'ready'},DIRECTORY_CATEGORIES,closeMenus:()=>{},showFeedback:msg=>feedback.push(msg),downloadCSV:()=>actions.push('csv'),printRecordsOnly:()=>actions.push('pdf'),composeEmail:()=>actions.push('email')};
    vm.runInNewContext(exportFn,ctx);
    for(const choice of ['csv','pdf','email','schedule'])ctx.exportAction(choice);
    assert.equal(actions.length,0,type);
    assert.equal(feedback.length,4,type);
    assert.ok(feedback.every(msg=>msg.includes('No export was generated')),type);
  }
});

test('export is also blocked for incomplete/error booking fetches',()=>{
  for(const liveStatus of ['idle','loading','error']){
    const feedback=[],actions=[];
    const ctx={state:{type:'bookings',liveStatus},DIRECTORY_CATEGORIES,closeMenus:()=>{},showFeedback:msg=>feedback.push(msg),downloadCSV:()=>actions.push('csv'),printRecordsOnly:()=>actions.push('pdf'),composeEmail:()=>actions.push('email')};
    vm.runInNewContext(exportFn,ctx);
    ctx.exportAction('pdf');
    assert.equal(actions.length,0);
    assert.match(feedback[0],/have not loaded/);
  }
});
