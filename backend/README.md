# Backend

The backend is the FastAPI service for Event Attendance Tracker. It provides authentication, role-aware API access, event and attendee management, and attendance recording. The current implementation is defined by the code under `backend/app/`, the SQLModel models, Alembic migrations, and the test suite.

## Stack

- Python, managed with [uv](https://docs.astral.sh/uv/)
- FastAPI
- SQLModel / SQLAlchemy and Pydantic
- PostgreSQL with Alembic migrations
- Pytest, Ruff, mypy, and ty for testing and code quality

Use the root [README](../README.md) for the product overview and implemented-feature summary. Intended requirements and future phases are described in [Source of Truth](../docs/SOURCE-OF-TRUTH.md); that specification is not evidence that every listed feature is implemented.

## Project layout

- `backend/app/main.py` — application entry point and API setup
- `backend/app/api/` — API routes and dependencies
- `backend/app/models.py` — SQLModel definitions
- `backend/app/crud.py` — database operations
- `backend/app/core/` — configuration and shared application logic
- `backend/app/alembic/` — database migration configuration and revisions
- `backend/scripts/` — startup, test, and maintenance scripts
- `backend/tests/` — automated backend tests

Check the actual route registrations and models before adding endpoint lists or schema diagrams to documentation. Do not assume a table or endpoint exists just because it appears in an older guide or the product specification.

## Local development

Follow the repository's [Development Guide](../development.md) for prerequisites, environment setup, PostgreSQL connectivity, TLS certificates, startup commands, generated API client, and known configuration gaps.

At a high level:

1. Create a local `.env` from `.env.example` and use development-only secrets.
2. Make sure PostgreSQL is reachable using the configured `DATABASE_URL`.
3. From `backend/`, install dependencies with `uv sync`.
4. Apply migrations and initialize development data using the documented pre-start script.
5. Start the API using the command in the Development Guide.

The exact local service configuration matters. Do not assume that every service named in older template instructions exists in the current Compose files.

## Migrations and data safety

Migrations are managed by Alembic. Review generated migration files before applying or committing them, and confirm that upgrades preserve existing data. Never reset or delete a development database as a routine troubleshooting step. Commands that remove Docker volumes can permanently remove local database contents.

## Tests and checks

From `backend/`, the repository's test script is:

```bash
uv run bash scripts/test.sh
```

For the complete test prerequisites and code-quality commands, use the [Development Guide](../development.md) and the current CI workflows. Do not report coverage thresholds or passing status based on this document alone; check the active workflow and its latest run.

## API documentation

When the backend is running, FastAPI exposes interactive API documentation at `/docs` and the OpenAPI schema at `/api/v1/openapi.json`, subject to the active application configuration. The API's actual routes and schemas are the source for endpoint documentation.

The generated frontend client is maintained from the OpenAPI schema. See the Development Guide for the supported generation command and workflow.

## Authorization

The application has role-based access control and a separate scanning permission. Document specific capabilities only after checking the current route dependencies and tests. In particular, do not infer permissions from role names or from the intended behavior in the Source of Truth.

## Documentation maintenance

When changing routes, models, migrations, authorization, attendance behavior, imports, or sync logic, update the relevant documentation and tests in the same change. Track known documentation mismatches in [Documentation Status and Audit](../docs/DOCUMENTATION-STATUS.md).
