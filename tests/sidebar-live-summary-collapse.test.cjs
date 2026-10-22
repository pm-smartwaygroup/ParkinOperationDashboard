const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'dashboard-sidebar-live.css'), 'utf8');

test('sidebar header toggle remains accessible and does not replace permission nav', () => {
  assert.match(html, /class="sidebar-collapse"[\s\S]*?aria-expanded="true"/);
  assert.match(html, /id="parkin-dashboard-navigation"/);
  assert.match(script, /button\.addEventListener\('click'/);
  assert.match(script, /page\.classList\.toggle\('parkin-sidebar-condensed'/);
  assert.match(script, /aria-expanded/);
  assert.match(script, /const preference = 'parkin_dashboard_sidebar_collapsed'/);
  assert.match(css, /\.dashboard-page\.parkin-sidebar-condensed/);
  assert.match(css, /@media \(max-width: 900px\)/);
});

test('summary has no fabricated counts or unsupported #summary route', () => {
  const summary = html.match(/<div class="today-summary"[\s\S]*?<button\s+class="manager-card"/)?.[0];
  assert.ok(summary);
  for (const name of ['companies', 'vehicles', 'locations']) {
    assert.match(summary, new RegExp(`data-summary-metric="${name}"`));
  }
  assert.doesNotMatch(summary, /1,248|<dd>24<\/dd>|<dd>18<\/dd>|href="#summary"/);
  assert.match(summary, /class="summary-refresh"/);
});

test('live summary fetches role-scoped existing endpoints and never turns errors into zero', () => {
  assert.match(script, /getJSON\('\/companies\/options'\)/);
  assert.match(script, /getJSON\('\/vehicles'\)/);
  assert.match(script, /getJSON\('\/locations\/statistics'\)/);
  assert.match(script, /hasDashboardPermission\('vehicles.view'\)/);
  assert.match(script, /hasDashboardPermission\('locations.view'\)/);
  assert.match(script, /Promise\.allSettled/);
  assert.match(script, /'—'/);
  assert.match(script, /summaryReset\(\);[\s\S]*disconnectAuthSocket\(\)/);
});

test('Vehicles Today uses genuine createdAt data and strict AST day boundaries', () => {
  const start = script.indexOf('function summarySaudiDate(value) {');
  const end = script.indexOf('\nfunction summaryReset()', start);
  assert.ok(start !== -1 && end > start);
  const context = vm.createContext({Intl, Date, Object});
  vm.runInContext(script.slice(start, end), context);
  assert.equal(vm.runInContext('summarySaudiDate(new Date("2026-10-21T20:59:59Z"))',context),'2026-10-21');
  assert.equal(vm.runInContext('summarySaudiDate(new Date("2026-10-21T21:00:00Z"))',context),'2026-10-22');
  assert.match(script, /typeof entry\.createdAt === 'string'/);
});
