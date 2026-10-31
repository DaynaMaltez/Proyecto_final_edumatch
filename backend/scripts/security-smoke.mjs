// Uses fictional identities and removes only fixture IDs, including revoked JWT digests.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { io as connect } from 'socket.io-client';
import { app } from '../dist/app.js';
import { getRequiredEnv, getJwtSecret } from '../dist/config/env.js';
import { signAccessToken } from '../dist/modules/auth/jwt.js';
import { User } from '../dist/modules/users/user.model.js';
import { RevokedToken, tokenDigest } from '../dist/modules/auth/revoked-token.model.js';
import { attachChat } from '../dist/modules/chat/chat.socket.js';

const ids = Array.from({ length: 4 }, () => new mongoose.Types.ObjectId());
let server, io, socket; const tokens = [];
try {
  await mongoose.connect(getRequiredEnv('MONGODB_URI'), { serverSelectionTimeoutMS: 10000 });
  await Promise.all([User.init(), RevokedToken.init()]);
  await User.create(ids.map((_id, index) => ({ _id, fullName: `Seguridad temporal ${index}`, email: `security-${_id}@example.invalid`, googleId: `security-${_id}`, ...(index === 0 ? { role: 'admin' } : index === 3 ? { role: 'student' } : {}), accountStatus: 'active', onboardingCompleted: index === 0 || index === 3 })));
  server = createServer(app); io = attachChat(server); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const id of ids) tokens.push(signAccessToken(String(id), getJwtSecret(), '15m'));
  async function req(index, path, method = 'GET', body, tokenOverride) {
    const response = await fetch(`${base}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(index === null ? {} : { authorization: `Bearer ${tokenOverride ?? tokens[index]}` }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  assert.equal((await req(null, '/profiles/me')).status, 401);
  assert.equal((await req(1, '/profiles/me', 'GET', undefined, 'invalid')).status, 401);
  assert.equal((await req(1, '/profiles/me', 'GET', undefined, signAccessToken(String(ids[1]), getJwtSecret(), '1s', Math.floor(Date.now() / 1000) - 10))).status, 401);
  assert.equal((await req(1, '/profiles/me', 'GET', undefined, signAccessToken(String(ids[1]), 'a-different-test-secret-for-invalid-signature', '15m'))).status, 401);
  assert.equal((await req(1, '/bookings/me')).status, 403, 'Incomplete onboarding cannot book');
  assert.equal((await req(1, '/moderation/users?q=temporal')).status, 403);
  const location = { city: 'Guatemala', address: 'Dirección ficticia de prueba', coordinates: { latitude: 14.6, longitude: -90.5 } };
  const personal = { phone: '+50255550123', gender: 'prefer_not_to_say', documentType: 'other', documentNumber: 'TEST-SECURITY-12345', categoryAffinity: ['Matemáticas'] };
  const student = { role: 'student', profile: { subjectPreferences: ['Matemáticas'], preferredModality: 'virtual', location }, personal };
  assert.equal((await req(1, '/profiles/onboarding', 'POST', { role: 'student', profile: student.profile })).status, 400);
  assert.equal((await req(1, '/profiles/onboarding', 'POST', { ...student, role: 'admin' })).status, 400);
  assert.equal((await req(1, '/profiles/onboarding', 'POST', { ...student, personal: { ...personal, role: 'admin' } })).status, 400);
  assert.equal((await req(1, '/profiles/onboarding', 'POST', { ...student, profile: { ...student.profile, location: { city: 'Guatemala' } } })).status, 400);
  const concurrent = await Promise.all([req(1, '/profiles/onboarding', 'POST', student), req(1, '/profiles/onboarding', 'POST', student)]);
  assert.deepEqual(concurrent.map((result) => result.status).sort(), [200, 409]);
  assert.equal((await req(1, '/profiles/onboarding', 'POST', { ...student, role: 'tutor' })).status, 400);
  const tutor = { role: 'tutor', personal, profile: { biography: 'Docente temporal con experiencia para pruebas de seguridad.', specialties: ['Matemáticas'], hourlyRate: 100, teachingModalities: ['virtual'], location, credentials: [{ title: 'Portafolio temporal', evidenceUrl: 'https://example.invalid/cv.pdf' }], professionalExperience: [] } };
  assert.equal((await req(2, '/profiles/onboarding', 'POST', { ...tutor, profile: { ...tutor.profile, credentials: [] } })).status, 400);
  assert.equal((await req(2, '/profiles/onboarding', 'POST', tutor)).status, 200);
  assert.equal((await req(2, '/services', 'POST', {})).status, 403, 'Pending tutors cannot publish');
  assert.equal((await req(0, `/admin/tutors/${ids[2]}/review`, 'PATCH', { status: 'verified', note: 'Perfil temporal revisado para la prueba.' })).status, 200);
  const publicProfile = await req(null, `/tutors/${ids[2]}`); assert.equal(publicProfile.status, 200);
  const publicJson = JSON.stringify(publicProfile.body);
  for (const privateValue of [personal.phone, personal.documentNumber, personal.gender, location.address, `security-${ids[2]}@example.invalid`, 'https://example.invalid/cv.pdf']) assert.equal(publicJson.includes(privateValue), false, 'Public profiles must not expose private identification');
  const own = await req(1, '/profiles/me'); assert.equal(own.body.user.personal.documentNumber, personal.documentNumber);
  assert.equal(own.headers.get('cache-control'), 'no-store'); assert.equal(own.headers.get('x-powered-by'), null); assert.equal(own.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await req(1, '/profiles/me', 'PUT', { profile: student.profile, personal, role: 'admin' })).status, 400);
  assert.equal((await req(1, '/profiles/me', 'PUT', { profile: { ...student.profile, location: {} } })).status, 400);
  assert.equal((await req(1, '/admin/tutors')).status, 403);
  assert.equal((await req(1, '/analytics?month=2026-10')).status, 403);
  const other = await req(3, '/profiles/me'); assert.equal(other.body.user.id, String(ids[3])); assert.equal(other.body.user.personal, undefined);
  const anotherSession = signAccessToken(String(ids[1]), getJwtSecret(), '15m'); tokens.push(anotherSession);
  assert.notEqual(anotherSession, tokens[1], 'Two logins must receive different JWTs');
  socket = connect(base, { auth: { token: tokens[1] }, transports: ['websocket'], reconnection: false });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); setTimeout(() => reject(new Error('Socket timeout')), 8000).unref(); });
  const disconnected = new Promise((resolve) => socket.once('disconnect', resolve));
  assert.equal((await req(1, '/auth/logout', 'POST')).status, 200); await disconnected;
  assert.equal((await req(1, '/profiles/me')).status, 401, 'A saved JWT cannot be replayed after logout');
  assert.equal((await req(1, '/profiles/me', 'GET', undefined, anotherSession)).status, 200, 'Logout must not revoke a separate login');
  socket = connect(base, { auth: { token: tokens[1] }, transports: ['websocket'], reconnection: false });
  await new Promise((resolve, reject) => { socket.once('connect_error', resolve); socket.once('connect', () => reject(new Error('Revoked socket connected'))); setTimeout(() => reject(new Error('Socket timeout')), 8000).unref(); });
  assert.equal((await req(3, '/auth/logout', 'POST')).status, 200);
  assert.equal((await req(3, '/auth/me')).status, 401);
  console.log('Security integration passed: missing/expired/tampered JWT, onboarding requirements, concurrent registration, role injection, tutor approval, private data projection, cache/security headers, revocation, socket logout, replay rejection and independent sessions.');
} catch (error) { console.error('Security integration failed:', error instanceof assert.AssertionError ? error.message : error.name); process.exitCode = 1; }
finally {
  socket?.disconnect(); if (io) await new Promise((resolve) => io.close(resolve)); else if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) { await RevokedToken.deleteMany({ _id: { $in: tokens.map(tokenDigest) } }); await User.deleteMany({ _id: { $in: ids } }); console.log('Temporary security fixtures removed.'); }
  await mongoose.disconnect();
}
