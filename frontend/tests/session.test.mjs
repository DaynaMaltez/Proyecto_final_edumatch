import assert from 'node:assert/strict';
import test from 'node:test';
import { tokenExpirationMilliseconds } from '../src/lib/session.ts';
const storage = new Map();
globalThis.window = new EventTarget();
window.sessionStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
const { getSession, setAccessToken, getAccessToken, logoutSession } = await import('../src/lib/api.ts');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
test('expiry scheduling accepts a numeric expiry and ignores malformed tokens', () => {
  const payload = Buffer.from(JSON.stringify({ exp: 1800000000 })).toString('base64url');
  assert.equal(tokenExpirationMilliseconds(`header.${payload}.signature`), 1800000000000);
  for (const token of ['invalid', 'a.b.c', `a.${Buffer.from('{"exp":"1800000000"}').toString('base64url')}.c`]) assert.equal(tokenExpirationMilliseconds(token), null);
});
test('protected requests send Bearer and current-session 401 clears the token and signals login', async () => {
  setAccessToken('current-token'); let expired = 0;
  const listener = () => expired++; window.addEventListener('session-expired', listener);
  globalThis.fetch = async (_url, init) => { assert.equal(init.headers.get('authorization'), 'Bearer current-token'); return json({ error: 'Sesión vencida' }, 401); };
  await assert.rejects(getSession(), /Sesión vencida/);
  assert.equal(getAccessToken(), null); assert.equal(expired, 1); window.removeEventListener('session-expired', listener);
});
test('a delayed 401 from an older session cannot sign out a newer session', async () => {
  setAccessToken('old-token'); let respond;
  globalThis.fetch = () => new Promise((resolve) => { respond = resolve; });
  const oldRequest = getSession(); setAccessToken('new-token'); respond(json({ error: 'Old session expired' }, 401));
  await assert.rejects(oldRequest); assert.equal(getAccessToken(), 'new-token');
});
test('logout invalidates the server session before removing the local token', async () => {
  setAccessToken('logout-token');
  globalThis.fetch = async (url, init) => { assert.ok(url.endsWith('/auth/logout')); assert.equal(init.method, 'POST'); assert.equal(init.headers.get('authorization'), 'Bearer logout-token'); assert.equal(getAccessToken(), 'logout-token'); return json({ ok: true }); };
  await logoutSession(); assert.equal(getAccessToken(), null);
});
