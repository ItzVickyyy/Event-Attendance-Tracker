# Event Attendance Tracker

A multi-method event attendance system built for **CCS (College of Computer Studies)** student council events. Officers identify attendees at the door using **NFC, QR code, or manual search**, and attendance is recorded instantly — no more paper sign-in sheets sorted by year level and section.

The project started from the [Full Stack FastAPI Template](https://github.com/fastapi/full-stack-fastapi-template) and has since been substantially extended with a domain-specific attendee/event/attendance data model, role-based access control, a browser-based NFC/QR scanner, and offline-capable PWA support.

[![Test Docker Compose](https://github.com/ItzVickyyy/Event-Attendance-Tracker/actions/workflows/test-docker-compose.yml/badge.svg)](https://github.com/ItzVickyyy/Event-Attendance-Tracker/actions/workflows/test-docker-compose.yml)
[![Test Backend](https://github.com/ItzVickyyy/Event-Attendance-Tracker/actions/workflows/test-backend.yml/badge.svg)](https://github.com/ItzVickyyy/Event-Attendance-Tracker/actions/workflows/test-backend.yml)

The full functional and architectural specification this project is built against lives in [`docs/SOURCE-OF-TRUTH.md`](docs/SOURCE-OF-TRUTH.md). That document is the authority on *intended* design; this README describes what the codebase actually does today.

## The Problem

At CCS events, students currently line up by year level, find the paper sheet for their section, and write their name and student number by hand. This is slow, creates bottlenecks, and produces attendance data that has to be manually re-typed after the event.

The goal is any attendee, at any scanner station: tap an NFC ID, scan a QR code, or get looked up by name — attendance is recorded in about the time it takes to glance at a screen.

## Technology Stack

**Backend**
- [FastAPI](https://fastapi.tiangolo.com) (Python 3.14)
- [SQLModel](https://sqlmodel.tiangolo.com) (SQLAlchemy + Pydantic) as the ORM
- [PostgreSQL](https://www.postgresql.org) as the database, with Alembic migrations
- JWT authentication with role-based access control
- [Pytest](https://pytest.org) with a 90% coverage gate in CI

**Frontend**
- [React 19](https://react.dev) + TypeScript, built with [Vite](https://vitejs.dev)
- Built into the backend and served by FastAPI from the same origin
- [TanStack Router](https://tanstack.com/router) and [TanStack Query](https://tanstack.com/query)
- [Tailwind CSS](https://tailwindcss.com) and [shadcn/ui](https://ui.shadcn.com) components
- An automatically generated, typed API client ([`@hey-api/openapi-ts`](https://heyapi.dev))
- [Playwright](https://playwright.dev) end-to-end tests
- Progressive Web App support via [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app) / Workbox, with [`idb`](https://github.com/jakearchibald/idb) for local IndexedDB storage
- [`html5-qrcode`](https://github.com/mebjas/html5-qrcode) for QR scanning and the browser's [Web NFC API](https://developer.mozilla.org/en-US/docs/Web/API/Web_NFC_API) (`NDEFReader`) for NFC scanning

**Infrastructure**
- [Docker Compose](https://www.docker.com) for local services and self-hosted deployment
- [Traefik](https://traefik.io) as a reverse proxy with automatic HTTPS in production
- GitHub Actions for CI (backend tests, Docker Compose build/smoke test, Playwright, dependency and workflow security checks)
- [FastAPI Cloud](https://fastapicloud.com) as an alternative managed deployment option

> **Note on Web NFC:** the browser's NFC API is only available in Chromium-based browsers on Android (Chrome, Samsung Internet, Edge). It does not work on iOS, desktop browsers, or Firefox for Android. QR code scanning and manual search exist specifically to cover every other device.

## What's Currently Implemented

The backend has a normalized relational schema and full CRUD API routes for:

- **Organizations**, **Academic Programs**, and **Academic Sections**
- **People** and **Students** (student masterlist)
- **Attendees** (Student, Faculty, Staff, Parent/Guardian, Guest) with **Attendee Credentials** (NFC UID / QR, tracked separately from the person record) and **Attendee Relationships** (e.g. linking a Parent/Guardian to a Student)
- **Events** and **Event Registrations** (time-in-only or time-in/time-out attendance modes)
- **Attendance** records, including NFC/QR/manual scan endpoints, duplicate-scan prevention, and an **Attendance Correction** audit trail
- **Import Batches** and **Student Import Records** for masterlist import/staging

Role-based access control is implemented with five roles — `developer`, `super_admin`, `admin`, `class_representative`, `student` — plus a separate `can_scan` permission so scanning access isn't tied only to a role name. Permissions are enforced server-side via FastAPI dependencies.

On the frontend, there are working pages for **Dashboard**, **Events**, **Students**, **Records**, **Scanner**, **Admin**, and **Settings**, plus the inherited auth flow (login, sign-up, password reset). The Scanner page supports NFC tap, QR scan, and manual attendee search. The app is configured as an installable PWA with a service worker, runtime caching for events/students/credentials data, and a background-sync script (`sw-sync.js`) for queuing attendance scans made while offline. Playwright tests cover login, sign-up, password reset, the admin area, roster loading, manual scanning, and background sync/sync-status behavior.

The original template's demo **Items** feature (model, CRUD routes, and frontend page) is still present and wired in; it isn't part of the attendance domain and hasn't been removed yet.

## Planned / Not Yet Implemented

The following are described in the [Source of Truth](docs/SOURCE-OF-TRUTH.md) as intended functionality but do **not** currently exist in the codebase — do not assume they work:

- **Export/print**: Excel, CSV, Word, and PDF attendance exports, and a printable pre-event roster. No export libraries (e.g. `openpyxl`, `python-docx`, a PDF renderer) or export endpoints exist yet.
- **School ID system API integration** (Section 17–19 of the spec) — this is explicitly scoped as a later phase, contingent on the school confirming an API exists.
- **Multi-organization support beyond CCS** (Section 13's Phase 13) — the data model already has an `Organization` entity to support this later, but the product itself is scoped to CCS for now.

If you're picking up work on this project, treat the Source of Truth's numbered phases as the roadmap, and this README's "Currently Implemented" section as the actual state of the code.

## Documentation

- [`development.md`](development.md) — local development setup and day-to-day workflow
- [`deployment.md`](deployment.md) — FastAPI Cloud deployment
- [`deployment-docker-compose.md`](deployment-docker-compose.md) — self-hosted deployment with Docker Compose
- [`docs/SOURCE-OF-TRUTH.md`](docs/SOURCE-OF-TRUTH.md) — full system specification, data model, and phased roadmap
- [`docs/Phase-3-Student-Data-Field-Mapping.md`](docs/Phase-3-Student-Data-Field-Mapping.md) — masterlist-to-database field mapping used for student import
- [`backend/README.md`](backend/README.md) / [`frontend/README.md`](frontend/README.md) — per-package developer notes (still largely generic template content; see the repository audit for cleanup status)

## License

MIT — see [`LICENSE`](LICENSE).