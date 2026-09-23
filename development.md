# Event Attendance Tracker — Development Guide

This describes the development workflow as the repository is actually configured today. Where the current configuration has a gap (see the callout in "Full Stack with Docker Compose" below), that gap is called out explicitly rather than papered over.

## Prerequisites

- [uv](https://docs.astral.sh/uv/) (Python 3.14, pinned via `.python-version`)
- [Bun](https://bun.sh/)
- [Docker](https://www.docker.com/) and Docker Compose, for PostgreSQL (and optionally the full stack)
- A locally-trusted TLS certificate for the frontend dev server (see "Frontend HTTPS Requirement" below) — this project relies on the browser's Web NFC API, which only works in a secure context, so the Vite dev server is configured to serve over HTTPS even locally.

## Environment Configuration

The repository does not commit a `.env` file. Copy the example and fill in real values before running the backend or Docker Compose:

```bash
cp .env.example .env
```

`.env.example` currently defines: `FASTAPI_ENV`, `PROJECT_NAME`, `SECRET_KEY`, `FIRST_SUPERUSER`, `FIRST_SUPERUSER_PASSWORD`, SMTP settings (`SMTP_HOST`, `EMAILS_FROM_EMAIL`, `SMTP_TLS`, `SMTP_PORT`), `POSTGRES_PASSWORD`, and `DATABASE_URL`.

Setting `FASTAPI_ENV=development` enables the `/private` API routes (a small set of test-only endpoints for creating users directly), which are only mounted when this variable is set.

## Backend Setup

From the `backend` directory:

```bash
uv sync
uv run bash scripts/prestart.sh
uv run fastapi dev
```

`scripts/prestart.sh` runs Alembic migrations (`alembic upgrade head`) and then seeds initial data (`python app/initial_data.py`), which creates the first superuser as a `super_admin` with scanning permission enabled.

`prestart.sh` needs a reachable PostgreSQL database — see "Database (PostgreSQL)" below.

The backend dev server runs at **http://localhost:8001**, with interactive API docs at **http://localhost:8001/docs**.

## Frontend Setup

From the project root:

```bash
bun install
bun run dev
```

### Frontend HTTPS Requirement

`frontend/vite.config.ts` configures the Vite dev server to load a TLS key/cert pair from `frontend/.certs/localhost+lan-key.pem` and `frontend/.certs/localhost+lan.pem`. This directory is gitignored and **must be created locally** — `bun run dev` will fail to start without it. Generate a locally-trusted certificate covering `localhost` and your machine's LAN IP (a LAN-reachable address is needed if you want to test NFC/QR scanning from a phone on the same network) with a tool such as [`mkcert`](https://github.com/FiloSottile/mkcert), and place the resulting key and certificate at the paths above.

Once running, the frontend dev server is served over **HTTPS** (not plain HTTP) — check your terminal output for the exact host/port Vite reports. The dev server proxies `/api` requests to `http://127.0.0.1:8001`, so the backend must be running separately (see "Backend Setup").

### PWA / Service Worker in Development

`vite-plugin-pwa`'s `devOptions.enabled` is set to `false` in `frontend/vite.config.ts`, so `bun run dev` does not register a service worker. This is intentional: the production Workbox config uses `NetworkFirst` caching for `/api/v1/events`, `/api/v1/students`, and `/api/v1/attendee-credentials`, which — if active during development — can silently serve stale cached API responses and mask backend/proxy configuration changes (e.g. the Vite proxy target). Production builds are unaffected; `bun run build` still generates and registers the service worker with the existing runtime caching (including `NetworkOnly` for `/api/v1/attendance/scan`).

If your browser already has a dev-mode service worker registered from before this change, it will keep intercepting requests at `localhost:5173` until removed:

1. Open DevTools → Application → Service Workers, and unregister any worker scoped to `localhost:5173` (or `192.168.x.x:5173`).
2. In DevTools → Application → Storage, click "Clear site data" for that origin (this also clears any stale Workbox caches).
3. Restart `bun run dev`.
4. Hard-reload the page.

### Frontend Served by FastAPI

To build the frontend and have FastAPI serve it directly from the same origin:

```bash
bun run build
```

The build output goes to `backend/app/frontend` (configured in `vite.config.ts`) and is served by the backend at whatever URL the backend is running on. Rebuild after frontend changes.

## Database (PostgreSQL)

`compose.yml` defines a `db` service (PostgreSQL 18), but **as currently committed, `compose.yml` does not publish any ports to the host** — `db`, `backend`, `adminer`, and `proxy` all rely on Traefik's internal Docker routing rather than host port mappings; only `compose.deploy.yml` adds host ports (`80`/`443`, for production). This means running `docker compose up -d db` starts Postgres in a container, but it will **not** be reachable at `localhost:5432` from your host machine as `.env.example`'s `DATABASE_URL` assumes.

Until this is resolved (see the audit findings for this repository), you have two practical options for local backend development:
- Run PostgreSQL some other way that's reachable at `localhost:5432` (e.g., a local Postgres install, or a one-off `docker run -p 5432:5432 ...`), matching the credentials in your `.env`.
- Add a local port mapping for the `db` service yourself (e.g., via a `compose.override.yml` you create) so `docker compose up -d db` publishes `5432:5432`.

**Mailpit**, referenced in the original template docs for local email testing, is **not currently defined** in `compose.yml` — there is no `mailpit` service to start. Email sending is optional in development: if `SMTP_HOST` and `EMAILS_FROM_EMAIL` are left unset, the backend simply won't attempt to send email (`Settings.emails_enabled` is computed from those two values).

## Database Migrations

Migrations are managed with Alembic from the `backend` directory:

```bash
uv run alembic revision --autogenerate -m "description"
uv run alembic upgrade head
```

`scripts/prestart.sh` already runs `alembic upgrade head` on startup.

## Tests

**Backend** (Pytest, from `backend`):

```bash
bash scripts/test.sh
```

This builds and runs the Docker Compose stack, runs `prestart.sh`, and executes the backend test suite with coverage. CI (`test-backend.yml`) enforces a minimum of 90% coverage.

**Frontend end-to-end** (Playwright): tests live in `frontend/tests` and cover login, sign-up, password reset, the admin area, items, roster loading, manual scanning, sync status, background sync, and user settings.

```bash
bunx playwright test
# or, with the UI runner:
bunx playwright test --ui
```

Playwright tests expect the Docker Compose backend stack to be running (see `.github/workflows/playwright.yml` for the exact CI sequence, which also expects a `playwright` Compose service — see the Known Gaps note below).

## Lint and Format

**Frontend** (Biome):

```bash
bun run lint
```

**Backend** (Ruff, mypy, ty) and **pre-commit hooks** are managed with [`prek`](https://prek.j178.dev/), configured in `.pre-commit-config.yaml`. From the project root:

```bash
uv run prek install -f   # install the Git hook once
uv run prek run --all-files   # run all checks manually
```

The pre-commit configuration also regenerates the frontend API client automatically when backend models/routes or `openapi-ts.config.ts` change (see below), and runs `zizmor` against the GitHub Actions workflows.

## Generated Frontend API Client

The frontend's typed API client (`frontend/src/client`) is generated from the backend's OpenAPI schema via [`@hey-api/openapi-ts`](https://heyapi.dev).

Automatically, from the project root (backend must be able to import cleanly; this does not require a running server):

```bash
bash ./scripts/generate-client.sh
```

Or manually, with the backend running, by downloading `http://localhost:8000/api/v1/openapi.json` into `frontend/openapi.json` and running `bun run generate-client` from `frontend`.

Regenerate and commit the client whenever backend routes or schemas change — this is also enforced by the pre-commit hook above.

## Full Stack with Docker Compose

```bash
docker compose build
docker compose run --rm backend bash scripts/prestart.sh
docker compose up -d
```

This starts `proxy` (Traefik), `db`, `adminer`, and `backend` using `compose.yml` alone.

> **⚠️ Known gap:** with only `compose.yml` present, none of these services publish a host port (see "Database (PostgreSQL)" above), so nothing here is reachable at a `localhost` URL as previously documented. The earlier version of this guide described a `compose.override.yml` that added local port mappings, a `mailpit` service, and a `playwright` service for local Docker-based development and CI — **that file does not exist in the current repository.** CI workflows (`test-backend.yml` and `playwright.yml`) still reference `mailpit` and `playwright` Compose services respectively, and `test-docker-compose.yml` curls `http://localhost:8000` directly, all of which depend on configuration that isn't currently committed. If you're picking up this project, either restore an override file providing these, or update the affected workflows/docs to match whatever replaces it.

To deploy with the production HTTPS configuration locally for testing, combine both files:

```bash
docker compose -f compose.yml -f compose.deploy.yml build
docker compose -f compose.yml -f compose.deploy.yml up -d
```

This requires `DOMAIN` and the other variables `compose.deploy.yml` marks as required (see `deployment-docker-compose.md`).

## Common Development Workflow

1. `cp .env.example .env` and fill in real values.
2. Get PostgreSQL reachable at `localhost:5432` (see the Database section above).
3. From `backend`: `uv sync && uv run bash scripts/prestart.sh && uv run fastapi dev`.
4. From the project root: `bun install && bun run dev` (after generating local HTTPS certs — see above).
5. Make backend changes; if routes/schemas changed, run `bash ./scripts/generate-client.sh` (or let the pre-commit hook do it).
6. Run `uv run prek run --all-files` before committing, or rely on the installed Git hook.