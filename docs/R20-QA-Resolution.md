# R20 — QA Resolution

Date: 2026-09-26

## Objective

Resolve and verify the remaining frontend build and QA issues from R19 without introducing new product functionality, changing the reconstruction, resolving open product decisions, or implementing the two known backend/API blockers.

## Starting state

R19 ended `PARTIAL`. The effective frontend build correction changed the build order in `frontend/package.json` to generate the TanStack Router route tree with Vite before TypeScript validation:

```text
vite build
↓
tsc -p tsconfig.build.json
```

The corrected build was not yet executed successfully after that change.

## Current repository head at R20 start

`25a7f157c58830725e1340a39536960ea2b39d0e` — `docs: record R19 runtime QA baseline`

## R19 findings carried forward

The previously executed CI build exposed frontend TypeScript errors involving:

- generated attendance-corrections service usage
- `EventPublic.location`
- `AttendancesPublic` / `EventsPublic` collection handling
- `EventStatus.replaceAll`
- reset-password search-parameter typing
- unused imports
- TanStack Router route types

R20 will re-evaluate these against the current generated client and corrected build order before making changes.

Known deferred backend/API blockers:

1. Attendance/System Settings API
2. Audit Logs API

Open product decisions:

1. Class Representative section-edit scope
2. Walk-in attendee retention
3. Guardian notification
4. Offline sync conflict resolution

## Verification status

Runtime execution is being established through the repository's CI environment because the current assistant execution environment cannot run the user's local Windows Bun/Docker stack.

All PASS/FAIL results below will be filled only from executed CI or executable repository evidence.

## QA matrix

| Area | Status | Evidence |
|---|---|---|
| Frontend build | UNVERIFIED | Awaiting executable CI run |
| Backend pytest | UNVERIFIED | Awaiting executable CI run |
| Ruff | UNVERIFIED | Awaiting executable CI run |
| Format | UNVERIFIED | Awaiting executable CI run |
| Playwright setup | UNVERIFIED | Awaiting executable CI run |
| Playwright functional | UNVERIFIED | Awaiting executable CI run |
| Background sync | UNVERIFIED | Awaiting executable CI run |
| CI Docker | UNVERIFIED | Awaiting current R20 run |
| CI Backend | UNVERIFIED | Awaiting current R20 run |
| CI Playwright | UNVERIFIED | Awaiting current R20 run |
| Runtime RBAC | UNVERIFIED | No local runtime available |
| Reconstruction regression | VERIFIED BY REPOSITORY INSPECTION | R2–R16 reconstruction remains present; no change has been made in R20 yet |

## Changes

No application code changes have been made at the start of R20.
