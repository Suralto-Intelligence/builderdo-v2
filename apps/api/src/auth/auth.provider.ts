import type { Role } from '@builderdo/shared';

/** What an identity provider vouches for after verifying a token. */
export interface VerifiedIdentity {
  subject: string;
  email: string;
  /** Role claimed by the provider (Cognito group, or the local test token). */
  role?: Role;
}

/**
 * The one seam between BuilderDo and sign-in. Local test sign-in and Amazon Cognito both
 * implement it, so no feature code changes when Cognito is switched on.
 */
export interface AuthProvider {
  verify(token: string): Promise<VerifiedIdentity>;
}

export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');

export class InvalidTokenError extends Error {
  constructor(reason: string) {
    super(`invalid token: ${reason}`);
    this.name = 'InvalidTokenError';
  }
}
