# Documentation Status and Audit

**Audit started:** 2026-10-10
**Scope:** Documentation accuracy against the repository's current configuration and implementation.
**Status:** Focused audit in progress. This is a working checklist, not a claim that every file or feature has been fully verified.

## Documentation map

| Document | Intended purpose | Initial finding |
|---|---|---|
| [Root README](../README.md) | Project overview, current features, stack, links | Already distinguishes implemented features from planned work. Some links and statements still need verification. |
| [Development guide](../development.md) | Local setup, tests, generated client, common workflow | Compose ports, Mailpit, backend test prerequisites, and Playwright setup are checked against configuration and CI. Removed a stale intro reference to a callout that no longer existed. Remaining setup commands still need review. |
| [FastAPI Cloud deployment](../deployment.md) | Managed deployment | Verified against the workflow: push to master or manual dispatch, gated by ENABLE_FASTAPI_CLOUD_DEPLOY == true. Required app and GitHub secrets are documented. No live deployment was performed. |
| [Docker Compose deployment](../deployment-docker-compose.md) | Self-hosted deployment | Verified against the Compose overlay and workflow: manual dispatch on a self-hosted runner, with deployment variables and secrets documented. No live deployment was performed. |
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
- Verified both deployment guides against their current GitHub Actions workflows. FastAPI Cloud deployment triggers on pushes to `master` or manual dispatch but is gated by `ENABLE_FASTAPI_CLOUD_DEPLOY == 'true'`; the Docker Compose deployment is manual-only and runs on a self-hosted runner. This verifies workflow wiring and documented configuration, not a live deployment.
- The root README incorrectly stated that no export endpoints exist. The current `GET /api/v1/attendance/export` route implements CSV export. Excel, Word, PDF, and printable roster export remain unverified/not implemented.
- The previous backend README referenced stale Mailpit/HTTP setup details and destructive volume cleanup. It has been replaced with a concise contributor guide; avoid restoring those unsafe or outdated instructions.
- The frontend README's quick start did not explain the conditional HTTPS setup. Vite uses the configured local TLS files when present and falls back to HTTP when absent; trusted HTTPS is needed for Web NFC from a phone on the LAN, but certificates are not required for ordinary UI development.
- `docs/README.md` referenced several documentation files absent from the current repository tree. Replaced those dead links with verified files and added the current API reference and audit.
- `DASHBOARD_AUDIT.md` was presented as a read-only audit without a clear historical status. Labeled it as a historical snapshot because its findings have not been fully revalidated against the current dashboard components and tests.
- The root README previously linked to a student field-mapping document that was not found at the documented path. That broken link has been removed. Locate the authoritative replacement before restoring a link.
- The Source of Truth included a specific NFC UID from a physical school ID test. Replaced it with a redacted placeholder to avoid publishing a reusable unique identifier.
- The development guide intro referred to a Compose callout that no longer existed. Removed that stale cross-reference. The guide also incorrectly stated that the base Compose file had no host port mappings and that Mailpit was absent.
- The local backend command used `fastapi dev` without a port override while the guide claimed it ran on port 8001 and Vite proxies API requests to port 8001. The FastAPI CLI defaults to port 8000, so the guide now explicitly uses `uv run fastapi dev --port 8001` and updates the manual OpenAPI download URL to match. The current Compose file publishes PostgreSQL on host port 5433, Mailpit on 1025/8026, and the backend on 8000/8001. It also contained conflicting Playwright instructions: one paragraph claimed a separate `playwright` Compose service was required, while the later paragraph correctly described the workflow. Replaced the stale paragraph so local and CI instructions now match the workflow.
- The Source of Truth still contained original template-gap, immediate-next-step, and development-roadmap lists that read like current tasks. Added status notes and labeled those sections as historical without deleting or changing their original requirements.
- The root README referred to multi-organization expansion as “Section 13's Phase 13,” but Phase 13 appears under Section 24, the historical development roadmap. Corrected the cross-reference.
- The Source of Truth has no headings for Sections 6–9 or 23. Clear stale references to the technology stack and manual-search fallback were redirected to the root README or existing sections. A text-based cross-reference scan now finds no remaining `Section N` references whose numbered section heading is absent, but the missing section content remains unresolved. Do not renumber blindly because other sections cross-reference each other.
- The first CI run after the navigation/offline-sync notes failed because the spell checker flagged a proper name in the reference roster and the whitespace hook normalized this file. The roster name is preserved using an HTML entity in the Markdown source. All five configured checks passed on commit `41bf96ae`, and the checks passed again on `db57cc7c`. The later documentation-only head `c134d304` also passed all reported checks, including backend, Docker Compose, Playwright, pre-commit, and Zizmor. Any subsequent commit still needs its own CI verification.
- The README now distinguishes the implemented offline scan queue/synchronization path from the full offline-first behavior described as the target in the Source of Truth.
- Found and corrected a stale PWA caching claim in both the root README and development guide. The current Workbox rule is `NetworkOnly` for all `/api/v1/` requests; only configured static assets are cached. Offline roster and queued-scan data use explicit IndexedDB storage. The previous guide incorrectly described `NetworkFirst` API caching for events, students, and credentials.
- Corrected the TLS setup wording in the development and frontend guides. `vite.config.ts` enables HTTPS only when the ignored certificate files exist; without them, Vite falls back to HTTP instead of failing to start. Trusted HTTPS is needed for Web NFC testing from a phone using the machine's LAN address.
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
| Section student roster export | `GET /api/v1/academic-sections/{section_id}/export/xlsx` and `/export/docx` download a section's student roster in XLSX and DOCX. | Implemented; distinct from attendance-report export formats |
| Attendance-report XLSX, DOCX, PDF, and printable blank roster | No corresponding attendance-report formats were confirmed in the inspected attendance export route. Section-level XLSX/DOCX roster exports are separate and implemented. | Planned / not confirmed implemented |
| Student import staging | Admin UI includes import-batch listing, upload/staging, validation review, and promotion. Backend tests cover CSV/XLSX upload, validation conflicts, role checks, promotion guards, and reconciliation. No dedicated Playwright spec for the import workflow was found in the current `frontend/tests` inventory. | UI and API implemented; add browser-level regression coverage for the import workflow |
| Attendance corrections and audit trail | Admin UI contains a correction dialog; backend correction tests verify the audit record and that the authoritative attendance row is updated. No dedicated Playwright spec for the correction dialog was found in the current `frontend/tests` inventory. | UI and API implemented; add browser-level regression coverage for the correction workflow |
| Offline roster and scan queue | Frontend IndexedDB stores roster data and queued scans; sync code includes service-worker and foreground fallback paths; Workbox uses `NetworkOnly` for all API requests and caches configured static assets. Playwright tests cover background sync, roster, and sync status. | Partial against the full specification |
| Time-in/time-out record semantics | The recording service supports both event attendance modes and session types. In a legacy combined flow, a second scan in the same open time-in session can fill `time_out`; a dedicated time-out session can instead create a separate attendance row for the same registration. This differs from the Source of Truth's simpler one-record-per-student/event description and depends on session configuration. | Document the actual session model and reconcile the intended contract |
| Duplicate scans and offline conflict handling | The `Attendance` model uniquely constrains `(registration_id, attendance_session_id)`. The shared recording service returns HTTP 409 when a record already exists for that registration/session. Foreground sync marks a 409 as `DUPLICATE` and treats it as synced. The Source of Truth instead describes event/student/record-type uniqueness, earliest-timestamp-wins, and a reviewable conflict log. This pass found no evidence of earliest-timestamp arbitration or a reviewable conflict log. | Specification and implementation need reconciliation |
| Public student QR self-service | The public route requires an exact student number and normalized name match and returns the existing QR credential. The frontend downloads its QR image from `api.qrserver.com`, placing the credential value in the third-party request URL. The API rate limiter is in-memory per process and derives its key from the first `X-Forwarded-For` value when present. | Implemented, but review the third-party QR generation privacy/security implications, production proxy trust, and multi-worker rate-limit behavior before deployment |
| School system API integration | The README and Source of Truth identify this as a later phase. No school API integration was confirmed in the inspected route inventory. | Planned |
| Multi-organization product support | An Organization model and routes exist, but the README scopes the current product to CCS and labels expansion as later work. | Foundation exists; product-level expansion planned |

### Role-based navigation snapshot

The current sidebar filters navigation items by role and separate capabilities. This is a UI visibility rule, not a substitute for backend authorization.

- Class Representatives see Dashboard, Students, Records, and My Account. The Events and Scanner links are hidden for them. Their API access remains assignment-scoped.
- Admins and Super Admins see operational pages and administration pages. Class Representative management, scanner-permission management, and system settings are Super Admin-only in the UI.
- Scanner visibility also depends on scanner permission, except that Admin/Super Admin and superuser accounts are allowed by the current frontend condition. Attendance-session lifecycle mutations remain Admin-gated on the API.
- Developer access is separate from the application role. An isolated developer sees the Developer dashboard, My Account, and Audit Logs, while other roles can have developer access as an additional capability.
- Students do not receive the operational navigation group through the current role check. Dashboard and account links remain visible unless the isolated-developer redirect rules apply.

The layout route guard redirects users away from protected paths, but the API remains the security boundary. Keep these two layers documented separately and test them independently.

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
- [ ] Extend the focused feature/spec snapshot into a complete requirement-by-requirement reconciliation, labeling each requirement implemented, partial, planned, or blocked. The first additional pass clarified the current attendance-session and duplicate/offline-sync contract mismatches.
- [x] Correct the development guide's stale Compose port, Mailpit, and Playwright workflow claims against the current files.
- [x] Review the development guide commands against package scripts, backend scripts, `.env.example`, Compose configuration, pre-commit hooks, and CI workflow steps. This verifies documented command wiring and prerequisites; it does not replace a fresh local environment setup test.
- [x] Compare both deployment guides with their current workflow triggers and required variables/secrets. This verifies documented workflow wiring, not a live production deployment.
- [x] Check local Markdown links in all current documentation indexes, root/backend/frontend READMEs, development/deployment guides, API reference, audit, and Source of Truth. No missing local Markdown targets were found in those files on this branch.
- [ ] Recover or deliberately retire missing Source of Truth sections 6–9 and 23. A text-based scan found no remaining references to missing section numbers, but the absent content still needs a deliberate editorial decision.
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


- Audited the public student QR self-service endpoint and its tests. The route uses a 12-attempt/60-second in-memory rate limiter; state is not shared across workers/instances and resets on restart. It trusts the first `X-Forwarded-For` value when supplied, so production proxy configuration must be verified before describing this as robust client-IP rate limiting.

- A second pass found contradictory TLS wording still present near the top of `development.md`: the prerequisites and HTTPS section said certificates were mandatory and the dev server would fail without them, while the later explanation correctly described HTTP fallback. Corrected the prerequisite and section to make certificates optional for ordinary UI work and necessary only for secure-context Web NFC testing from a phone.

- A further scan of `development.md` found one remaining common-workflow step that still implied HTTPS certificates must be generated before starting Vite. Updated it to make certificate setup conditional on phone-based Web NFC testing. A text scan of the guide now shows the TLS instructions consistently describe optional certificates and HTTP fallback.

- The `/get-my-qr` frontend route uses `https://api.qrserver.com/v1/create-qr-code/` to generate the downloadable QR image and passes the existing credential value in the request URL. This means QR generation is not fully local and exposes the credential to that third-party service. Review the privacy/security implications and consider generating QR images in-browser before describing this flow as self-contained.

- Verified that academic section student rosters can be exported as XLSX and DOCX through `academic_sections.py`. These are separate from the attendance CSV endpoint; the documentation now distinguishes implemented section roster exports from the still-unimplemented advanced attendance-report formats.

- A follow-up scan caught one cross-reference missed by the earlier singular `Section N` scan: the security/privacy section referred to `Sections 6 and 11`, although Section 6 has no heading. Reworded it to preserve the security requirement while explicitly leaving the missing Section 6 reference unresolved rather than guessing what the missing section contained.

- Reviewed `.env.example` against backend mail configuration and Compose. The sample includes `MAILPIT_HOST`/`MAILPIT_PORT`, but the inspected backend email sender consumes `SMTP_HOST`/`SMTP_PORT`; `MAILPIT_HOST` points to `localhost:8025` while Compose publishes the web UI at `localhost:8026`. The development guide now documents this discrepancy without changing the environment sample in this documentation-only PR. A follow-up config cleanup can remove or correct unused sample variables.
