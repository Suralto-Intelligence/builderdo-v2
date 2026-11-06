import { schema, type DbHandle } from '@builderdo/db';
import type { AuthUser } from '@builderdo/shared';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB_HANDLE } from '../db/db.module';
import type { VerifiedIdentity } from './auth.provider';

@Injectable()
export class UsersService {
  constructor(@Inject(DB_HANDLE) private readonly dbh: DbHandle) {}

  /**
   * Finds the BuilderDo user for a verified identity, creating it on first sign-in.
   * The role is fixed at creation: a later token cannot promote an existing user.
   */
  async resolve(identity: VerifiedIdentity): Promise<AuthUser> {
    const { users } = schema;
    const existing = await this.dbh.db.query.users.findFirst({ where: eq(users.authSubject, identity.subject) });
    if (existing) {
      if (existing.status !== 'active') throw new ForbiddenException('account disabled');
      return { id: existing.id, role: existing.role, email: existing.email };
    }

    // The role comes from the provider: a Cognito group we assign (admins are never self-assigned),
    // or the local test token. Sign-up screens only ever request homeowner or contractor.
    const role = identity.role;
    if (!role) throw new ForbiddenException('account has no role');

    const [created] = await this.dbh.db
      .insert(users)
      .values({ authSubject: identity.subject, email: identity.email, role })
      .onConflictDoUpdate({ target: users.authSubject, set: { email: identity.email } })
      .returning();
    return { id: created!.id, role: created!.role, email: created!.email };
  }
}
