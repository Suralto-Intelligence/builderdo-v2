import { createProjectDraft, type AuthUser, type CreateProjectDraft } from '@builderdo/shared';
import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentUser, Roles } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ProjectsService, type ProjectDto } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Post()
  @Roles('homeowner')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createProjectDraft)) body: CreateProjectDraft,
    @Req() req: FastifyRequest,
  ): Promise<ProjectDto> {
    return this.projects.createDraft(user, body, req.id);
  }

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ProjectDto[]> {
    return this.projects.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string): Promise<ProjectDto> {
    return this.projects.get(user, id);
  }
}
