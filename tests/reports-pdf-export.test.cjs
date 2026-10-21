'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../js/reports.js'),'utf8');
const page = fs.readFileSync(path.join(__dirname,'../pages/reports.html'),'utf8');
const exportsCode = source.slice(source.indexOf('  function rowsForExport()'),source.indexOf('  function downloadCSV()'));
const rows = Array.from({length:24},(_,i) => ({
  id:`BK-2026-10-${String(i+1).padStart(2,'0')}`,date:'2026-10-08',time:'09:40',
  customer:i===0?'<script>unsafe</script>':`Customer ${i+1}`,
  phone:'+966 50 123 4567',vehicle:`Sedan ${i+1}`,plate:`ABC${i+1}`,
  type:'Valet Parking',location:'Riyadh',driver:'Not recorded',
  amount:40+i,status:'Confirmed',source:'Customer App'
}));
function harness({selected=[],records=rows,liveStatus='ready',type='bookings',hiddenColumns=[],profile='Operations Manager'}={}){
  const state={type,selected:new Set(selected),viewRecords:records,liveStatus,
    hiddenColumns:new Set(hiddenColumns),applied:{from:'2026-10-01',to:'2026-10-19',type:'',company:'',location:'',source:'',status:''},
    companyNames:new Map(),locationNames:new Map()};
  const cols=[{key:'id',label:'Booking ID'},{key:'date',label:'Booking Date'},{key:'customer',label:'Customer'},
    {key:'vehicle',label:'Vehicle'},{key:'type',label:'Vehicle Parking Type'},{key:'location',label:'Location / Zone'},
    {key:'driver',label:'Driver'},{key:'amount',label:'Amount'},{key:'status',label:'Status'},{key:'source',label:'Source'}];
  const printed=[];const events=[];const feedback=[];
  const document={body:{appendChild(frame){frame.isAppended=true;frame.onload();}},createElement(name){
    assert.equal(name,'iframe');
    const frame={style:{},removed:false,printCalled:false,setAttribute(){},remove(){this.removed=true;},
      contentWindow:{focus(){},addEventListener(name){events.push(name);},print(){frame.printCalled=true;printed.push(frame.srcdoc);}}};
    return frame;
  }};
  const context={state,document,setTimeout:()=>123,clearTimeout:()=>{},
    window:{localStorage:{getItem:()=>JSON.stringify({name:profile})}},
    today:()=>new Date('2026-10-19T10:00:00Z'),
    html:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    shortDate:x=>x,cellValue:(r,key)=>key==='amount'&&r.amount!==null?`SAR ${r.amount}`:r[key]??'—',
    recordId:r=>r.id,category:()=>({name:'Bookings Report'}),PRINT_COLUMNS:cols,COLUMN_MAP:{bookings:cols,locations:cols},
    showFeedback:(msg,success)=>feedback.push({msg,success})};
  vm.runInNewContext(exportsCode,context);
  return {context,printed,feedback,events};
}
const render=options=>{const h=harness(options);h.context.printRecordsOnly();return h.printed[0];};
const pageCount=doc=>(doc.match(/<section class="pdf-page"/g)||[]).length;

test('prints ONLY selected bookings across table pages; excludes dashboard analytics',()=>{
  const doc=render({selected:['BK-2026-10-03','BK-2026-10-19']});
  assert.match(doc,/Selected records/);
  assert.match(doc,/<small>Total Records<\/small><strong>2<\/strong>/);
  assert.match(doc,/BK-2026-10-03/);
  assert.match(doc,/BK-2026-10-19/);
  assert.doesNotMatch(doc,/BK-2026-10-08</);
  assert.doesNotMatch(doc,/Bookings by Source|Activity Trend|Top Locations|Overview/);
  assert.equal(pageCount(doc),1);
});
test('prints ALL filtered bookings, not merely current pagination page',()=>{
  const doc=render();
  assert.equal(pageCount(doc),2);
  assert.match(doc,/Page 1 of 2/);assert.match(doc,/Page 2 of 2/);
  assert.match(doc,/BK-2026-10-01/);assert.match(doc,/BK-2026-10-24/);
  assert.equal((doc.match(/<tr>/g)||[]).length,26); // 24 rows + one header per PDF page
});
test('keeps table headings on each page and never includes sidebar or charts',()=>{
  const doc=render();
  assert.equal((doc.match(/<th scope="col">Booking ID<\/th>/g)||[]).length,2);
  assert.match(doc,/display:table-header-group/);
  assert.doesNotMatch(doc,/class="pr-.*"|Bookings by Source|Top Locations/);
});
test('uses ParkIn logo embedded in PDF, matching the supplied source wordmark',()=>{
  const doc=render({selected:['BK-2026-10-02']});
  const logo=doc.match(/<img class="brand-logo" src="data:image\/png;base64,([A-Za-z0-9+/=]+)"/);
  assert.ok(logo);
  const bytes=Buffer.from(logo[1],'base64');
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16),216);
  assert.equal(bytes.readUInt32BE(20),72);
  assert.match(doc,/alt="ParkIn company logo"/);
});
test('matches approved two-page layout: branded header, metadata, info cards, totals, notes, footer',()=>{
  const doc=render();
  assert.match(doc,/<h1>Booking Records Report<\/h1>/);
  assert.match(doc,/PARKIN REPORTS/);
  assert.match(doc,/Report Type<\/b><span>Booking/);
  assert.match(doc,/Prepared For<\/b><span>Operations Manager/);
  assert.match(doc,/Export Scope<\/b><span>All matching records/);
  assert.match(doc,/01 Oct 2026 — 19 Oct 2026/);
  for(const label of ['Total Records','Reporting Period','Location Scope','Company Scope','Time Zone','Total Recorded Amount','Notes'])assert.ok(doc.includes(label),label);
  assert.match(doc,/Detailed authorized booking records \(continued\)/);
  assert.match(doc,/Continued on next page/);
  assert.match(doc,/ParkIn Admin Dashboard/);
});
test('booking table includes separate phone, plate and AST columns',()=>{
  const doc=render({selected:['BK-2026-10-02']});
  for(const label of ['Booking Date &amp; Time','Phone','Plate No.','Parking Type','Source'])assert.ok(doc.includes(`<th scope="col">${label}</th>`));
  assert.match(doc,/ABC2/);assert.match(doc,/09:40 AST/);assert.match(doc,/\+966 50 123 4567/);
});
test('hidden columns are excluded, including their derived phone/plate columns',()=>{
  const doc=render({hiddenColumns:['driver','source','customer','vehicle']});
  for(const label of ['Driver','Source','Phone','Plate No.'])assert.ok(!doc.includes(`<th scope="col">${label}</th>`));
  assert.ok(doc.includes('<th scope="col">Booking ID</th>'));
});
test('booking fields and signed-in prepared-for metadata are escaped safely',()=>{
  const doc=render({selected:['BK-2026-10-01'],profile:'<img src=x onerror=alert(1)>'});
  assert.match(doc,/&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.doesNotMatch(doc,/<script>unsafe<\/script>/);
  assert.match(doc,/&lt;img src=x onerror=alert\(1\)&gt;/);
});
test('only sums stored numeric amounts and flags missing amounts (not phantom SAR zero)',()=>{
  const data=[{...rows[0],amount:22},{...rows[1],amount:null},{...rows[2],amount:30.5}];
  const doc=render({records:data});
  assert.match(doc,/SAR 52.5/);
  assert.match(doc,/1 booking\(s\) have no recorded amount/);
  assert.match(doc,/Not recorded/);
  const none=render({records:[{...rows[0],amount:null}]});
  assert.match(none,/<small>Total Recorded Amount<\/small><strong>Not recorded<\/strong>/);
});
test('all pages have explicit A4 landscape pagination and correct footer page numbering',()=>{
  const doc=render({records:Array.from({length:38},(_,i)=>({...rows[0],id:`B-${i}`}))});
  assert.equal(pageCount(doc),4);
  assert.match(doc,/@page \{size:A4 landscape; margin:0;\}/);
  for(let n=1;n<=4;n++)assert.ok(doc.includes(`Page ${n} of 4`));
  assert.equal((doc.match(/<section class="final-totals"/g)||[]).length,1);
  assert.equal((doc.match(/<section class="summary-grid"/g)||[]).length,1);
});
test('API errors and empty record sets cannot open PDF print dialog',()=>{
  const missing=harness({liveStatus:'error'});missing.context.printRecordsOnly();
  assert.equal(missing.printed.length,0);assert.match(missing.feedback[0].msg,/not loaded/);
  const empty=harness({records:[]});empty.context.printRecordsOnly();
  assert.equal(empty.printed.length,0);assert.match(empty.feedback[0].msg,/No matching records/);
});
test('PDF runs in a standalone iframe, never parent dashboard print()',()=>{
  const h=harness();h.context.printRecordsOnly();
  assert.equal(h.printed.length,1);assert.deepEqual(h.events,['afterprint']);
  assert.match(source,/if\(id==='pdf'\)printRecordsOnly\(\)/);
  assert.doesNotMatch(source,/previousPageSize|addEventListener\('beforeprint'/);
  assert.match(page,/Save Records as PDF/);
});
test('records-only PDF shows chosen Saudi time boundaries without changing the layout',()=>{
  const h=harness({selected:['BK-2026-10-02']});
  h.context.state.applied.from='2026-10-01T08:30';
  h.context.state.applied.to='2026-10-19T17:45';
  h.context.printRecordsOnly();
  const doc=h.printed[0];
  assert.match(doc,/01 Oct 2026, 08:30 AST — 19 Oct 2026, 17:45 AST/);
  assert.match(doc,/<h1>Booking Records Report<\/h1>/);
  assert.doesNotMatch(doc,/Shift \/ Time Stamp|Payment Status/);
});
