# DM3Oi™ — Operational Intelligence

**People. Work. Progress. Intelligence.**

DM3Oi is Operational Intelligence for service businesses: Operational Intelligence for the Real World. It turns daily work into measurable progress across the Customer / Request → Case → Requirements → Tasks → Staff Work → Review → Completion workflow.

## Getting started

Requirements: a current Node.js LTS release and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3003](http://localhost:3003). Other commands:

```bash
npm run build
npm run lint
npm run typecheck
```

### Authentication configuration

Copy `.env.example` to `.env.local` and supply the public values from the Supabase project's API settings:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Configure `http://localhost:3003/auth/callback` as an allowed Supabase redirect URL. Without these variables, the login UI remains available and clearly reports that Supabase is not configured; protected routes redirect to `/login`. Authentication supports password sign-in, email-code request and verification, cookie-backed sessions, callback exchange, protected routes, and sign-out. No case-management database schema is introduced by this milestone.

## Project structure

- `app/` — App Router pages and global visual system
- `components/` — reusable application, dashboard, and case presentation
- `data/` — structured representative local records
- `domain/` — permanent domain contracts and role policy
- `lib/` — reusable selectors, metrics, progress, and formatting
- `supabase/` — deterministic migrations, local configuration, and database tests
- `types/` — Supabase-generated database contracts
- `docs/` — product and architecture decisions

## Milestone status

DM3iQCM-01 establishes the application shell, navigation, role/domain model, dashboard, case register and workspace, Service Desk foundation, sample data, future-module routes, and the Supabase authentication scaffold. Case persistence, dynamic questions/rules, messaging, and integrations are explicitly reserved for later milestones.

DM3iQCM-02 establishes the permanent tenant schema, transactional role constraints, cross-tenant foreign-key integrity, RLS policies, profile/access resolution, derived progress and overdue database interfaces, append-oriented case activity, and generated Supabase types. The current operational UI remains fixture-backed pending repository integration in a later milestone.

DM3iQCM-03 replaces core fixtures with live, active-organization Supabase operations for the dashboard, case register, case creation/workspace, assignments, task CRUD/reordering, status transitions, completion safeguards, activity, and customers. Service Desk alone remains a presentation fixture until the customer-service milestone.

For local database validation (this resets only the local stack, whose historical Supabase project identifier remains `DM3iQCM`):

```bash
supabase start
npm run db:test
```

See [docs/DM3IQCM-DATA-ARCHITECTURE.md](docs/DM3IQCM-DATA-ARCHITECTURE.md) for architecture, policy boundaries, and the first-Super-Admin bootstrap procedure.

See [docs/DM3IQCM-CASE-WORKFLOW.md](docs/DM3IQCM-CASE-WORKFLOW.md) for the live workflow, authorization matrix, metrics, and transactional RPC behavior.

See [docs/DM3IQCM-PRODUCT-FOUNDATION.md](docs/DM3IQCM-PRODUCT-FOUNDATION.md) for the permanent product foundation.
