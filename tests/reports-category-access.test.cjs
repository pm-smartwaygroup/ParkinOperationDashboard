'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/reports.js'), 'utf8');
const everyModule = ['bookings.view', 'locations.view', 'drivers.view', 'customers.view', 'vehicles.view', 'valet_companies.view', 'users.view', 'revenue.view'];
function makeReports(initial) {
  const permissions = new Set(initial);
  const window = { hasDashboardPermission: code => permissions.has(code) };
  const ctx = { window, Date, Set, Map, Number, String, Math };
  vm.runInNewContext(source, ctx, { filename: 'reports.js' });
  return { window, permissions, ids: () => Array.from(window.ParkinReports.getVisibleCategoryIds()) };
}
test('shows the 8 module reports in the requested order, with Revenue last', () => {
  const reports = makeReports(['reports.view', ...everyModule]);
  assert.deepEqual(reports.ids(), ['bookings', 'locations', 'drivers', 'customers', 'vehicles', 'companies', 'users', 'revenue']);
});
test('location-only user sees only Locations Report', () => {
  assert.deepEqual(makeReports(['reports.view', 'locations.view']).ids(), ['locations']);
});
test('booking access is not inferred from location or valet access', () => {
  assert.deepEqual(makeReports(['reports.view', 'locations.view', 'valet_operations.view']).ids(), ['locations']);
});
test('Reports access is required even when module permissions exist', () => {
  assert.deepEqual(makeReports(everyModule).ids(), []);
});
test('Reports permission alone grants no module-level report', () => {
  assert.deepEqual(makeReports(['reports.view']).ids(), []);
});
test('company and user report permission mappings match backend catalog', () => {
  assert.deepEqual(makeReports(['reports.view', 'valet_companies.view', 'users.view']).ids(), ['companies', 'users']);
  assert.deepEqual(makeReports(['reports.view', 'companies.view']).ids(), []);
});
test('effective permissions are rechecked after changes, not cached by role or page', () => {
  const reports = makeReports(['reports.view', 'bookings.view', 'revenue.view']);
  assert.deepEqual(reports.ids(), ['bookings', 'revenue']);
  reports.permissions.delete('bookings.view');
  reports.permissions.add('locations.view');
  assert.deepEqual(reports.ids(), ['locations', 'revenue']);
  reports.permissions.delete('reports.view');
  assert.deepEqual(reports.ids(), []);
});
test('no global permission checker fails closed', () => {
  const reports = makeReports(['reports.view', ...everyModule]);
  delete reports.window.hasDashboardPermission;
  assert.deepEqual(reports.ids(), []);
});
