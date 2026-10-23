const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'js/customers.js'), 'utf8');
const addHtml = fs.readFileSync(path.join(root, 'pages/add-customer.html'), 'utf8');
const editHtml = fs.readFileSync(path.join(root, 'pages/edit-customer.html'), 'utf8');
const detailsHtml = fs.readFileSync(path.join(root, 'pages/customer-details.html'), 'utf8');
const part = (a,b) => {
  const start = js.indexOf(a);
  const end = js.indexOf(b, start+1);
  assert.ok(start>=0 && end>start, `${a} not found`);
  return js.slice(start,end);
};
test('create payload includes actual address nationality and emergency contact',()=>{
  const src = part('const payload = {\n      companyId,','\n    try {\n      if (submitButton)');
  for(const key of ['nationality:', 'address:', 'emergencyContactName:', 'emergencyContactPhone:'])
    assert.ok(src.includes(key),key);
  assert.match(addHtml, /<option value="" selected disabled>Select nationality<\/option>/);
  assert.match(addHtml, /id="customer-address"[\s\S]*?required/);
});
test('edit payload preserves optional clearing of contact fields',()=>{
  const src = part('function getEditCustomerFormValues(', 'function editCustomerValuesForComparison(');
  for(const key of ['nationality:', 'address:', 'emergencyContactName:', 'emergencyContactPhone:'])
    assert.ok(src.includes(key),key);
  assert.doesNotMatch(editHtml, /value="Olaya Street, Riyadh/);
  assert.doesNotMatch(editHtml, /value="Ahmed Ali \(Brother\)"/);
  assert.doesNotMatch(editHtml, /value="55 987 6543"/);
  assert.doesNotMatch(part('async function handleEditCustomerSubmit(', 'function mergeUpdatedCustomerIntoList('), /console\.debug\("\[Customers\] PATCH customer"/);
});
test('customer details render API values and missing values as unavailable',()=>{
  const src = part('function populateCustomerDetails(', 'function getEditCustomerFormValues(');
  assert.match(src, /customer\.address \|\| "—"/);
  assert.match(src, /customer\.nationality \|\| "—"/);
  assert.match(src, /customer\.emergencyContactName/);
  assert.match(src, /customer\.emergencyContactPhone/);
  for(const key of ['data-customer-nationality','data-contact-address','data-contact-emergency'])
    assert.ok(detailsHtml.includes(key),key);
});
test('edit form loads actual contact information without disabling fields',()=>{
  const src = part('function populateEditCustomerForm(', 'function renderEditCustomerOverview(');
  const values = {};
  const elements = {};
  const ids = ['edit-nationality','edit-address','edit-emergency-contact','edit-emergency-phone'];
  for(const id of ids) elements['#'+id] = {value:'old', options: []};
  const ctx={document:{querySelector:(q)=>elements[q]||null},
    populateCustomerSuspensionForm:()=>{},getCurrentCustomerId:()=>null};
  const nationalFields = part('const CUSTOMER_NATIONAL_ADDRESS_FIELDS = [', 'function getCustomerNationalAddressValues(');
  vm.runInNewContext(nationalFields + src,ctx);
  ctx.populateEditCustomerForm({nationality:'Jordan',address:'Test address',emergencyContactName:'Person',emergencyContactPhone:'+966551234567'});
  assert.equal(elements['#edit-nationality'].value,'Jordan');
  assert.equal(elements['#edit-address'].value,'Test address');
  assert.equal(elements['#edit-emergency-contact'].value,'Person');
  assert.equal(elements['#edit-emergency-phone'].value,'551234567');
  for(const id of ids) assert.notEqual(elements['#'+id].disabled,true);
});

test('edit form is hidden until the requested customer data is loaded',()=>{
  const src = part('async function loadEditCustomerPage(', 'function populateEditCustomerForm(');
  assert.match(src,/if \(editForm\) editForm.hidden = true;/);
  assert.match(src,/if \(editForm\) editForm.hidden = false;/);
  assert.ok(src.indexOf('editForm.hidden = false') > src.indexOf('populateEditCustomerForm(customer)'));
});
