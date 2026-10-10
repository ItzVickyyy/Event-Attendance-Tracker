# Documentation Status and Audit

**Audit started:** 2026-10-10
**Scope:** Documentation accuracy against the repository's current configuration and implementation.
**Status:** Focused audit in progress. This is a working checklist, not a claim that every file or feature has been fully verified.

## Documentation map

| Document | Intended purpose | Initial finding |
|---|---|---|
| [Root README](../README.md) | Project overview, current features, stack, links | Already distinguishes implemented features from planned work. Some links and statements still need verification. |
| [Development guide](../development.md) | Local setup, tests, generated client, common workflow | Detailed and candid about configuration gaps. Re-check commands against current scripts and CI workflows before simplifying it. |
| [FastAPI Cloud deployment](../deployment.md) | Managed deployment | Verify workflow triggers, required variables/secrets, and deployment steps. |
| [Docker Compose deployment](../deployment-docker-compose.md) | Self-hosted deployment | Verify against the current Compose files and deployment workflow. |
| [Backend README](../backend/README.md) | Backend architecture and contributor workflow | Replaced with a concise contributor guide based on current route/model structure and linked to the central guides. |
| [Frontend README](../frontend/README.md) | Frontend setup and contributor workflow | Previously instructed users to open the dev server over HTTP despite the HTTPS certificate configuration. Updated in this pass. |
| [Source of Truth](./SOURCE-OF-TRUTH.md) | Intended behavior, architecture, and roadmap | Treat as the product specification, not proof that a feature is implemented. Reconcile it with the current code as a separate task. |
| [Documentation index](./README.md) | Links to current project documentation | Contained links to several files that do not exist in the current repository tree. Replaced with links to verified files and labeled the old dashboard audit as historical. |
| [Dashboard data-flow audit](../DASHBOARD_AUDIT.md) | Historical dashboard implementation notes | The document's findings were not clearly labeled as historical. Added a warning because the current dashboard uses separate operational and Class Representative components; individual claims still require code/test verification. |
| Student field-mapping guide | Import mapping details | The previously documented path was not found on the default branch. The broken README link was removed pending confirmation of an authoritative replacement. |

## Documentation rules

1. **Implementation is the source for current behavior.** Verify claims against routes, models, frontend routes, configuration, migrations, scripts, tests, and CI workflows.
2. **The Source of Truth describes intended behavior.** Keep roadmap requirements clearly labeled as planned until the implementation and tests support them.
3. **Do not invent schema names.** Use the actual SQLModel table definitions and migrations. Confirm names before documenting them.
4. **Do not recommend destructive database commands casually.** In particular, do not suggest `docker compose down -v` as routine cleanup because it removes volumes and can delete database data.
5. **Keep secrets out of examples.** Use placeholders and point to `.env.example`; never document real credentials.
6. **Use one canonical guide per topic.** Keep the root README concise and link to setup/deployment guides rather than duplicating long procedures.
7. **Update docs with behavior changes.** API, database, role/permission, offline-sync, import, and deployment changes should include a documentation review.

## Initial findings

- The root README already separates implemented features from planned functionality. Preserve that distinction and verify it as features change.
- The root README incorrectly stated that no export endpoints exist. The current `GET /api/v1/attendance/export` route implements CSV export. Excel, Word, PDF, and printable roster export remain unverified/not implemented.
- The previous backend README referenced stale Mailpit/HTTP setup details and destructive volume cleanup. It has been replaced with a concise contributor guide; avoid restoring those unsafe or outdated instructions.
- The frontend README's quick start pointed to plain HTTP, while the current Vite configuration requires local TLS certificates for its HTTPS dev server.
- `docs/README.md` referenced several documentation files absent from the current repository tree. Replaced those dead links with verified files and added the current API reference and audit.
- `DASHBOARD_AUDIT.md` was presented as a read-only audit without a clear historical status. Labeled it as a historical snapshot because its findings have not been fully revalidated against the current dashboard components and tests.
- The root README previously linked to a student field-mapping document that was not found at the documented path. That broken link has been removed. Locate the authoritative replacement before restoring a link.
- The Source of Truth included a specific NFC UID from a physical school ID test. Replaced it with a redacted placeholder to avoid publishing a reusable unique identifier.
- The development guide incorrectly stated that the base Compose file had no host port mappings and that Mailpit was absent. The current Compose file publishes PostgreSQL on host port 5433, Mailpit on 1025/8026, and the backend on 8000/8001. It also incorrectly claimed the Playwright workflow depended on a separate Compose service named `playwright`; the current workflow starts the backend service and runs Playwright from the workflow runner.
- The Source of Truth still contained original template-gap, immediate-next-step, and development-roadmap lists that read like current tasks. Added status notes and labeled those sections as historical without deleting or changing their original requirements.
- The root README referred to multi-organization expansion as “Section 13's Phase 13,” but Phase 13 appears under Section 24, the historical development roadmap. Corrected the cross-reference.
- The Source of Truth's numbered headings jump from Section 5 to Section 10. This may reflect removed sections or stale numbering. Do not renumber blindly because the document contains internal section references. Corrected one directly verified cross-reference from the NFC security note to Section 26, but a full internal-reference audit remains open.
- The latest `pre-commit` run failed because the trailing-whitespace hook corrected one line in `DASHBOARD_AUDIT.md`, and the spell checker flagged the real name `Ceasar`. Removed trailing whitespace and formatted the name's disputed token as inline code. A new CI run is needed to verify these corrections.
- The README now distinguishes the implemented offline scan queue/synchronization path from the full offline-first behavior described as the target in the Source of Truth.
- Renamed the Source of Truth's export heading to `Target export formats` and explicitly marked Excel, Word, PDF, and printable pre-event rosters as requirements rather than current features. CSV is the implemented export format.

## Feature/spec reconciliation snapshot

This is a focused first pass against route implementations, selected frontend pages, models, and existing Playwright tests. It is not a full end-to-end verification of every workflow.

| Requirement area | Current evidence | Status for documentation |
|---|---|---|
| Event attendance by NFC, QR, and manual selection | Backend scan and manual-scan routes resolve credentials/attendees, require an open event and registration, and call the shared attendance-recording service. Frontend scanner routes and manual-scan tests exist. Web NFC remains browser/device dependent. | Implemented, with platform limits |
| Student masterlist and section-scoped Class Representative access | Student and academic-registry routes check assigned-section/year access. Tests cover student lifecycle, Class Representative assignment/student workflows, and rejection of access outside the assigned year. The student DELETE route archives a Class Representative's enrollment but archives the whole student record for Admin/Super Admin. | Implemented at API level; verify UI labels reflect role-dependent archive behavior |
| Academic year selection and default | `AcademicYearContext` loads academic years, persists the selected ID in local storage, and falls back to the current year. Super Admin-only API routes create a year and set the current year; tests cover switching and event defaulting. | Implemented at API/context level; continue checking selector and role-specific UI behavior |
| Event and attendance-session lifecycle | Event CRUD is Admin-gated and new events default to the configured current academic year. Attendance-session reads require scanner permission, while lifecycle mutations require Admin. Route tests exist for both areas. | Implemented at API level; UI workflow coverage still needs review |
| CSV attendance export | `GET /api/v1/attendance/export` exists. | Implemented |
| XLSX, DOCX, PDF, and printable blank roster | No corresponding export formats were confirmed in the inspected attendance export route. | Planned / not confirmed implemented |
| Student import staging | Admin UI includes import-batch listing, upload/staging, validation review, and promotion. Backend tests cover CSV/XLSX upload, validation conflicts, role checks, promotion guards, and reconciliation. No dedicated Playwright spec for the import workflow was found in the current `frontend/tests` inventory. | UI and API implemented; add browser-level regression coverage for the import workflow |
| Attendance corrections and audit trail | Admin UI contains a correction dialog; backend correction tests verify the audit record and that the authoritative attendance row is updated. No dedicated Playwright spec for the correction dialog was found in the current `frontend/tests` inventory. | UI and API implemented; add browser-level regression coverage for the correction workflow |
| Offline roster and scan queue | Frontend IndexedDB stores roster data and queued scans; sync code includes service-worker and foreground fallback paths; Playwright tests cover background sync, roster, and sync status. | Partial against the full specification |
| Offline conflict handling | Attendance uniqueness is defined by registration and attendance session. The Source of Truth instead describes event/student/type uniqueness and an earliest-timestamp-wins conflict log. The inspected sync path treats HTTP 409 as a duplicate/synced outcome, but a reviewable conflict log and earliest-timestamp arbitration were not established by this pass. | Specification and implementation need reconciliation |
| School system API integration | The README and Source of Truth identify this as a later phase. No school API integration was confirmed in the inspected route inventory. | Planned |
| Multi-organization product support | An Organization model and routes exist, but the README scopes the current product to CCS and labels expansion as later work. | Foundation exists; product-level expansion planned |

### Concrete specification mismatch to resolve

The Source of Truth's duplicate/offline sections describe a uniqueness rule keyed by event, student, and record type, plus earliest-timestamp-wins behavior and a conflict log. The current `Attendance` model declares a unique constraint on `registration_id` and `attendance_session_id`. Those are different contracts. Do not silently rewrite either side in documentation as if they were equivalent. A product decision and corresponding tests are needed before treating this requirement as complete.

## Recommended order

- [x] Create this audit and establish documentation accuracy rules.
- [x] Correct the backend README's high-risk stale claims and point contributors to the central setup guide.
- [x] Correct the frontend README's HTTPS setup guidance.
- [x] Add an initial API route-group and authorization reference from the registered routers and inspected dependencies.
- [x] Correct the root README's role list: Developer is a separate capability, not a fifth `UserRole` enum value.
- [x] Correct the root README's export status to acknowledge CSV export while keeping advanced formats marked as not implemented.
- [ ] Verify every root README feature claim against current routes, models, tests, and frontend pages. The first focused feature/spec snapshot is now recorded above.
- [ ] Expand the API reference to an endpoint-by-endpoint contract only after validating route decorators, response schemas, and authorization tests.
- [x] Inventory registered API route groups and document the initial authorization model from the actual FastAPI route registrations and dependencies. Endpoint-by-endpoint coverage remains deferred.
- [ ] Keep database schema and migration-head documentation outside this pass; do not add a separate guide for the development database or application source.
- [ ] Extend the focused feature/spec snapshot into a complete requirement-by-requirement reconciliation, labeling each requirement implemented, partial, planned, or blocked.
- [x] Correct the development guide's stale Compose port, Mailpit, and Playwright workflow claims against the current files.
- [ ] Finish checking all development commands and CI workflow prerequisites against scripts and configuration.
- [x] Compare both deployment guides with their current workflow triggers and required variables/secrets. This verifies documented workflow wiring, not a live production deployment.
- [x] Check local Markdown links in all current documentation indexes, root/backend/frontend READMEs, development/deployment guides, API reference, audit, and Source of Truth. No missing local Markdown targets were found in those files on this branch.
- [ ] Reconcile the Source of Truth's missing numbered sections 6–9 and validate internal cross-references before any renumbering.
- [ ] Remove duplicated or generic template documentation only after checking whether it contains project-specific details.

## Additional implementation checks completed in this pass

- Confirmed that `backend/app/api/main.py` registers route groups for academic catalog/registry, students, attendees and credentials, events/registrations, attendance/sessions/corrections, class representatives, imports, login/users, and developer operations.
- Confirmed the `UserRole` enum contains `super_admin`, `admin`, `class_representative`, and `student`. Developer access is a separate `is_developer` capability, and scanner access also has a separate `can_scan` permission.
- Confirmed that `GET /api/v1/attendance/export` implements CSV export and applies route-level filters. This does not establish that Excel, Word, PDF, or printable roster formats exist.
- Confirmed academic year, enrollment, and class-representative assignment models are defined in `backend/app/student_academics.py`; major catalog models are in `backend/app/academic_catalog.py`.
- Confirmed that the current academic-year context persists the selected academic-year ID and falls back to the year marked current. The backend restricts creating and switching the current year to Super Admin and tests cover year switching and default event-year assignment.
- Confirmed that event routes are Admin-gated and event creation defaults to the current academic year when none is provided. Attendance-session routes separate scanner-permitted reads from Admin-only lifecycle mutations, with route tests for both areas.
- Confirmed that student PATCH access is intentionally shared by Admin/Super Admin and assigned Class Representatives, with section-move prevention for representatives. Student DELETE behavior is role-dependent: representatives archive only their assigned-year enrollment, while Admin/Super Admin archive the student record. Added these distinctions to the API reference.
- Inspected the import-batch admin UI, student-import dialog, and backend import tests. CSV/XLSX staging and guarded promotion are implemented; no dedicated import Playwright spec appears in the current frontend test inventory.
- Inspected the attendance correction dialog and its backend audit test. The UI and API exist, and the backend test verifies both the audit entry and authoritative attendance update; no dedicated correction-dialog Playwright spec appears in the current frontend test inventory.

## Verification standard

A statement should be considered verified only when supported by the relevant implementation or configuration. For example:

- Feature claims: route/page implementation and meaningful tests.
- Schema claims: SQLModel definitions plus migrations.
- Permission claims: authorization dependencies and tests.
- Setup commands: current scripts, package commands, Compose files, and CI workflows.
- Deployment claims: workflow triggers, required variables/secrets, and deployment configuration.

Record unresolved mismatches here rather than silently presenting assumptions as facts.
