// Uses temporary accounts and removes only the generated IDs after the check.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { io as connect } from 'socket.io-client';
import { app } from '../dist/app.js';
import { getRequiredEnv, getJwtSecret } from '../dist/config/env.js';
import { signAccessToken } from '../dist/modules/auth/jwt.js';
import { User } from '../dist/modules/users/user.model.js';
import { Conversation, ChatMessage } from '../dist/modules/chat/chat.models.js';
import { attachChat } from '../dist/modules/chat/chat.socket.js';

const ids = Array.from({ length: 4 }, () => new mongoose.Types.ObjectId());
const sockets = []; let server; let socketServer;
const event = (socket, name) => new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`Timeout: ${name}`)), 8000); socket.once(name, (value) => { clearTimeout(timer); resolve(value); }); });
try {
  await mongoose.connect(getRequiredEnv('MONGODB_URI'), { serverSelectionTimeoutMS: 10000 });
  await Promise.all([User.init(), Conversation.init(), ChatMessage.init()]);
  await User.create(ids.map((_id, index) => ({ _id, fullName: `Prueba chat temporal ${index}`, email: `chat-${_id}@example.invalid`, role: index === 0 ? 'tutor' : index === 3 ? 'admin' : 'student', accountStatus: 'active', onboardingCompleted: true })));
  await User.updateOne({ _id: ids[0] }, { $set: { tutorProfile: { biography: 'Perfil temporal para revisar notificaciones administrativas.', specialties: ['Matemáticas'], hourlyRate: 100, teachingModalities: ['virtual'], credentials: [], professionalExperience: [], verificationStatus: 'pending' } } });
  server = createServer(app); socketServer = attachChat(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const tokens = ids.map((id) => signAccessToken(String(id), getJwtSecret(), '15m'));
  async function request(index, path, method = 'GET', body) {
    const response = await fetch(`${base}/api/chat${path}`, { method, headers: { authorization: `Bearer ${tokens[index]}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }
  async function socket(index) { const instance = connect(base, { auth: { token: tokens[index] }, transports: ['websocket'], reconnection: false }); sockets.push(instance); await event(instance, 'connect'); return instance; }
  const tutor = await socket(0); const student = await socket(1); const outsider = await socket(2);
  let reviewLeaks = 0; outsider.on('profile:reviewed', () => reviewLeaks++); student.on('profile:reviewed', () => reviewLeaks++);
  const decisionEvent = event(tutor, 'profile:reviewed');
  const adminDecision = await fetch(`${base}/api/admin/tutors/${ids[0]}/review`, { method: 'PATCH', headers: { authorization: `Bearer ${tokens[3]}`, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'rejected', note: 'Adjunta evidencia de tus credenciales.' }) });
  assert.equal(adminDecision.status, 200);
  const decision = await decisionEvent;
  assert.equal(decision.status, 'rejected'); assert.equal(decision.reviewNote, 'Adjunta evidencia de tus credenciales.'); assert.ok(decision.reviewedAt);
  const profileResponse = await fetch(`${base}/api/profiles/me`, { headers: { authorization: `Bearer ${tokens[0]}` } });
  const profile = (await profileResponse.json()).user;
  assert.equal(profile.tutorProfile.verificationStatus, 'rejected'); assert.equal(profile.tutorProfile.reviewNote, decision.reviewNote);
  const pendingEvent = event(tutor, 'profile:reviewed');
  const resubmission = await fetch(`${base}/api/profiles/resubmit`, { method: 'POST', headers: { authorization: `Bearer ${tokens[0]}` } });
  assert.equal(resubmission.status, 200); assert.equal((await pendingEvent).status, 'pending');
  assert.equal(reviewLeaks, 0, 'Administrative decisions are private to the reviewed tutor');
  console.log('Review notifications passed: rejection, reason, date, persisted status, resubmission and private realtime delivery.');
  const invalid = connect(base, { auth: { token: 'invalid' }, transports: ['websocket'], reconnection: false }); sockets.push(invalid); await event(invalid, 'connect_error'); assert.equal(invalid.connected, false);
  const opened = await request(1, '/', 'POST', { peerId: String(ids[0]) }); assert.equal(opened.status, 200);
  const conversationId = opened.body.data._id;
  assert.equal((await request(1, '/', 'POST', { peerId: String(ids[0]) })).body.data._id, conversationId);
  assert.equal((await request(2, `/${conversationId}/messages`)).status, 404);
  let leaked = 0; outsider.on('chat:message', () => leaked++); outsider.emit('join', conversationId);
  const received = event(tutor, 'chat:message');
  const sent = await request(1, `/${conversationId}/messages`, 'POST', { text: 'Hola, quisiera información del curso.', clientId: 'smoke_message_0001' });
  assert.equal(sent.status, 201); assert.equal((await received).text, sent.body.data.text);
  const duplicate = await request(1, `/${conversationId}/messages`, 'POST', { text: 'Hola, quisiera información del curso.', clientId: 'smoke_message_0001' }); assert.equal(duplicate.body.data._id, sent.body.data._id);
  assert.equal((await request(0, '/')).body.data[0].unread, 1);
  assert.equal((await request(2, `/${conversationId}/read`, 'POST', { messageIds: [sent.body.data._id] })).status, 404);
  const readReceipt = event(student, 'chat:read');
  const read = await request(0, `/${conversationId}/read`, 'POST', { messageIds: [sent.body.data._id] }); assert.equal(read.status, 200); assert.ok((await readReceipt).messages[0].readAt);
  assert.equal((await request(0, '/')).body.data[0].unread, 0);
  assert.equal((await request(0, `/${conversationId}/messages`)).body.data.length, 1);
  const replyReceived = event(student, 'chat:message');
  assert.equal((await request(0, `/${conversationId}/messages`, 'POST', { text: 'Hola, con gusto te ayudo.', clientId: 'smoke_message_0002' })).status, 201); await replyReceived;
  tutor.disconnect();
  assert.equal((await request(1, `/${conversationId}/messages`, 'POST', { text: 'Mensaje enviado mientras el tutor está desconectado.', clientId: 'smoke_message_0003' })).status, 201);
  await socket(0);
  assert.equal((await request(0, `/${conversationId}/messages`)).body.data.length, 3);
  assert.equal(leaked, 0, 'Outsider must receive no private message');
  assert.equal((await request(1, `/${conversationId}/messages`, 'POST', { text: '   ', clientId: 'smoke_invalid_0001' })).status, 400);
  console.log('Chat integration passed: authenticated realtime delivery, private history, idempotent sends, unread counts, read receipts, two-way messages, offline history and unauthorized access rejection.');
} catch (error) { console.error('Chat integration failed:', error instanceof assert.AssertionError ? error.message : error.name); process.exitCode = 1; }
finally {
  sockets.forEach((socket) => socket.disconnect());
  if (socketServer) await new Promise((resolve) => socketServer.close(resolve));
  else if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) {
    const conversations = await Conversation.find({ tutorId: ids[0] }).select('_id').lean();
    await ChatMessage.deleteMany({ conversationId: { $in: conversations.map((conversation) => conversation._id) } });
    await Conversation.deleteMany({ tutorId: ids[0] });
    await User.deleteMany({ _id: { $in: ids } });
    console.log('Temporary chat test records removed.');
  }
  await mongoose.disconnect();
}
