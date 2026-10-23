const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'..');
const script = fs.readFileSync(path.join(root,'script.js'),'utf8');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const css = fs.readFileSync(path.join(root,'css/valet.css'),'utf8');

test('successful saves use positive confirmation rather than global error modal', () => {
 assert.match(script,/window\.showDashboardSuccess\s*=\s*function/);
 assert.match(script,/title: "Location created!"|"Location created!"/);
 assert.match(script,/type: "success"/);
 assert.match(script,/successful = \/\\b/);
 assert.match(css,/\.dashboard-alert-success \.dashboard-alert-icon/);
});
test('location create passes positive integer capacity to API and checks response', () => {
 assert.match(script,/rawCapacity = String\(formData\.get\("capacity"\)/);
 assert.match(script,/Number\.isSafeInteger\(capacity\)/);
 assert.match(script,/formData\.set\("capacity", String\(capacity\)\)/);
 assert.match(script,/Number\(savedLocation\.capacity\) !== capacity/);
 assert.match(script,/await getLocationById\(savedLocation\.id\)/);
});
test('table exposes real capacity and parking metrics rather than synthetic zeroes', () => {
 assert.match(html,/<span>Capacity<\/span>\s*<span>Reserved Now<\/span>\s*<span>Vehicles Parked<\/span>\s*<span>Occupancy<\/span>/);
 for(const key of ['capacity','reservedNow','parkedVehicles','occupancyPercent','availableSpaces']) {
  assert.match(script,new RegExp(`location\\.${key}`));
 }
 assert.doesNotMatch(script,/<b>SAR 0<\/b>/);
});
test('illustrated empty state is local and not shown on request failures', () => {
 assert.match(script,/locations-empty-premium\.svg/);
 const image=fs.readFileSync(path.join(root,'assets/illustrations/locations-empty-premium.svg'),'utf8');
 assert.match(image,/<svg /);
 assert.match(script,/title === "No parking locations yet"/);
 assert.match(script,/hasDashboardPermission\("locations\.create"\)/);
});
test('financial KPI does not claim revenue without payment records', () => {
 assert.match(script,/stats\.totalRevenueToday === null/);
 assert.match(script,/Settlement data unavailable/);
});
