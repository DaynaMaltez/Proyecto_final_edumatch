import assert from 'node:assert/strict';
import test from 'node:test';
import { slotsOverlap, validateSlot } from './scheduling.controller.js';

test('availability validation rejects impossible dates and invalid intervals', () => {
  const base = { date: '2099-04-20', startTime: '09:00', endTime: '10:00', modality: 'virtual' };
  assert.equal(validateSlot(base), true);
  assert.equal(validateSlot({ ...base, date: '2099-02-30' }), false);
  assert.equal(validateSlot({ ...base, endTime: '09:00' }), false);
  assert.equal(validateSlot({ ...base, startTime: '25:00' }), false);
});

test('overlap treats touching reservations as separate and rejects intersection', () => {
  const slot = { date: '2099-04-20', startTime: '09:00', endTime: '10:00' };
  assert.equal(slotsOverlap(slot, { ...slot, startTime: '10:00', endTime: '11:00' }), false);
  assert.equal(slotsOverlap(slot, { ...slot, startTime: '09:59', endTime: '11:00' }), true);
});

test('optimistic compare-and-swap admits only one concurrent overlapping booking', async () => {
  let revision = 0;
  const reservations: Array<{ startTime: string; endTime: string; date: string }> = [];
  async function attempt(slot: { startTime: string; endTime: string; date: string }) {
    for (let retry = 0; retry < 8; retry++) {
      const observedRevision = revision;
      const snapshot = [...reservations];
      await Promise.resolve();
      if (snapshot.some((prior) => slotsOverlap(prior, slot))) return false;
      if (revision !== observedRevision) continue;
      revision++;
      reservations.push(slot);
      return true;
    }
    return false;
  }
  const outcomes = await Promise.all([
    attempt({ date: '2099-04-20', startTime: '09:00', endTime: '10:00' }),
    attempt({ date: '2099-04-20', startTime: '09:30', endTime: '10:30' }),
  ]);
  assert.equal(outcomes.filter(Boolean).length, 1);
});
