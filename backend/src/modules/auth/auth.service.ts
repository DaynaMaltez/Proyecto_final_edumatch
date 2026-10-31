import type { AccountStatus, UserRole } from '../users/user.types.js';
import type { GoogleIdentity } from './google-id-token.js';

export interface AuthAccount {
  _id: { toString(): string } | string;
  fullName: string;
  email: string;
  googleId?: string;
  profileImageUrl?: string;
  role?: UserRole;
  onboardingCompleted?: boolean;
  accountStatus: AccountStatus;
}

export interface AuthUserRepository {
  findByGoogleId(googleId: string): Promise<AuthAccount | null>;
  createGoogleAccount(identity: GoogleIdentity): Promise<AuthAccount>;
}

export interface AuthServiceDependencies {
  users: AuthUserRepository;
  issueToken: (userId: string) => string;
}

export class AuthServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: 403 | 409,
    readonly code: 'ACCOUNT_SUSPENDED' | 'IDENTITY_CONFLICT' | 'ACCOUNT_UNAVAILABLE',
  ) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function assertUsableAccount(account: AuthAccount): void {
  const pendingRegistration = account.role === undefined && account.onboardingCompleted === false;
  if (!['active', 'suspended'].includes(account.accountStatus) || (!pendingRegistration && !['student', 'tutor', 'admin'].includes(account.role ?? ''))) {
    throw new AuthServiceError('This account cannot start a session.', 403, 'ACCOUNT_UNAVAILABLE');
  }
}

export async function createGoogleSession(
  identity: GoogleIdentity,
  dependencies: AuthServiceDependencies,
): Promise<{
  accessToken: string;
  tokenType: 'Bearer';
  user: { id: string; fullName: string; email: string; profileImageUrl?: string; role?: UserRole; accountStatus: AccountStatus; onboardingCompleted: boolean };
}> {
  let account = await dependencies.users.findByGoogleId(identity.googleId);

  if (!account) {
    try {
      // MongoDB's unique email and googleId indexes make creation atomic. If a
      // concurrent request wins, only a persisted matching googleId can proceed.
      await dependencies.users.createGoogleAccount(identity);
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }

    // Re-read after both insert and duplicate-key race; never issue a JWT from
    // an unverified create result or from an account matched only by email.
    account = await dependencies.users.findByGoogleId(identity.googleId);
    if (!account || account.googleId !== identity.googleId) {
      throw new AuthServiceError('This Google identity could not be linked.', 409, 'IDENTITY_CONFLICT');
    }
  }

  if (!account || account.googleId !== identity.googleId) {
    throw new AuthServiceError('This Google identity could not be linked.', 409, 'IDENTITY_CONFLICT');
  }
  assertUsableAccount(account);

  const userId = String(account._id);
  const accessToken = dependencies.issueToken(userId);
  return {
    accessToken,
    tokenType: 'Bearer',
    user: {
      id: userId,
      fullName: account.fullName,
      email: account.email,
      ...(account.profileImageUrl ? { profileImageUrl: account.profileImageUrl } : {}),
      role: account.role,
      onboardingCompleted: account.onboardingCompleted ?? Boolean(account.role),
      accountStatus: account.accountStatus,
    },
  };
}
