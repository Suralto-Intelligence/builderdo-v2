/**
 * Database schema v1. Every change ships as a reviewed migration (pnpm --filter @builderdo/db db:generate).
 * Conventions: uuid primary keys, timestamps with time zone, money in cents, PostGIS points in SRID 4326.
 */
import { contractorStatuses, introductionStatuses, projectStatuses, roles } from '@builderdo/shared';
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  date,
  geometry,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const point = (name: string) => geometry(name, { type: 'point', mode: 'xy', srid: 4326 });

// ---------- enums ----------
export const roleEnum = pgEnum('role', roles);
export const userStatusEnum = pgEnum('user_status', ['active', 'disabled']);
export const projectStatusEnum = pgEnum('project_status', projectStatuses);
export const contractorStatusEnum = pgEnum('contractor_status', contractorStatuses);
export const introductionStatusEnum = pgEnum('introduction_status', introductionStatuses);
export const businessSourceEnum = pgEnum('business_source', ['signup', 'discovery', 'admin']);
export const leadStatusEnum = pgEnum('lead_status', ['new', 'approved', 'contacted', 'claimed', 'rejected', 'suppressed']);
export const verificationStatusEnum = pgEnum('verification_status', ['open', 'approved', 'changes_needed', 'rejected']);
export const documentKindEnum = pgEnum('document_kind', ['license', 'insurance', 'other']);
export const uploadStatusEnum = pgEnum('upload_status', ['pending', 'uploaded', 'rejected']);
export const channelEnum = pgEnum('channel', ['email', 'sms']);
export const consentPurposeEnum = pgEnum('consent_purpose', ['transactional', 'outreach']);
export const outboxStatusEnum = pgEnum('outbox_status', ['pending', 'dispatched']);
export const jobStatusEnum = pgEnum('job_status', ['queued', 'running', 'succeeded', 'retrying', 'dead']);
export const flagStatusEnum = pgEnum('flag_status', ['open', 'upheld', 'dismissed']);

// ---------- people ----------
export const users = pgTable('users', {
  id: id(),
  /** Identity provider subject: Cognito `sub`, or `local:<email>` for local test sign-in. */
  authSubject: text('auth_subject').notNull().unique(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  phone: text('phone'),
  role: roleEnum('role').notNull(),
  status: userStatusEnum('status').notNull().default('active'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------- homeowner projects ----------
export const projects = pgTable(
  'projects',
  {
    id: id(),
    homeownerId: uuid('homeowner_id').notNull().references(() => users.id),
    status: projectStatusEnum('status').notNull().default('draft'),
    title: text('title').notNull(),
    description: text('description').notNull(),
    zipCode: text('zip_code').notNull(),
    location: point('location'),
    tradeSlug: text('trade_slug').references(() => trades.slug),
    availability: text('availability'),
    budgetRange: text('budget_range'),
    contactPreference: text('contact_preference'),
    /** AI-written scope summary; sent to contractors only after the homeowner approves it. */
    aiBrief: jsonb('ai_brief'),
    briefApprovedAt: timestamp('brief_approved_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('projects_homeowner_idx').on(t.homeownerId), index('projects_status_idx').on(t.status)],
);

export const projectPhotos = pgTable(
  'project_photos',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull().unique(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    status: uploadStatusEnum('status').notNull().default('pending'),
    createdAt: createdAt(),
  },
  (t) => [index('project_photos_project_idx').on(t.projectId)],
);

// ---------- contractors ----------
export const trades = pgTable('trades', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
});

export const businesses = pgTable(
  'businesses',
  {
    id: id(),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    website: text('website'),
    address: text('address'),
    location: point('location'),
    googlePlaceId: text('google_place_id').unique(),
    source: businessSourceEnum('source').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('businesses_location_gix').using('gist', t.location)],
);

export const contractorProfiles = pgTable('contractor_profiles', {
  id: id(),
  userId: uuid('user_id').notNull().unique().references(() => users.id),
  businessId: uuid('business_id').notNull().references(() => businesses.id),
  status: contractorStatusEnum('status').notNull().default('draft'),
  bio: text('bio'),
  yearsInBusiness: smallint('years_in_business'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const contractorTrades = pgTable(
  'contractor_trades',
  {
    profileId: uuid('profile_id').notNull().references(() => contractorProfiles.id, { onDelete: 'cascade' }),
    tradeSlug: text('trade_slug').notNull().references(() => trades.slug),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.tradeSlug] })],
);

export const serviceAreas = pgTable(
  'service_areas',
  {
    id: id(),
    profileId: uuid('profile_id').notNull().references(() => contractorProfiles.id, { onDelete: 'cascade' }),
    center: point('center').notNull(),
    radiusMiles: smallint('radius_miles').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('service_areas_center_gix').using('gist', t.center)],
);

export const verificationCases = pgTable('verification_cases', {
  id: id(),
  profileId: uuid('profile_id').notNull().references(() => contractorProfiles.id, { onDelete: 'cascade' }),
  status: verificationStatusEnum('status').notNull().default('open'),
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verificationDocuments = pgTable('verification_documents', {
  id: id(),
  caseId: uuid('case_id').notNull().references(() => verificationCases.id, { onDelete: 'cascade' }),
  kind: documentKindEnum('kind').notNull(),
  storageKey: text('storage_key').notNull().unique(),
  expiresOn: date('expires_on'),
  createdAt: createdAt(),
});

export const discoveredLeads = pgTable(
  'discovered_leads',
  {
    id: id(),
    businessId: uuid('business_id').notNull().references(() => businesses.id),
    tradeSlug: text('trade_slug').notNull().references(() => trades.slug),
    status: leadStatusEnum('status').notNull().default('new'),
    approvedBy: uuid('approved_by').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('discovered_leads_business_trade_uq').on(t.businessId, t.tradeSlug)],
);

// ---------- matching ----------
export const introductions = pgTable(
  'introductions',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').notNull().references(() => contractorProfiles.id),
    status: introductionStatusEnum('status').notNull().default('shortlisted'),
    /** Why this contractor was matched (shown on the "why this contractor" card). */
    matchReason: jsonb('match_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('introductions_project_profile_uq').on(t.projectId, t.profileId),
    index('introductions_profile_idx').on(t.profileId),
  ],
);

export const estimates = pgTable('estimates', {
  id: id(),
  introductionId: uuid('introduction_id').notNull().references(() => introductions.id, { onDelete: 'cascade' }),
  priceCents: integer('price_cents').notNull(),
  scope: text('scope').notNull(),
  startDate: date('start_date'),
  warranty: text('warranty'),
  createdAt: createdAt(),
});

export const messages = pgTable(
  'messages',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    introductionId: uuid('introduction_id').references(() => introductions.id),
    senderId: uuid('sender_id').notNull().references(() => users.id),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('messages_project_idx').on(t.projectId)],
);

export const leadFlags = pgTable('lead_flags', {
  id: id(),
  introductionId: uuid('introduction_id').notNull().references(() => introductions.id),
  raisedBy: uuid('raised_by').notNull().references(() => users.id),
  reason: text('reason').notNull(),
  status: flagStatusEnum('status').notNull().default('open'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------- messaging compliance (CAN-SPAM, TCPA) ----------
export const consents = pgTable(
  'consents',
  {
    id: id(),
    userId: uuid('user_id').references(() => users.id),
    channel: channelEnum('channel').notNull(),
    address: text('address').notNull(),
    purpose: consentPurposeEnum('purpose').notNull(),
    granted: boolean('granted').notNull(),
    /** Where consent was captured, e.g. "intake-form-v1". Kept as evidence. */
    source: text('source').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('consents_address_idx').on(t.channel, t.address)],
);

export const suppressions = pgTable(
  'suppressions',
  {
    channel: channelEnum('channel').notNull(),
    address: text('address').notNull(),
    reason: text('reason').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.channel, t.address] })],
);

// ---------- events, outbox, jobs, audit ----------
/**
 * Append-only log of everything that happened. The id is the cursor for GET /events?after=.
 * Visibility: a user sees an event if their id is in user_ids or their role is in roles.
 */
export const domainEvents = pgTable(
  'domain_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    type: text('type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    actorId: uuid('actor_id'),
    payload: jsonb('payload').notNull().default({}),
    userIds: uuid('user_ids').array().notNull().default(sql`'{}'::uuid[]`),
    roles: text('roles').array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [
    index('domain_events_user_ids_gin').using('gin', t.userIds),
    index('domain_events_aggregate_idx').on(t.aggregateType, t.aggregateId),
  ],
);

/** Jobs written in the same transaction as the change that caused them; the relay sends them to the queue. */
export const outbox = pgTable(
  'outbox',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    jobId: uuid('job_id').notNull().unique(),
    jobType: text('job_type').notNull(),
    payload: jsonb('payload').notNull(),
    status: outboxStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (t) => [index('outbox_pending_idx').on(t.availableAt).where(sql`${t.status} = 'pending'`)],
);

/** One row per job, updated by the worker. Dead jobs are listed for admins to re-run. */
export const jobRuns = pgTable(
  'job_runs',
  {
    jobId: uuid('job_id').primaryKey(),
    jobType: text('job_type').notNull(),
    payload: jsonb('payload').notNull(),
    status: jobStatusEnum('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    rerunOf: uuid('rerun_of'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('job_runs_status_idx').on(t.status)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    details: jsonb('details').notNull().default({}),
    requestId: text('request_id'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_entity_idx').on(t.entityType, t.entityId)],
);
