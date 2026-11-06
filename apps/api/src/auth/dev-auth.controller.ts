import { role } from '@builderdo/shared';
import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { AUTH_PROVIDER } from './auth.provider';
import { Public } from './decorators';
import type { LocalAuthProvider } from './local-auth.provider';

const devLogin = z.object({ email: z.email(), role });

/** Local test sign-in. Only registered when AUTH_MODE=local, which env validation forbids in staging and production. */
@Controller('auth/dev')
export class DevAuthController {
  constructor(@Inject(AUTH_PROVIDER) private readonly provider: LocalAuthProvider) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(devLogin)) body: z.infer<typeof devLogin>): Promise<{ token: string }> {
    return { token: await this.provider.issue(body.email, body.role) };
  }
}
