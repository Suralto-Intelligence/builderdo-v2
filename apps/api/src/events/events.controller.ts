import { schema, type DbHandle } from '@builderdo/db';
import { eventsQuery, type AuthUser, type EventsPage } from '@builderdo/shared';
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { and, asc, gt, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { CurrentUser } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { DB_HANDLE } from '../db/db.module';

const { domainEvents } = schema;

/**
 * Change feed. Screens remember the last id they saw and ask for anything newer,
 * so a closed tab or dropped connection catches up without missing events.
 */
@Controller('events')
export class EventsController {
  constructor(@Inject(DB_HANDLE) private readonly dbh: DbHandle) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(eventsQuery)) query: z.infer<typeof eventsQuery>,
  ): Promise<EventsPage> {
    const rows = await this.dbh.db
      .select()
      .from(domainEvents)
      .where(
        and(
          gt(domainEvents.id, query.after),
          sql`(${user.id}::uuid = any(${domainEvents.userIds}) or ${user.role} = any(${domainEvents.roles}))`,
        ),
      )
      .orderBy(asc(domainEvents.id))
      .limit(query.limit);

    return {
      events: rows.map((e) => ({
        id: e.id,
        type: e.type,
        aggregateType: e.aggregateType,
        aggregateId: e.aggregateId,
        payload: e.payload,
        createdAt: e.createdAt.toISOString(),
      })),
      nextCursor: rows.at(-1)?.id ?? query.after,
    };
  }
}
