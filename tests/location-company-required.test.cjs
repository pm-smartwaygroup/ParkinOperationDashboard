const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const helper = js.slice(js.indexOf('let locationCompanyLoadRequest = 0;'), js.indexOf('function showAddLocationView()'));
function makeHarness(options, editId = '', editCompanyId = '', responseStatus = 200) {
  const select = {
    options: [], disabled: true, required: false, value: '',
    replaceChildren(...children) { this.options = [...children]; this.value = children[0]?.value ?? ''; },
    add(child) { this.options.push(child); },
  };
  const message = { textContent: '' };
  const form = {
    dataset: { ...(editId ? {editId,editCompanyId} : {}) },
    querySelector(selector) { return selector === '[data-location-company-message]' ? message : null; },
  };
  const fetchCalls = [];
  const sandbox = {
    addLocationForm: form, locationFormField: () => select,
    Option: function Option(label, value) { this.textContent = label; this.value = value; },
    localStorage: { getItem: () => 'local-development-token' },
    API_BASE_URL: 'http://127.0.0.1:3001',
    fetch: async (url, init) => { fetchCalls.push({url,init}); return {
      ok: responseStatus === 200, status: responseStatus,
      json: async () => ({success:responseStatus===200,data:options}),
    }; },
    Set, Error, Array,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(helper, context);
  return { select, message, fetchCalls, context, run: () => vm.runInContext('loadLocationCompanyOptions()', context) };
}
test('Create Location displays an explicit Company field and includes it in FormData', () => {
  assert.match(html, /<select name="companyId" required disabled>/);
  assert.match(js, /formData\.set\("companyId", companyId\)/);
  assert.match(js, /Select an active company before saving this location/);
});
test('Edit Location never sends companyId and keeps location ownership immutable', () => {
  assert.match(js, /formData\.delete\("companyId"\)/);
  assert.match(js, /Location company cannot be changed after creation/);
  assert.match(js, /addLocationForm\.dataset\.editCompanyId = String\(/);
});
test('Authenticated options endpoint and one active company enable correct selection', async () => {
  const h = makeHarness([{id:'cmp1',name:'ParkIn Test Company'}]);
  await h.run();
  assert.equal(h.select.value, 'cmp1');
  assert.equal(h.select.disabled, false);
  assert.equal(h.select.required, true);
  assert.equal(h.fetchCalls[0].url, 'http://127.0.0.1:3001/companies/options');
  assert.equal(h.fetchCalls[0].init.headers.Authorization, 'Bearer local-development-token');
});
test('Multiple companies do not silently select an arbitrary owner', async () => {
  const h = makeHarness([{id:'cmp1',name:'One'},{id:'cmp2',name:'Two'}]);
  await h.run();
  assert.equal(h.select.value, '');
  assert.equal(h.select.disabled, false);
});
test('Empty active company list blocks new location creation and explains remedy', async () => {
  const h = makeHarness([]);
  await h.run();
  assert.equal(h.select.disabled, true);
  assert.match(h.message.textContent, /Create or activate a company/);
});
test('Failed company options request blocks creation without guessing an owner', async () => {
  const h = makeHarness(null,'','',403);
  await h.run();
  assert.equal(h.select.disabled, true);
  assert.match(h.message.textContent, /do not have access/);
});
test('Edit Location preserves its original company even when not in active options', async () => {
  const h = makeHarness([{id:'other',name:'Other'}],'location1','existing');
  await h.run();
  assert.equal(h.select.value, 'existing');
  assert.equal(h.select.disabled, true);
  assert.equal(h.select.required, false);
  assert.match(h.message.textContent, /cannot be changed/);
});
