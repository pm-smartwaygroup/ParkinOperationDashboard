const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const customers = fs.readFileSync(path.join(root, 'js/customers.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'pages/customer-details.html'), 'utf8');
const ID = 'a9f3339b-e7c2-4e6c-b8e7-1a3b2761f102';
const otherId = '3c6f515c-012b-408d-972f-f49819339f10';

function booking(i, customerId = ID) {
  return {
    id: `booking-${i}`, customerId,
    bookingCode: `BK-${i}`, createdAt: '2026-10-22T07:15:00Z', status: 'COMPLETED',
  };
}
function runApi(mockFetch) {
  const start = customers.indexOf('const CUSTOMER_BOOKING_PAGE_SIZE = 100;');
  const end = customers.indexOf('\nfunction renderUnavailableCustomerBookings()', start);
  assert.ok(start > 0 && end > start, 'scoped booking adapter not present');
  const ctx = {
    URLSearchParams, Set, Date, Intl, Error,
    getCustomerManagementApiBaseUrl: () => 'https://example.invalid',
    getCustomerManagementAuthHeaders: () => ({Authorization:'Bearer test'}),
    fetch: mockFetch,
  };
  vm.runInNewContext(customers.slice(start, end), ctx);
  return ctx;
}

test('customer booking requests use authenticated, exact customer-scoped API filters', async () => {
  const seen = [];
  const ctx = runApi(async (url, options) => {
    seen.push({ url, options });
    return { ok: true, json: async () => ({
      data: { bookings: [booking(1)], pagination: { page: 1, total: 1, totalPages: 1 } },
    }) };
  });
  const records = await vm.runInNewContext(`fetchCustomerBookings('${ID}')`, ctx);
  assert.equal(records.length, 1);
  assert.equal(seen.length, 1);
  const request = new URL(seen[0].url);
  assert.equal(request.pathname, '/bookings');
  assert.equal(request.searchParams.get('customerId'), ID);
  assert.equal(request.searchParams.get('page'), '1');
  assert.equal(request.searchParams.get('limit'), '100');
  assert.equal(seen[0].options.headers.Authorization, 'Bearer test');
  assert.equal(seen[0].options.cache, 'no-store');
});
test('customer details no longer claims a nationality or booking totals without API verification', () => {
  assert.doesNotMatch(html, /<b>Saudi Arabia<\/b>/);
  assert.match(html, /data-customer-booking-list/);
  assert.match(customers, /hasDashboardPermission\?\.\("bookings\.view"\)/);
  assert.match(customers, /bookingError\?\.status === 403/);
  assert.match(customers, /Payment settlement is not available/);
  assert.match(customers, /container\.dataset\.customerId !== customerId/);
  assert.match(customers, /container\.replaceChildren\(\)/);
});

test('booking lookup fetches every authorized page with a server-side customer filter', async () => {
  const seen = [];
  const ctx = runApi(async (url, options) => {
    const parsed = new URL(url);
    seen.push({params:parsed.searchParams, options});
    const page = Number(parsed.searchParams.get('page'));
    const bookings = page === 1 ? Array.from({length:100}, (_,i)=>booking(i)) : [booking(100)];
    return {ok:true,json:async()=>({data:{bookings,pagination:{page,total:101,totalPages:2}}})};
  });
  const records = await vm.runInNewContext(`fetchCustomerBookings('${ID}')`, ctx);
  assert.equal(records.length, 101);
  assert.equal(seen.length,2);
  for(const req of seen){
    assert.equal(req.params.get('customerId'), ID);
    assert.equal(req.params.get('limit'),'100');
    assert.equal(req.options.cache,'no-store');
  }
});

test('rejects an API that ignores the customer filter and returns another account', async () => {
  const ctx = runApi(async () => ({ok:true,json:async()=>({
    data:{bookings:[booking(1,otherId)],pagination:{page:1,total:1,totalPages:1}}
  })}));
  await assert.rejects(vm.runInNewContext(`fetchCustomerBookings('${ID}')`, ctx), /unexpected records/);
});

test('rejects partial, inconsistent or repeated booking pages', async () => {
  const ctx = runApi(async()=>({ok:true,json:async()=>({
    data:{bookings:[booking(1)],pagination:{page:1,total:2,totalPages:1}}
  })}));
  await assert.rejects(vm.runInNewContext(`fetchCustomerBookings('${ID}')`, ctx), /safe reporting limit|Incomplete or duplicate/);
});

test('rejects API errors rather than manufacturing a zero count', async () => {
  const ctx = runApi(async()=>({ok:false,status:403}));
  await assert.rejects(vm.runInNewContext(`fetchCustomerBookings('${ID}')`, ctx), /not available/);
});
