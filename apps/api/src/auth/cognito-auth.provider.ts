import { roles, type Role } from '@builderdo/shared';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { InvalidTokenError, type AuthProvider, type VerifiedIdentity } from './auth.provider';

/**
 * Verifies Amazon Cognito ID tokens against the user pool's public keys.
 * The role comes from the user's Cognito group (homeowner, contractor or admin). Wired up in Phase 7.
 */
export class CognitoAuthProvider implements AuthProvider {
  private readonly issuer: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(region: string, userPoolId: string, private readonly clientId: string) {
    this.issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
  }

  async verify(token: string): Promise<VerifiedIdentity> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, { issuer: this.issuer, audience: this.clientId });
      if (payload.token_use !== 'id') throw new Error('not an id token');
      if (!payload.sub || typeof payload.email !== 'string' || payload.email_verified !== true) {
        throw new Error('email missing or not verified');
      }
      const groups = Array.isArray(payload['cognito:groups']) ? (payload['cognito:groups'] as string[]) : [];
      const role = roles.find((r) => groups.includes(r)) as Role | undefined;
      return { subject: payload.sub, email: payload.email.toLowerCase(), role };
    } catch (error) {
      throw new InvalidTokenError(error instanceof Error ? error.message : 'unknown');
    }
  }
}
