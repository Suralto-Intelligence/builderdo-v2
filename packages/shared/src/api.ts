import { z } from 'zod';
import { usZipCode } from './domain';

/** Consistent error body for every non-2xx API response. */
export interface ApiError {
  error: { code: string; message: string; requestId?: string; details?: unknown };
}

export const createProjectDraft = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(5000),
  zipCode: usZipCode,
});
export type CreateProjectDraft = z.infer<typeof createProjectDraft>;

/** Photo uploads: what the browser may send, checked before a signed link is issued. */
export const uploadLimits = {
  maxBytes: 10 * 1024 * 1024,
  contentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const,
  linkTtlSeconds: 15 * 60,
};

export const presignUploadRequest = z.object({
  purpose: z.literal('project_photo'),
  projectId: z.uuid(),
  contentType: z.enum(uploadLimits.contentTypes),
  sizeBytes: z.number().int().positive().max(uploadLimits.maxBytes),
});
export type PresignUploadRequest = z.infer<typeof presignUploadRequest>;

export const eventsQuery = z.object({
  after: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export interface EventDto {
  id: number;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  createdAt: string;
}

export interface EventsPage {
  events: EventDto[];
  /** Pass as `after` on the next call. Equal to the input when nothing is new. */
  nextCursor: number;
}
