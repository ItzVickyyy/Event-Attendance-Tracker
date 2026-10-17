# Complete Tech Stack: Event Attendance Tracker

Repository: [ItzVickyyy/Event-Attendance-Tracker](https://github.com/ItzVickyyy/Event-Attendance-Tracker)

This document summarizes the technologies and architectural patterns identified in the repository's README, package manifests, Python project configuration, and Vite configuration. It distinguishes implemented functionality from deployment options and planned work.

## 1. Project overview

Event Attendance Tracker is a full-stack attendance management web application for CCS student council events. It supports attendee identification by NFC, QR code, and manual search, with role-based permissions and offline-capable attendance scanning.

The application uses a React frontend and a FastAPI backend. In production, the built frontend is served by FastAPI from the same origin. PostgreSQL stores server-side records, while IndexedDB supports selected local scanner data and queued scans.

## 2. Core technology stack

| Layer | Technologies | Purpose |
|---|---|---|
| Backend language and runtime | Python 3.14 or compatible version allowed by the project | Backend application and business logic |
| Backend framework | FastAPI | REST API, request handling, dependency-based authorization |
| Frontend | React 19, TypeScript, JavaScript | Browser user interface |
| Frontend build tool | Vite 8 | Development server and production build |
| Database | PostgreSQL | Persistent relational data |
| ORM and data models | SQLModel, SQLAlchemy, Pydantic | Database mapping, data validation, request and response schemas |
| Database migrations | Alembic | Versioned database schema changes |
| API contract | OpenAPI | API description and typed frontend client generation |
| Authentication | JWT, PyJWT, pwdlib password hashing | Token authentication and password security |
| Browser routing and data | TanStack Router, TanStack Query | Client-side navigation and server-state fetching/caching |
| Styling and components | Tailwind CSS 4, shadcn/ui, Radix UI | Styling and reusable accessible UI components |
| PWA and offline support | vite-plugin-pwa, Workbox, Service Worker API, IndexedDB, idb | Installability, static asset caching, local roster/queue storage and scan synchronization |
| Scanner support | html5-qrcode, Web NFC API, NDEFReader, browser camera/media APIs | QR scanning and compatible-device NFC reading |
| Automated testing | Pytest, Coverage.py, Playwright | Backend tests, coverage measurement and browser end-to-end tests |
| Containers and deployment | Docker, Docker Compose, Traefik | Local/self-hosted services and reverse proxy/HTTPS setup |
| CI/CD and repository checks | GitHub Actions, prek, Ruff, Biome, Typos, zizmor | Automated testing, linting, formatting and workflow/security checks |
| Package management | Bun, uv | JavaScript workspace and Python project/dependency management |
| Version control and hosting | Git, GitHub | Source control, pull requests and CI workflows |

## 3. Frontend stack

The frontend lives in `frontend/`.

### Main libraries and tools

| Technology | Role |
|---|---|
| React 19 | Component-based user interface |
| TypeScript | Static typing for frontend code |
| Vite 8 | Development server and build tool |
| `@vitejs/plugin-react-swc` | React transformation using SWC |
| TanStack Router | Client-side route definitions and navigation |
| TanStack Query | Server-state fetching, caching and synchronization |
| TanStack Table | Table and data-grid functionality |
| Tailwind CSS 4 | Utility-first styling |
| shadcn/ui and Radix UI | UI component patterns and primitives |
| `lucide-react`, `react-icons` | Icons |
| `react-hook-form`, `@hookform/resolvers`, `zod` | Form state, resolver integration and schema validation |
| `@hey-api/openapi-ts` | Generates a typed TypeScript client from the backend OpenAPI schema |
| Axios and Fetch APIs | HTTP requests to backend endpoints, depending on the code path |
| `html5-qrcode` | Browser-based QR-code scanning |
| `qrcode.react` | QR-code rendering in the frontend |
| `vite-plugin-pwa`, Workbox | PWA manifest and service-worker generation/caching |
| `idb` | IndexedDB helper library |
| Playwright | Browser end-to-end tests |
| Biome | Frontend linting and code checks |

The Vite build output is configured for `backend/app/frontend`. This supports serving the built frontend from the FastAPI application.

### Web standards and browser APIs

- HTML, CSS and JavaScript
- DOM and Fetch/HTTP APIs
- OpenAPI
- Service Workers and the PWA manifest
- IndexedDB
- Camera/media permissions used by QR scanning
- Web NFC API through `NDEFReader` on compatible browsers and devices

**NFC compatibility:** Web NFC is not universally available. The README documents support for compatible Chromium-based Android browsers. QR scanning and manual search provide alternative workflows on devices without Web NFC support.

## 4. Backend stack

The backend lives in `backend/` and is configured in `backend/pyproject.toml`.

| Technology | Role |
|---|---|
| Python | Backend programming language |
| FastAPI | HTTP API framework |
| Pydantic | Data validation and serialization |
| SQLModel | Typed database models using SQLAlchemy and Pydantic concepts |
| SQLAlchemy | SQL toolkit and ORM foundation |
| PostgreSQL | Relational database |
| Psycopg 3 | PostgreSQL driver |
| Alembic | Database migrations |
| PyJWT | JWT encoding and decoding |
| pwdlib with Argon2/bcrypt support | Password hashing utilities |
| python-multipart | Multipart form/file request parsing |
| email-validator | Email address validation |
| Jinja2 and emails | Email template and email-related support |
| pydantic-settings | Application settings and environment configuration |
| Sentry SDK for FastAPI | Optional error reporting/monitoring when configured |
| HTTPX | HTTP client and testing support |
| openpyxl | Excel workbook processing/generation support |
| Pytest | Backend unit and integration tests |
| Coverage.py | Test coverage measurement |
| Ruff | Python linting and formatting |
| mypy and ty | Static type checking |

The backend project requires Python `>=3.14,<4.0`. The exact Python version used in a particular deployment depends on its runtime/container configuration.

## 5. Database and storage

### Server-side database

PostgreSQL is the primary persistent data store. SQLModel and SQLAlchemy map Python models to relational tables, and Alembic manages schema migrations.

The application domain includes organizations, academic programs and sections, people, students, attendees, credentials, events, registrations, attendance records, corrections/audit records, and student import records.

### Browser-side storage

IndexedDB, accessed through `idb`, supports selected offline scanner data and queued attendance scans. This is separate from PostgreSQL and does not replace the server database.

## 6. Attendance identification and offline behavior

### NFC

- Web NFC API
- `NDEFReader`
- Compatible NFC tags and supported Android browsers

### QR codes

- `html5-qrcode` for camera-based scanning
- `qrcode.react` for rendering QR codes in the frontend
- Browser camera/media permissions

The README also notes that the public student QR retrieval page currently uses a third-party QR generation service for its QR-image download. Review the project's documentation audit before describing that flow as fully self-contained.

### Manual lookup

The scanner also supports manual attendee search through the frontend and backend API.

### PWA and offline scanning

The project uses `vite-plugin-pwa`, Workbox, a service worker, and an imported `sw-sync.js` script. API requests under `/api/v1/` are configured as `NetworkOnly`; selected static assets use runtime caching. Offline roster data and queued scans use explicit IndexedDB storage.

Offline capability is limited in scope. It supports selected scanner data and queued attendance scans with later synchronization. Do not assume all pages, authentication flows, administrative operations, or database changes are available offline.

## 7. Authentication and authorization

The project uses JWT-based authentication and server-side permission enforcement through FastAPI dependencies.

The README documents these application roles:

- `super_admin`
- `admin`
- `class_representative`
- `student`

The application also has a separate developer capability (`is_developer`) and a `can_scan` permission. Developer access is not an additional `UserRole` value. The backend enforces permissions rather than relying only on hiding frontend controls.

Other related technologies include PyJWT, pwdlib password hashing utilities, Pydantic validation, environment-based secrets/configuration, and optional Sentry reporting.

## 8. Infrastructure and deployment

| Technology | Role |
|---|---|
| Docker | Container runtime |
| Docker Compose | Defines and coordinates services for local development and self-hosted deployment |
| PostgreSQL container/image | Database service where configured |
| Traefik | Reverse proxy and production HTTPS infrastructure |
| TLS/HTTPS | Encrypts browser-to-server traffic when correctly configured |
| Environment variables | Configure settings, database connections and secrets |
| GitHub Actions | Runs automated CI workflows |
| FastAPI Cloud | Documented alternative managed deployment option |

These are deployment options and supporting infrastructure, not separate application frameworks. Check the current deployment files and deployment guides before documenting environment-specific ports, image tags, or production settings.

## 9. Development and package management

### JavaScript workspace

- Bun is used for workspace scripts and JavaScript dependency management.
- The root `package.json` declares the `frontend` and `packages/*` workspaces.
- `bun.lock` locks JavaScript dependency versions.
- Frontend scripts include Vite development/build commands, Biome checks, OpenAPI client generation and Playwright tests.

### Python workspace

- uv manages the Python project and dependencies.
- The root `pyproject.toml` declares a uv workspace with `backend` as a member.
- `uv.lock` locks Python dependency versions.
- Python and development dependencies are configured in `backend/pyproject.toml` and the root `pyproject.toml`.

### Source control

Git and GitHub provide version control, pull requests, repository hosting and automated workflows.

## 10. Testing, quality and CI

| Tool or process | Purpose |
|---|---|
| Pytest | Backend unit and integration tests |
| Coverage.py | Measures backend test coverage |
| Playwright | Browser end-to-end tests, split into CI shards |
| GitHub Actions | Runs CI workflows |
| Docker Compose tests | Builds/starts containerized services and runs smoke checks |
| prek | Pre-commit task runner |
| Ruff | Python linting and formatting |
| Biome | Frontend linting and code checks |
| mypy and ty | Python static type checking |
| Typos | Spelling checks |
| zizmor | GitHub Actions workflow security analysis |
| Dependency/security checks | Additional automated checks defined by the repository workflows |
| smokeshow | Supports coverage-report publishing in CI |

The README documents a 90% backend coverage gate in CI. Current workflow files determine which checks are required for each change.

## 11. API and application architecture

- **Full-stack web application:** frontend and backend are maintained in one repository.
- **Client-server architecture:** browser screens call the FastAPI API.
- **REST API:** HTTP endpoints expose application resources and operations.
- **Single-page application:** React handles client-side screens and navigation.
- **Same-origin production setup:** the frontend build is served by FastAPI.
- **Relational persistence:** PostgreSQL stores connected application entities.
- **ORM-based access:** SQLModel and SQLAlchemy connect models and database operations.
- **Schema versioning:** Alembic tracks database changes.
- **Typed API client:** OpenAPI is used to generate TypeScript client code.
- **Role-based access control:** backend dependencies enforce user permissions.
- **Offline-capable scanning:** IndexedDB stores supported local roster/queue data for later synchronization.

## 12. Implemented features versus limitations

The README describes these implemented areas:

- Organization, academic program and section management
- People and student masterlist management
- Attendees and NFC/QR credentials
- Events and event registrations
- NFC, QR and manual attendance scanning
- Attendance records, duplicate-scan prevention and correction audit trail
- Student import batches and import records
- Role-dependent dashboards and administration pages
- PWA installation and selected offline scan queue/synchronization behavior
- CSV attendance export
- XLSX and DOCX student-roster downloads for academic sections

Do not claim that every planned export or integration is complete. The README identifies these as not yet implemented or later-phase work:

- XLSX, DOCX and PDF attendance-report exports and a printable pre-event roster
- School ID system API integration
- Product support for multiple organizations beyond the current CCS scope

The repository's original template demo Items feature also remains in the codebase and is separate from the attendance domain.

## 13. Consolidated list for presentations

**Languages and standards:** Python 3.14+, TypeScript, JavaScript, HTML, CSS, OpenAPI

**Frontend:** React 19, Vite 8, TanStack Router, TanStack Query, TanStack Table, Tailwind CSS 4, shadcn/ui, Radix UI

**Forms and validation:** React Hook Form, Zod, resolver integrations

**Backend:** FastAPI, Pydantic, SQLModel, SQLAlchemy

**Database and migrations:** PostgreSQL, Psycopg 3, Alembic

**Authentication and security:** JWT, PyJWT, pwdlib, FastAPI dependencies, role-based access control

**Scanning:** Web NFC API, NDEFReader, html5-qrcode, qrcode.react, browser camera APIs

**PWA and offline storage:** vite-plugin-pwa, Workbox, Service Workers, IndexedDB, idb, background scan synchronization

**API client:** OpenAPI, @hey-api/openapi-ts, HTTPX/Axios/Fetch depending on usage

**Infrastructure:** Docker, Docker Compose, Traefik, TLS/HTTPS

**Package management:** Bun, uv, bun.lock, uv.lock, pyproject.toml

**Testing and quality:** Pytest, Coverage.py, Playwright, Ruff, Biome, mypy, ty, prek, Typos, zizmor, smokeshow

**CI/CD and hosting:** GitHub Actions, GitHub, FastAPI Cloud as a documented alternative deployment option

## 14. Short project description

> Event Attendance Tracker is a full-stack web application built with React 19, TypeScript, Vite, Tailwind CSS and shadcn/ui on the frontend, with FastAPI and Python on the backend. It uses PostgreSQL with SQLModel, SQLAlchemy and Alembic for data persistence, JWT authentication and role-based access control for security, and Web NFC, QR scanning and manual lookup for attendance identification. Its PWA implementation uses Workbox and IndexedDB for selected offline scanning and synchronization workflows. Docker Compose, Traefik, GitHub Actions, Pytest and Playwright support deployment and quality assurance.

## 15. Source files to consult

- [README.md](../README.md): high-level stack, implemented features and known limitations
- [Frontend package manifest](../frontend/package.json): frontend dependencies and scripts
- [Backend project configuration](../backend/pyproject.toml): Python dependencies and quality tooling
- [Root Python project configuration](../pyproject.toml): uv workspace and repository tooling
- [Vite configuration](../frontend/vite.config.ts): build output, frontend plugins, PWA and caching configuration
- [Source of Truth](SOURCE-OF-TRUTH.md): intended architecture and planned behavior
- [Documentation status audit](DOCUMENTATION-STATUS.md): known documentation mismatches and gaps
- [API reference](API-REFERENCE.md): API route groups and authorization overview
- [Development guide](../development.md): local development setup
- [Docker Compose deployment guide](../deployment-docker-compose.md): self-hosted deployment

This is a verified high-level inventory based on the named repository files, not a list of every direct and transitive dependency. For exact dependency versions, consult `frontend/package.json`, `bun.lock`, `backend/pyproject.toml`, and `uv.lock`. For deployment-specific claims, consult the current deployment configuration and guides.
