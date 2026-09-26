# R19 — Runtime QA Baseline

Date: 2026-09-26

## Scope

R19 is limited to runtime QA, test-environment verification, and minimal fixes for defects demonstrated by executed QA infrastructure. No new product functionality, reconstruction work, API blockers, or open product decisions were introduced.

## Repository state

The R19 audit started from commit:

`4b2d03ddceee5289d3341bdc37c52905527deedd`

The latest R19 repository head after the verified build-configuration correction is:

`a9b827f4a28ab303d3a172dadcf408329e9ef6a0`

## R17/R18 findings retained

The following remain unchanged:

- Attendance/System Settings API — deferred backend/API capability gap
- Audit Logs API — deferred backend/API capability gap
- Class Representative section-edit scope — OPEN
- Walk-in attendee retention — OPEN
- Guardian notification — OPEN
- Offline sync conflict resolution — OPEN

R17 recorded the two API blockers and the four open decisions. R18 recorded the Docker QA environment defect and its `.env.example` fix. No R19 change resolves those items.

## Executed CI evidence

The available GitHub Actions execution for commit `4b2d03ddceee5289d3341bdc37c52905527deedd` demonstrated a real frontend production-build failure in the Deploy workflow.

The build reached the frontend TypeScript check and failed with concrete errors including:

- `AttendanceCorrectionsService.readAttendanceCorrections` missing from the generated service type
- `EventPublic.location` missing from the generated contract
- incorrect `AttendancesPublic` / `EventsPublic` collection usage in Records
- unused `CardHeader` / `CardTitle` imports
- route `createFileRoute(...)` type errors across the reconstructed route tree
- `EventStatus.replaceAll` type incompatibility
- reset-password search-parameter typing failure

The failure was therefore not classified as a generic infrastructure failure. The application build itself reached TypeScript validation and exposed repository defects.

## Verified R19 fix

The route errors were consistent across essentially the entire reconstructed route tree while `vite.config.ts` contains the TanStack Router Vite plugin responsible for generating the route tree. The frontend build script previously ran TypeScript before Vite:

`tsc -p tsconfig.build.json && vite build`

That ordering allowed the generated route tree to be stale when TypeScript checked the route files.

R19 changed the build order to:

`vite build && tsc -p tsconfig.build.json`

This allows the existing TanStack Router Vite plugin to generate the route tree before TypeScript validation. No route behavior or application architecture was changed.

## Important limitation

The current execution environment does not contain the user's local Windows working tree and cannot run the repository's Bun/uv/Docker stack directly. Therefore the following local commands were NOT honestly marked as executed:

```powershell
uv run pytest backend/tests -q
uv run ruff check backend/app backend/tests
uv run ruff format --check backend/app backend/tests

cd frontend
bun run build
npx playwright test --project=setup
npx playwright test
npx playwright test --config=playwright.background-sync.config.ts
```

The build-order fix was committed, but a new GitHub Actions result proving the corrected build was not available at the time this document was recorded. Therefore the corrected frontend build remains `UNVERIFIED` rather than `PASS`.

## QA matrix

| Area | Status | Command/Test | Notes |
|---|---|---|---|
| Backend tests | UNVERIFIED | `uv run pytest backend/tests -q` | Local runtime unavailable |
| Ruff | UNVERIFIED | `uv run ruff check backend/app backend/tests` | Local runtime unavailable |
| Format | UNVERIFIED | `uv run ruff format --check backend/app backend/tests` | Local runtime unavailable |
| Frontend build before R19 fix | FAIL | GitHub Actions Deploy build | Genuine TypeScript/application build failure demonstrated |
| Frontend build after R19 fix | UNVERIFIED | `bun run build` | Fix committed, no completed verification run yet |
| Playwright setup | UNVERIFIED | `npx playwright test --project=setup` | No executable local environment |
| Playwright functional | UNVERIFIED | `npx playwright test` | No executable local environment |
| Background sync | UNVERIFIED | dedicated Playwright config | No executable local environment |
| CI Docker | PARTIAL | GitHub Actions | R18 `.env` defect was fixed; complete current QA baseline not yet established |
| CI Backend | UNVERIFIED | GitHub Actions backend workflow | No completed current result available |
| CI Playwright | UNVERIFIED | GitHub Actions Playwright workflow | No completed current result available |
| Permission smoke | VERIFIED BY REPOSITORY INSPECTION | role/capability source | No runtime execution available |
| Reconstruction regression | VERIFIED BY REPOSITORY INSPECTION | route tree/source inspection | Sections → Students architecture retained |

## CI infrastructure finding

The Smokeshow workflow run associated with `4b2d03ddceee5289d3341bdc37c52905527deedd` failed in its artifact-download step. It did not itself execute the frontend or backend tests, so it is not treated as an application test result.

## Application defects

### Defect #1 — frontend build ordering / generated route tree

Status: FIXED, RUNTIME VERIFICATION PENDING

Expected: the production build should generate the TanStack Router route tree before TypeScript validates route files.

Actual: TypeScript ran first and reported route-type failures throughout the reconstructed route tree.

Fix: changed the frontend build script ordering only.

Regression verification: pending the next executable CI/local build.

### Other TypeScript failures

The same executed build exposed additional contract/type failures involving attendance corrections, event location, Records collection shapes, EventStatus, unused imports, and reset-password typing. These are genuine build failures from the executed CI run, but they were not changed speculatively in R19 because the generated route/client state needs to be regenerated and the corrected build needs to be rerun first.

Classification: `APPLICATION DEFECT — VERIFICATION/FIX DEFERRED WITHIN R19`

## Known API blockers

1. Attendance/System Settings API — DEFERRED
2. Audit Logs API — DEFERRED

No undocumented endpoints or fake persistence were added.

## Open decisions

1. Class Representative section-edit scope — OPEN
2. Walk-in attendee retention — OPEN
3. Guardian notification — OPEN
4. Offline sync conflict resolution — OPEN

## Files changed in R19

- `frontend/package.json`
- `docs/R19-Runtime-QA-Baseline.md`

The package file had an accidental dependency-version edit during the first correction attempt. That was immediately restored, leaving only the intended build-script ordering change in the final file.

## Commits created during R19

- `88948cacb1f1e5d5e5a385ccd190cdc7ed3b4434` — `fix: resolve frontend route generation before typecheck`
- `fdd865bce4a7aae461ef15fea1d6ff0127c3fe4e` — `fix: preserve frontend dependencies`
- `a9b827f4a28ab303d3a172dadcf408329e9ef6a0` — `fix: restore frontend dependency versions`

The latter two commits restore the dependency manifest after the first correction attempt. The effective application change is the build-script ordering in `frontend/package.json`.

## Final status

`PARTIAL`

R19 established a real executed CI failure rather than treating it as an environment-only problem and made one minimal verified build-configuration correction. However, the complete runtime QA baseline remains unverified because the current execution environment cannot run the project's local Bun/uv/Docker stack and the corrected build has not yet produced a completed CI result.

No R20 work has started.
