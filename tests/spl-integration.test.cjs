const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'js/customers.js'), 'utf8');
const add = fs.readFileSync(path.join(root, 'pages/add-customer.html'), 'utf8');
const edit = fs.readFileSync(path.join(root, 'pages/edit-customer.html'), 'utf8');

test('Customer Add/Edit expose only authenticated server-side SPL operations', () => {
  for (const file of [add, edit]) {
    assert.match(file, /data-spl-search/);
    assert.match(file, /data-spl-verify/);
    assert.match(file, /data-spl-result/);
    assert.match(file, /Proof and holder verification are separate/);
  }
  assert.match(js, /getCustomerManagementApiBaseUrl\(\).*?\/national-address\/\$\{path\}/s);
  assert.match(js, /getCustomerManagementAuthHeaders\(\)/);
  assert.doesNotMatch(js, /api_key|SPL_API_KEY|apina\.address\.gov\.sa/);
});

test('SPL address confirmation is session-only and never marks the proof verified', () => {
  assert.match(js, /SPL confirms this address exists/);
  assert.match(js, /This check is not saved/);
  assert.match(js, /proof remains unverified/i);
  assert.doesNotMatch(js, /nationalAddressVerifiedAt\s*:/);
  assert.doesNotMatch(js, /nationalAddressVerified\s*:/);
  assert.match(js, /installCustomerSplAddressActions\(.*"customer"\)/);
  assert.match(js, /installCustomerSplAddressActions\(.*"edit"\)/);
});
