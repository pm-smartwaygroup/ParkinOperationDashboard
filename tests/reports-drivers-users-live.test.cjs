'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const adapter = fs.readFileSync(path.join(__dirname, '../js/reports-directories-api.js'), 'utf8');
const report = fs.readFileSync(path.join(__dirname, '../js/reports.js'), 'utf8');
const stamp = '2026-10-22T08:00:00.000Z';
const make = (id, more = {}) => ({id, createdAt:stamp, ...more});
const setup = fetchImpl => {
  const window = {};
  vm.runInNewContext(adapter, {window, fetch:fetchImpl, Intl, Date, Number, Set, Map, URL, Error, Promise});
  return window.ParkinDirectoryReportAPI;
};
const args = kind => ({kind, apiBaseUrl:'http://127.0.0.1:3001', token:'development-test-token'});
test('Drivers uses the same protected GET /drivers contract as Driver Management', async () => {
  const api = setup(async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:3001/drivers');
    assert.equal(options.headers.Authorization, 'Bearer development-test-token');
    return {ok:true, status:200, json:async()=>({success:true,data:[make('d1',{fullName:'Test Driver',driverCode:'DRV0001',phoneCountryCode:'+966',phoneNumber:'512345678',companyName:'Test Company',driverType:'VALET_DRIVER',assignments:[{isPrimary:true,location:{name:'Test Location'}}],status:'ACTIVE'})]})};
  });
  const rows = await api.fetchAll(args('drivers'));
  assert.equal(rows.length,1);
  assert.equal(rows[0].driver,'Test Driver');
  assert.equal(rows[0].location,'Test Location');
  assert.equal(rows[0].driverCode,'DRV0001');
  assert.equal(rows[0].date,'2026-10-22');
  assert.equal(rows[0].time,'11:00');
  assert.ok(!('revenue' in rows[0]));
  assert.ok(!('bookings' in rows[0]));
});
test('Users traverses pages with authenticated requests and validates pagination', async () => {
  let calls=0;
  const api=setup(async(url,options)=>{
    calls++;
    assert.match(url, new RegExp(`/users\\?page=${calls}&limit=100`));
    assert.equal(options.headers.Authorization,'Bearer development-test-token');
    const items=Array.from({length:calls===1?100:1},(_,i)=>make(`u${calls}-${i}`,{name:'Local User',email:'local@example.invalid',role:'OPERATIONS_MANAGER',isActive:true,suspensionEnabled:false,accessScope:'COMPANY'}));
    return {ok:true,status:200,json:async()=>({success:true,data:{data:items,pagination:{page:calls,limit:100,total:101,totalPages:2}}})};
  });
  const rows=await api.fetchAll(args('users'));
  assert.equal(calls,2);
  assert.equal(rows.length,101);
  assert.equal(rows[0].user,'Local User');
  assert.equal(rows[0].enabled,'Yes');
  assert.equal(rows[0].suspension,'Not configured');
  assert.ok(!('lastActivity' in rows[0]));
});
test('Users rejects drifted or incomplete pages instead of reporting a partial result', async()=>{
  const api=setup(async()=>({ok:true,status:200,json:async()=>({data:{data:[make('u1')],pagination:{page:1,limit:100,total:10,totalPages:1}}})}));
  await assert.rejects(()=>api.fetchAll(args('users')),/incomplete/);
});
test('Unauthorized Drivers and Users cannot fall back to sample data', async()=>{
  for(const kind of ['drivers','users']){
    const api=setup(async()=>({ok:false,status:403}));
    await assert.rejects(()=>api.fetchAll(args(kind)),/Access denied/);
  }
});
test('Driver records must have genuine timestamps and stable IDs',async()=>{
  const api=setup(async()=>({ok:true,status:200,json:async()=>({data:[{id:'d1'}]})}));
  await assert.rejects(()=>api.fetchAll(args('drivers')),/creation timestamp/);
});
test('Directory views expose no unverified driver performance, last activity or revenue',()=>{
  assert.match(report,/drivers:\[\{key:'driverCode'/);
  assert.match(report,/users:\[\{key:'user'/);
  assert.doesNotMatch(report,/drivers:\[.*?Revenue Generated/);
  assert.doesNotMatch(report,/users:\[.*?Last Activity/);
  assert.match(report,/PENDING_CATEGORIES = new Set\(\['revenue'\]\)/);
});
