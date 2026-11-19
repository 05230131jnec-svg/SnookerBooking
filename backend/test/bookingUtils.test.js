const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSlotKeys, parseLocalStart } = require('../src/utils/bookingUtils');

test('builds one unique reservation key for each requested hour', () => {
  assert.deepEqual(buildSlotKeys('2026-11-18', '09:00', 3), [
    '2026-11-18T09:00',
    '2026-11-18T10:00',
    '2026-11-18T11:00'
  ]);
});

test('rejects invalid calendar dates, off-hour starts, and invalid durations', () => {
  assert.throws(() => buildSlotKeys('2026-02-30', '09:00', 1), /calendar date/);
  assert.throws(() => buildSlotKeys('2026-11-18', '09:30', 1), /on-the-hour/);
  assert.throws(() => buildSlotKeys('2026-11-18', '09:00', 5), /between 1 and 4/);
});

test('does not allow a booking to extend into the next day', () => {
  assert.throws(() => buildSlotKeys('2026-11-18', '23:00', 2), /next day/);
});

test('validates local booking time against the browser time-zone offset', () => {
  const start = parseLocalStart('2026-11-18', '09:00', '2026-11-18T03:00:00.000Z', -360);
  assert.equal(start.toISOString(), '2026-11-18T03:00:00.000Z');
  assert.throws(
    () => parseLocalStart('2026-11-18', '10:00', '2026-11-18T03:00:00.000Z', -360),
    /do not match/
  );
});
