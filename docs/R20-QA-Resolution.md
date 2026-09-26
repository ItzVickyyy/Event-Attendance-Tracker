# R20 — Final QA Resolution

Date: 2026-09-26

## Purpose

This document records the final runtime QA work completed locally and the CI results inspected afterward. It is the consolidated replacement for the older R17, R18, R19, and intermediate R20 QA notes.

No product feature was added during this QA pass. The work focused on establishing a trustworthy test baseline, identifying environment failures, and confirming the repository state before further implementation.

## Local runtime verification

### Test environment issue identified

The first local pytest runs failed during settings import because Pydantic Settings was not loading the test environment. The `.env` file existed and contained the required variables, but the process was running without the test environment selected.

The test database was verified independently:

```text
host=localhost
port=5433
database=app_test
user=postgres
```

The Docker PostgreSQL container contained both `app` and `app_test` databases.

`init_db()` was also verified against the test database. The initial superuser persisted after closing and reopening the SQLModel session.

The decisive environment correction was:

```powershell
$env:FASTAPI_ENV="test"
```

### Backend test baseline

After setting `FASTAPI_ENV=test`:

```text
144 passed
0 failed
0 errors
```

Command:

```powershell
uv run pytest tests --tb=short -q
```

This confirms that the earlier large failure set was a cascading test-environment problem rather than 27 independent application failures.

### Static checks

The repository also passed:

```powershell
uv run ruff check backend/app backend/tests
git diff --check
```

The working tree was then restored to a clean state.

## CI verification

The subsequent GitHub Actions results were inspected after the local baseline was established.

### Backend / application QA

The available CI evidence confirmed successful backend test execution. The workflow also exposed security/deprecation warnings, but they did not cause test failures.

### Playwright / Docker

The relevant Docker and Playwright environment successfully exercised the application stack, including PostgreSQL, Mailpit, migrations, backend startup, frontend build, and functional browser testing.

The actual functional Playwright test jobs completed successfully where executed. An aggregate workflow cancellation should not be interpreted as a failed application test when the underlying shard jobs had already passed.

### Deploy workflow

Observed run:

```text
36231930707
```

The frontend build and uv setup succeeded. The workflow failed specifically at:

```text
Prepare database
```

The FastAPI Cloud deployment step was therefore never reached. This is recorded as a deployment/database-environment issue, separate from the verified application test suite.

## Coverage

The CI coverage gate currently reports approximately:

```text
82%
```

while the workflow threshold is:

```text
90%
```

This is a genuine coverage-gap issue, not something to hide by lowering the threshold. It is outside the runtime-environment correction performed here and should be handled as a separate coverage-improvement task if the project requires the CI gate to become green.

## Warnings retained for future cleanup

The verified test run still emits warnings including:

- default `changethis` secret warnings for the local test configuration
- PyJWT HMAC key length warnings because the local test secret is short
- Starlette/httpx TestClient deprecation warning

These warnings did not invalidate the `144 passed` baseline, but they should remain visible as technical-debt items.

## Repository state

The implementation changes that had been temporarily introduced while diagnosing QA were restored. The repository returned to:

```text
master...origin/master
clean working tree
```

No temporary formatter or QA edits remain in the working tree.

## Temporary branch

A temporary branch named:

```text
r20-format-fix
```

was created during the QA/formatting investigation. It is not required for the final repository state and may be deleted from the remote once confirmed unused:

```powershell
git push origin --delete r20-format-fix
```

## Test artifacts

Generated Playwright and coverage artifacts are intentionally not part of the repository. `.gitignore` already excludes:

```text
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
```

These artifacts are useful for short-term debugging or CI inspection, but they should not be committed as permanent project documentation. GitHub Actions artifacts should remain the historical record for individual CI runs when needed.

## Documentation cleanup

The previous QA documents were incremental working notes from R17 through R20. They are now consolidated into this file because their status statements became stale as later verification superseded them.

The retained documentation is intentionally limited to durable project information:

- `SOURCE-OF-TRUTH.md` — authoritative system specification
- `Major-Reconstruction-Guide.md` — reconstruction and information architecture
- `Phase-3-Student-Data-Field-Mapping.md` — student import field decisions
- `WORKFLOW/` — operational handoff documents
- this file — consolidated runtime QA baseline

## Known product/API items not changed by this QA pass

The following remain separate from runtime QA and were not invented, resolved, or modified during this work:

- Attendance/System Settings API capability gap
- Audit Logs API capability gap
- Class Representative section-edit scope
- Walk-in attendee retention
- Guardian notification
- Offline sync conflict resolution

## Final baseline

```text
Backend pytest       PASS — 144 passed
Ruff check           PASS
Git diff check       PASS
Test DB              PASS
Docker DB            PASS
Frontend CI build    PASS where executed
Playwright shards    PASS where executed
Deploy               BLOCKED at database preparation
Coverage             82% vs 90% CI threshold
Working tree         CLEAN
```

## Next step

The repository is ready for normal implementation work. Future changes should preserve the verified test environment requirement:

```powershell
$env:FASTAPI_ENV="test"
```

Then run the relevant focused tests followed by the full backend suite before considering a change complete.
