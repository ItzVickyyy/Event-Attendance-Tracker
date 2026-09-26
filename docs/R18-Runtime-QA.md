# R18 — Runtime QA & Verification

Date: 2026-09-26

## Scope

R18 is limited to establishing an executable QA environment and verifying existing application behavior. It does not introduce product features, resolve the four open product decisions, or implement the two known backend/API blockers.

## R17 baseline

R17 identified two backend/API capability gaps:

1. Persisted system settings for Attendance Rules, Time-Out Settings, and Organization Settings.
2. Audit Logs API/resource.

Those remain deferred and were not changed by R18.

The four open product decisions also remain unchanged:

1. Class Representative section-edit scope
2. Walk-in attendee retention
3. Guardian notification
4. Offline sync conflict resolution

## Environment defect found

The repository's Docker-based QA workflows attempted to run `docker compose build` without creating the root `.env` file. `compose.yml` requires `POSTGRES_PASSWORD`, and the Compose interpolation failed before the application containers could build:

`required variable POSTGRES_PASSWORD is missing a value: Variable not set`

This was observed in GitHub Actions run `36212587689` for commit `a7b94d620b8ee17693e80bd7f98966ebcb1477fe`.

The repository already provides `.env.example` containing the required development/test variables, including an isolated `TEST_DATABASE_URL`.

## Environment fix

The following QA workflows now create the test environment from the repository's existing template before invoking Docker Compose:

- `.github/workflows/test-docker-compose.yml`
- `.github/workflows/test-backend.yml`
- `.github/workflows/playwright.yml`

The added step is:

```bash
cp .env.example .env
```

No production secrets were added. No authentication, authorization, security validation, or application behavior was weakened.

## Local execution status

A local Windows working tree at `C:\Users\vocjo\Projects\Event-Attendance-Tracker` was not available inside the execution environment used for this audit. Therefore the requested local commands could not honestly be reported as executed.

Required local commands remain:

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

Classification: `UNVERIFIED — ENVIRONMENT BLOCKED`

## CI verification after the fix

The environment-fix commits were pushed directly to `master` because this repository is connected through the GitHub integration:

- `bf39c1bdb69a5a9a3344583090ff4d8f862e1412` — `test: configure Docker Compose QA environment`
- `43fbe57b90d9de01d8312d0e0771f15c50f5db22` — `test: configure backend QA environment`
- `4126b181f5a84d7b50efc923bd61427b2f0bcb75` — `test: configure Playwright QA environment`

The final commit triggered the repository's automated workflows. At the time of this audit, the resulting Smokeshow workflow had completed with failure while the underlying QA workflows were still being evaluated. Therefore no complete PASS result is claimed from CI yet.

## Test result classification

| Area | Status |
|---|---|
| Backend tests | UNVERIFIED — runtime result not yet available in this audit environment |
| Ruff | UNVERIFIED — runtime result not yet available in this audit environment |
| Format | UNVERIFIED — runtime result not yet available in this audit environment |
| Frontend build | UNVERIFIED — runtime result not yet available in this audit environment |
| Playwright setup | UNVERIFIED — runtime result not yet available in this audit environment |
| Playwright functional | UNVERIFIED — runtime result not yet available in this audit environment |
| Background sync | UNVERIFIED — runtime result not yet available in this audit environment |
| Runtime smoke | UNVERIFIED |
| Permission verification | VERIFIED BY REPOSITORY INSPECTION |
| API blocker #1 | DEFERRED — BACKEND/API CAPABILITY |
| API blocker #2 | DEFERRED — BACKEND/API CAPABILITY |
| Open decisions | OPEN |

## No application defects fixed

R18 did not identify an application defect through an executed runtime test. No frontend or backend application behavior was changed.

## Files changed

- `.github/workflows/test-docker-compose.yml`
- `.github/workflows/test-backend.yml`
- `.github/workflows/playwright.yml`
- `docs/R18-Runtime-QA.md`

## Final status

`PARTIAL`

The verified R18 result is that the QA workflows had a concrete environment configuration defect that prevented Docker Compose execution, and that defect was corrected using the repository's existing `.env.example` test configuration. Complete runtime PASS/FAIL results remain unverified from the available execution environment.

R18 stops here. No R19 work is started.
