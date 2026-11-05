import type { HealthResponse } from '@builderdo/shared';
import { Controller, Get, HttpCode, Inject, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  /** Liveness: the process is running. No dependency checks, so a slow database never restarts healthy tasks. */
  @Get('live')
  @HttpCode(200)
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: dependencies answer. Returns 503 when degraded so the load balancer stops sending traffic. */
  @Get()
  async ready(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthResponse> {
    const result = await this.health.check();
    reply.status(result.status === 'ok' ? 200 : 503);
    return result;
  }
}
