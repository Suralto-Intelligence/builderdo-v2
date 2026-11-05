import { createDb, type DbHandle } from '@builderdo/db';
import { Inject, Module, type DynamicModule, type OnApplicationShutdown } from '@nestjs/common';
import { API_ENV, type ApiEnv } from './config/env';
import { HealthController } from './health/health.controller';
import { DB_HANDLE, HealthService } from './health/health.service';

@Module({})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(DB_HANDLE) private readonly dbHandle: DbHandle) {}

  static register(env: ApiEnv, overrides: { dbHandle?: DbHandle } = {}): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [
        { provide: API_ENV, useValue: env },
        {
          provide: DB_HANDLE,
          useFactory: () => overrides.dbHandle ?? createDb(env.DATABASE_URL, { applicationName: 'builderdo-api' }),
        },
        HealthService,
      ],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.dbHandle.close();
  }
}
