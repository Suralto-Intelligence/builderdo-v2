import type { AuthUser, Role } from '@builderdo/shared';
import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';

export const IS_PUBLIC = 'builderdo:public';
export const ROLES = 'builderdo:roles';

/** Route needs no sign-in (health checks, dev login). Everything else requires a valid token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route is limited to these roles. Without it, any signed-in user passes the role check. */
export const Roles = (...allowed: Role[]) => SetMetadata(ROLES, allowed);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
  if (!request.user) throw new Error('CurrentUser used on a public route');
  return request.user;
});
