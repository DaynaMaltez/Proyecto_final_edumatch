import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { getAuthEnvironment } from '../../config/env.js';
import { authUserRepository } from './auth.repository.js';
import { createGoogleSession, AuthServiceError } from './auth.service.js';
import { GoogleIdTokenError, verifyGoogleIdToken } from './google-id-token.js';
import { signAccessToken } from './jwt.js';

const MAX_CREDENTIAL_LENGTH = 12_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function googleLogin(request: Request, response: Response): Promise<void> {
  const body: unknown = request.body;
  if (!isRecord(body) || Object.keys(body).some((key) => key !== 'credential')) {
    response.status(400).json({ error: 'Send only the Google credential in the request body.' });
    return;
  }
  if (typeof body.credential !== 'string' || body.credential.length === 0 || body.credential.length > MAX_CREDENTIAL_LENGTH) {
    response.status(400).json({ error: 'A valid Google credential is required.' });
    return;
  }

  let authEnvironment;
  try {
    authEnvironment = getAuthEnvironment();
  } catch {
    response.status(503).json({ error: 'Google authentication is not configured.' });
    return;
  }

  try {
    const identity = await verifyGoogleIdToken(body.credential, authEnvironment.googleClientId);
    const session = await createGoogleSession(identity, {
      users: authUserRepository,
      issueToken: (userId) => signAccessToken(userId, authEnvironment.jwtSecret, authEnvironment.jwtExpiresIn),
    });
    response.status(200).json(session);
  } catch (error) {
    if (error instanceof GoogleIdTokenError) {
      response.status(error.unavailable ? 503 : 401).json({
        error: error.unavailable ? 'Google authentication is temporarily unavailable.' : 'The Google credential is invalid or expired.',
      });
      return;
    }
    if (error instanceof AuthServiceError) {
      response.status(error.statusCode).json({ code: error.code, error: error.message });
      return;
    }
    if (error instanceof mongoose.Error.ValidationError) {
      response.status(422).json({ error: 'The Google account profile does not satisfy account requirements.' });
      return;
    }
    console.error('Google authentication failed due to an internal error.');
    response.status(500).json({ error: 'Google authentication could not be completed right now.' });
  }
}

export function currentSession(request: Request, response: Response): void {
  if (!request.authUser) {
    response.status(401).json({ error: 'Authentication is required.' });
    return;
  }
  response.status(200).json({ user: request.authUser });
}
