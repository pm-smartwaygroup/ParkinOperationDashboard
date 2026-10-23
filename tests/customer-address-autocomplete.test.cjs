const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/customers.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const add = fs.readFileSync(path.join(root, 'pages/add-customer.html'), 'utf8');
const edit = fs.readFileSync(path.join(root, 'pages/edit-customer.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/customer-address-autocomplete.css'), 'utf8');
const start = source.indexOf('const CUSTOMER_ADDRESS_MIN_CHARACTERS = 3;');
const end = source.indexOf('async function loadAddCustomerPage()', start);
assert.ok(start >= 0 && end > start, 'Address assistant code missing');
const segment = source.slice(start, end);

test('Saudi address suggestions start at three non-whitespace characters', () => {
  const ctx = vm.createContext({String, Array});
  vm.runInContext(segment, ctx);
  assert.equal(vm.runInContext('customerAddressCharacterCount("ab")', ctx), 2);
  assert.equal(vm.runInContext('customerAddressCharacterCount("abd")', ctx), 3);
  assert.equal(vm.runInContext('customerAddressCharacterCount("Al M")', ctx), 3);
  assert.equal(vm.runInContext('customerAddressCharacterCount("ش ا ر")', ctx), 3);
  assert.equal(vm.runInContext('customerAddressCharacterCount("   ")', ctx), 0);
  assert.match(segment, /customerAddressCharacterCount\(query\) < CUSTOMER_ADDRESS_MIN_CHARACTERS/);
  assert.match(segment, /Enter 3 or more characters/);
  assert.match(segment, /window\.setTimeout\(\(\) => \{ void search\(query, token\); \}, 300\)/);
});

test('Places API uses existing Maps loader and restricts suggestions to Saudi Arabia', () => {
  assert.match(index, /maps\.googleapis\.com\/maps\/api\/js/);
  assert.match(segment, /maps\.importLibrary\("places"\)/);
  assert.match(segment, /includedRegionCodes: \["sa"\]/);
  assert.match(segment, /region: "sa"/);
  assert.match(segment, /AutocompleteSessionToken/);
  assert.doesNotMatch(segment, /https?:\/\/|AIza/);
});

test('manual entry stays possible when Google Places is unavailable', () => {
  assert.match(segment, /if \(!maps\?\.importLibrary\) return hide\(\)/);
  assert.match(segment, /Manual entry stays available/);
  assert.match(segment, /This is not Saudi National Address verification/);
  assert.match(segment, /input\.value = String\(address\)/);
  assert.match(segment, /new Event\("change", \{ bubbles: true \}\)/);
});

test('Add and Edit Customer forms initialize autocomplete only once', () => {
  assert.match(source, /installCustomerAddressAutocomplete\(container\.querySelector\("#add-customer-form"\), "#customer-address"\)/);
  assert.match(source, /installCustomerAddressAutocomplete\(editForm, "#edit-address"\)/);
  assert.match(segment, /input\.dataset\.parkinAddressBound === "true"/);
  assert.match(add, /id="customer-address"[\s\S]*?autocomplete="off"/);
  assert.match(edit, /id="edit-address"[\s\S]*?autocomplete="off"/);
});

test('suggestions are accessible and text is never inserted as HTML', () => {
  assert.match(segment, /role", "combobox"/);
  assert.match(segment, /role", "listbox"/);
  assert.match(segment, /aria-activedescendant/);
  assert.match(segment, /event\.key === "ArrowDown"/);
  assert.match(segment, /event\.key === "Enter"/);
  assert.match(segment, /event\.key === "Escape"/);
  assert.match(segment, /title\.textContent =/);
  assert.match(segment, /secondary\.textContent =/);
  assert.match(segment, /attribution.textContent = "Google Maps"/);
  assert.match(segment, /token !== generation/);
  assert.match(css, /customer-address-suggestions\[hidden\]/);
  assert.doesNotMatch(segment, /innerHTML\s*=/);
});
