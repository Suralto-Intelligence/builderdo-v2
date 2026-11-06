import { z } from 'zod';

export const roles = ['homeowner', 'contractor', 'admin'] as const;
export const role = z.enum(roles);
export type Role = z.infer<typeof role>;

export const projectStatuses = [
  'draft',
  'submitted',
  'reviewing',
  'options_ready',
  'introduction_requested',
  'in_progress',
  'closed',
  'cancelled',
] as const;
export const projectStatus = z.enum(projectStatuses);
export type ProjectStatus = z.infer<typeof projectStatus>;

export const contractorStatuses = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'changes_needed',
  'rejected',
  'suspended',
] as const;
export type ContractorStatus = (typeof contractorStatuses)[number];

export const introductionStatuses = [
  'shortlisted',
  'requested',
  'accepted',
  'declined',
  'estimate_sent',
  'won',
  'lost',
] as const;
export type IntroductionStatus = (typeof introductionStatuses)[number];

/** US ZIP code (5 digits, optional +4). BuilderDo launches in the US only. */
export const usZipCode = z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'must be a US ZIP code');

/** The signed-in user as every service sees it. */
export interface AuthUser {
  id: string;
  role: Role;
  email: string;
}
