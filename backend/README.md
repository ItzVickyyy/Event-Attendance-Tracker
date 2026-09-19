# Event Attendance Tracker — Backend

The backend is a [FastAPI](https://fastapi.tiangolo.com) application that provides the REST API for the Event Attendance Tracker. It is built on top of the FastAPI + SQLModel + PostgreSQL stack and implements the complete attendance tracking system for college events.

## Project Overview

The **Event Attendance Tracker** replaces manual paper sign-in sheets for college events. Student Council officers can quickly identify attendees using browser-based NFC, QR codes, or manual search, and record their attendance (time-in and time-out). The system supports multiple attendee types (students, faculty, staff, parents/guardians, guests) and enforces role-based access control.

## Technology Stack

- **FastAPI** — Python web framework for the API.
- **SQLModel** — ORM for SQL database interactions (built on SQLAlchemy + Pydantic).
- **Pydantic** — data validation and settings management (used by FastAPI).
- **PostgreSQL** — primary SQL database.
- **Alembic** — database migration tool.
- **uv** — Python package and environment management.
- **SQLModel** — ORM for Python.

## Backend Structure

The backend follows a modular structure with clear separation of concerns:

### Key Directories

- `backend/app/models.py` — All SQLModel database tables and relationships.
- `backend/app/api/` — REST API endpoints organized by resource.
- `backend/app/crud.py` — CRUD operations for database access.
- `backend/app/core/` — Core application logic, configuration, and utilities.
- `backend/app/alembic/` — Database migration files.
- `backend/scripts/` — Development and deployment scripts.
- `backend/tests/` — Backend test suite (Pytest).

### Database Models

The application uses a normalized relational database with these core tables:

#### Core Identity
- `people` — Base person record (first_name, middle_name, last_name, name_extension, contact info)
- `users` — User accounts for system access (with JWT authentication)

#### Academic Structure
- `academic_programs` — Program definitions (BSIT, BSCS, etc.)
- `academic_sections` — Year & section combinations (e.g., 3A, 4B)
- `students` — Student records linked to `people` and `academic_sections`

#### Attendance System
- `attendees` — Event participation records (links `people` to events)
- `attendee_credentials` — NFC/QR identification methods (one attendee can have multiple credentials)
- `attendee_relationships` — Parent/Guardian links to students
- `events` — Event definitions (name, date, times, attendance mode)
- `event_registrations` — Attendee expectations/allowance for events
- `attendance` — Actual attendance records (time-in/time-out, scan method)

#### Administration
- `organizations` — Event organizing bodies (e.g., CCS)
- `user_roles` — Role assignments (`Super Admin`, `Admin`, `Class Representative`, `Student`, `Scanner`)

## Configuration

### Environment Variables

The backend reads configuration from `.env` file (one level above `backend/`):

#### Required Variables
- `PROJECT_NAME` — Application name for documentation and emails.
- `SECRET_KEY` — Used to sign JWT tokens.
- `FIRST_SUPERUSER` — Email of the initial superuser.
- `FIRST_SUPERUSER_PASSWORD` — Password for the initial superuser.
- `DATABASE_URL` — PostgreSQL connection URL.

#### Optional Variables
- `FRONTEND_HOST` — URL of the frontend (default: `http://localhost:5173`).
- `FASTAPI_ENV` — Environment (`development` or `None`).
- `SENTRY_DSN` — Sentry error tracking DSN.
- `SMTP_HOST` — SMTP server for outgoing emails.
- `SMTP_USER`/`SMTP_PASSWORD` — SMTP authentication (if required).
- `EMAILS_FROM_EMAIL` — Sender email address.
- `EMAILS_FROM_NAME` — Sender display name (defaults to `PROJECT_NAME`).
- `EMAIL_RESET_TOKEN_EXPIRE_HOURS` — Password reset token expiry (default: 48 hours).
- `ACCESS_TOKEN_EXPIRE_MINUTES` — JWT access token expiry (default: 8 days).

#### Security
- All secret values (`SECRET_KEY`, `FIRST_SUPERUSER_PASSWORD`, database passwords) should be changed from defaults.
- Default values are used only for development.

### Database Configuration

PostgreSQL stores all application data. Database schema is managed via Alembic migrations:

#### Initial Data
`backend/scripts/prestart.sh` runs migrations and creates initial data in `backend/app/initial_data.py`.

#### Migration Workflow
1. Modify SQLModel models in `backend/app/models.py`.
2. Generate migration: `uv run alembic revision --autogenerate -m "Description"`.
3. Apply migration: `uv run alembic upgrade head`.
4. Commit migration files in `backend/app/alembic/versions/`.

## Running the Backend

### Prerequisites
- Docker and Docker Compose
- PostgreSQL (or Docker Compose PostgreSQL service)
- uv (Python package manager)

### Development Setup

#### Local Development

From the project root, start PostgreSQL and Mailpit:

```console
$ docker compose up -d db mailpit
```

Then, from `./backend/`:

```console
$ uv sync
$ uv run bash scripts/prestart.sh
$ uv run fastapi dev
```

The API is available at `http://localhost:8000`, with automatic interactive docs at `http://localhost:8000/docs`.

#### Docker Compose Development

To run the backend with Docker Compose:

```console
$ docker compose run --rm backend bash scripts/prestart.sh
$ docker compose watch
```

The application is available at `http://localhost:8000`.

### Backend Tests

To test the backend from the `backend` directory:

```console
$ uv run bash scripts/test.sh
```

The tests run with Pytest. Modify existing tests or add new ones in `./backend/tests/`.

If your Docker Compose stack is already running:

```bash
docker compose exec backend bash scripts/tests-start.sh
```

To stop and remove the Docker Compose stack and clean data created in tests:

```bash
docker compose down -v
```

### Testing

- Test coverage reports are generated in `backend/htmlcov/`.
- Tests are run via Pytest from the `backend` directory.

### Code Quality

Run code quality checks from the `backend` directory:

```console
$ uv run bash scripts/lint.sh
```

This runs:
- `mypy app` — Type checking
- `ty check app` — Additional type checking
- `ruff check app` — Linting
- `ruff format app --check` — Formatting validation

## API

The API follows RESTful conventions and is organized around resource types:

### Base Path
All API endpoints are prefixed with `/api/v1` (configurable via `API_V1_STR`).

### Authentication
JWT-based authentication using the `/api/v1/auth` endpoints for login, registration, password recovery, and token refresh.

### Roles and Permissions
The system enforces strict access control with these roles:

- **Super Admin** — Full system access, can manage users/roles, adjust event settings, authorize corrections.
- **Admin** — Event operations, masterlist management, scanner management, permitted attendance administration.
- **Class Representative** — Section-scoped role for managing own section's students and attendance.
- **Student** — Student record access (optional features, not required for core attendance).
- **Scanner** — Dedicated scanning permission for event-day attendance collection.

### Attendance Flow

The backend implements the complete attendance workflow:

1. **Attendee Identification**
   - NFC (Web NFC API, Android/Chromium browsers only)
   - QR Code scanning
   - Manual search (fallback)

2. **Registration and Event Management**
   - Students register for events via `event_registrations`
   - Parent/Guardian attendees can be linked to students
   - Event coordinators manage attendance modes (time-in-only vs. time-in+time-out)

3. **Attendance Recording**
   - Time-in and time-out recording (based on event configuration)
   - Duplicate prevention via database constraints
   - Scan method tracking (nfc, qr, manual)

4. **Offline Support**
   The backend is designed to work with the frontend's offline mode where attendance is queued locally and synced when connectivity returns.

### API Endpoints

The API is organized into these main resources:

- `/api/v1/auth` — Authentication endpoints
- `/api/v1/users` — User management (Admin+ only)
- `/api/v1/organizations` — Organization management
- `/api/v1/events` — Event management
- `/api/v1/attendees` — Attendee management
- `/api/v1/attendance` — Attendance recording and queries
- `/api/v1/scanner` — Scanner operations and attendee lookup
- `/api/v1/export` — Attendance report generation (Excel, CSV, Word, PDF)
- `/api/v1/utils` — Utility endpoints (health check, etc.)

### OpenAPI Documentation
FastAPI provides automatic OpenAPI documentation at:
- `http://localhost:8000/api/v1/docs` — Swagger UI
- `http://localhost:8000/api/v1/redoc` — ReDoc

## Development Notes

### Backend-Specific Considerations

#### Web NFC Constraints
This is a website, not a native Android app, so NFC scanning has these constraints:

- **Chromium-on-Android only** — Chrome, Samsung Internet, Edge, Opera for Android.
- **HTTPS required** — The deployed site must use HTTPS (Traefik in production provides this).
- **Explicit permission + user gesture** — Browser prompts for NFC permission; scanning requires user action.
- **Foreground-tab requirement** — Scanning only works while the page is open and active.

#### Database Design
The system uses a normalized schema to avoid data duplication and ensure data integrity:

- One `people` record per person (students, parents, staff, guests)
- Student information separated from attendance records
- Academic structure normalized (programs → sections → students)
- Credentials separated from attendee records for flexibility

#### Offline-First Design
During an event, the browser's local IndexedDB database is the source of truth for attendance records. The PostgreSQL backend syncs data when connectivity returns.

This design means:

- Event roster is downloaded to the browser before scanning begins
- Attendance records are written locally during scanning
- Sync happens automatically when the browser detects connectivity

#### Export Functionality
The backend generates attendance reports in multiple formats:

- **Excel (.xlsx)** — For further analysis
- **CSV** — Lightweight, universal format
- **Word (.docx)** — Formal reports with letterhead
- **PDF** — For archiving and printing

### Frontend Integration

The backend serves the React frontend from `/`:

```python
app.frontend("/", directory=FRONTEND_DIR)
```

This allows the same FastAPI server to handle both API requests and serve the frontend application.

### Security Considerations

#### Authentication
- JWT tokens with configurable expiration (default: 8 days)
- Argon2 password hashing
- Email-based password recovery

#### Authorization
- Role-based access control with fine-grained permissions
- Scanner capability separate from role names
- Audit logging for administrative actions

#### Data Protection
- Database access restricted via environment variables
- No password or secrets committed to repository
- HTTPS required in production (via Traefik)

## Troubleshooting

### Common Issues

#### Database Connection Errors
- Ensure PostgreSQL is running (`docker compose up -d db`)
- Check `DATABASE_URL` configuration
- Verify PostgreSQL password matches `.env` or environment variable

#### Email Configuration
- Set `SMTP_HOST`, `EMAILS_FROM_EMAIL` for email functionality
- Use `MAILPIT_HOST` for local email testing
- Test with actual SMTP server credentials in production

#### Frontend/Backend Communication
- Ensure `FRONTEND_HOST` matches frontend URL
- Verify CORS settings in backend configuration

### Debugging

- Use `uv run fastapi dev` for automatic reload during development
- Check `backend/htmlcov/` for test coverage reports
- Use Docker logs (`docker compose logs backend`) for container issues

## Migration

When upgrading from a previous version:

1. Review migration files in `backend/app/alembic/versions/`
2. Run migrations: `uv run alembic upgrade head`
3. Update `.env` values as needed
4. Test application functionality thoroughly

## Support

For development assistance, refer to the project documentation and Source of Truth (`docs/SOURCE-OF-TRUTH.md`) for comprehensive system specifications and development roadmaps.

The backend README is currently being developed and will be updated as the project evolves. For the most accurate information, always refer to the current source code and configuration.