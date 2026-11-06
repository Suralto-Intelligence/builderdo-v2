import type { AuthUser, Role } from '@builderdo/shared';
import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_PROVIDER, InvalidTokenError, type AuthProvider } from './auth.provider';
import { IS_PUBLIC, ROLES } from './decorators';
import { UsersService } from './users.service';

/** Global guard: every route needs a valid bearer token unless marked @Public(), then @Roles() is enforced. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AUTH_PROVIDER) private readonly provider: AuthProvider,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: AuthUser }>();
    const header = request.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedException('sign-in required');

    try {
      request.user = await this.users.resolve(await this.provider.verify(token));
    } catch (error) {
      if (error instanceof InvalidTokenError) throw new UnauthorizedException('sign-in expired or invalid');
      throw error;
    }

    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (allowed && !allowed.includes(request.user.role)) throw new ForbiddenException('not allowed for your account type');
    return true;
  }
}
