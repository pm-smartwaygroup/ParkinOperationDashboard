const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/customers.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/customers-empty.css'), 'utf8');
const image = fs.readFileSync(path.join(root, 'assets/illustrations/customers-empty.png'));
const section = (start, end) => source.split(start)[1]?.split(end)[0] || '';

test('empty customer illustration is a real bundled PNG', () => {
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(image.length > 10000);
  assert.ok(image.length < 750000);
});

test('loaded customers use a dedicated empty state rather than a table row', () => {
  const code = section('function renderCustomerList(', 'function bindCustomerListControls(');
  assert.match(code, /customers\.length === 0/);
  assert.match(code, /createCustomerEmptyState\(container\)/);
  assert.match(code, /customers-table-empty/);
  assert.doesNotMatch(code, /createCustomerListMessage\("No customers found\."\)/);
});

test('illustration and No Customers Found text are separate responsive elements', () => {
  const code = section('function createCustomerEmptyState(', 'function ensureCustomerEmptyStyles(');
  assert.match(code, /customers-empty\.png/);
  assert.match(code, /No Customers Found/);
  assert.match(code, /matching your selected filters/);
  assert.match(code, /customers available for your account/);
  assert.match(css, /@media \(max-width: 600px\)/);
});

test('no-match view resets search, status, type, and mobile source filters', () => {
  const code = section('function clearCustomerListFilters(', 'function createCustomerEmptyState(');
  for (const field of ['search', 'status', 'customerType', 'createdSource']) {
    assert.match(code, new RegExp(`customerListState\\.${field} = ""`));
  }
  assert.match(code, /loadCustomersPage\(1\)/);
});

test('empty customer state does not duplicate the existing Add Customer action', () => {
  const code = section('function createCustomerEmptyState(', 'function ensureCustomerEmptyStyles(');
  assert.doesNotMatch(code, /Add New Customer/);
  assert.doesNotMatch(code, /customers\.create/);
  assert.doesNotMatch(code, /add-customer/);
  assert.match(code, /Clear Filters/);
  const existingAction = section('function bindCustomerActions(', 'function bindCustomerTableSelection(');
  assert.match(existingAction, /\.customer-add-btn/);
  assert.match(existingAction, /window\.hasDashboardPermission\?\.\("customers\.create"\)/);
  assert.match(existingAction, /window\.location\.hash = "add-customer"/);
});

test('API errors are not converted to a false zero-customers state', () => {
  const loader = section('async function loadCustomersPage(', 'function createCustomerListMessage(');
  assert.match(loader, /renderCustomerList\(/);
  assert.match(loader, /catch \(error\)/);
  assert.match(loader, /Unable to load Customers/);
});

test('row selections are correctly bound after navigating from zero to nonzero rows', () => {
  const code = section('function bindCustomerTableSelection(', 'function bindCustomerActionMenus(');
  assert.match(code, /document\.querySelectorAll\("\.customer-row-checkbox"\)/);
  assert.match(code, /selectAll\.dataset\.bound !== "true"/);
  assert.match(code, /checkbox\.dataset\.bound === "true"/);
});

test('other existing customer actions are not changed by the empty-state feature', () => {
  assert.match(source, /function bindCustomerActions\(/);
  assert.match(source, /function fetchCustomerRecord\(/);
  assert.match(source, /function renderCustomerStatistics\(/);
});
