'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const index = read('index.html');
const reports = read('js/reports.js');
const styles = read('css/parkin-3d-icons.css');
const reportStyles = read('css/reports.css');
const reportPage = read('pages/reports.html');
const tabKinds = ['bookings','locations','drivers','customers','vehicles','companies','users','revenue'];
const nav = {
  dashboard:'dashboard',locations:'locations','valet-operations':'valet',drivers:'drivers',
  customers:'customers',vehicles:'vehicles',zones:'zones',bookings:'bookings',
  companies:'companies',revenue:'revenue',reports:'reports','user-management':'users',
  alerts:'alerts',settings:'settings'
};
function navMarkup() {
  const begin=index.indexOf('<nav class="dashboard-nav"');
  const end=index.indexOf('</nav>',begin);
  assert.ok(begin > 0 && end > begin);
  return index.slice(begin, end);
}
test('all 14 dimensional SVG icons are local, valid SVG documents and use no external resources', () => {
  for (const name of new Set([...tabKinds, ...Object.values(nav)])) {
    const icon = read(`assets/icons/3d/${name}.svg`);
    assert.match(icon, /<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.match(icon, /viewBox="0 0 80 80"/);
    assert.match(icon, /<linearGradient id="tile"/);
    assert.match(icon, /<filter id="raised"/);
    assert.match(icon, /<\/svg>\s*$/);
    assert.doesNotMatch(icon, /<script|<foreignObject|<image\b|\bhref="https?:\/\/|url\(https?:\/\//i);
    assert.ok(Buffer.byteLength(icon) < 6_000, `Unexpected icon size: ${name}`);
  }
});
test('existing sidebar routes, label text, and permission-dependent navigation remain unchanged', () => {
  const html=navMarkup();
  for (const [route, name] of Object.entries(nav)) {
    assert.match(html, new RegExp(`href="#${route}"[\\s\\S]*?src="/assets/icons/3d/${name}\\.svg"[\\s\\S]*?<span>[^<]+<\\/span>`));
  }
  assert.equal((html.match(/class="parkin-nav-3d"/g)||[]).length, Object.keys(nav).length);
  assert.match(html, /href="#drivers"[\s\S]*?<em>3<\/em>/);
  assert.match(html, /href="#bookings"[\s\S]*?<em>12<\/em>/);
});
test('all eight report categories use the matching local dimensional icon and retain report permissions', () => {
  assert.match(reports, /src="\/assets\/icons\/3d\/\$\{cat\.id\}\.svg"/);
  for (const category of tabKinds) assert.match(reports, new RegExp(`id:'${category}'`));
  assert.match(reports, /getVisibleCategoryIds/);
  assert.match(reports, /hasDashboardPermission/);
});
test('icons have empty alternative text because visible navigation labels already identify actions', () => {
  assert.match(index, /class="parkin-nav-3d"[^>]*alt="" aria-hidden="true"/);
  assert.match(reports, /class="pr-tab-3d"[^>]*alt="" aria-hidden="true"/);
});
test('icon visuals support responsive condensed sidebar and reduced motion', () => {
  assert.match(index, /href="\/css\/parkin-3d-icons\.css"/);
  assert.match(styles, /\.parkin-sidebar-condensed/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /\.pr-tab-3d/);
  assert.match(reportStyles, /\.pr-report-tab \.pr-tab-icon \{width:48px;height:48px;background:transparent/);
});
test('Revenue visual remains pending with no invented payments, while directory availability copy is accurate', () => {
  assert.match(reports, /PENDING_CATEGORIES = new Set\(\['revenue'\]\)/);
  assert.match(reportPage, /Drivers, Customers, Vehicles, Companies and Users directories are available/);
  assert.match(reportPage, /Revenue requires verified payment records/);
});
