# R17 — Stabilization & QA

Date: 2026-09-26

## Scope

This document records the first post-reconstruction stabilization audit. It does not introduce product features or change the R2–R16 information architecture.

## Source-of-truth verification

The repository contains `docs/Major-Reconstruction-Guide.md` and `docs/SOURCE-OF-TRUTH.md`. The reconstruction guide remains the authority for the final sitemap, role/data-scope model, scanner capability model, registration/roster distinction, attendance states, and the four unresolved product decisions.

No R17 change resolves those four decisions.

## R16 audit provenance

A separate R16 final-audit report was not found in `docs/` on the current `master` branch. The `docs/` directory contains the Major Reconstruction Guide, SOURCE-OF-TRUTH, Phase-3 Student Data Field Mapping, and WORKFLOW directory, but no R16 audit artifact.

Therefore, the two blockers described below are identified from the current repository implementation rather than attributed to a missing R16 document.

## Known API blocker #1 — persisted system settings

Status: BLOCKED BY BACKEND/API CAPABILITY

Affected areas:
- Attendance Rules
- Time-Out Settings
- Organization Settings

Evidence:

The frontend routes exist, but `attendance-rules.tsx` explicitly reports that the current frontend client does not expose a persisted attendance-rules settings resource. The corresponding settings pages use the shared capability-page treatment rather than a mutation flow.

The backend route registry currently exposes academic programs/sections, attendance, corrections, credentials, relationships, attendees, event registrations, events, imports, login, organizations, people, private routes, roster, students, users, and utils. No dedicated system-settings resource is registered.

Classification: BACKEND/API CAPABILITY GAP

Action: DEFERRED. Do not invent persistence endpoints or weaken authorization. A future explicit backend/product decision is required before implementing persisted system settings.

## Known API blocker #2 — audit logs

Status: BLOCKED BY BACKEND/API CAPABILITY

Affected area:
- Administration → Audit Logs

Evidence:

The reconstructed frontend route exists at `administration/audit-logs.tsx`, but the backend route registry contains no audit-log route/resource. There is therefore no verified API contract from which the frontend can display real audit records.

Classification: BACKEND/API CAPABILITY GAP

Action: DEFERRED. Do not fabricate audit entries or create an undocumented frontend-only audit trail. A backend audit-log contract and persistence model must be established first.

## Automated QA environment

Status: UNVERIFIED — ENVIRONMENT BLOCKED

The repository contains dedicated Playwright configurations for the normal foreground/dev environment and the production-preview background-sync environment.

`frontend/playwright.config.ts`:
- uses the Vite dev server by default
- defaults to `https://localhost:5173`
- configures Playwright to ignore the development self-signed certificate
- excludes `background-sync.spec.ts` from the normal Chromium project
- provides the `setup` project and authenticated Chromium project

`frontend/playwright.background-sync.config.ts`:
- uses a dedicated production build + `vite preview` lifecycle
- defaults to `https://localhost:4173`
- runs only `background-sync.spec.ts`
- intentionally avoids the normal authentication setup project

This separation is intentional and is retained.

## Backend test configuration

The backend settings require:
- `SECRET_KEY`
- `PROJECT_NAME`
- `DATABASE_URL`
- `FIRST_SUPERUSER`
- `FIRST_SUPERUSER_PASSWORD`

The repository `.env.example` supplies development/test placeholders and also defines `TEST_DATABASE_URL` separately from `DATABASE_URL`.

The backend settings explicitly reject using the same test database URL as the development database and only warn about default secrets in development/test environments. Production defaults remain protected.

The GitHub Actions backend workflow provisions the database with Docker Compose, runs migrations, executes the backend test script, uploads coverage, and enforces the configured coverage threshold.

Classification: TEST CONFIGURATION PRESENT

Runtime result: UNVERIFIED from this audit environment. The current tool environment cannot execute the repository's Bun/uv/Docker test stack. No security-weakening fallback was introduced.

## GitHub Actions QA infrastructure

The repository has dedicated workflows for backend tests and Playwright tests. The Playwright workflow installs Bun and uv, generates the API client, builds Docker services, runs backend prestart/migrations, and executes Playwright in four shards.

A previously observed Smokeshow failure on commit `3458c6ac1f3ac0fec46cf4b6c1507661908f6219` occurred after the reconstruction commit. That workflow result alone does not establish a frontend functional failure, so it is not reclassified as a frontend defect here.

## Required R17 commands

These commands remain the authoritative local verification commands:

```powershell
uv run pytest backend/tests -q
uv run ruff check backend/app backend/tests
uv run ruff format --check backend/app backend/tests

cd frontend
bun run build
npx playwright test --project=setup
npx playwright test
npx playwright test --config=playwright.background-sync.config.ts tests/background-sync.spec.ts
```

They were not executed by this audit environment.

## Reconstruction regression audit

Status: VERIFIED BY REPOSITORY INSPECTION

The reconstructed route tree remains present, including Dashboard, Events, Sections, Records, Scanner, Administration, Settings, and Account workspaces. No R17 change alters the sitemap, role model, Class Representative boundaries, scanner capability model, or Sections → Students information architecture.

## Open decisions

These remain OPEN and were not silently resolved:

1. Class Representative section-edit scope
2. Walk-in attendee retention
3. Guardian notification
4. Offline sync conflict resolution

## Final classification

| Area | Status |
|---|---|
| API blocker #1: persisted settings | BLOCKED — BACKEND/API CAPABILITY GAP |
| API blocker #2: audit logs | BLOCKED — BACKEND/API CAPABILITY GAP |
| Backend automated tests | UNVERIFIED — ENVIRONMENT BLOCKED |
| Backend Ruff | UNVERIFIED — ENVIRONMENT BLOCKED |
| Backend format | UNVERIFIED — ENVIRONMENT BLOCKED |
| Frontend build | UNVERIFIED — ENVIRONMENT BLOCKED |
| Playwright setup | UNVERIFIED — ENVIRONMENT BLOCKED |
| Playwright functional suite | UNVERIFIED — ENVIRONMENT BLOCKED |
| Background-sync suite | UNVERIFIED — ENVIRONMENT BLOCKED |
| Reconstruction regression inspection | VERIFIED |
| Open decisions | OPEN |

## Files changed in R17

- `docs/R17-Stabilization-QA.md`

No application code, backend code, database schema, migrations, authentication, authorization, or scanner infrastructure was changed during this audit.

## Commit

`docs: record R17 stabilization and QA audit`

## Stop condition

R17 stops here. No R18 feature work is started by this phase.