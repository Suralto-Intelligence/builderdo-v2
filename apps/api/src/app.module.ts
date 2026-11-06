import type { DbHandle } from '@builderdo/db';
import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AdminJobsController } from './admin/jobs.controller';
import { AuthModule } from './auth/auth.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { API_ENV, type ApiEnv } from './config/env';
import { DbModule } from './db/db.module';
import { EventsController } from './events/events.controller';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { ProjectsController } from './projects/projects.controller';
import { ProjectsService } from './projects/projects.service';
import { OBJECT_STORAGE, S3ObjectStorage, type ObjectStorage } from './storage/object-storage';
import { UploadsController } from './uploads/uploads.controller';

export interface AppOverrides {
  dbHandle?: DbHandle;
  storage?: ObjectStorage;
}

@Module({})
export class AppModule {
  static register(env: ApiEnv, overrides: AppOverrides = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [DbModule.register(env.DATABASE_URL, overrides.dbHandle), AuthModule.register(env)],
      controllers: [HealthController, ProjectsController, EventsController, UploadsController, AdminJobsController],
      providers: [
        { provide: API_ENV, useValue: env },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
        {
          provide: OBJECT_STORAGE,
          useFactory: () =>
            overrides.storage ??
            new S3ObjectStorage(env.STORAGE_BUCKET, {
              endpoint: env.STORAGE_ENDPOINT,
              region: env.STORAGE_REGION,
              accessKeyId: env.STORAGE_ACCESS_KEY_ID,
              secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
            }),
        },
        HealthService,
        ProjectsService,
      ],
    };
  }
}
