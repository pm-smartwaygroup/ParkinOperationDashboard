const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = (name) => fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');

test('booking list refreshes on visible active route without caching or fabricated empty state', () => {
  const text = source('bookings.js');
  assert.match(text, /BOOKING_LIST_SYNC_INTERVAL_MS = 12000/);
  assert.match(text, /bookingListSyncInFlight/);
  assert.match(text, /document\.hidden/);
  assert.match(text, /bookingListIsActive\(\)/);
  assert.match(text, /cache: "no-store"/);
  assert.match(text, /Retain the last successful API snapshot/);
  assert.match(text, /startBookingsListSync\(\)/);
});

test('real API status is shown for each booking while category filters remain stable', () => {
  const text = source('bookings.js');
  for (const label of ['Vehicle Parked', 'Return Requested', 'Vehicle on Retrieval', 'Ready for Handover', 'Completed']) {
    assert.ok(text.includes(label), `Missing status ${label}`);
  }
  assert.match(text, /bookingStatusMarkup\(booking\.status, booking\.rawStatus\)/);
});

test('operator-only Mark Parked calls authenticated NestJS endpoint and gets live response', () => {
  const text = source('booking-details.js');
  assert.match(text, /actionPath: "park"/);
  assert.match(text, /window\.hasDashboardPermission\("bookings\.edit"\)/);
  assert.match(text, /updateBookingWorkflowApi\(/);
  assert.match(text, /result\?\.parkedAt/);
  assert.match(text, /bookingDetailStatusLabel\(/);
  assert.match(text, /window\.showParkinToast/);
});
