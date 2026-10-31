import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTutorFilter, parseTutorQuery, toPublicTutor } from './tutor.controller.js';
import type { IUser } from '../users/user.types.js';

function fakeResponse() {
  return {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

test('tutor query builds MongoDB filters for category, price, modality and city', () => {
  const filter = buildTutorFilter({
    page: 2,
    limit: 10,
    category: 'C++',
    minRate: 50,
    maxRate: 200,
    modality: 'in_person',
    location: 'Guatemala',
  });

  assert.deepEqual(filter, {
    role: 'tutor',
    accountStatus: 'active',
    tutorProfile: { $exists: true },
    'tutorProfile.specialties': { $regex: 'C\\+\\+', $options: 'i' },
    'tutorProfile.hourlyRate': { $gte: 50, $lte: 200 },
    'tutorProfile.teachingModalities': { $in: ['at_tutor', 'at_student'] },
    'tutorProfile.location.city': { $regex: 'Guatemala', $options: 'i' },
  });
});

test('tutor query maps virtual modality to virtual profiles', () => {
  const filter = buildTutorFilter({ page: 1, limit: 12, modality: 'virtual' });
  assert.deepEqual(filter['tutorProfile.teachingModalities'], { $in: ['virtual'] });
});

test('exact home modality does not accidentally include tutor-location lessons', () => {
  const filter = buildTutorFilter({ page: 1, limit: 12, modality: 'at_student' });
  assert.deepEqual(filter['tutorProfile.teachingModalities'], { $in: ['at_student'] });
});

test('tutor query rejects invalid price ranges and filter values', () => {
  const response = fakeResponse();
  const result = parseTutorQuery({ query: { minRate: '250', maxRate: '100', modality: 'mixed' } } as never, response as never);
  assert.equal(result, null);
  assert.equal(response.statusCode, 400);
});

test('public tutor projection omits email, Google id, precise location, and credential evidence URL', () => {
  const result = toPublicTutor({
    _id: 'public-id',
    fullName: 'Tutora de prueba',
    email: 'private@example.com',
    googleId: 'private-google-id',
    tutorProfile: {
      biography: 'Biografía pública suficientemente larga.',
      specialties: ['Matemáticas'],
      hourlyRate: 100,
      teachingModalities: ['virtual'],
      location: { city: 'Guatemala', address: 'Dirección privada 123', coordinates: { latitude: 14.6, longitude: -90.5 } },
      credentials: [{ title: 'Licenciatura', evidenceUrl: 'https://private.example/document.pdf', verified: false }],
      professionalExperience: [],
      verificationStatus: 'pending',
    },
  } as unknown as Partial<IUser> & { _id: unknown });

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('private@example.com'), false);
  assert.equal(serialized.includes('private-google-id'), false);
  assert.equal(serialized.includes('Dirección privada'), false);
  assert.equal(serialized.includes('14.6'), false);
  assert.equal(serialized.includes('private.example/document.pdf'), false);
  assert.equal(result.tutorProfile.location?.city, 'Guatemala');
});
