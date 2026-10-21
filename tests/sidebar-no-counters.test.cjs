const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dashboard = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
const start = dashboard.indexOf('function hideSidebarNavigationCounters() {');
const end = dashboard.indexOf('\nhideSidebarNavigationCounters();', start);
assert.ok(start !== -1 && end !== -1, 'sidebar counter guard must exist');
const runGuard = dashboard.slice(start, end + '\nhideSidebarNavigationCounters();'.length);

function badge(text, classname = 'nav-badge') {
  const el = {
    textContent: text,
    className: classname,
    hidden: false,
    attributes: {},
    display: undefined,
    setAttribute(name, value) { this.attributes[name] = value; },
    style: { setProperty(name, value, priority) { el.display = [name, value, priority]; } },
    closest() { return this.wrapper || this; },
  };
  return el;
}

function fixture() {
  const links = new Map();
  const counts = {
    '#drivers': badge('3'),
    '#bookings': badge('12'),
    '#alerts': badge('8'),
    '#customers': badge('4'),
  };
  for (const [route, count] of Object.entries(counts)) {
    const name = badge(route.slice(1), 'nav-label');
    links.set(route, {
      name,
      nodes: [name, count],
      querySelectorAll() { return this.nodes; },
      contains(el) { return this.nodes.includes(el) || this.nodes.some((n) => n.wrapper === el); },
    });
  }
  let callback;
  let observed;
  class Observer {
    constructor(fn) { callback = fn; }
    observe(nav, config) { observed = { nav, config }; }
  }
  const nav = {
    querySelector(selector) {
      const route = selector.match(/a\[href="([^"]+)"\]/)?.[1];
      return links.get(route) || null;
    },
  };
  const sandbox = {
    document: { querySelector(sel) { return sel === '.dashboard-nav' ? nav : null; } },
    MutationObserver: Observer,
  };
  return { links, counts, nav, sandbox, notify: () => callback(), observed: () => observed };
}

test('hides Drivers, Bookings, Alerts numerical badges, preserves menu titles', () => {
  const data = fixture();
  vm.runInNewContext(runGuard, data.sandbox);
  for (const route of ['#drivers', '#bookings', '#alerts']) {
    assert.equal(data.counts[route].hidden, true, route);
    assert.deepEqual(data.counts[route].display, ['display', 'none', 'important']);
    assert.equal(data.links.get(route).name.hidden, false);
  }
});

test('runs independent of user role, including Super Admin', () => {
  for (const role of ['SUPER_ADMIN', 'COMPANY_ADMIN', 'STAFF']) {
    const data = fixture();
    data.sandbox.role = role;
    vm.runInNewContext(runGuard, data.sandbox);
    for (const route of ['#drivers', '#bookings', '#alerts']) {
      assert.equal(data.counts[route].hidden, true, `${role} ${route}`);
    }
  }
});

test('does not hide badges on other menu items', () => {
  const data = fixture();
  vm.runInNewContext(runGuard, data.sandbox);
  assert.equal(data.counts['#customers'].hidden, false);
});

test('rehides counters inserted after login or live refresh', () => {
  const data = fixture();
  vm.runInNewContext(runGuard, data.sandbox);
  assert.equal(data.observed().nav, data.nav);
  assert.equal(data.observed().config.subtree, true);
  const another = badge('99+');
  data.links.get('#bookings').nodes.push(another);
  data.notify();
  assert.equal(another.hidden, true);
});

test('hides a numeric counter wrapper without hiding the nav link', () => {
  const data = fixture();
  const inner = badge('8', 'badge-number');
  const outer = badge('8', 'nav-badge');
  inner.wrapper = outer;
  data.links.get('#alerts').nodes = [data.links.get('#alerts').name, inner, outer];
  vm.runInNewContext(runGuard, data.sandbox);
  assert.equal(outer.hidden, true);
  assert.equal(data.links.get('#alerts').name.hidden, false);
});
