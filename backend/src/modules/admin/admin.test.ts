import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createServer } from 'node:http';
import { monthRange } from './analytics.routes.js';
import { validAppeal, validReport } from './moderation.routes.js';
import { validCategory } from './category.routes.js';
import { createAuthMiddleware } from '../auth/auth.middleware.js';
import { signAccessToken } from '../auth/jwt.js';

test('analytics uses bounded calendar months and handles December rollover', () => {
  assert.deepEqual(monthRange('2026-12'), { start: '2026-12-01', end: '2027-01-01' });
  assert.deepEqual(monthRange('2026-02'), { start: '2026-02-01', end: '2026-03-01' });
  for (const value of ['2026-13', '2026-00', '2026-1', '0000-01', [], {}, '2026-10-01']) assert.equal(monthRange(value), null);
});
test('reports and appeals validate textual evidence and reject invalid target IDs', () => {
  const body = { targetId: '65a000000000000000000001', reason: 'conduct', evidence: 'Mensajes inapropiados durante la clase.' };
  assert.equal(validReport(body), true);
  for (const patch of [{ targetId: { $ne: null } }, { evidence: '   ' }, { reason: 'invalid' }, { reason: ['conduct'] }, { evidence: 'x'.repeat(4001) }]) assert.equal(validReport({ ...body, ...patch }), false);
  assert.equal(validAppeal('Solicito revisión de mi caso y adjunto mi versión.'), true);
  assert.equal(validAppeal('    '), false);
});
test('category management rejects duplicated subcategories and unbounded lists', () => {
  assert.equal(validCategory({ name: 'Deportes', subcategories: ['Natación', 'Fútbol'] }), true);
  assert.equal(validCategory({ name: 'Deportes', subcategories: ['Natación', ' natación '] }), false);
  assert.equal(validCategory({ name: 'D', subcategories: [] }), false);
  assert.equal(validCategory({ name: 'Deportes', subcategories: [42] }), false);
});
test('suspended sessions only access session status, suspension details and appeal submission', async (context) => {
  const id = '65a000000000000000000001', secret = 'moderation-test-secret-with-enough-entropy';
  const app = express();
  const auth = createAuthMiddleware({ getSecret: () => secret, findAccount: async () => ({ _id: id, fullName: 'Prueba suspendida', email: 'test@example.invalid', role: 'student', accountStatus: 'suspended', onboardingCompleted: true }) });
  const router = express.Router(); router.use(auth); router.all('/{*path}', (_req, res) => res.json({ ok: true }));
  app.use('/api/moderation', router); app.use('/api/auth', router); app.use('/api/profiles', router);
  const server = createServer(app); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const headers = { authorization: `Bearer ${signAccessToken(id, secret, '1h')}` };
  for (const [method, path, expected] of [['GET', '/moderation/me', 200], ['POST', '/moderation/appeals', 200], ['GET', '/auth/me', 200], ['PUT', '/profiles/me', 403], ['GET', '/profiles/me', 403], ['GET', '/moderation/users', 403], ['POST', '/moderation/reports', 403], ['PATCH', '/moderation/appeals/123', 403]] as const) {
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/api${path}`, { method, headers })).status, expected, `${method} ${path}`);
  }
});
