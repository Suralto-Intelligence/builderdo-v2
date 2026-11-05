# BuilderDo V2

Homeowners describe a project; BuilderDo gives them a short list of verified local contractors they choose themselves.

## Quick start

Requirements: Node 22, pnpm 10 (`corepack enable`), Docker.

```bash
cp .env.example .env
pnpm setup          # install, start local services, build shared packages
pnpm dev            # web on :3000, api on :4000, worker
```

Then open:

| What | URL |
|---|---|
| Website | http://localhost:3000 |
| API health | http://localhost:4000/health |
| Emails caught locally (Mailpit) | http://localhost:8025 |
| Queue stats (ElasticMQ) | http://localhost:9325 |

## Layout

```
apps/web         Next.js website: homeowner, contractor and admin screens
apps/api         NestJS on Fastify: business rules, permissions, APIs
apps/worker      Background jobs from the queue: AI, discovery, email, SMS
packages/shared  Types, Zod schemas and env validation shared by all apps
packages/db      Drizzle schema, client and migrations (PostgreSQL + PostGIS)
infra/           Local service config now; Terraform for AWS from Phase 7
```

Local services stand in for AWS: PostgreSQL + PostGIS for RDS, ElasticMQ for SQS, S3Mock for Cloudflare R2, Mailpit for Postmark. Nothing sends real email or SMS locally.

## Everyday commands

```bash
pnpm check           # lint, type-check, test and build everything (what CI runs)
pnpm services:reset  # wipe and restart local databases and storage
```

## Rules

- Every change goes through a pull request with passing checks; nobody pushes straight to `main`.
- Every API route has a permission test; every database change ships as a reviewed migration.
- Every outside service sits behind an interface, with a fake for tests.
- No secrets in code. Settings come from the environment and are validated at startup; a service refuses to start with a missing or wrong setting.
