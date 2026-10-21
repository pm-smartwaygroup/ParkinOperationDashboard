const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'pages/reports.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css/reports.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js/reports.js'), 'utf8');
const router = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

test('reports route uses existing permission and has its own show handler', () => {
  assert.match(router, /"#reports": "reports\.view"/);
  assert.match(router, /if \(routeName === "reports"\) \{\s*showReportsView\(\)/);
  assert.match(router, /async function showReportsView\(\)/);
});
test('Reports is lazily loaded without touching existing user auth', () => {
  assert.match(router, /loadDashboardScript\("\/js\/reports\.js"\)/);
  assert.match(router, /fetch\("\/pages\/reports\.html"/);
  assert.match(router, /document\.querySelector\("#reports-view"\)\?\.classList\.add\("hidden"\)/);
});
test('report UI includes all essential interactive controls', () => {
  for (const selector of ['data-report-tabs','data-reports-filter-form','data-search','data-sort','data-select-page','data-saved-toggle','data-export-toggle','data-column-toggle','data-detail-dialog']) {
    if (selector === 'data-sort') assert.match(app, /data-sort=/);
    else assert.ok(page.includes(selector) || app.includes(selector), `${selector} missing`);
  }
});
test('all eight report schemas exist', () => {
  for (const kind of ['bookings','revenue','locations','drivers','customers','vehicles','companies','users']) assert.match(app, new RegExp(`\\b${kind}:`));
});
test('bad date ranges are rejected before applying', () => {
  assert.match(app, /next\.from>next\.to/);
  assert.match(app, /Choose a valid date range/);
});
test('CSV export and isolated records-only PDF are implemented; scheduling honestly deferred', () => {
  assert.match(app, /text\/csv;charset=utf-8/);
  assert.ok(app.includes(String.raw`\ufeff`));
  assert.match(app, /printingWindow\.print\(\)/);
  assert.match(app, /document\.createElement\('iframe'\)/);
  assert.doesNotMatch(app, /\bwindow\.print\(\)/);
  assert.match(app, /Scheduled report delivery requires the future API/);
});
test('layout has desktop, iPad and mobile breakpoints', () => {
  for(const width of ['1400','1024','720','480']) assert.ok(styles.includes(`max-width:${width}px`));
  assert.match(styles, /overflow-x:auto/);
});
test('production never generates sample bookings or synthetic system users', () => {
  assert.doesNotMatch(app, /makeBookings|const BOOKINGS|const USERS|Visible sample users/);
  assert.match(app, /state\.type !== 'bookings'\) return \[\]/);
  assert.match(app, /if\(pending\)\{\s*state\.viewRecords=\[\]/);
  assert.match(page, /data-report-pending hidden/);
  assert.match(app, /No export was generated/);
  assert.doesNotMatch(app, /\/users\?page|\/bookings\?page|Authorization.*Bearer/);
  new vm.Script(app);
});
