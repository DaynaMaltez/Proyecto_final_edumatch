import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDirectory = resolve(fileURLToPath(new URL('../..', import.meta.url)));
dotenv.config({ path: resolve(backendDirectory, '.env') });

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
};

export interface AuthEnvironment {
  googleClientId: string;
  jwtSecret: string;
  jwtExpiresIn: string;
}

export function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. Add it to backend/.env.`);
  }
  return value;
}

export function getAuthEnvironment(): AuthEnvironment {
  const googleClientId = getRequiredEnv('GOOGLE_CLIENT_ID');
  const jwtSecret = getRequiredEnv('JWT_SECRET');
  const jwtExpiresIn = getRequiredEnv('JWT_EXPIRES_IN');

  if (Buffer.byteLength(jwtSecret, 'utf8') < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes.');
  }
  if (!/^[1-9]\d*(s|m|h|d)$/.test(jwtExpiresIn)) {
    throw new Error('JWT_EXPIRES_IN must use a positive duration such as 15m, 1h, or 1d.');
  }

  return { googleClientId, jwtSecret, jwtExpiresIn };
}

export function getJwtSecret(): string {
  const jwtSecret = getRequiredEnv('JWT_SECRET');
  if (Buffer.byteLength(jwtSecret, 'utf8') < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes.');
  }
  return jwtSecret;
}
