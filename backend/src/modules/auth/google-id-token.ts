import { createPublicKey, verify as verifySignature, type JsonWebKey } from 'node:crypto';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const MAX_ID_TOKEN_LENGTH = 12_000;
const CLOCK_SKEW_SECONDS = 300;

interface GoogleJwk extends JsonWebKey {
  kty: 'RSA';
  kid: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
}

export interface GoogleJwkSet {
  keys: GoogleJwk[];
}

interface GoogleIdTokenHeader {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
}

interface GoogleIdTokenClaims {
  iss?: unknown;
  aud?: unknown;
  azp?: unknown;
  exp?: unknown;
  iat?: unknown;
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  picture?: unknown;
}

export interface GoogleIdentity {
  googleId: string;
  email: string;
  fullName: string;
  profileImageUrl?: string;
}

export class GoogleIdTokenError extends Error {
  constructor(message = 'The Google ID token is invalid or could not be verified.', readonly unavailable = false) {
    super(message);
    this.name = 'GoogleIdTokenError';
  }
}

let cachedKeySet: GoogleJwkSet | undefined;
let cacheExpiresAt = 0;

async function loadGoogleKeySet(forceRefresh = false): Promise<GoogleJwkSet> {
  if (!forceRefresh && cachedKeySet && Date.now() < cacheExpiresAt) return cachedKeySet;

  let response: Response;
  try {
    response = await fetch(GOOGLE_JWKS_URL, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new GoogleIdTokenError('Google token verification is temporarily unavailable.', true);
  }
  if (!response.ok) throw new GoogleIdTokenError('Google token verification is temporarily unavailable.', true);

  let keySet: GoogleJwkSet;
  try {
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.keys)) throw new Error();
    const keys = payload.keys.filter(isGoogleJwk);
    if (keys.length === 0) throw new Error();
    keySet = { keys };
  } catch {
    throw new GoogleIdTokenError('Google returned an invalid signing-key set.', true);
  }

  const cacheControl = response.headers.get('cache-control') ?? '';
  const maxAge = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl)?.[1];
  const lifetimeMs = Math.min(Number(maxAge ?? 300), 21_600) * 1000;
  cachedKeySet = keySet;
  cacheExpiresAt = Date.now() + lifetimeMs;
  return keySet;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGoogleJwk(value: unknown): value is GoogleJwk {
  return isRecord(value)
    && value.kty === 'RSA'
    && typeof value.kid === 'string'
    && typeof value.n === 'string'
    && typeof value.e === 'string'
    && (value.alg === undefined || value.alg === 'RS256')
    && (value.use === undefined || value.use === 'sig');
}

function decodeJsonSegment<T>(segment: string): T {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) throw new GoogleIdTokenError();
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
  } catch {
    throw new GoogleIdTokenError();
  }
}

function validateClaims(claims: GoogleIdTokenClaims, audience: string, nowSeconds: number): GoogleIdentity {
  const issuers = new Set(['accounts.google.com', 'https://accounts.google.com']);
  if (typeof claims.iss !== 'string' || !issuers.has(claims.iss)) throw new GoogleIdTokenError();

  const audiences = typeof claims.aud === 'string'
    ? [claims.aud]
    : Array.isArray(claims.aud) && claims.aud.every((entry) => typeof entry === 'string')
      ? claims.aud
      : [];
  if (!audiences.includes(audience)) throw new GoogleIdTokenError();
  if (claims.azp !== undefined && claims.azp !== audience) throw new GoogleIdTokenError();
  if (audiences.length > 1 && claims.azp !== audience) throw new GoogleIdTokenError();

  if (typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) || claims.exp <= nowSeconds) {
    throw new GoogleIdTokenError('The Google ID token has expired.');
  }
  if (typeof claims.iat !== 'number' || !Number.isSafeInteger(claims.iat) || claims.iat > nowSeconds + CLOCK_SKEW_SECONDS) {
    throw new GoogleIdTokenError();
  }
  if (typeof claims.sub !== 'string' || claims.sub.length < 1 || claims.sub.length > 255) throw new GoogleIdTokenError();
  if (typeof claims.email !== 'string' || claims.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)) {
    throw new GoogleIdTokenError();
  }
  if (claims.email_verified !== true) throw new GoogleIdTokenError('The Google account email is not verified.');

  const email = claims.email.trim().toLowerCase();
  const providedName = typeof claims.name === 'string' ? claims.name.trim() : '';
  const emailName = email.split('@')[0] ?? '';
  const fullName = (providedName || emailName).slice(0, 120);
  const safeName = fullName.length >= 2 ? fullName : 'Estudiante';

  let profileImageUrl: string | undefined;
  if (claims.picture !== undefined) {
    if (typeof claims.picture !== 'string' || claims.picture.length > 2048) throw new GoogleIdTokenError();
    try {
      if (new URL(claims.picture).protocol !== 'https:') throw new Error();
      profileImageUrl = claims.picture;
    } catch {
      throw new GoogleIdTokenError();
    }
  }

  return { googleId: claims.sub, email, fullName: safeName, ...(profileImageUrl ? { profileImageUrl } : {}) };
}

export type GoogleJwkSetProvider = (forceRefresh?: boolean) => Promise<GoogleJwkSet>;

export async function verifyGoogleIdToken(
  idToken: string,
  audience: string,
  getKeySet: GoogleJwkSetProvider = loadGoogleKeySet,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<GoogleIdentity> {
  if (!idToken || idToken.length > MAX_ID_TOKEN_LENGTH || !audience) throw new GoogleIdTokenError();
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new GoogleIdTokenError();
  const [headerPart, claimsPart, signaturePart] = parts;
  if (!headerPart || !claimsPart || !signaturePart || !/^[A-Za-z0-9_-]+$/.test(signaturePart)) {
    throw new GoogleIdTokenError();
  }

  const headerValue = decodeJsonSegment<unknown>(headerPart);
  const claimsValue = decodeJsonSegment<unknown>(claimsPart);
  if (!isRecord(headerValue) || !isRecord(claimsValue)) throw new GoogleIdTokenError();
  const header = headerValue as GoogleIdTokenHeader;
  const claims = claimsValue as GoogleIdTokenClaims;
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || (header.typ !== undefined && header.typ !== 'JWT')) {
    throw new GoogleIdTokenError();
  }

  let keySet = await getKeySet();
  let jwk = keySet.keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    keySet = await getKeySet(true);
    jwk = keySet.keys.find((key) => key.kid === header.kid);
  }
  if (!jwk || jwk.kty !== 'RSA' || (jwk.alg && jwk.alg !== 'RS256') || (jwk.use && jwk.use !== 'sig')) {
    throw new GoogleIdTokenError();
  }

  let signatureValid = false;
  try {
    const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
    signatureValid = verifySignature(
      'RSA-SHA256',
      Buffer.from(`${headerPart}.${claimsPart}`),
      publicKey,
      Buffer.from(signaturePart, 'base64url'),
    );
  } catch {
    throw new GoogleIdTokenError();
  }
  if (!signatureValid) throw new GoogleIdTokenError();

  return validateClaims(claims, audience, nowSeconds);
}
