import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { getJwtSecret } from '../../config/env.js';
import { findSessionAccountById } from './auth.repository.js';
import { JwtTokenError, verifyAccessToken } from './jwt.js';
import { isTokenRevoked } from './revoked-token.model.js';
import type { AuthenticatedUser } from './auth.types.js';
import type { AccountStatus, UserRole } from '../users/user.types.js';

export interface SessionAccount {
  _id: { toString(): string } | string;
  fullName: string;
  email: string;
  profileImageUrl?: string;
  role?: UserRole;
  onboardingCompleted?: boolean;
  accountStatus: AccountStatus;
}

export interface AuthMiddlewareDependencies {
  isRevoked?: (token: string) => Promise<boolean>;
  getSecret: () => string;
  findAccount: (id: string) => Promise<SessionAccount | null>;
}

export function createAuthMiddleware(
  dependencies: AuthMiddlewareDependencies = {
    getSecret: getJwtSecret,
    findAccount: findSessionAccountById,
    isRevoked: isTokenRevoked,
  },
): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    const authorization = request.get('authorization');
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
    if (!match?.[1]) {
      response.status(401).json({ error: 'A valid Bearer token is required.' });
      return;
    }

    try {
      const claims = verifyAccessToken(match[1], dependencies.getSecret());
      if (await dependencies.isRevoked?.(match[1])) {
        response.status(401).json({ error: 'La sesión fue cerrada. Inicia sesión nuevamente.' }); return;
      }
      if (!/^[a-f\d]{24}$/i.test(claims.sub)) {
        response.status(401).json({ error: 'The access token is invalid.' });
        return;
      }
      const account = await dependencies.findAccount(claims.sub);
      if (!account) {
        response.status(401).json({ error: 'The session is no longer valid.' });
        return;
      }
      const suspensionRoute = request.baseUrl === '/api/moderation' && ((request.method === 'GET' && request.path === '/me') || (request.method === 'POST' && request.path === '/appeals'));
      const sessionRoute = request.baseUrl === '/api/auth' && ((request.method === 'GET' && request.path === '/me') || (request.method === 'POST' && request.path === '/logout'));
      if (account.accountStatus === 'suspended' && !suspensionRoute && !sessionRoute) {
        response.status(403).json({ code: 'ACCOUNT_SUSPENDED', error: 'This account is suspended.' });
        return;
      }
      const pendingRegistration = account.role === undefined && account.onboardingCompleted === false;
      if (!['active', 'suspended'].includes(account.accountStatus) || (!pendingRegistration && !['student', 'tutor', 'admin'].includes(account.role ?? ''))) {
        response.status(403).json({ error: 'This account cannot access protected resources.' });
        return;
      }

      const registrationRoute = (request.method === 'GET' && request.path === '/me' && ['/api/auth', '/api/profiles'].includes(request.baseUrl))
        || (request.method === 'POST' && request.path === '/logout' && request.baseUrl === '/api/auth')
        || (request.method === 'POST' && request.path === '/onboarding' && request.baseUrl === '/api/profiles');
      if (pendingRegistration && !registrationRoute) {
        response.status(403).json({ error: 'Complete your registration first.', code: 'ONBOARDING_REQUIRED' });
        return;
      }
      const authUser: AuthenticatedUser = {
        id: String(account._id),
        fullName: account.fullName,
        email: account.email,
        ...(account.profileImageUrl ? { profileImageUrl: account.profileImageUrl } : {}),
        role: account.role,
        onboardingCompleted: account.onboardingCompleted ?? Boolean(account.role),
        accountStatus: account.accountStatus,
      };
      request.authUser = authUser;
      next();
    } catch (error) {
      if (error instanceof JwtTokenError) {
        const message = error.code === 'expired' ? 'The access token has expired.' : 'The access token is invalid.';
        response.status(401).json({ error: message });
        return;
      }
      if (error instanceof Error && /environment variable|JWT_SECRET/i.test(error.message)) {
        response.status(503).json({ error: 'Authentication is not configured.' });
        return;
      }
      console.error('Protected request could not be authenticated.');
      response.status(500).json({ error: 'The request could not be authenticated right now.' });
    }
  };
}

export const authenticateRequest = createAuthMiddleware();

export function requireRole(...allowedRoles: UserRole[]): RequestHandler {
  return (request, response, next) => {
    if (!request.authUser) {
      response.status(401).json({ error: 'Authentication is required.' });
      return;
    }
    if (!request.authUser.role || !allowedRoles.includes(request.authUser.role)) {
      response.status(403).json({ error: 'This account is not allowed to access this resource.' });
      return;
    }
    next();
  };
}
