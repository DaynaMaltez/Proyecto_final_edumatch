import assert from 'node:assert/strict';
import test from 'node:test';
import { distanceKm, serviceSearchFilter } from './search.helpers.js';

test('search combines course price, modality and literal category', () => {
  const filter = serviceSearchFilter({ category: 'C++', modality: 'virtual', minRate: 50, maxRate: 100 });
  assert.deepEqual(filter.modality, { $in: ['virtual'] });
  assert.deepEqual(filter.hourlyRate, { $gte: 50, $lte: 100 });
  assert.deepEqual(filter.$or, ['category', 'title', 'description'].map((field) => ({ [field]: { $regex: 'C\\+\\+', $options: 'i' } })));
});
test('presential search includes both locations; home search only home lessons', () => {
  assert.deepEqual(serviceSearchFilter({ modality: 'in_person' }).modality, { $in: ['at_tutor', 'at_student'] });
  assert.deepEqual(serviceSearchFilter({ modality: 'at_student' }).modality, { $in: ['at_student'] });
});
test('distance calculation handles identical points, known distance and opposite points', () => {
  assert.equal(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }), 0);
  assert.ok(Math.abs(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) - 111.195) < 0.01);
  assert.ok(Number.isFinite(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 })));
});
