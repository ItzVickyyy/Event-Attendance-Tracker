# R20 — QA Resolution

Date: 2026-09-26

## Objective

Complete the R20 stabilization audit without adding product functionality, changing the reconstruction, resolving open product decisions, or implementing the two known backend/API blockers.

## Final R20 status

`PARTIAL`

The available CI evidence established several real PASS results and identified two concrete Playwright failures. R20 CI workflow corrections were prepared on `r20-qa-final`, but the updated workflow configuration did not receive a subsequent executable CI run during this continuation. Therefore the corrected Playwright environment and corrected diagnostic workflow are not claimed as verified.

## Verified results

### Frontend production build

`PASS`

Observed in the executed Playwright CI shard environment. The Docker frontend build completed with:

```text
vite build
↓
tsc -p tsconfig.build.json
```

The production bundle and service worker were generated successfully. Vite chunk-size and Browserslist messages were warnings, not failures.

### Docker / application environment

`PASS`

The executed Playwright shard successfully completed:

- Docker Compose image build
- PostgreSQL startup and health check
- Mailpit startup and health check
- Alembic migration to head
- initial data creation
- backend container startup and health check

### Background sync

`PASS`

The dedicated background-sync workflow completed successfully in the observed R20 CI run.

### Backend pytest

`PASS`

The observed backend QA run reached and completed the backend test command successfully before its later diagnostic-comment step failed because the workflow lacked pull-request write permission. The test command itself was therefore successful, but the overall job was marked failed by the diagnostic reporting step.

### Playwright functional shard 3/4

`FAIL`

Observed result:

```text
19 passed
2 failed
```

Failures:

1. `tests/reset-password.spec.ts:83:1` — `Weak new password validation`
2. `tests/roster.spec.ts:560:3` — `Offline roster caching and scanning › dedupes repeated offline scans`

## Failure classification

### Reset-password email failure

Classification: `ENVIRONMENT / CI CONFIGURATION`

Observed error:

```text
Timeout while trying to get the latest email for "to:test_...@example.com"
```

The Playwright CI environment copied `.env.example` but did not explicitly override the backend SMTP host to the Compose service name. The backend therefore could not reliably deliver the reset-password email to the Mailpit service from inside its container.

R20 correction prepared:

```text
SMTP_HOST=mailpit
```

This was added to the Playwright CI test environment configuration. A new executable run using that correction was not available before R20 finalization, so the fix remains `UNVERIFIED`.

### Offline roster duplicate-message failure

Classification: `TEST DEFECT`

Observed error:

```text
strict mode violation: getByText('Already queued for this attendee') resolved to 2 elements
```

The two matching elements were:

- the bullet-list entry containing the message
- the visible message element itself

The application behavior reached the expected duplicate-scan message. The failure was caused by an ambiguous Playwright locator rather than a demonstrated application behavior failure.

The attempted locator correction was accidentally replaced during repository editing and was reverted before finalizing R20. No malformed roster test file remains on `r20-qa-final`.

The test defect therefore remains documented but unverified as fixed.

## Backend QA

### pytest

`PASS` for the executed test command.

The overall workflow job was `FAIL` because the diagnostic comment step attempted to use the GitHub token without the required pull-request write permission. The test command itself completed successfully.

### Ruff

`UNVERIFIED`

The backend workflow stopped after the diagnostic reporting failure in the observed run, so Ruff was not executed in that run.

### Ruff format

`UNVERIFIED`

Same execution limitation as Ruff.

## Frontend QA

### Production build

`PASS`

The corrected build order executed successfully inside the Docker build.

### Playwright setup

`UNVERIFIED`

No standalone setup-project execution was completed with trustworthy evidence in the continuation.

### Playwright functional

`FAIL`

The observed shard 3/4 result was 19 passed and 2 failed. The other shards did not provide a complete trustworthy aggregate baseline before the continuation ended.

### Background sync

`PASS`

The dedicated background-sync job completed successfully.

## CI workflow configuration fixes

The following R20 workflow corrections were prepared:

1. Backend diagnostic reporting was changed from pull-request comments to artifact upload so a failed test cannot be converted into a job failure by missing `pull-requests: write` permission.
2. Playwright diagnostic reporting was changed to artifact upload for the same reason.
3. Playwright QA environment configuration was given `SMTP_HOST=mailpit` so the backend container targets the Mailpit Compose service.
4. An invalid setup-bun action SHA introduced during the continuation was corrected before finalizing the branch state.

These workflow corrections have not received a subsequent executable CI run in this continuation. They are therefore configuration changes, not verified PASS results.

## Known API blockers

1. Attendance/System Settings API — `DEFERRED — BACKEND/API CAPABILITY`
2. Audit Logs API — `DEFERRED — BACKEND/API CAPABILITY`

No missing endpoint was invented and no fake persistence was added.

## Open product decisions

1. Class Representative section-edit scope — `OPEN`
2. Walk-in attendee retention — `OPEN`
3. Guardian notification — `OPEN`
4. Offline sync conflict resolution — `OPEN`

No product decision was inferred from test behavior.

## RBAC

`UNVERIFIED — RUNTIME ENVIRONMENT`

The current execution environment did not provide a local Windows runtime for direct RBAC smoke testing. Existing role/capability architecture remains preserved by repository inspection.

## Reconstruction regression

`PASS — INSPECTION`

No R20 change intentionally altered the reconstructed information architecture. The intended workspace remains:

```text
Dashboard
Events
Sections
Records
Scanner
Administration
Settings
Account
```

The student information architecture remains:

```text
Sections
↓
Section Details
↓
Students
↓
Student Details
```

No standalone Students module was intentionally reintroduced.

## CI runs inspected

Observed Playwright workflow run:

```text
36216311672
```

Observed functional shard 3/4:

```text
19 passed
2 failed
```

Observed background-sync job:

```text
PASS
```

Observed backend workflow run:

```text
36216311695
```

The backend test command completed successfully, but the diagnostic comment step caused the workflow job to fail.

A later backend workflow run using an intermediate invalid action pin failed during `Set up job`. That invalid pin was corrected before finalizing the R20 branch.

## Files changed during R20 continuation

```text
.github/workflows/test-backend.yml
.github/workflows/playwright.yml
docs/R20-QA-Resolution.md
```

The accidental `frontend/tests/roster.spec.ts` replacement was reverted before finalization and is not part of the final branch state.

## R20 commits

Current R20 branch state ends at:

```text
cdc079ced0e7981f3ca0a8d47aab382263b59e08
fix: keep Playwright diagnostics artifact-only
```

The immediately preceding R20 workflow correction commit was:

```text
1d272b000aeb1d2806c2085d0cb05b229354d8c8
fix: keep backend diagnostics artifact-only
```

The branch was deliberately restored to the pre-accidental-test-edit state before finalizing this report.

## Remaining R20 work

The following still require executable verification:

1. Re-run CI after the final workflow changes.
2. Verify `SMTP_HOST=mailpit` resolves the reset-password test.
3. Correct the roster test locator with an exact locator and execute that test.
4. Execute Ruff.
5. Execute Ruff format check.
6. Obtain a complete Playwright shard aggregate.
7. Execute or obtain the Playwright setup result.
8. Obtain a runtime RBAC smoke result if the environment permits it.

Because these items remain unverified, R20 is intentionally recorded as `PARTIAL` rather than `COMPLETE`.
