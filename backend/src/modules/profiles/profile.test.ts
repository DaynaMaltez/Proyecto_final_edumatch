import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfileHandlers, type ProfileControllerDependencies } from './profile.controller.js';
import type { IUser } from '../users/user.types.js';

function makeUser(overrides: Partial<IUser> & { save?: () => Promise<unknown> } = {}) {
  return {
    _id: '65a000000000000000000001',
    fullName: 'Ada Estudiante',
    email: 'ada@example.com',
    role: 'student' as const,
    accountStatus: 'active' as const,
    onboardingCompleted: true,
    studentProfile: undefined,
    tutorProfile: undefined,
    save: async () => undefined,
    ...overrides,
  };
}

function fakeResponse() {
  return {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

test('profile update is scoped to the authenticated user id', async () => {
  const user = makeUser();
  let requestedId = '';
  const dependencies: ProfileControllerDependencies = {
    findById: async (id) => { requestedId = id; return user; },
  };
  const handlers = createProfileHandlers(dependencies);
  const response = fakeResponse();

  await handlers.updateMine({
    authUser: { id: user._id, fullName: user.fullName, email: user.email, role: 'student', accountStatus: 'active' },
    body: { profile: { subjectPreferences: ['Matemáticas'], preferredModality: 'virtual' } },
  } as never, response as never);

  assert.equal(requestedId, user._id);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(user.studentProfile?.subjectPreferences, ['Matemáticas']);
});

test('profile update rejects role and internal fields without saving', async () => {
  let saved = false;
  const user = makeUser({ save: async () => { saved = true; } });
  const handlers = createProfileHandlers({ findById: async () => user });
  const response = fakeResponse();

  await handlers.updateMine({
    authUser: { id: user._id, fullName: user.fullName, email: user.email, role: 'student', accountStatus: 'active' },
    body: { role: 'admin', profile: { subjectPreferences: [], preferredModality: 'both' } },
  } as never, response as never);

  assert.equal(response.statusCode, 400);
  assert.equal(saved, false);
});

test('student cannot submit tutor profile fields and admin cannot use learner profile editing', async () => {
  const student = makeUser();
  const handlers = createProfileHandlers({ findById: async () => student });
  const studentResponse = fakeResponse();
  await handlers.updateMine({
    authUser: { id: student._id, fullName: student.fullName, email: student.email, role: 'student', accountStatus: 'active' },
    body: { profile: { biography: 'Un perfil ajeno.', specialties: ['Matemáticas'] } },
  } as never, studentResponse as never);
  assert.equal(studentResponse.statusCode, 400);

  const adminResponse = fakeResponse();
  await handlers.updateMine({
    authUser: { id: student._id, fullName: student.fullName, email: student.email, role: 'admin', accountStatus: 'active' },
    body: { profile: { subjectPreferences: [], preferredModality: 'both' } },
  } as never, adminResponse as never);
  assert.equal(adminResponse.statusCode, 403);
});

test('tutor update cannot mark credentials verified or change account role/status', async () => {
  const tutor = makeUser({ role: 'tutor' });
  let saved = false;
  tutor.save = async () => { saved = true; };
  const handlers = createProfileHandlers({ findById: async () => tutor });
  const response = fakeResponse();
  await handlers.updateMine({
    authUser: { id: tutor._id, fullName: tutor.fullName, email: tutor.email, role: 'tutor', accountStatus: 'active' },
    body: { profile: {
      biography: 'Soy tutora con experiencia enseñando a estudiantes.',
      specialties: ['Matemáticas'],
      hourlyRate: 120,
      teachingModalities: ['virtual'],
      credentials: [{ title: 'Licenciatura', verified: true }],
      professionalExperience: [],
    } },
  } as never, response as never);

  assert.equal(response.statusCode, 400);
  assert.equal(saved, false);
});

test('valid tutor profile saves public fields while new credentials remain unverified', async () => {
  const tutor = makeUser({ role: 'tutor' });
  let saved = false;
  tutor.save = async () => { saved = true; };
  const handlers = createProfileHandlers({ findById: async () => tutor });
  const response = fakeResponse();
  await handlers.updateMine({
    authUser: { id: tutor._id, fullName: tutor.fullName, email: tutor.email, role: 'tutor', accountStatus: 'active' },
    body: { profile: {
      biography: 'Enseño matemáticas con ejercicios prácticos y claros.',
      specialties: ['Matemáticas', 'Álgebra'],
      hourlyRate: 125,
      teachingModalities: ['virtual', 'at_student'],
      location: { city: 'Guatemala', coordinates: { latitude: 14.6, longitude: -90.5 } },
      credentials: [{ title: 'Licenciatura', institution: 'Universidad', verified: true }],
      professionalExperience: [{ organization: 'Centro educativo', position: 'Tutora' }],
      verificationStatus: 'verified',
    } },
  } as never, response as never);

  assert.equal(response.statusCode, 400);
  assert.equal(saved, false);

  const cleanResponse = fakeResponse();
  await handlers.updateMine({
    authUser: { id: tutor._id, fullName: tutor.fullName, email: tutor.email, role: 'tutor', accountStatus: 'active' },
    body: { profile: {
      biography: 'Enseño matemáticas con ejercicios prácticos y claros.',
      specialties: ['Matemáticas', 'Álgebra'],
      hourlyRate: 125,
      teachingModalities: ['virtual', 'at_student'],
      location: { city: 'Guatemala', coordinates: { latitude: 14.6, longitude: -90.5 } },
      credentials: [{ title: 'Licenciatura', institution: 'Universidad' }],
      professionalExperience: [{ organization: 'Centro educativo', position: 'Tutora' }],
    } },
  } as never, cleanResponse as never);

  assert.equal(cleanResponse.statusCode, 200);
  assert.equal(saved, true);
  assert.equal(tutor.role, 'tutor');
  assert.equal(tutor.accountStatus, 'active');
  assert.equal(tutor.tutorProfile?.credentials[0]?.verified, false);
  assert.equal(tutor.tutorProfile?.verificationStatus, 'pending');
});

test('tutor edits preserve prior credential review only when the credential fields are unchanged', async () => {
  const verifiedCredential = { title: 'Licenciatura', institution: 'Universidad', description: 'Matemáticas', verified: true };
  const tutor = makeUser({
    role: 'tutor',
    tutorProfile: {
      biography: 'Enseño matemáticas con ejercicios prácticos y claros.',
      specialties: ['Matemáticas'], hourlyRate: 100, teachingModalities: ['virtual'],
      credentials: [verifiedCredential], professionalExperience: [], verificationStatus: 'verified',
    },
  });
  const handlers = createProfileHandlers({ findById: async () => tutor });
  const response = fakeResponse();
  await handlers.updateMine({
    authUser: { id: tutor._id, fullName: tutor.fullName, email: tutor.email, role: 'tutor', accountStatus: 'active' },
    body: { profile: {
      biography: 'Enseño matemáticas con ejercicios prácticos y claros.',
      specialties: ['Matemáticas'], hourlyRate: 100, teachingModalities: ['virtual'],
      credentials: [{ title: verifiedCredential.title, institution: verifiedCredential.institution, description: verifiedCredential.description }],
      professionalExperience: [],
    } },
  } as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.equal(tutor.tutorProfile?.credentials[0]?.verified, true);
  assert.equal(tutor.tutorProfile?.verificationStatus, 'verified');
});
