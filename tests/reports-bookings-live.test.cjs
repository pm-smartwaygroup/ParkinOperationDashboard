'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/reports-bookings-api.js'), 'utf8');
function createAdapter(handler) {
  const window = {};
  const context = { window, Intl, Date, Number, String, Set, Map, Object, Error,
    fetch: async (url, options) => handler(url, options) };
  vm.runInNewContext(source, context, { filename:'reports-bookings-api.js' });
  return window.ParkinBookingReportAPI;
}
const response = (body, status=200) => ({ok:status>=200&&status<300,status, json:async()=>body});
const makeBooking = (i, patch={}) => ({
  id:`id-${i}`,bookingCode:`BK-26-${i}`,createdAt:'2026-10-18T22:30:00.000Z',
  companyId:'company-1',locationId:'location-1',source:'CUSTOMER_APP',status:'CONFIRMED',
  amountSar:'45.50',customer:{fullName:'Actual Customer',phoneE164:'+966501234567'},
  vehicle:{make:'Toyota',model:'Camry',plateNumberEnglish:'1234',plateLettersEnglish:'ABC'},
  location:{name:'Al Murabba'},...patch,
});
const paginated = (page, bookings, total, totalPages) => ({bookings,pagination:{page,limit:100,total,totalPages}});
test('Loads every booking page, authenticates requests and never truncates totals silently',async()=>{
  const calls=[]; const list=Array.from({length:101},(_,i)=>makeBooking(i));
  const api=createAdapter((url,options)=>{calls.push({url,headers:options.headers});const page=Number(new URL(url).searchParams.get('page'));
    return response(paginated(page,list.slice((page-1)*100,page*100),101,2));});
  const result=await api.fetchAll({apiBaseUrl:'http://localhost:3001/',token:'private-test-token'});
  assert.equal(result.length,101);assert.deepEqual(calls.map(x=>new URL(x.url).searchParams.get('page')),['1','2']);
  assert.equal(calls[0].headers.Authorization,'Bearer private-test-token');
  assert.equal(result[0].customer,'Actual Customer');
});
test('Accepts the live NestJS success envelope with zero bookings',async()=>{
  const liveBody={success:true,path:'/bookings?page=1&limit=100',timestamp:'2026-10-19T09:56:00Z',
    data:paginated(1,[],0,1)};
  const api=createAdapter(()=>response(liveBody));
  const rows=await api.fetchAll({apiBaseUrl:'http://localhost:3001',token:'token'});
  assert.equal(rows.length,0);
});
test('Loads all pages of live NestJS-wrapped booking results',async()=>{
  const all=Array.from({length:101},(_,i)=>makeBooking(i));
  const seen=[];
  const api=createAdapter(url=>{
    const page=Number(new URL(url).searchParams.get('page'));
    seen.push(page);
    return response({success:true,path:'/bookings',timestamp:'2026-10-19T09:56:00Z',
      data:paginated(page,all.slice((page-1)*100,page*100),101,2)});
  });
  const rows=await api.fetchAll({apiBaseUrl:'http://localhost:3001',token:'token'});
  assert.equal(rows.length,101);
  assert.deepEqual(seen,[1,2]);
  assert.equal(rows[100].bookingId,'id-100');
});
test('Rejects wrapped success responses with missing or contradictory pagination',async()=>{
  const broken=[
    {success:true,data:{bookings:[]}},
    {success:true,data:paginated(1,[makeBooking(0)],0,1)},
    {success:true,data:paginated(3,[],0,1)},
  ];
  for(const body of broken){
    const api=createAdapter(()=>response(body));
    await assert.rejects(api.fetchAll({apiBaseUrl:'http://localhost:3001',token:'token'}));
  }
});
test('Uses KSA local date and genuine source/status; never invents booking type or driver',()=>{
  const api=createAdapter(()=>{throw Error('Unexpected fetch');});
  const b=api.normalizeBooking(makeBooking(1,{status:'RETRIEVAL_IN_PROGRESS',source:'VALET_DRIVER_APP'}));
  assert.equal(b.date,'2026-10-19');assert.equal(b.time,'01:30');assert.equal(b.source,'Valet Driver App');
  assert.equal(b.status,'Retrieval In Progress');assert.equal(b.statusGroup,'Open');
  assert.equal(b.type,'Not recorded');assert.equal(b.driver,'Not recorded');
});
test('Completed and cancelled statuses are distinct from expired bookings',()=>{
  const api=createAdapter(()=>{});
  assert.equal(api.normalizeBooking(makeBooking(1,{status:'COMPLETED'})).statusGroup,'Completed');
  assert.equal(api.normalizeBooking(makeBooking(2,{status:'CANCELLED'})).statusGroup,'Cancelled');
  assert.equal(api.normalizeBooking(makeBooking(3,{status:'EXPIRED'})).statusGroup,'Expired');
});
test('Missing amounts remain missing; never pretend SAR 0 was stored',()=>{
  const api=createAdapter(()=>{});
  assert.equal(api.normalizeBooking(makeBooking(1,{amountSar:null})).amount,null);
  assert.equal(api.normalizeBooking(makeBooking(2,{amountSar:'50.20'})).amount,50.2);
});
test('Rejects requests without an access token',async()=>{
  const api=createAdapter(()=>{throw Error('Unexpected fetch');});
  await assert.rejects(api.fetchAll({apiBaseUrl:'https://api.example.test',token:''}),/sign in/i);
});
test('Honors 401 and 403 and does not fall back to fake records',async()=>{
  for(const [status,message] of [[401,/Session expired/],[403,/bookings.view/]]){
    const api=createAdapter(()=>response({},status));
    await assert.rejects(api.fetchAll({apiBaseUrl:'https://api.example.test',token:'token'}),message);
  }
});
test('Rejects malformed/mismatched paging and partial responses',async()=>{
  const bad=[{},paginated(1,[makeBooking(1)],2,1),paginated(1,[makeBooking(1)],10001,101)];
  for(const x of bad){const api=createAdapter(()=>response(x));
    await assert.rejects(api.fetchAll({apiBaseUrl:'https://api.example.test',token:'token'}));}
});
test('Rejects duplicate booking IDs instead of misreporting two records',async()=>{
  const api=createAdapter(()=>response(paginated(1,[makeBooking(1),makeBooking(1)],2,1)));
  await assert.rejects(api.fetchAll({apiBaseUrl:'https://api.example.test',token:'token'}),/changed during loading/i);
});
test('Company-label lookup is optional when account lacks companies.view',async()=>{
  const api=createAdapter(()=>response({},403));
  const names=await api.loadCompanyNames({apiBaseUrl:'https://api.example.test',token:'token'});
  assert.equal(names.size,0);
});
test('Company lookup uses actual names when permitted',async()=>{
  const api=createAdapter(()=>response({companies:[{id:'company-1',name:'ParkIn Operations'}]}));
  const names=await api.loadCompanyNames({apiBaseUrl:'https://api.example.test',token:'token'});
  assert.equal(names.get('company-1'),'ParkIn Operations');
});
test('Vehicle parking classification is shown only when present in API; never inferred from booking source',()=>{
  const api=createAdapter(()=>{throw Error('unexpected network request');});
  const live=api.normalizeBooking(makeBooking(4,{vehicle:{parkingType:'VALET_PARKING',make:'Toyota',model:'Camry'}}));
  assert.equal(live.type,'Valet Parking');
  assert.equal(live.parkingTypeCode,'VALET_PARKING');
  const walkIn=api.normalizeBooking(makeBooking(5,{vehicle:{parkingType:'WALK_IN'}}));
  assert.equal(walkIn.type,'Walk-in Parking');
  const missing=api.normalizeBooking(makeBooking(6,{vehicle:{}}));
  assert.equal(missing.type,'Not recorded');
  assert.equal(missing.parkingTypeCode,'');
});
test('Company dropdown retrieves all three authorized companies even if no bookings exist for two of them',async()=>{
  const api=createAdapter(url=>{
    assert.match(url,/\/companies\?page=1&limit=100/);
    return response({success:true,data:{companies:[
      {id:'c1',name:'ParkIn'},{id:'c2',name:'Smart Way Valet'},{id:'c3',name:'Test Valet Company'},
    ],pagination:{page:1,limit:100,total:3,totalPages:1}}});
  });
  const items=await api.loadCompanyNames({apiBaseUrl:'http://localhost:3001',token:'token'});
  assert.equal(items.size,3);assert.equal(items.get('c2'),'Smart Way Valet');
});
test('Location directory includes authorized locations without booking activity',async()=>{
  const api=createAdapter(url=>{
    assert.match(url,/\/locations\?page=1&limit=100/);
    return response({success:true,data:{locations:[
      {id:'l1',name:'Riyadh Boulevard'},{id:'l2',name:'No Bookings Location'},
    ],pagination:{page:1,limit:100,total:2,totalPages:1}}});
  });
  const items=await api.loadLocationNames({apiBaseUrl:'http://localhost:3001',token:'token'});
  assert.equal(items.size,2);assert.equal(items.get('l2'),'No Bookings Location');
});
test('Handles paginated company directories without silently dropping later pages',async()=>{
  const requests=[];
  const first=Array.from({length:100},(_,i)=>({id:`c-${i}`,name:`Company ${i}`}));
  const api=createAdapter(url=>{
    const page=Number(new URL(url).searchParams.get('page'));requests.push(page);
    return response({data:{companies:page===1?first:[{id:'c-100',name:'Company 100'}],pagination:{page,limit:100,total:101,totalPages:2}}});
  });
  const items=await api.loadCompanyNames({apiBaseUrl:'http://localhost:3001',token:'token'});
  assert.deepEqual(requests,[1,2]);assert.equal(items.size,101);
});
test('Permission denied to optional directories does not break authorized booking reports',async()=>{
  const api=createAdapter(()=>response({},403));
  const [companies,locations]=await Promise.all([
    api.loadCompanyNames({apiBaseUrl:'http://localhost:3001',token:'token'}),
    api.loadLocationNames({apiBaseUrl:'http://localhost:3001',token:'token'}),
  ]);
  assert.equal(companies.size,0);assert.equal(locations.size,0);
});
test('Directory pagination failures do not display partially fetched directory lists',async()=>{
  const api=createAdapter(()=>response({data:{companies:[{id:'c1',name:'Only one'}],pagination:{page:1,limit:100,total:3,totalPages:1}}}));
  const companies=await api.loadCompanyNames({apiBaseUrl:'http://localhost:3001',token:'token'});
  assert.equal(companies.size,0);
});
