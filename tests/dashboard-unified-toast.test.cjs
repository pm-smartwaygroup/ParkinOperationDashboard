const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const base = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(base, name), 'utf8');

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.dataset = {};
    this.style = { setProperty: (key, value) => { this.style[key] = value; } };
    this.classList = { add: (...classes) => { for (const name of classes) this.className += ` ${name}`; }, remove: (...classes) => { for (const name of classes) this.className = this.className.replace(` ${name}`, ''); } };
    this.className = '';
    this.isConnected = false;
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  append(...nodes) { for (const node of nodes) { this.children.push(node); node.parent = this; node.isConnected = true; } }
  appendChild(node) { this.append(node); return node; }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    this.isConnected = false;
  }
  contains(el) { return this === el || this.children.some(c => c.contains(el)); }
}
function harness() {
  const body = new Element('body');
  const timeouts = [];
  const window = {
    matchMedia: () => ({ matches: true }),
    setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; },
  };
  const document = { body, createElement: tag => new Element(tag) };
  vm.runInNewContext(read('js/dashboard-notifications.js'), { window, document, Date, Number, Set, String, Object, clearTimeout() {} });
  return { window, body, timeouts };
}

test('dashboard loads global toast stylesheet and controller before other modules', () => {
  const html = read('index.html');
  assert.ok(html.includes('/css/dashboard-notifications.css'));
  assert.ok(html.indexOf('/js/dashboard-notifications.js') < html.indexOf('/script.js'));
});
test('non-actionable alerts are toasts; action confirmations remain dialogs', () => {
  const script = read('script.js');
  assert.match(script, /typeof onConfirm !== "function" && !cancelButtonText/);
  assert.match(script, /return window\.showParkinToast\(message/);
  assert.match(script, /onConfirm: performDashboardLogout/);
  assert.match(script, /window\.showDashboardSuccess = function/);
  assert.match(script, /window\.alert = function/);
});
test('toast renders safe text, correct colors and non-modal semantics', () => {
  const { window, body } = harness();
  window.showParkinToast('<img src=x onerror=alert(1)>', { title: 'Saved!', type: 'success' });
  const stack = body.children[0];
  assert.equal(stack.children.length, 1);
  const toast = stack.children[0];
  assert.match(toast.className, /parkin-toast--success/);
  assert.equal(toast.attributes.role, 'status');
  assert.equal(toast.children[1].children[1].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(toast.children[1].children[0].textContent, 'Saved!');
  window.showParkinToast('No permission', { type: 'error' });
  assert.equal(stack.children[1].attributes.role, 'alert');
});
test('duplicate notifications collapse and dismiss button works', () => {
  const { window, body } = harness();
  window.showParkinToast('Record saved', { type: 'success' });
  window.showParkinToast('Record saved', { type: 'success' });
  const stack = body.children[0];
  assert.equal(stack.children.length, 1);
  stack.children[0].children[2].listeners.click();
  assert.equal(stack.children.length, 0);
});
test('notifications have accessible close, responsive style and reduced motion', () => {
  const css = read('css/dashboard-notifications.css');
  assert.match(css, /\.parkin-toast__progress/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /max-width: 560px/);
  assert.match(css, /data-theme="dark"/);
  assert.match(read('js/dashboard-notifications.js'), /aria-label.*Dismiss/);
});
test('legacy modules use the global message surface', () => {
  for (const file of ['js/companies.js', 'js/parking-zones.js', 'js/add-parking-zone.js', 'js/drivers.js', 'js/customers.js']) {
    assert.match(read(file), /window\.showParkinToast/);
  }
});
