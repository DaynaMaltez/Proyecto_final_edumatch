import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const JWT_ISSUER = 'edumatch-api';
const JWT_AUDIENCE = 'edumatch-client';
const JWT_HEADER = { alg: 'HS256', typ: 'JWT' } as const;

export class JwtTokenError extends Error {
  constructor(message = 'Invalid access token.', readonly code: 'invalid' | 'expired' = 'invalid') {
    super(message);
    this.name = 'JwtTokenError';
  }
}

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function parseDurationSeconds(duration: string): number {
  const match = /^([1-9]\d*)(s|m|h|d)$/.exec(duration);
  if (!match) throw new Error('JWT_EXPIRES_IN must use a duration such as 15m, 1h, or 1d.');

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  const seconds = amount * multiplier;
  if (!Number.isSafeInteger(seconds) || seconds > 366 * 24 * 60 * 60) {
    throw new Error('JWT_EXPIRES_IN must be no longer than 366 days.');
  }
  return seconds;
}

function signatureFor(input: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(input).digest();
}

export function signAccessToken(
  subject: string,
  secret: string,
  expiresIn: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const lifetime = parseDurationSeconds(expiresIn);
  if (!subject || !Number.isSafeInteger(nowSeconds)) throw new Error('Cannot create access token.');

  const payload = {
    jti: randomUUID(),
    sub: subject,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    iat: nowSeconds,
    exp: nowSeconds + lifetime,
  };
  const signingInput = `${encodeSegment(JWT_HEADER)}.${encodeSegment(payload)}`;
  return `${signingInput}.${signatureFor(signingInput, secret).toString('base64url')}`;
}

function decodeSegment(segment: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) throw new JwtTokenError();
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new JwtTokenError();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface AccessTokenClaims {
  sub: string;
  iat: number;
  exp: number;
}

export function verifyAccessToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): AccessTokenClaims {
  if (token.length > 8192) throw new JwtTokenError();
  const parts = token.split('.');
  if (parts.length !== 3) throw new JwtTokenError();

  const [headerPart, payloadPart, signaturePart] = parts;
  if (!headerPart || !payloadPart || !signaturePart) throw new JwtTokenError();

  const header = decodeSegment(headerPart);
  const payload = decodeSegment(payloadPart);
  if (!isRecord(header) || header.alg !== 'HS256' || header.typ !== 'JWT' || !isRecord(payload)) {
    throw new JwtTokenError();
  }

  if (!/^[A-Za-z0-9_-]+$/.test(signaturePart)) throw new JwtTokenError();
  const suppliedSignature = Buffer.from(signaturePart, 'base64url');
  // Reject alternate encodings of the same signature: revocation hashes the
  // original JWT, so accepting non-canonical padding bits would bypass logout.
  if (suppliedSignature.toString('base64url') !== signaturePart) throw new JwtTokenError();
  const expectedSignature = signatureFor(`${headerPart}.${payloadPart}`, secret);
  if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) {
    throw new JwtTokenError();
  }

  if (payload.iss !== JWT_ISSUER || payload.aud !== JWT_AUDIENCE || typeof payload.sub !== 'string' || !payload.sub) {
    throw new JwtTokenError();
  }
  if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)) throw new JwtTokenError();
  if ((payload.exp as number) <= (payload.iat as number) || !Number.isSafeInteger(nowSeconds)) throw new JwtTokenError();
  if ((payload.iat as number) > nowSeconds || (payload.exp as number) <= nowSeconds) {
    throw new JwtTokenError('Access token has expired.', 'expired');
  }

  return { sub: payload.sub, iat: payload.iat as number, exp: payload.exp as number };
}
