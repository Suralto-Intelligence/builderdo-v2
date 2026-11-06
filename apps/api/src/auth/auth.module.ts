import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { ApiEnv } from '../config/env';
import { AUTH_PROVIDER } from './auth.provider';
import { AuthGuard } from './auth.guard';
import { CognitoAuthProvider } from './cognito-auth.provider';
import { DevAuthController } from './dev-auth.controller';
import { LocalAuthProvider } from './local-auth.provider';
import { UsersService } from './users.service';

@Module({})
export class AuthModule {
  static register(env: ApiEnv): DynamicModule {
    const local = env.AUTH_MODE === 'local';
    const provider = local
      ? new LocalAuthProvider(env.AUTH_LOCAL_SECRET!)
      : new CognitoAuthProvider(env.COGNITO_REGION!, env.COGNITO_USER_POOL_ID!, env.COGNITO_CLIENT_ID!);
    return {
      module: AuthModule,
      controllers: local ? [DevAuthController] : [],
      providers: [
        { provide: AUTH_PROVIDER, useValue: provider },
        UsersService,
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
      exports: [AUTH_PROVIDER, UsersService],
    };
  }
}
