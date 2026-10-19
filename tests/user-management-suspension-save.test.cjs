"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/user-management.js"), "utf8");

function fixture({ dirty = false, permitted = true, sectionExists = true, invalid = false } = {}) {
  let calls = 0;
  let previewUpdates = 0;
  const expected = { enabled: true, type: "LIMITED", endsAt: "2026-10-20T09:00:00Z" };
  const window = {
    hasDashboardPermission: () => permitted,
    ParkinUserSuspension: {
      update() { previewUpdates++; },
      payload() {
        calls++;
        if (invalid) throw new Error("Scheduled suspension must start after the current date and time.");
        return expected;
      },
    },
  };
  const context = vm.createContext({ window });
  vm.runInContext(source, context, { filename: "user-management.js" });
  const form = {
    querySelector(selector) {
      assert.equal(selector, "[data-user-suspension]");
      return sectionExists ? { dataset: { dirty: String(dirty) } } : null;
    },
  };
  const submit = () => context.userManagementValidatedEditSuspension(form);
  return { submit, expected, getCalls: () => calls, getPreviewUpdates: () => previewUpdates };
}

test("an unchanged expired schedule blocks Save before the PATCH request", () => {
  const t = fixture({ dirty: false, invalid: true });
  assert.throws(t.submit, /Scheduled suspension must start after the current date and time/);
  assert.equal(t.getCalls(), 1);
  assert.equal(t.getPreviewUpdates(), 1);
});

test("a still-valid unchanged schedule is validated but not unnecessarily re-saved", () => {
  const t = fixture();
  assert.equal(t.submit(), undefined);
  assert.equal(t.getCalls(), 1);
});

test("a changed, valid suspension is included in the PATCH payload", () => {
  const t = fixture({ dirty: true });
  assert.equal(t.submit(), t.expected);
  assert.equal(t.getCalls(), 1);
});

test("a changed, invalid suspension is rejected", () => {
  const t = fixture({ dirty: true, invalid: true });
  assert.throws(t.submit, /Scheduled suspension/);
});

test("users without suspension-management permission do not change suspension", () => {
  const t = fixture({ permitted: false });
  assert.equal(t.submit(), undefined);
  assert.equal(t.getCalls(), 0);
});

test("missing section keeps legacy Edit User forms compatible", () => {
  const t = fixture({ sectionExists: false });
  assert.equal(t.submit(), undefined);
  assert.equal(t.getCalls(), 0);
});

test("Edit User submit handler invokes the validation helper", () => {
  assert.match(source, /automaticSuspension\s*=\s*userManagementValidatedEditSuspension\(form\)/);
});
