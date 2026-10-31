import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarConflict, expandDates, sessionTotal, validDate, legacyIntervals, hasClassEnded } from './calendar.helpers.js';

test('weekly subscriptions expand only selected weekdays, including end date', () => {
  assert.deepEqual(expandDates('2099-04-20', { until: '2099-05-04', weekdays: [1] }), ['2099-04-20', '2099-04-27', '2099-05-04']);
});
test('single sessions stay single and impossible dates are rejected', () => {
  assert.deepEqual(expandDates('2099-04-20', undefined), ['2099-04-20']);
  assert.equal(validDate('2099-02-30'), false);
  assert.throws(() => expandDates('2099-02-30', undefined));
});
test('recurrence rejects invalid weekdays, backwards ranges and excessive series', () => {
  assert.throws(() => expandDates('2099-04-20', []));
  assert.throws(() => expandDates('2099-04-20', { until: '2099-04-27', weekdays: [2] }));
  assert.throws(() => expandDates('2099-04-20', { until: '2099-04-19', weekdays: [1] }));
  assert.throws(() => expandDates('2099-04-20', { until: '2099-05-01', weekdays: [7] }));
  assert.throws(() => expandDates('2099-04-20', { until: '2100-04-20', weekdays: [1] }));
  assert.throws(() => expandDates('2099-01-01', { until: '2099-05-01', weekdays: [0, 1, 2, 3, 4, 5, 6] }));
});
test('student intervals cannot overlap, but touching sessions are allowed', () => {
  const a = { date: '2099-04-20', startTime: '09:00', endTime: '10:00' };
  assert.equal(calendarConflict(a, { ...a, startTime: '09:30', endTime: '10:30' }), true);
  assert.equal(calendarConflict(a, { ...a, startTime: '10:00', endTime: '11:00' }), false);
});
test('travel buffers block nearby sessions and work across midnight', () => {
  const a = { date: '2099-04-20', startTime: '23:00', endTime: '23:50', bufferMinutes: 30 };
  assert.equal(calendarConflict(a, { date: '2099-04-21', startTime: '00:10', endTime: '01:00' }, true), true);
  assert.equal(calendarConflict(a, { date: '2099-04-21', startTime: '00:20', endTime: '01:00' }, true), false);
});
test('prices multiply hours and add one travel charge per session', () => {
  assert.equal(sessionTotal('09:00', '10:30', 100, 25), 175);
  assert.equal(sessionTotal('09:00', '10:00', 75.5, 0), 75.5);
  assert.equal(sessionTotal('09:00', '09:20', 100, 0), 33.33);
});
test('legacy reservations block only valid active intervals', () => {
  const record = { date: '2099-04-20', startTime: '09:00', endTime: '10:00', status: 'pending' };
  assert.equal(legacyIntervals([record, { ...record, status: 'cancelled' }, { ...record, date: 'invalid' }, { ...record, endTime: '08:00' }]).length, 1);
});
test('class completion uses Guatemala time and rejects invalid dates', () => {
  assert.equal(hasClassEnded('2026-10-30', '10:00', Date.parse('2026-10-30T15:59:59Z')), false);
  assert.equal(hasClassEnded('2026-10-30', '10:00', Date.parse('2026-10-30T16:00:00Z')), true);
  assert.equal(hasClassEnded('2026-02-30', '10:00'), false);
  assert.equal(hasClassEnded('2026-10-30', '25:00'), false);
});
