import { User } from '../users/user.model.js';
import type { GoogleIdentity } from './google-id-token.js';
import type { AuthAccount, AuthUserRepository } from './auth.service.js';

const accountFields = '_id fullName email googleId profileImageUrl role accountStatus onboardingCompleted';

export const authUserRepository: AuthUserRepository = {
  findByGoogleId(googleId): Promise<AuthAccount | null> {
    return User.findOne({ googleId }).select(accountFields).exec();
  },

  createGoogleAccount(identity: GoogleIdentity): Promise<AuthAccount> {
    return User.create({
      fullName: identity.fullName,
      email: identity.email.toLowerCase(),
      googleId: identity.googleId,
      ...(identity.profileImageUrl ? { profileImageUrl: identity.profileImageUrl } : {}),
      onboardingCompleted: false,
      accountStatus: 'active',
    });
  },
};

export async function findSessionAccountById(id: string): Promise<AuthAccount | null> {
  return User.findById(id).select(accountFields).exec();
}
