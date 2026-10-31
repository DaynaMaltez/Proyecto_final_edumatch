import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRequiredOnboarding, validatePersonalDetails } from './onboarding.validation.js';
const personal = { phone: '+50255550123', gender: 'prefer_not_to_say', documentType: 'passport', documentNumber: 'TEST-123456', categoryAffinity: ['Matemáticas'] };
test('extended onboarding requires typed personal data and rejects privileged field injection', () => {
  assert.equal(validatePersonalDetails(personal).phone, personal.phone);
  for (const patch of [{ phone: 'invalid' }, { gender: ['female'] }, { documentNumber: '' }, { categoryAffinity: [] }, { categoryAffinity: [{ $ne: null }] }, { role: 'admin' }]) assert.throws(() => validatePersonalDetails({ ...personal, ...patch }));
  assert.throws(() => validatePersonalDetails(undefined));
});
test('extended onboarding requires an address with coordinates and tutor evidence', () => {
  const profile = { location: { city: 'Guatemala', address: 'Dirección temporal', coordinates: { latitude: 14.6, longitude: -90.5 } }, credentials: [{ title: 'Portafolio', evidenceUrl: 'https://example.invalid/cv.pdf' }] };
  assert.doesNotThrow(() => assertRequiredOnboarding(profile, 'student'));
  assert.doesNotThrow(() => assertRequiredOnboarding(profile, 'tutor'));
  assert.throws(() => assertRequiredOnboarding({ ...profile, location: {} }, 'student'));
  assert.throws(() => assertRequiredOnboarding({ ...profile, credentials: [] }, 'tutor'));
});
