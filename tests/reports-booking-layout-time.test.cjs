'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'js/reports.js'),'utf8');
const page=fs.readFileSync(path.join(root,'pages/reports.html'),'utf8');
const apiText=fs.readFileSync(path.join(root,'js/reports-bookings-api.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css/reports.css'),'utf8');
const reportScope=app.slice(app.indexOf('  function getReportRows(filtered) {'),app.indexOf('  function summary(rows, bookings) {'));
const sample={id:'BK-1',date:'2026-10-21',time:'09:27',companyId:'c1',locationId:'l1',company:'c1',location:'ParkIn',type:'Valet Parking',source:'Customer App',status:'Completed',paymentMethod:'Cash'};
const getScope=({rows=[sample],filters={}}={})=>{
  const state={type:'bookings',liveRows:rows,applied:{from:'2026-10-21T09:27',to:'2026-10-21T09:27',company:'',location:'',type:'',status:'',source:'',paymentMethod:'',...filters}};
  const ctx={state};vm.runInNewContext(reportScope,ctx);return {ctx,state};
};

test('real booking AST date/time bounds are minute-accurate and inclusive',()=>{
  const rows=[{...sample,id:'before',time:'09:26'},{...sample,id:'exact',time:'09:27'},{...sample,id:'after',time:'09:28'},
    {...sample,id:'yesterday',date:'2026-10-20',time:'23:59'}];
  const {ctx}=getScope({rows});
  assert.deepEqual(ctx.filteredBookings().map(row=>row.id),['exact']);
});

test('legacy date-only saved filters still include entire final day',()=>{
  const rows=[{...sample,time:'00:01'},{...sample,id:'late',time:'23:59'}];
  const {ctx}=getScope({rows,filters:{from:'2026-10-21',to:'2026-10-21'}});
  assert.deepEqual(ctx.filteredBookings().map(row=>row.id),['BK-1','late']);
});

test('payment method is filtered from actual API value, not booking status or source',()=>{
  const rows=[sample,{...sample,id:'card',paymentMethod:'Credit Card'},{...sample,id:'unset',paymentMethod:'Not recorded'}];
  const {ctx,state}=getScope({rows,filters:{paymentMethod:'Credit Card'}});
  assert.deepEqual(ctx.filteredBookings().map(row=>row.id),['card']);
  state.applied.company='not-authorized';assert.equal(ctx.filteredBookings().length,0);
});

test('date-and-time boundaries are valid and enforce start before finish',()=>{
  const snippet=app.slice(app.indexOf('  function applyFilters(next) {'),app.indexOf('  function displayRows() {'));
  const feedback=[];const state={filters:{},applied:{},page:2,selected:new Set(['BK-1'])};
  const ctx={state,filterClock:(value,end)=> /^\d{4}-\d{2}-\d{2}$/.test(value)?`${value}T${end?'23:59':'00:00'}`:value,
    showFeedback:s=>feedback.push(s),renderAll:()=>{}};
  vm.runInNewContext(snippet,ctx);
  assert.equal(ctx.applyFilters({from:'2026-10-21T14:30',to:'2026-10-21T14:29'}),false);
  assert.match(feedback.pop(),/including time/);
  assert.equal(ctx.applyFilters({from:'2026-10-21T14:29',to:'2026-10-21T14:30'}),true);
  assert.equal(state.page,1);assert.equal(state.selected.size,0);
});

test('booking row renders actual payment method but never invents settlement or shift',()=>{
  const code=app.slice(app.indexOf('  function isStatus(key)'),app.indexOf('  // An empty *authorized'))
    +app.slice(app.indexOf('  function bookingTableCell(row,col)'),app.indexOf('  function renderPageNumbers('));
  const ctx={html:value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;'),formatCurrency:value=>`SAR ${value}`};
  vm.runInNewContext(code,ctx);
  const method=ctx.bookingTableCell(sample,{key:'paymentMethod'});
  assert.match(method,/Cash/);
  assert.match(ctx.bookingTableCell(sample,{key:'shiftTime'}),/Shift not recorded/);
  assert.match(ctx.bookingTableCell(sample,{key:'paymentStatus'}),/Not available/);
  const evil={...sample,paymentMethod:'<script>bad</script>'};
  assert.doesNotMatch(ctx.bookingTableCell(evil,{key:'paymentMethod'}),/<script>/);
});

test('backend-sourced payment method is optional and payment status remains unknown',()=>{
  const sandbox={window:{}};
  vm.runInNewContext(apiText,sandbox);
  const base={id:'1',createdAt:'2026-10-21T06:27:00Z',source:'CUSTOMER_APP',status:'CONFIRMED',customer:{},vehicle:{},location:{}};
  const paid=sandbox.window.ParkinBookingReportAPI.normalizeBooking({...base,paymentMethod:'Cash'});
  assert.equal(paid.paymentMethod,'Cash');assert.equal(paid.paymentStatus,null);assert.equal(paid.shiftCode,null);
  assert.equal(paid.date,'2026-10-21');assert.equal(paid.time,'09:27');
  assert.equal(sandbox.window.ParkinBookingReportAPI.normalizeBooking(base).paymentMethod,'Not recorded');
});

test('filters display AST datetime controls and unsupported business-only filters are disabled',()=>{
  assert.match(page,/id="pr-from"[^>]*type="datetime-local"/);
  assert.match(page,/id="pr-to"[^>]*type="datetime-local"/);
  for(const id of ['pr-payment-method','pr-group-by','pr-source','pr-status','pr-company','pr-location','pr-type']){
    assert.ok(page.includes(`id="${id}"`),id);
  }
  for(const id of ['pr-role','pr-shift','pr-payment-status'])assert.match(page,new RegExp(`id="${id}" disabled`));
  for(const field of ['paymentMethod','groupBy'])assert.ok(app.includes(`'${field}'`));
  assert.match(css,/\.pr-value-chip/);assert.match(css,/\.pr-filter-note/);
});

test('new table has requested columns, pagination and keeps existing exports isolated',()=>{
  for(const field of ['shiftTime','paymentMethod','paymentStatus','date','type','location','driver','source'])
    assert.match(app,new RegExp(`key:'${field}'`));
  for(const data of ['data-page-size','data-page-numbers','data-page-prev','data-page-next'])assert.ok(page.includes(data));
  assert.match(app,/const cols = PRINT_COLUMNS\.filter\(col => !state\.hiddenColumns\.has\(col\.key\)\);/);
  assert.match(app,/rowsForExport\(\)/);
  assert.match(app,/window\.hasDashboardPermission/);
});
