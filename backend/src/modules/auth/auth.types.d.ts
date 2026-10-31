import type { AccountStatus, UserRole } from '../users/user.types.js';

export interface AuthenticatedUser {
  id: string;
  fullName: string;
  email: string;
  profileImageUrl?: string;
  role?: UserRole;
  onboardingCompleted?: boolean;
  accountStatus: AccountStatus;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
    }
  }
}

export {};
