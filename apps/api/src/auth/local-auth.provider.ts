import { role as roleSchema, type Role } from '@builderdo/shared';
import { jwtVerify, SignJWT } from 'jose';
import { InvalidTokenError, type AuthProvider, type VerifiedIdentity } from './auth.provider';

const ISSUER = 'builderdo-local';
const AUDIENCE = 'builderdo-api';

/** Local test sign-in: HMAC-signed tokens for development and automated tests only. */
export class LocalAuthProvider implements AuthProvider {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  async issue(email: string, role: Role, ttl = '1h'): Promise<string> {
    const normalized = email.trim().toLowerCase();
    return new SignJWT({ email: normalized, role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(`local:${normalized}`)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(ttl)
      .sign(this.key);
  }

  async verify(token: string): Promise<VerifiedIdentity> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
      const role = roleSchema.safeParse(payload.role);
      if (!payload.sub || typeof payload.email !== 'string' || !role.success) throw new Error('missing claims');
      return { subject: payload.sub, email: payload.email, role: role.data };
    } catch (error) {
      throw new InvalidTokenError(error instanceof Error ? error.message : 'unknown');
    }
  }
}
