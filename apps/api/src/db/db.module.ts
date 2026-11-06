import { createDb, type DbHandle } from '@builderdo/db';
import { Global, Inject, Module, type DynamicModule, type OnApplicationShutdown } from '@nestjs/common';

export const DB_HANDLE = Symbol('DB_HANDLE');

@Global()
@Module({})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB_HANDLE) private readonly handle: DbHandle) {}

  static register(url: string, override?: DbHandle): DynamicModule {
    return {
      module: DbModule,
      providers: [{ provide: DB_HANDLE, useFactory: () => override ?? createDb(url, { applicationName: 'builderdo-api' }) }],
      exports: [DB_HANDLE],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.handle.close();
  }
}
