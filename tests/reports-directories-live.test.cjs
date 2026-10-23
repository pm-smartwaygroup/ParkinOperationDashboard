'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const adapter=fs.readFileSync(path.join(__dirname,'../js/reports-directories-api.js'),'utf8');
const report=fs.readFileSync(path.join(__dirname,'../js/reports.js'),'utf8');
const loader=fs.readFileSync(path.join(__dirname,'../script.js'),'utf8');
const stamp='2026-10-22T08:00:00.000Z';
const record=(id,more={})=>({id,createdAt:stamp,...more});
const wrap=payload=>({ok:true,status:200,json:async()=>({success:true,data:payload})});
const boot=(fetchImpl)=>{const window={};vm.runInNewContext(adapter,{window,fetch:fetchImpl,Intl,Date,Number,Set,Map,URL,Error,Promise});return window.ParkinDirectoryReportAPI;};
const params=(kind)=>({kind,apiBaseUrl:'http://127.0.0.1:3001',token:'local-token'});
test('directory adapter loads before Reports UI, preserving the existing Bookings adapter',()=>{
  assert.ok(loader.indexOf('/js/reports-bookings-api.js')<loader.indexOf('/js/reports-directories-api.js'));
  assert.ok(loader.indexOf('/js/reports-directories-api.js')<loader.indexOf('/js/reports.js'));
});
test('locations report loads every authorized server page without inventing booking totals',async()=>{
  const urls=[];let count=0;
  const api=boot(async(url,options)=>{urls.push(url);assert.equal(options.headers.Authorization,'Bearer local-token');const page=++count;const size=page===1?100:1;
    return wrap({items:Array.from({length:size},(_,i)=>record(`loc-${page}-${i}`,{name:'Test Location',city:'Riyadh',capacity:40,status:'ACTIVE'})),meta:{page,limit:100,total:101,totalPages:2}});
  });
  const rows=await api.fetchAll(params('locations'));
  assert.equal(rows.length,101);assert.equal(rows[0].location,'Test Location');assert.equal(rows[0].capacity,40);assert.ok(!('bookings' in rows[0]));assert.ok(!('amount' in rows[0]));assert.match(urls[1],/page=2&limit=100/);
});
test('customers report safely supports genuinely empty NestJS paginated responses',async()=>{
  const api=boot(async()=>wrap({customers:[],pagination:{page:1,limit:100,total:0,totalPages:0}}));
  assert.equal((await api.fetchAll(params('customers'))).length,0);
});
test('vehicle report uses the real unpaginated vehicle API and mapped plate classification',async()=>{
  const api=boot(async(url)=>{assert.equal(url,'http://127.0.0.1:3001/vehicles');return wrap({items:[record('v1',{make:'Toyota',model:'Camry',plateDisplayEnglish:'123 ABC',parkingTypeLabel:'Valet Parking',status:'ACTIVE'})],total:1});});
  const rows=await api.fetchAll(params('vehicles'));
  assert.equal(rows[0].vehicle,'Toyota Camry');assert.equal(rows[0].plate,'123 ABC');assert.equal(rows[0].parkingType,'Valet Parking');
});
test('companies report only shows actual company service counts returned by the API',async()=>{
  const api=boot(async()=>wrap({items:[record('company-1',{name:'Demo Company',activeDrivers:3,assignedLocations:2,totalCustomers:5})],meta:{page:1,limit:100,total:1,totalPages:1}}));
  const rows=await api.fetchAll(params('companies'));
  assert.equal(rows[0].drivers,3);assert.equal(rows[0].locations,2);assert.equal(rows[0].customers,5);assert.ok(!('revenue' in rows[0]));
});
test('the server decides scope and 401/403 cannot silently turn into an empty report',async()=>{
  for(const status of [401,403]){
    const api=boot(async()=>({ok:false,status}));
    await assert.rejects(()=>api.fetchAll(params('customers')),status===403?/Access denied/:/Session expired/);
  }
});
test('pagination drift, truncated data, duplicate IDs and incorrect counts all fail closed',async()=>{
  const responses=[
    [{items:[record('l1')],meta:{page:1,limit:100,total:2,totalPages:1}}],
    [{items:[record('l1'),record('l1')],meta:{page:1,limit:100,total:2,totalPages:1}}],
    [{items:[record('l1')],meta:{page:1,limit:100,total:10001,totalPages:101}}],
    [{items:[],meta:{page:99,limit:100,total:0,totalPages:0}}],
  ];
  for(const series of responses){const api=boot(async()=>wrap(series[0]));await assert.rejects(()=>api.fetchAll(params('locations')));}
});
test('invalid record timestamps are rejected instead of assigning fabricated dates',async()=>{
  const api=boot(async()=>wrap({items:[{id:'v1'}],total:1}));
  await assert.rejects(()=>api.fetchAll(params('vehicles')), /creation timestamp/);
});
test('six source-backed directory tabs are live, while Revenue remains pending',()=>{
  assert.match(report,/DIRECTORY_CATEGORIES = new Set\(\['locations','customers','vehicles','companies','drivers','users'\]\)/);
  assert.match(report,/PENDING_CATEGORIES = new Set\(\['revenue'\]\)/);
  assert.doesNotMatch(report,/makeBookings|const BOOKINGS|Visible sample users/);
  assert.match(report,/buildDirectoryPrintDocument/);
  assert.match(report,/csvCell\(cellValue\(row,col.key\)\)/);
});
test('directory reporting dates filter creation timestamps to the minute in Saudi time',()=>{
  const snippet=report.slice(report.indexOf('  function getReportRows(filtered) {'),report.indexOf('  function summary(rows, bookings) {'));
  const state={type:'customers',liveType:'customers',liveStatus:'ready',applied:{from:'2026-10-22T10:59',to:'2026-10-22T11:00'},liveRows:[
    {id:'older',date:'2026-10-22',time:'10:58'},{id:'boundary',date:'2026-10-22',time:'11:00'},{id:'later',date:'2026-10-22',time:'11:01'}
  ]};
  const ctx={state,DIRECTORY_CATEGORIES:new Set(['locations','customers','vehicles','companies'])};
  vm.runInNewContext(snippet,ctx);
  assert.deepEqual(ctx.getReportRows([]).map(r=>r.id).join(','),'boundary');
  state.liveType='bookings';assert.equal(ctx.getReportRows([]).length,0);
  state.liveType='customers';state.liveStatus='error';assert.equal(ctx.getReportRows([]).length,0);
});
test('directory PDF uses the actual embedded ParkIn wordmark and escapes untrusted fields',()=>{
  const snippet=report.slice(report.indexOf('  function buildDirectoryPrintDocument('),report.indexOf('  function printRecordsOnly()'));
  const html=val=>String(val??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state={applied:{from:'2026-10-01T00:00',to:'2026-10-22T23:59'}};
  const ctx={state,html,category:()=>({name:'Customers Report'}),cellValue:(row,key)=>row[key]??'—'};
  vm.runInNewContext(snippet,ctx);
  const pdf=ctx.buildDirectoryPrintDocument([{id:'1',customer:'<script>evil</script>',date:'2026-10-22',time:'10:30'}],[{key:'customer',label:'Customer'},{key:'date',label:'Created'}]);
  assert.match(pdf,/data:image\/png;base64,/);
  assert.match(pdf,/alt="ParkIn company logo"/);
  assert.match(pdf,/&lt;script&gt;evil&lt;\/script&gt;/);
  assert.doesNotMatch(pdf,/<script>evil<\/script>|sample data|Total Recorded Amount|Revenue Generated/);
  assert.match(pdf,/Created.*AST/);
});
