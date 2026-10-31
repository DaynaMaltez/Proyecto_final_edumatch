import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, sign as signRsa } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import type { AuthAccount, AuthUserRepository } from './auth.service.js';
import { AuthServiceError, createGoogleSession } from './auth.service.js';
import { createAuthMiddleware } from './auth.middleware.js';
import { googleLogin } from './auth.controller.js';
import { GoogleIdTokenError, verifyGoogleIdToken, type GoogleJwkSet } from './google-id-token.js';
import { signAccessToken, verifyAccessToken, JwtTokenError } from './jwt.js';
import type { GoogleIdentity } from './google-id-token.js';

const secret = 'test-only-jwt-secret-with-more-than-32-bytes';

function account(overrides: Partial<AuthAccount> = {}): AuthAccount {
  return {
    _id: '65a000000000000000000001',
    fullName: 'Ada Estudiante',
    email: 'ada@example.com',
    googleId: 'google-user-1',
    role: 'student',
    accountStatus: 'active',
    ...overrides,
  };
}

const identity: GoogleIdentity = {
  googleId: 'google-user-1',
  email: 'ada@example.com',
  fullName: 'Ada Estudiante',
  profileImageUrl: 'https://images.example/avatar.png',
};

function tokenSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createJwtWithPayload(payload: object): string {
  const header = tokenSegment({ alg: 'HS256', typ: 'JWT' });
  const body = tokenSegment(payload);
  const input = `${header}.${body}`;
  const signature = createHmac('sha256', secret).update(input).digest('base64url');
  return `${input}.${signature}`;
}

function createSignedGoogleIdToken(
  claims: Record<string, unknown>,
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
): string {
  const header = tokenSegment({ alg: 'RS256', typ: 'JWT', kid: 'test-key' });
  const payload = tokenSegment(claims);
  const signingInput = `${header}.${payload}`;
  const signature = signRsa('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

test('Google login creates new accounts as active students and issues a token', async () => {
  let created: GoogleIdentity | undefined;
  let issuedFor = '';
  let persisted: AuthAccount | null = null;
  const users: AuthUserRepository = {
    findByGoogleId: async () => persisted,
    createGoogleAccount: async (receivedIdentity) => {
      created = receivedIdentity;
      persisted = account({ googleId: receivedIdentity.googleId, email: receivedIdentity.email, role: 'student', accountStatus: 'active' });
      return persisted;
    },
  };

  const session = await createGoogleSession(identity, {
    users,
    issueToken: (id) => { issuedFor = id; return 'signed-token'; },
  });

  assert.equal(created?.googleId, identity.googleId);
  assert.equal(session.user.role, 'student');
  assert.equal(session.user.accountStatus, 'active');
  assert.equal(session.accessToken, 'signed-token');
  assert.equal(issuedFor, '65a000000000000000000001');
});

test('Google login preserves an existing tutor role', async () => {
  const existing = account({ role: 'tutor' });
  const session = await createGoogleSession(identity, {
    users: {
      findByGoogleId: async () => existing,
      createGoogleAccount: async () => { throw new Error('Existing users must not be recreated.'); },
    },
    issueToken: () => 'signed-token',
  });

  assert.equal(session.user.role, 'tutor');
});

test('Google login preserves an already linked admin role', async () => {
  const existing = account({ role: 'admin', accountStatus: 'active' });
  const session = await createGoogleSession(identity, {
    users: {
      findByGoogleId: async () => existing,
      createGoogleAccount: async () => { throw new Error('Existing users must not be recreated.'); },
    },
    issueToken: () => 'signed-token',
  });

  assert.equal(session.user.role, 'admin');
  assert.equal(session.user.accountStatus, 'active');
});

test('Google login never links an existing account by email, including an admin account', async () => {
  let tokenIssued = false;
  let created = false;
  const users: AuthUserRepository = {
    findByGoogleId: async () => null,
    createGoogleAccount: async () => {
      created = true;
      const duplicate = new Error('duplicate key') as Error & { code: number };
      duplicate.code = 11000;
      throw duplicate;
    },
  };

  await assert.rejects(
    createGoogleSession(identity, { users, issueToken: () => { tokenIssued = true; return 'must-not-be-issued'; } }),
    (error: unknown) => error instanceof AuthServiceError && error.code === 'IDENTITY_CONFLICT',
  );
  assert.equal(created, true);
  assert.equal(tokenIssued, false);
});

test('Google login does not issue a token if the persisted Google identity differs', async () => {
  let tokenIssued = false;
  let lookups = 0;
  const users: AuthUserRepository = {
    findByGoogleId: async () => {
      lookups += 1;
      return lookups === 1 ? null : account({ googleId: 'different-google-user' });
    },
    createGoogleAccount: async () => {
      const duplicate = new Error('duplicate key') as Error & { code: number };
      duplicate.code = 11000;
      throw duplicate;
    },
  };

  await assert.rejects(
    createGoogleSession(identity, { users, issueToken: () => { tokenIssued = true; return 'must-not-be-issued'; } }),
    (error: unknown) => error instanceof AuthServiceError && error.code === 'IDENTITY_CONFLICT',
  );
  assert.equal(tokenIssued, false);
});

test('an existing admin without a persisted Google association cannot receive a session by email collision', async () => {
  let tokenIssued = false;
  const existingAdmin = account({ googleId: undefined, role: 'admin' });
  const accountsByEmail = new Map([[identity.email.toLowerCase(), existingAdmin]]);
  const users: AuthUserRepository = {
    findByGoogleId: async () => null,
    createGoogleAccount: async () => {
      assert.ok(accountsByEmail.has(identity.email.toLowerCase()));
      const duplicate = new Error('duplicate key') as Error & { code: number };
      duplicate.code = 11000;
      throw duplicate;
    },
  };

  await assert.rejects(
    createGoogleSession(identity, { users, issueToken: () => { tokenIssued = true; return 'must-not-be-issued'; } }),
    (error: unknown) => error instanceof AuthServiceError && error.code === 'IDENTITY_CONFLICT',
  );
  assert.equal(tokenIssued, false);
});

test('concurrent first Google logins create one student and both use the persisted association', async () => {
  const accountsByGoogleId = new Map<string, AuthAccount>();
  const emails = new Set<string>();
  const users: AuthUserRepository = {
    findByGoogleId: async (googleId) => accountsByGoogleId.get(googleId) ?? null,
    createGoogleAccount: async (receivedIdentity) => {
      if (accountsByGoogleId.has(receivedIdentity.googleId) || emails.has(receivedIdentity.email.toLowerCase())) {
        const duplicate = new Error('duplicate key') as Error & { code: number };
        duplicate.code = 11000;
        throw duplicate;
      }
      const createdAccount = account({ googleId: receivedIdentity.googleId, email: receivedIdentity.email.toLowerCase() });
      accountsByGoogleId.set(receivedIdentity.googleId, createdAccount);
      emails.add(receivedIdentity.email.toLowerCase());
      return createdAccount;
    },
  };

  const sessions = await Promise.all([
    createGoogleSession(identity, { users, issueToken: (id) => `token:${id}` }),
    createGoogleSession(identity, { users, issueToken: (id) => `token:${id}` }),
  ]);

  assert.equal(accountsByGoogleId.size, 1);
  assert.equal(sessions.length, 2);
  assert.ok(sessions.every((session) => session.user.id === '65a000000000000000000001'));
  assert.ok(sessions.every((session) => session.user.role === 'student'));
});

test('suspended Google accounts can start a restricted session for appeal', async () => {
  let tokenIssued = false;
  const session = await createGoogleSession(identity, {
      users: {
        findByGoogleId: async () => account({ accountStatus: 'suspended' }),
        createGoogleAccount: async () => account(),
      },
      issueToken: () => { tokenIssued = true; return 'restricted-session'; },
    });
  assert.equal(tokenIssued, true);
  assert.equal(session.user.accountStatus, 'suspended');
});

test('JWT verifies its signature, issuer, audience and expiration', () => {
  const token = signAccessToken('65a000000000000000000001', secret, '1h', 1_800_000_000);
  assert.equal(verifyAccessToken(token, secret, 1_800_000_001).sub, '65a000000000000000000001');

  const [header, payload] = token.split('.');
  assert.ok(header && payload);
  const altered = `${header}.${tokenSegment({ sub: 'another-user', iss: 'edumatch-api', aud: 'edumatch-client', iat: 1_800_000_000, exp: 1_800_003_600 })}.${token.split('.')[2]}`;
  assert.throws(() => verifyAccessToken(altered, secret, 1_800_000_001), JwtTokenError);
  assert.throws(() => verifyAccessToken(token, secret, 1_800_003_600), (error: unknown) => error instanceof JwtTokenError && error.code === 'expired');
  assert.throws(() => verifyAccessToken(createJwtWithPayload({ sub: 'user', iss: 'wrong', aud: 'edumatch-client', iat: 1_800_000_000, exp: 1_800_003_600 }), secret, 1_800_000_001), JwtTokenError);
  assert.throws(() => verifyAccessToken(createJwtWithPayload({ sub: 'user', iss: 'edumatch-api', aud: 'wrong', iat: 1_800_000_000, exp: 1_800_003_600 }), secret, 1_800_000_001), JwtTokenError);
});

test('JWT rejects non-canonical signatures so logout revocation cannot be bypassed', () => {
  const token = signAccessToken('65a000000000000000000001', secret, '1h');
  const parts = token.split('.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const signature = parts[2]!;
  const alternate = signature.slice(0, -1) + alphabet[alphabet.indexOf(signature.at(-1)!) + 1];
  assert.deepEqual(Buffer.from(alternate, 'base64url'), Buffer.from(signature, 'base64url'));
  assert.throws(() => verifyAccessToken(`${parts[0]}.${parts[1]}.${alternate}`, secret), JwtTokenError);
});

test('Google ID token verification checks signed claims against the expected audience', async () => {
  const now = 1_800_000_000;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const keySet: GoogleJwkSet = {
    keys: [{ ...publicJwk, kid: 'test-key', kty: 'RSA', n: publicJwk.n!, e: publicJwk.e!, alg: 'RS256', use: 'sig' }],
  };
  const getKeySet = async () => keySet;
  const claims = {
    iss: 'https://accounts.google.com',
    aud: 'edumatch-test-client',
    exp: now + 3600,
    iat: now,
    sub: 'google-subject',
    email: 'ADA@example.com',
    email_verified: true,
    name: 'Ada Prueba',
    picture: 'https://images.example/avatar.png',
  };

  const validToken = createSignedGoogleIdToken(claims, privateKey);
  const verified = await verifyGoogleIdToken(validToken, 'edumatch-test-client', getKeySet, now);
  assert.equal(verified.googleId, 'google-subject');
  assert.equal(verified.email, 'ada@example.com');
  assert.equal(verified.fullName, 'Ada Prueba');

  await assert.rejects(verifyGoogleIdToken(validToken, 'different-client', getKeySet, now), GoogleIdTokenError);
  await assert.rejects(
    verifyGoogleIdToken(createSignedGoogleIdToken({ ...claims, email_verified: false }, privateKey), 'edumatch-test-client', getKeySet, now),
    GoogleIdTokenError,
  );
  await assert.rejects(
    verifyGoogleIdToken(createSignedGoogleIdToken({ ...claims, exp: now }, privateKey), 'edumatch-test-client', getKeySet, now),
    GoogleIdTokenError,
  );
  await assert.rejects(
    verifyGoogleIdToken(createSignedGoogleIdToken({ ...claims, iss: 'https://untrusted.example' }, privateKey), 'edumatch-test-client', getKeySet, now),
    GoogleIdTokenError,
  );
  const secondKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  await assert.rejects(
    verifyGoogleIdToken(createSignedGoogleIdToken(claims, secondKey), 'edumatch-test-client', getKeySet, now),
    GoogleIdTokenError,
  );
});

test('Google login rejects client-supplied role fields before authentication', async () => {
  let responseStatus = 0;
  let responseBody: unknown;
  const response = {
    status(status: number) { responseStatus = status; return this; },
    json(body: unknown) { responseBody = body; return this; },
  };

  await googleLogin(
    { body: { credential: 'not-a-token', role: 'admin' } } as never,
    response as never,
  );

  assert.equal(responseStatus, 400);
  assert.deepEqual(responseBody, { error: 'Send only the Google credential in the request body.' });
});

test('protected-route middleware looks up current account status before access', async (context) => {
  const activeToken = signAccessToken('65a000000000000000000001', secret, '1h');
  const suspendedToken = signAccessToken('65a000000000000000000002', secret, '1h');
  const app = express();
  app.get('/protected', createAuthMiddleware({
    getSecret: () => secret,
    findAccount: async (id) => id.endsWith('2') ? account({ _id: id, accountStatus: 'suspended' }) : account({ _id: id }),
  }), (request, response) => response.json({ userId: request.authUser?.id }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}/protected`;
  const activeResponse = await fetch(baseUrl, { headers: { authorization: `Bearer ${activeToken}` } });
  const suspendedResponse = await fetch(baseUrl, { headers: { authorization: `Bearer ${suspendedToken}` } });
  const missingResponse = await fetch(baseUrl);

  assert.equal(activeResponse.status, 200);
  assert.equal(suspendedResponse.status, 403);
  assert.equal(missingResponse.status, 401);
});
