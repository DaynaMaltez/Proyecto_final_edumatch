// Integration checks create and remove only their own generated fixture IDs.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { app } from '../dist/app.js';
import { getRequiredEnv, getJwtSecret } from '../dist/config/env.js';
import { signAccessToken } from '../dist/modules/auth/jwt.js';
import { createGoogleSession } from '../dist/modules/auth/auth.service.js';
import { authUserRepository } from '../dist/modules/auth/auth.repository.js';
import { User } from '../dist/modules/users/user.model.js';
import { ConductReport, AccountAppeal } from '../dist/modules/admin/moderation.models.js';
import { AcademicCategory } from '../dist/modules/admin/category.routes.js';
import { TutoringService } from '../dist/modules/services/service.model.js';
import { BookingRecord } from '../dist/modules/scheduling/booking.model.js';
import { Review } from '../dist/modules/services/review.model.js';
import { attachChat } from '../dist/modules/chat/chat.socket.js';
import { io as connect } from 'socket.io-client';

const ids = Array.from({ length: 4 }, () => new mongoose.Types.ObjectId());
const categoryId = new mongoose.Types.ObjectId(), serviceId = new mongoose.Types.ObjectId();
const bookingIds = Array.from({ length: 3 }, () => new mongoose.Types.ObjectId());
const categoryName = `Prueba-${categoryId}`;
let server, socketsServer, socket;
try {
  await mongoose.connect(getRequiredEnv('MONGODB_URI'), { serverSelectionTimeoutMS: 10000 });
  await Promise.all([User.init(), ConductReport.init(), AccountAppeal.init(), AcademicCategory.init()]);
  await User.create(ids.map((_id, index) => ({ _id, fullName: `Moderación temporal ${index}`, email: `moderation-${_id}@example.invalid`, googleId: `moderation-${_id}`, role: index === 0 ? 'admin' : index === 1 ? 'tutor' : 'student', accountStatus: 'active', onboardingCompleted: true })));
  await User.updateOne({ _id: ids[1] }, { $set: { tutorProfile: { biography: 'Catedrático temporal para prueba integral de moderación.', specialties: ['Matemáticas'], hourlyRate: 100, teachingModalities: ['virtual'], credentials: [], professionalExperience: [], verificationStatus: 'verified' } } });
  server = createServer(app); socketsServer = attachChat(server); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const tokens = ids.map((id) => signAccessToken(String(id), getJwtSecret(), '15m'));
  async function req(index, path, method = 'GET', body) {
    const response = await fetch(`${base}${path}`, { method, headers: { ...(index === null ? {} : { authorization: `Bearer ${tokens[index]}` }), 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }
  assert.equal((await req(null, '/moderation/reports')).status, 401);
  assert.equal((await req(2, '/moderation/reports')).status, 403);
  assert.equal((await req(2, '/analytics?month=2050-02')).status, 403);
  const report = await req(2, '/moderation/reports', 'POST', { targetId: String(ids[1]), reason: 'conduct', evidence: 'Evidencia textual de prueba: mensajes inapropiados en la clase.' });
  assert.equal(report.status, 201); const reportId = report.body.data._id;
  assert.equal((await req(2, '/moderation/reports', 'POST', { targetId: String(ids[1]), reason: 'conduct', evidence: 'Denuncia duplicada que debe ser rechazada.' })).status, 409);
  assert.equal((await req(2, '/moderation/reports', 'POST', { targetId: String(ids[2]), reason: 'other', evidence: 'No se permite denunciar la propia cuenta.' })).status, 400);
  assert.equal((await req(3, '/moderation/reports/me')).body.data.length, 0);
  assert.equal((await req(0, `/moderation/reports?status=all&targetId=${ids[1]}`)).body.data.length, 1);
  assert.equal((await req(2, `/moderation/users/${ids[1]}/suspend`, 'PATCH', { reason: 'Intento de suspensión sin permisos.' })).status, 403);
  socket = connect(base.replace('/api', ''), { auth: { token: tokens[1] }, transports: ['websocket'], reconnection: false });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); setTimeout(() => reject(new Error('Socket timeout')), 8000).unref(); });
  const disconnected = new Promise((resolve) => socket.once('disconnect', resolve));
  const suspension = await req(0, `/moderation/users/${ids[1]}/suspend`, 'PATCH', { reason: 'Se suspende por conducta inapropiada documentada en la prueba.' }); assert.equal(suspension.status, 200);
  await disconnected; assert.equal(socket.connected, false);
  assert.equal((await req(0, `/moderation/users/${ids[0]}/suspend`, 'PATCH', { reason: 'No se puede suspender administradores desde esta ruta.' })).status, 409);
  const session = await createGoogleSession({ googleId: `moderation-${ids[1]}`, fullName: 'Temporal', email: `moderation-${ids[1]}@example.invalid` }, { users: authUserRepository, issueToken: (id) => signAccessToken(id, getJwtSecret(), '15m') });
  assert.equal(session.user.accountStatus, 'suspended'); assert.ok(session.accessToken);
  for (const path of ['/profiles/me', '/bookings/me', '/chat']) assert.equal((await req(1, path)).status, 403);
  assert.equal((await req(1, '/auth/me')).body.user.accountStatus, 'suspended');
  const state = await req(1, '/moderation/me'); assert.equal(state.status, 200); assert.ok(state.body.suspension.suspendedAt); assert.equal(state.body.suspension.reason, suspension.body.data.suspension.reason);
  const appeal = await req(1, '/moderation/appeals', 'POST', { statement: 'Solicito revisar mi caso. Esta es la evidencia textual de mi apelación.' }); assert.equal(appeal.status, 201);
  assert.equal((await req(1, '/moderation/appeals', 'POST', { statement: 'Una apelación duplicada no debe registrarse de nuevo.' })).status, 409);
  assert.equal((await req(2, `/moderation/appeals/${appeal.body.data._id}`, 'PATCH', { status: 'accepted', decision: 'No tiene permisos para revisar apelaciones.' })).status, 403);
  const decision = { status: 'accepted', decision: 'Se revisó la evidencia y procede la reactivación de la cuenta.' };
  const accepted = await Promise.all([req(0, `/moderation/appeals/${appeal.body.data._id}`, 'PATCH', decision), req(0, `/moderation/appeals/${appeal.body.data._id}`, 'PATCH', decision)]);
  assert.deepEqual(accepted.map((item) => item.status).sort(), [200, 409]);
  assert.equal((await req(1, '/profiles/me')).status, 200);
  assert.equal((await req(0, `/moderation/reports/${reportId}`, 'PATCH', { status: 'actioned', decision: 'Se revisó y se registraron las acciones correspondientes.' })).status, 200);
  assert.equal((await req(2, '/moderation/reports/me')).body.data[0].status, 'actioned');
  // A second suspension creates a separate auditable case. Rejection keeps it blocked.
  assert.equal((await req(0, `/moderation/users/${ids[1]}/suspend`, 'PATCH', { reason: 'Segunda suspensión temporal para verificar rechazo y auditoría.' })).status, 200);
  const secondAppeal = await req(1, '/moderation/appeals', 'POST', { statement: 'Mi versión de los hechos para esta segunda suspensión de prueba.' }); assert.equal(secondAppeal.status, 201);
  assert.equal((await req(0, `/moderation/appeals/${secondAppeal.body.data._id}`, 'PATCH', { status: 'rejected', decision: 'La evidencia no justifica reactivar la cuenta en este caso.' })).status, 200);
  assert.equal((await req(1, '/auth/me')).body.user.accountStatus, 'suspended');
  assert.equal((await req(1, '/moderation/me')).body.appeals.length, 2);
  assert.equal((await req(0, `/moderation/appeals/${secondAppeal.body.data._id}`, 'PATCH', { status: 'accepted', decision: 'Se recibió nueva evidencia y se reconsidera la resolución anterior.' })).status, 200);
  const reconsidered = await AccountAppeal.findById(secondAppeal.body.data._id).lean(); assert.equal(reconsidered.decisions.length, 2);
  assert.equal((await req(1, '/profiles/me')).status, 200);
  // Catalog and monthly analytics.
  assert.equal((await req(2, '/categories', 'POST', { name: categoryName, subcategories: [] })).status, 403);
  const category = await req(0, '/categories', 'POST', { name: categoryName, subcategories: ['Práctica', 'Teoría'] }); assert.equal(category.status, 201);
  const createdCategoryId = category.body.data._id;
  // Save generated ID immediately so cleanup remains scoped if a later assertion fails.
  await AcademicCategory.updateOne({ _id: createdCategoryId }, { $set: { name: categoryName } });
  const published = await req(1, '/services', 'POST', { title: 'Curso con categoría nueva', description: 'Publicación con categoría administrada desde el panel de administración.', category: categoryName, modality: 'virtual', hourlyRate: 100, travelCost: 0 });
  assert.equal(published.status, 201);
  assert.equal((await req(1, `/services/${published.body.data._id}`, 'PUT', { title: 'Curso con categoría editada', description: 'Edición con categoría administrada desde el panel de administración.', category: categoryName, modality: 'virtual', hourlyRate: 150, travelCost: 0 })).status, 200);
  await TutoringService.create({ _id: serviceId, tutorId: ids[1], title: 'Curso de prueba temporal', description: 'Descripción suficiente para un curso temporal de pruebas.', category: categoryName, modality: 'virtual', hourlyRate: 100, travelCost: 0 });
  assert.equal((await req(0, `/categories/${createdCategoryId}`, 'DELETE')).status, 409);
  assert.equal((await req(0, `/categories/${createdCategoryId}`, 'PUT', { name: `${categoryName}-editada`, subcategories: ['Práctica'] })).status, 200);
  assert.equal((await TutoringService.findById(serviceId).lean()).category, `${categoryName}-editada`);
  await BookingRecord.create(bookingIds.map((_id, index) => ({ _id, tutorId: ids[1], studentId: ids[2], serviceId, serviceTitle: 'Curso de prueba temporal', category: `${categoryName}-editada`, date: '2050-02-10', startTime: '10:00', endTime: '11:30', modality: 'virtual', status: ['confirmed', 'completed', 'cancelled'][index] })));
  await Review.create({ studentId: ids[2], tutorId: ids[1], bookingId: bookingIds[1], rating: 4, comment: 'Comentario temporal de auditoría.', studentName: 'Prueba', serviceTitle: 'Curso temporal' });
  const analytics = await req(0, '/analytics?month=2050-02'); assert.equal(analytics.status, 200);
  const demand = analytics.body.demand.find((entry) => entry._id === `${categoryName}-editada`); assert.equal(demand.hours, 3); assert.equal(demand.sessions, 2);
  assert.equal((await req(0, `/moderation/reviews/${ids[1]}`)).body.data[0].rating, 4);
  assert.equal((await req(0, '/analytics?month=2050-99')).status, 400);
  await TutoringService.deleteOne({ _id: serviceId });
  assert.equal((await req(1, `/services/${published.body.data._id}`, 'DELETE')).status, 200);
  assert.equal((await req(0, `/categories/${createdCategoryId}`, 'DELETE')).status, 200);
  console.log('Moderation integration passed: report privacy, duplicate prevention, role checks, restricted Google session, socket disconnection, suspension, appeals, concurrent acceptance, reactivation, rejection, audit history, category CRUD and monthly analytics.');
} catch (error) { console.error('Moderation integration failed:', error instanceof assert.AssertionError ? error.message : error.name); process.exitCode = 1; }
finally {
  socket?.disconnect(); if (socketsServer) await new Promise((resolve) => socketsServer.close(resolve)); else if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) {
    await Promise.all([ConductReport.deleteMany({ reporterId: { $in: ids } }), AccountAppeal.deleteMany({ userId: { $in: ids } }), Review.deleteMany({ tutorId: { $in: ids } }), BookingRecord.deleteMany({ _id: { $in: bookingIds } }), TutoringService.deleteMany({ tutorId: { $in: ids } }), AcademicCategory.deleteMany({ name: { $in: [categoryName, `${categoryName}-editada`] } }), User.deleteMany({ _id: { $in: ids } })]);
    console.log('Temporary moderation fixtures removed.');
  }
  await mongoose.disconnect();
}
