'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const css = read('css/parkin-3d-icons.css');
const index = read('index.html');
const names = ['dashboard','locations','valet','drivers','customers','vehicles','zones','bookings','companies','revenue','reports','users','alerts','settings'];

test('all premium icon symbols are redrawn large within one full-bleed raised tile', () => {
  for (const name of names) {
    const icon = read(`assets/icons/3d/${name}.svg`);
    assert.match(icon, /viewBox="0 0 80 80"/);
    assert.match(icon, /<rect x="3" y="2" width="74" height="72" rx="20" fill="url\(#tile\)"/);
    assert.match(icon, /<g filter="url\(#raised\)">/);
    assert.ok(icon.length < 6_000);
    assert.doesNotMatch(icon, /<script|<foreignObject|<image\b|href="https?:\/\//i);
  }
});

test('navigation uses enlarged 46px images with existing labels and routes unchanged', () => {
  const nav = index.slice(index.indexOf('<nav class="dashboard-nav"'), index.indexOf('</nav>'));
  const imageTags = [...nav.matchAll(/<img class="parkin-nav-3d"[^>]+>/g)];
  assert.equal(imageTags.length, names.length);
  for (const tag of imageTags) {
    assert.match(tag[0], /width="46" height="46"/);
    assert.match(tag[0], /alt="" aria-hidden="true"/);
  }
  assert.match(css, /grid-template-columns: 46px minmax\(0, 1fr\) auto/);
  assert.match(css, /width: 46px/);
});

test('animated float, press feedback and hover tilt exist with reduced-motion safeguards', () => {
  assert.match(css, /@keyframes parkin-nav-icon-float/);
  assert.match(css, /@keyframes parkin-nav-icon-halo/);
  assert.match(css, /:hover > img\.parkin-nav-3d/);
  assert.match(css, /:active > img\.parkin-nav-3d/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /animation: none !important/);
});

test('compact desktop and horizontal tablet/mobile navigation sizes are preserved', () => {
  assert.match(css, /@media \(min-width: 901px\)/);
  assert.match(css, /\.parkin-sidebar-condensed/);
  assert.match(css, /@media \(max-width: 1180px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.pr-tab-3d/);
});
