const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const dashboard = fs.readFileSync('script.js', 'utf8');
const customers = fs.readFileSync('js/customers.js', 'utf8');

function extract(src, start, end) {
  const a=src.indexOf(start), b=src.indexOf(end,a+start.length);
  assert.ok(a >= 0 && b > a, `missing ${start}`);
  return src.slice(a,b);
}

test('header clock shows AST date (including after Riyadh midnight)', () => {
  const code=extract(dashboard,'function formatDashboardDate(', 'async function restoreSession()');
  const labels=[];
  const root={textContent:''};
  const sandbox={Date,Intl,window:{setInterval:()=>{} ,addEventListener:()=>{}}, document:{querySelectorAll:()=>[root],addEventListener:()=>{}, hidden:false},console};
  vm.runInNewContext(code,sandbox);
  assert.equal(sandbox.formatDashboardDate(new Date('2026-10-21T20:59:00Z')),'Today, October 21, 2026');
  assert.equal(sandbox.formatDashboardDate(new Date('2026-10-21T21:01:00Z')),'Today, October 22, 2026');
  assert.ok(dashboard.includes('document.addEventListener("visibilitychange"'));
  assert.ok(dashboard.includes('window.addEventListener("focus", updateCurrentDate)'));
  assert.ok(dashboard.includes('window.setInterval(updateCurrentDate, 60_000)'));
});

test('edit customer form retrieves actual fields including persisted address and emergency contact', () => {
  const body = extract(customers,'function populateEditCustomerForm(', 'function renderEditCustomerOverview(');
  for (const field of ['memberSince', 'notes', 'nationality', 'address', 'emergencyContactName', 'emergencyContactPhone']) {
    assert.ok(body.includes(`customer.${field}`), field);
  }
  assert.ok(!body.includes('field.disabled = true'));
  assert.ok(!body.includes('customer.totalSpent'));
});

test('edit summary loads vehicles only after authorization, and never claims missing booking data', () => {
  const body=extract(customers,'async function loadEditCustomerPage(', 'function populateEditCustomerForm(');
  assert.ok(body.includes('hasDashboardPermission?.("vehicles.view")'));
  assert.ok(body.includes('fetchCustomerVehicles(databaseId, controller.signal)'));
  assert.ok(body.includes('controller.signal.aborted'));
  const overview=extract(customers,'function renderEditCustomerOverview(', 'function formatCustomerDetailDate(');
  for (const key of ['Total Bookings', 'Total Spent', 'Active Bookings']) assert.ok(overview.includes(`put("${key}", "—")`));
  assert.ok(overview.includes('vehicle.plateDisplayEnglish'));
  assert.ok(overview.includes('title.textContent'));
  assert.ok(!overview.includes('title.innerHTML'));
  assert.ok(overview.includes('vehicleState === "failed"'));
  assert.ok(overview.includes('vehicleState === "restricted"'));
});
