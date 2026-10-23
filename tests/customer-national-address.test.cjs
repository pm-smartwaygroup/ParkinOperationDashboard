const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'js/customers.js'), 'utf8');
const add = fs.readFileSync(path.join(root, 'pages/add-customer.html'), 'utf8');
const edit = fs.readFileSync(path.join(root, 'pages/edit-customer.html'), 'utf8');
const details = fs.readFileSync(path.join(root, 'pages/customer-details.html'), 'utf8');
const names = ['nationalAddressShortCode','nationalAddressBuildingNumber','nationalAddressStreet',
  'nationalAddressDistrict','nationalAddressCity','nationalAddressPostalCode','nationalAddressAdditionalNumber'];
const suffixes = ['national-short','national-building','national-street',
  'national-district','national-city','national-postal','national-additional'];
const part=(from,to)=>{ const a=js.indexOf(from),b=js.indexOf(to,a+1);
  assert.ok(a>=0&&b>a,from); return js.slice(a,b); };

test('all seven optional Saudi National Address fields exist on Add and Edit',()=>{
  for(const suffix of suffixes){
    assert.ok(add.includes(`id="customer-${suffix}"`), suffix);
    assert.ok(edit.includes(`id="edit-${suffix}"`), suffix);
    assert.ok(details.includes(`data-national-address-${suffix}`), suffix);
  }
  assert.match(add, /Saudi National Address/);
  assert.match(edit, /Saudi National Address/);
  assert.match(add, /Not verified/);
  assert.match(edit, /Not verified/);
  assert.match(details, /data-national-address-status>Not verified/);
  assert.match(details, /<details class="customer-national-address-details">/);
});

test('form helper reads inputs without inventing missing customer fields',()=>{
  const source=part('const CUSTOMER_NATIONAL_ADDRESS_FIELDS = [','async function loadAddCustomerPage()');
  const values={};
  const ctx={document:{querySelector:sel=>sel==='#customer-national-short'?{value:'RRRD2929'}:null}};
  vm.runInNewContext(source,ctx);
  const result=ctx.getCustomerNationalAddressValues('customer');
  assert.equal(result.nationalAddressShortCode,'RRRD2929');
  for(const key of names.slice(1)) assert.equal(result[key],'');
});

test('create and update API payloads include real National Address components',()=>{
  assert.match(part('const payload = {\n      companyId,','\n    try {\n      if (submitButton)'), /\.\.\.getCustomerNationalAddressValues\("customer"\)/);
  assert.match(part('function getEditCustomerFormValues(', 'function editCustomerValuesForComparison('), /\.\.\.getCustomerNationalAddressValues\("edit"\)/);
  assert.match(part('function populateEditCustomerForm(', 'function renderEditCustomerOverview('), /for \(const \[key, suffix\] of CUSTOMER_NATIONAL_ADDRESS_FIELDS\)/);
  assert.match(part('function populateCustomerDetails(', 'function getEditCustomerFormValues('), /data-national-address-\$\{suffix\}/);
});

test('national address has strict client format but never claims authoritative verification',()=>{
  assert.match(add, /pattern="\[A-Za-z\]\{4\}\[0-9\]\{4\}"/);
  assert.match(add, /pattern="\[0-9\]\{5\}"/);
  assert.match(add, /pattern="\[0-9\]\{4\}"/);
  assert.doesNotMatch(js,/nationalAddressVerifiedAt\s*:/);
  assert.doesNotMatch(js,/nationalAddressVerified\s*:/);
  assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/customer-national-address\.css/);
});


test('format completion is shown separately from official SPL verification', () => {
  const source = part('function customerNationalAddressFormatStatus(', 'async function loadAddCustomerPage()');
  const context = { document: { querySelector: () => null } };
  vm.runInNewContext(source, context);
  const values = {
    nationalAddressShortCode: 'ABCD1234',
    nationalAddressBuildingNumber: '1234',
    nationalAddressStreet: 'Sample Road',
    nationalAddressDistrict: 'Test District',
    nationalAddressCity: 'Riyadh',
    nationalAddressPostalCode: '12345',
    nationalAddressAdditionalNumber: '6789',
  };
  assert.equal(context.customerNationalAddressFormatStatus(values), 'Format complete');
  assert.equal(context.customerNationalAddressFormatStatus({ ...values, nationalAddressPostalCode: '1262' }), 'Format incomplete');
  assert.equal(context.customerNationalAddressFormatStatus(Object.fromEntries(names.map(name => [name, '']))), 'Not entered');
  for (const page of [add, edit, details]) {
    assert.match(page, /https:\/\/proof\.address\.gov\.sa\//);
    assert.match(page, /rel="noopener noreferrer"/);
    assert.doesNotMatch(page, /data-national-address-status>Verified/);
  }
  assert.match(add, /data-national-address-format/);
  assert.match(edit, /data-national-address-format/);
  assert.match(add, /requires the proof number/);
  assert.doesNotMatch(source, /fetch\(/);
});
