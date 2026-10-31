import assert from 'node:assert/strict';
import test from 'node:test';
import { validateService } from './service.validation.js';

const draft = { title: 'Álgebra para principiantes', description: 'Tutorías de álgebra con ejercicios personalizados.', category: 'Matemáticas', modality: 'virtual', hourlyRate: 75.50, travelCost: 0 };

test('services accept virtual lessons without travel charges and home lessons with travel charges', () => {
  assert.equal(validateService(draft).hourlyRate, 75.50);
  assert.equal(validateService({ ...draft, modality: 'at_student', travelCost: 25 }).travelCost, 25);
  assert.equal(validateService({ ...draft, modality: 'at_student', travelCost: 0 }).travelCost, 0);
});

test('services reject invalid amounts and travel charges for virtual or tutor-location lessons', () => {
  for (const hourlyRate of [-1, NaN, Infinity, '75', 1.234, 1000001]) {
    assert.throws(() => validateService({ ...draft, hourlyRate }));
  }
  for (const modality of ['virtual', 'at_tutor']) {
    assert.throws(() => validateService({ ...draft, modality, travelCost: 15 }));
  }
  assert.throws(() => validateService({ ...draft, modality: 'at_student', travelCost: -5 }));
});

test('services reject identity injection and unsupported categories or modalities', () => {
  assert.throws(() => validateService({ ...draft, tutorId: 'another-account' }));
  assert.throws(() => validateService({ ...draft, category: 'unknown' }));
  assert.throws(() => validateService({ ...draft, modality: 'unknown' }));
  assert.throws(() => validateService({ ...draft, title: '   ' }));
});
