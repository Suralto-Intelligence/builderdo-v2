import type { DbHandle } from '@builderdo/db';
import { overallStatus, type HealthResponse } from '@builderdo/shared';
import { Inject, Injectable } from '@nestjs/common';
import { DB_HANDLE } from '../db/db.module';


const startedAt = Date.now();
const version = process.env.APP_VERSION ?? 'dev';

@Injectable()
export class HealthService {
  constructor(@Inject(DB_HANDLE) private readonly dbHandle: Pick<DbHandle, 'ping'>) {}

  async check(): Promise<HealthResponse> {
    const checks = { database: (await this.dbHandle.ping()) ? 'up' : 'down' } as const;
    return {
      status: overallStatus(checks),
      service: 'api',
      version,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      checks,
    };
  }
}
