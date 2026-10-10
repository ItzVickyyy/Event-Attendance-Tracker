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
| [Frontend README](../frontend/README.md) | Frontend setup and contributor workflow | Updated to explain that Vite uses HTTPS when local certificates exist and otherwise falls back to HTTP; certificates are optional for ordinary UI development. |
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

- The root README separates implemented features from planned functionality. During this pass, qualified the phrase “full CRUD API routes” because route modules contain different operations and endpoint-specific permissions; do not imply every resource supports every CRUD operation.
- Verified both deployment guides against their current GitHub Actions workflows. FastAPI Cloud deployment triggers on pushes to `master` or manual dispatch but is gated by `ENABLE_FASTAPI_CLOUD_DEPLOY == 'true'`; the Docker Compose deployment is manual-only and runs on a self-hosted runner. This verifies workflow wiring and documented configuration, not a live deployment.
- The root README incorrectly stated that no export endpoints exist. The current `GET /api/v1/attendance/export` route implements CSV attendance export. Academic sections separately support XLSX/DOCX student-roster downloads. XLSX/DOCX/PDF attendance reports and printable pre-event rosters remain unimplemented or unconfirmed.
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
- The September 11 Source of Truth revision omitted Sections 6–9 and 23. Rewrote these sections as concise, implementation-aware summaries rather than copying the September 10 historical wording verbatim. The restored sections distinguish desired NFC registration and unknown-card behavior from current implementation, document the manual fallback and time-in/time-out contract gaps, and summarize the configured stack. The historical version remains linked for reference. Existing cross-references were not blindly renumbered because other sections depend on the current numbering.
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
| Public student QR self-service | The public student QR route requires an exact student number and normalized name match and returns the existing QR credential. The frontend downloads its QR image from `api.qrserver.com`, placing the credential value in the third-party request URL. The API rate limiter is in-memory per process and derives its key from the first `X-Forwarded-For` value whenever that header is supplied. The route does not itself validate that the header came from a trusted proxy. The inspected `compose.deploy.yml` configures Traefik routing and TLS but no explicit middleware to sanitize client-supplied `X-Forwarded-For` values before forwarding; verify the deployed proxy behavior instead of assuming the first value is trustworthy. Its per-client dictionary entries are retained even after their timestamp lists become empty, so rotating client keys can grow process memory over time. Before deployment, replace this with a trusted-proxy-aware client identity and a bounded/shared rate limiter; consider generating QR images locally to avoid disclosing credentials to a third party. | Implemented, but review the third-party QR generation privacy/security implications, production proxy trust, and multi-worker rate-limit behavior before deployment |
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
- [ ] Finish verifying every root README feature claim against current routes, models, tests, and frontend pages. The first focused feature/spec snapshot is recorded above; this pass also qualified the overbroad “full CRUD API routes” wording.
- [ ] Expand the API reference to an endpoint-by-endpoint contract only after validating route decorators, response schemas, and authorization tests.
- [x] Inventory registered API route groups and document the initial authorization model from the actual FastAPI route registrations and dependencies. Endpoint-by-endpoint coverage remains deferred.
- [ ] Keep database schema and migration-head documentation outside this pass; do not add a separate guide for the development database or application source.
- [ ] Extend the focused feature/spec snapshot into a complete requirement-by-requirement reconciliation, labeling each requirement implemented, partial, planned, or blocked. The first additional pass clarified the current attendance-session and duplicate/offline-sync contract mismatches.
- [x] Correct the development guide's stale Compose port, Mailpit, and Playwright workflow claims against the current files.
- [x] Review the development guide commands against package scripts, backend scripts, `.env.example`, Compose configuration, pre-commit hooks, and CI workflow steps. This verifies documented command wiring and prerequisites; it does not replace a fresh local environment setup test.
- [x] Compare both deployment guides with their current workflow triggers and required variables/secrets. This verifies documented workflow wiring, not a live production deployment.
- [x] Check local Markdown links in all current documentation indexes, root/backend/frontend READMEs, development/deployment guides, API reference, audit, and Source of Truth. No missing local Markdown targets were found in those files on this branch.
- [x] Reconcile missing Source of Truth sections 6–9 and 23. Rewrote the sections against current implementation evidence and linked the historical revision for traceability.
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

## Historical Source-of-Truth reconciliation: Sections 6–9 and 23

Reviewed the September 10 version linked above against the current NFC registration component, scanner routes, attendance processing service, API routes, and existing tests. This is an implementation comparison, not a decision to restore the historical text.

| Historical section | Current implementation evidence | Reconciliation decision |
|---|---|---|
| 6. NFC registration | `frontend/src/components/Students/NfcRegister.tsx` detects `NDEFReader`, reads a tag, resolves or creates the attendee record for a selected student, and creates an NFC credential through the credential API. Manual credential entry is also available in this registration dialog. The credential API rejects a duplicate credential value. A cross-file discrepancy remains: the main scanner falls back to `event.serialNumber` when no NDEF text credential exists, but `NfcRegister.tsx` only extracts NDEF text/message content. A card that scans by hardware serial number in the attendance scanner may therefore not produce the same value in the registration dialog. | Keep the dedicated registration workflow documented. The historical proposal for ambient/rolling registration during normal attendance, a guided replace-ID workflow, and retired-credential history is not established by this component or the inspected credential route. The Admin-gated credential API does allow editing a credential value or attendee association and deleting a credential, but that is not the same as a dedicated replacement workflow with a retained retired-ID audit history. Do not claim the latter behaviors exist. |
| 7. Unregistered NFC IDs | The scanner's credential lookup and attendance scan paths distinguish an unknown credential from a registered credential. The existing manual scan flow lets staff find an attendee and submit attendance, but the reviewed code does not establish a single unknown-NFC flow that searches for a student, binds the scanned UID, and records attendance in one operation. | Mark automatic first-scan registration as not confirmed/absent from the reviewed flow. Keep manual attendance as a separate fallback. Decide whether first-scan credential registration is still a product requirement before implementing it. |
| 8. No NFC ID / manual fallback | `frontend/src/routes/_layout/scanner/manual.tsx` opens the shared scanner workspace, and `frontend/tests/manual-scan.spec.ts` covers the manual attendance request path. The registration component explicitly detects unsupported Web NFC and tells users to use Chrome on Android. | Manual attendance is implemented and browser-tested at the scanner-flow level. The old requirement that unsupported devices automatically make manual entry the primary interface needs a UI-specific check; the dedicated NFC registration dialog displays an unsupported-browser message rather than providing attendance entry itself. Keep the manual attendance route and NFC-registration fallback as distinct behaviors. |
| 9. Time-in/time-out | Event attendance mode and attendance sessions are implemented in the backend. `backend/app/services/attendance_processing.py` has a compatibility path where a second scan in an existing time-in session can fill `time_out` for legacy combined-mode events. Dedicated time-out sessions follow a separate session-scoped path. `backend/tests/api/routes/test_attendance.py` covers time-in-only duplicate prevention and time-in/time-out behavior. | The capability exists, but the historical “second tap always means time-out” description is too broad for the current session model. Document the event mode, active session, and legacy compatibility behavior; resolve the desired record semantics with the duplicate/offline-sync contract before changing implementation. |
| 23. Technology stack | Current configuration confirms a React/TypeScript frontend built with Vite, TanStack Router/Query, Tailwind CSS, and the Vite PWA/Workbox integration; a FastAPI backend using SQLModel, Pydantic, Alembic, and PostgreSQL through psycopg; Pytest backend tests; Playwright browser tests; Docker Compose; and GitHub Actions. Vite builds the frontend into `backend/app/frontend`, which the FastAPI app serves. React Email templates live under `packages/react-email`, and backend email templates are also present. Current frontend code contains NFC registration and scanner flows, while service-worker and IndexedDB offline support are already present. | Retain the stack summary only after checking it against the current package/configuration files. Retire the historical “what still needs to be added” list as a current checklist: it labels already-implemented NFC, PWA, domain models, roles, and import tooling as missing. Keep still-unimplemented export formats and school API integration in the current feature/spec matrix instead. |

### Evidence limits

- This review confirms the cited implementation paths and tests exist; it does not establish real-device NFC behavior across supported phones.
- The main attendance scanner reads an NDEF text credential first and falls back to Web NFC's `event.serialNumber`; the separate NFC registration component currently reads NDEF message content but does not use that serial-number fallback. This is a potential registration/scanning compatibility defect, not merely a documentation caveat. It needs a code-level fix and regression test before claiming the registration and attendance scan paths support the same physical-card UID behavior. Real-device verification is still required.
- The old section 6 describes credential replacement and retaining retired IDs for audit. The registration component creates credentials. The Admin-gated API supports credential updates and deletion and rejects duplicate values, but the review found no evidence of a dedicated replacement workflow that preserves retired IDs in an audit history.
- No implementation changes were made as part of this documentation reconciliation. Product decisions that would change attendance semantics or credential lifecycle remain open.

- Continued the API reference audit against router declarations. Corrected the catalog/registry distinction: `academic_catalog` handles majors and section-major assignments, while `academic_registry` handles academic years, section registry, and student enrollments. Also recorded the actual nested event-roster prefix and separated attendance correction endpoints from the attendance route group's summary.
- Updated the root README's credential terminology from “NFC UID / QR” to “NFC and QR identifiers.” The implementation has both NDEF-content and `event.serialNumber` paths, so “NFC UID” should not be used as a blanket label for every credential value until registration and scanning are aligned.

## Root README claim verification: follow-up pass

Reviewed the current README feature and technology summaries against selected route modules, package configuration, Compose files, Vite configuration, and the current frontend test inventory.

- Confirmed the Python 3.14 requirement in `backend/pyproject.toml`; React 19, TypeScript, Vite, TanStack Router/Query, Tailwind, `html5-qrcode`, `idb`, and `vite-plugin-pwa` in `frontend/package.json`; and the FastAPI/SQLModel/Alembic/PostgreSQL backend dependencies.
- Confirmed that Vite builds into `backend/app/frontend`, and the FastAPI app serves that directory. The development Compose file publishes PostgreSQL on host port 5433, Mailpit SMTP on 1025 and its web UI on 8026, and the backend on 8000 plus host port 8001 mapped to container port 8000. The deployment overlay configures Traefik HTTP-to-HTTPS redirection and ACME certificate resolution.
- Rechecked representative API operation coverage. Attendees, events, and event registrations expose GET/POST/PATCH/DELETE routes in their modules, but those operations are generally Admin-gated. Attendance exposes read/export, scanner-permitted recording, and Admin-gated correction/update/delete paths. Academic sections expose roster XLSX/DOCX exports, while attendance export remains CSV. These differences support keeping README wording general rather than claiming uniform CRUD operations or permissions.
- Rechecked the public QR flow, service-worker behavior, and Playwright inventory. The README's third-party QR-generation warning and its distinction between cached static assets and IndexedDB-backed offline roster/queue data remain supported by the inspected code. Existing Playwright specs cover manual scanning, roster, background/foreground sync, sync status, authentication, admin, and user settings; no dedicated import or attendance-correction browser spec was found.
- This remains a focused claim check, not a full audit of every requirement or a real-device NFC/deployment test. The root README feature-claim checklist remains open until all listed claims and relevant UI behavior have been checked.

## Latest CI verification

- Head `d324d32564a73f11a995ae386510577dd44de7b9` completed all 14 reported check runs successfully: backend tests, Docker Compose, all four Playwright shards and report aggregation, pre-commit, Zizmor, and aggregate workflow checks. This verifies CI at the current documentation branch head. No local manual test or live deployment was performed. Any later commit needs its own CI verification.

- Restored the missing Source of Truth sections 6–9 and 23 as concise, current-aware specification text. The NFC registration, unknown-card fallback, manual attendance, and time-in/time-out sections clearly distinguish target behavior from implementation gaps. Section 23 now reflects the configured stack and correct Workbox/IndexedDB offline model. The original September 10 text remains linked in Git history for traceability.


## Source-of-Truth stale-reference cleanup

- Removed an obsolete Section 26 note claiming Section 6 was missing. Sections 6–9 and 23 have since been restored in the current specification. The replacement wording now points to the actual unresolved credential-lifecycle requirement: a dedicated replacement workflow with retained retired-credential history is not established by the reviewed implementation.
- Rechecked the current specification for stale “missing section” references after the edit. The reviewed text no longer contains that obsolete claim. The original roadmap and template-gap checklist remain explicitly historical and are not treated as current implementation status.
- The NFC registration-versus-scanner identifier mismatch remains a documented implementation issue. This documentation-only PR does not modify scanner code or claim real-device compatibility.

## CI after the latest documentation edit

- Commit 1a43ffd56760915738660458f0695efb934bf6db has 4 of 11 reported checks completed successfully at the latest check, with 7 still running or queued and no failures reported. Recheck the final result before treating this commit as CI-verified.


## Attendance duplicate and offline-conflict contract

- Compared Source of Truth Sections 11 and 13 against the attendance service, database uniqueness constraint, foreground sync, and service-worker sync.
- Current database uniqueness is per `registration_id` and `attendance_session_id`, not a single event/student key. Legacy combined mode can fill `time_out` on a later scan in the same time-in session. Dedicated time-out sessions use a separate session-scoped record.
- Foreground and service-worker sync classify HTTP 409 as a duplicate and mark the local queue item synced with duplicate status. The inspected path does not compare client timestamps to select the earliest scan or persist a separate conflict-review record. Duplicate prevention exists, but the specification's earliest-wins and reviewable-conflict contract is not satisfied by this path.
- Updated Sections 11 and 13 to distinguish intended behavior from current implementation. Keep the gap open until product semantics are decided and code/tests establish the agreed behavior.

## Authentication and authorization audit: follow-up pass

Reviewed `backend/app/api/deps.py`, the login and user route modules, the Class Representative routes, `frontend/src/hooks/useAuth.ts`, the protected layout route, the user model schemas, and the related user/Class Representative tests.

- Access tokens are issued by `POST /api/v1/login/access-token` and validated by the shared `get_current_user` dependency. Inactive users are rejected. Password-reset requests return a consistent message whether or not the email exists, and reset tokens are checked before updating the password.
- The public `UserRegister` request schema accepts email, password, and optional full name only. It does not expose role, superuser, developer, or scanner-permission fields. Public signup therefore does not directly grant those privileges through this schema.
- Administrative user creation is guarded by `require_admin`. Ordinary Admins cannot create privileged accounts or grant developer/scanner capabilities, and Class Representative accounts must use the dedicated assignment workflow. The user-update route applies separate restrictions to privilege changes. Keep these checks documented as endpoint-specific rules, not as a blanket statement that every user operation has identical authorization.
- `must_change_password` blocks ordinary authenticated API paths except `/users/me` and `/users/me/password`, allowing the account to complete its required password change. The password-change route verifies the current password, rejects reuse of the same password, hashes the new password, and clears the flag.
- The frontend stores the access token in local storage and uses route guards to redirect users away from pages they should not access. Login/logout also clear account-scoped offline state and React Query cache. These client-side controls improve navigation and account isolation but do not replace backend authorization.
- The layout guard's role-based page checks and the backend dependency checks are separate layers. Continue validating both when changing permissions. Existing source checks support the role/capability descriptions in the API reference; this pass was a focused source review, not a complete endpoint-by-endpoint authorization test.

No application code, migrations, or CI workflows were changed. Remaining authorization work is to expand endpoint-level coverage only where useful and continue comparing route dependencies with their tests; avoid claiming a complete authorization audit from this focused pass.

## Deployment and proxy audit: follow-up pass

Reviewed `compose.yml`, `compose.deploy.yml`, `.env.example`, `backend/app/core/config.py`, `backend/app/main.py`, the public student QR route, and both deployment guides.

- The production Compose overlay adds HTTP-to-HTTPS redirection and Let's Encrypt TLS through Traefik. The shared Compose file also publishes PostgreSQL on host port 5433 and the backend on host ports 8000 and 8001. Those direct bindings can bypass Traefik's HTTPS entrypoint unless network/firewall policy restricts them. The Docker Compose deployment guide now calls this out and recommends restricting or removing unnecessary host exposure before production use.
- The inspected Compose configuration does not declare explicit Traefik middleware to sanitize `X-Forwarded-For`. The public student QR route uses the first supplied value as its rate-limit key, so client identity can be spoofed unless the effective proxy chain overwrites or safely validates forwarded headers. The deployment guide now says to verify actual proxy behavior and not assume Traefik alone makes the limiter trustworthy.
- The QR lookup's limiter remains in-memory and per process, with a dictionary entry per client key. It is not a shared, bounded production rate-limiting service. This limitation is documented in the API reference and remains an operational/security follow-up.
- `.env.example` includes placeholder secret values and both SMTP and Mailpit variables. The inspected Compose service consumes `SMTP_HOST` and `SMTP_PORT`, while the Mailpit UI is published on host port 8026. These documented mismatches remain recorded above.
- `backend/app/main.py` configures CORS using the single `FRONTEND_HOST` setting. The inspected configuration does not establish a separate application-level trusted-proxy middleware. Deployment-specific proxy and firewall behavior cannot be verified from repository files alone.

This was a repository configuration review, not a live server audit. No application code, migrations, or workflow files were changed.

## Public student QR eligibility audit

Reviewed `frontend/src/routes/get-my-qr.tsx`, `backend/app/api/routes/public_student_qr.py`, `backend/app/student_academics.py`, and `backend/tests/api/routes/test_public_student_qr.py`.

- The public lookup requires an exact student number and a normalized match for first, middle, and last name plus name extension. Unknown students and identity mismatches return the same 404 response. The current test suite covers normalized matching, unknown records, oversized input, and the process-local attempt limit.
- The SQL lookup excludes students with `students.archived_at` set and requires a non-null enrollment status, then chooses the most recently created enrollment. It does not restrict `student_status` to `regular` or `irregular`, and it does not check the enrollment's `archived_at`. Since the status enum also includes `inactive`, `graduated`, `transferred`, and `archived`, a non-archived student can potentially retrieve a QR credential using an inactive or historical enrollment. The intended eligibility rule is not established by the current route or tests.
- Decide whether QR self-service is limited to currently enrolled students or should remain available to former students. Then encode that rule explicitly in the query and add tests for each relevant status and archived enrollment before treating eligibility as settled.
- The displayed QR image and download both request `https://api.qrserver.com` with the credential in the query string. This confirms that credential values leave the application's origin for image generation, including when the QR is displayed, not only when the user downloads it. Prefer local QR generation or document an explicit, reviewed decision to use the external service.

This is a source-and-test review only. No application code or tests were changed in this documentation PR.

## Student enrollment and legacy-field consistency audit

Reviewed `backend/app/api/routes/academic_registry.py`, `backend/app/student_academics.py`, `backend/app/services/student_promotion.py`, and the credential lookup route.

- Year-scoped `StudentEnrollment` rows are the roster's source for section and student status, but the legacy `Student.section_id` and `Student.academic_status` fields still exist and are read by some older paths.
- The dedicated enrollment creation route updates the legacy `Student.section_id` when restoring an archived enrollment, but does not update `Student.academic_status`. Creating a brand-new enrollment does not synchronize either legacy field. The enrollment PATCH route updates only the enrollment row. By contrast, the import-promotion service updates the legacy student fields as well as the year-scoped enrollment.
- The public credential lookup in `backend/app/api/routes/attendee_credentials.py` derives a student's displayed section from `Student.section_id`, not from the selected/current `StudentEnrollment`. This means the section shown by that older public lookup can diverge from the section shown in the academic registry after enrollment changes. Do not describe every student-facing or credential lookup as enrollment-aware until those paths are reconciled.
- The enrollment creation route checks that the student, section, and academic year exist and that the section belongs to the selected year, but it does not reject a student whose `students.archived_at` is set. The route's intended behavior for archived students is therefore not enforced at this boundary.
- Follow-up should establish one canonical rule for synchronizing legacy fields or retire their use in favor of year-scoped enrollment queries. Add tests for create, restore, and update enrollment operations that verify roster details and credential lookup agree. Also decide whether archived students may receive new enrollments, then enforce and test that rule.

This was a source review only. No application code or tests were changed in this documentation PR.

## Student credential lifecycle and deactivation audit

Reviewed `backend/app/api/routes/attendee_credentials.py`, `backend/app/services/student_credentials.py`, and the attendance scan handler in `backend/app/api/routes/attendance.py`.

- Attendance scanning explicitly rejects credentials with `is_active=False`, and the public credential lookup also filters for active credentials. The scanner-only `GET /attendee-credentials/lookup/{credential_value}` endpoint does not filter inactive credentials, so it can return a credential that the scan endpoint will reject. This may be intentional for troubleshooting, but the API reference should distinguish lookup from scan eligibility.
- The admin credential DELETE endpoint permanently deletes the credential row. The current student provisioning service instead treats an inactive QR credential as reusable and reactivates it, preserving its existing value. These are different lifecycle paths: deactivation can be reversed with the same credential, while hard deletion removes that record and a later provisioning operation can create a new value.
- The repository's current route/service behavior does not establish a retired-credential history or reason-for-deactivation workflow. Before describing credential retirement as auditable, decide whether deletion should remain a supported admin action or whether deactivation with retained history should be the canonical lifecycle.
- Add focused tests for inactive credential lookup versus scan rejection, reactivation of an inactive student QR credential, and the expected behavior after a credential is deleted and provisioning runs again. Document the intended administrative use of inactive credential lookup if it remains available.

This was a source review only. No application code, tests, migrations, or CI workflows were changed in this documentation PR.

## Event-registration update validation audit

Reviewed `backend/app/api/routes/event_registrations.py` and compared the create and update handlers.

- Registration creation rejects closed events and checks whether the attendee is already registered for that event. The update handler validates that a replacement event or attendee exists, but it does not repeat the closed-event check and does not check whether the resulting event/attendee pair already has another registration.
- As a result, updating an existing registration can bypass the creation rules: an administrator can move a registration to a closed event or change its event/attendee pair to one already represented by another registration. This is a source-level validation gap; the repository review did not exercise it against a live database.
- The update path also permits changing the registration's event or attendee independently of any existing attendance rows. Confirm the intended policy for registrations that already have attendance records before allowing those identity fields to change.
- Follow-up: add validation for the final event/attendee pair during PATCH, apply the same closed-event policy as creation unless an explicit administrative exception is intended, and add tests for closed-event reassignment, duplicate-pair reassignment, and updates to registrations with recorded attendance.

This was a source review only. No application code, tests, migrations, or CI workflows were changed in this documentation PR.

## Event and attendance-session lifecycle audit

Reviewed `backend/app/api/routes/events.py`, `backend/app/api/routes/attendance_sessions.py`, and `backend/app/services/attendance_processing.py`.

- Event PATCH synchronizes sessions when an event transitions to `open` or `closed`, but it does not update sessions when an event transitions from `open` to `draft`. The event-level scan guard rejects scans while the event is not open, but the former session can remain marked both active and open. The active-session lookup checks session state without also requiring the parent event to be open, so its response can disagree with scan eligibility.
- When an event is reopened and has no session marked active, the event PATCH handler selects the first session by display order and marks it open and active without excluding sessions whose status is `cancelled`. A cancelled first session can therefore be reactivated by reopening the event.
- Event creation maps the event's initial status to a default attendance-session state. The transition handler is a separate path, and the reviewed implementation does not establish a single invariant covering every event/session status combination.
- Follow-up: define the allowed event/session state transitions, ensure moving an event to draft deactivates or otherwise reconciles active sessions, and ensure reopening selects only an eligible session. Add tests for open-to-draft, closed-to-open with a cancelled first session, and the active-session endpoint when its parent event is not open.

These are source-level findings from route/service review, not results from a live deployment. This documentation-only PR does not change the implementation or tests.

## Attendance correction audit-trail consistency

Reviewed `backend/app/api/routes/attendance.py`, `backend/app/api/routes/attendance_corrections.py`, the attendance correction models, and `backend/tests/api/routes/test_attendance_corrections.py`.

- The dedicated `POST /attendance-corrections/` endpoint updates attendance values and writes an `AttendanceCorrection` row containing the actor, reason, and old/new time and status values. The general admin `PATCH /attendance/{record_id}` endpoint can directly change `time_in`, `time_out`, `status`, `scan_method`, and the attendance session without creating a correction row or requiring a reason. Therefore, the audit trail is bypassable through a second write path.
- The correction endpoint recalculates `is_late` when a corrected time-in and session cutoff are present, but the general PATCH path accepts a changed `time_in` without the same recalculation. These paths can leave late status inconsistent with the recorded time.
- The attendance model declares correction rows to cascade-delete with their attendance record, and the attendance DELETE route permanently deletes the record. Deleting attendance therefore removes the associated correction history instead of preserving a separate durable audit record.
- The current correction test verifies the dedicated endpoint's basic update and audit row, but does not verify that every attendance mutation is audited, that late status stays consistent across mutation paths, or what history should survive attendance deletion.
- Follow-up: define whether all manual attendance edits must use the correction endpoint, or route every mutation through a shared audited service. Add regression tests for direct PATCH audit bypass, late-status consistency, and the intended retention policy when an attendance record is deleted. If correction history must be durable, avoid cascading its deletion with the source attendance row and define how deleted records are represented.

This was a source review only. No application code, tests, migrations, or CI workflows were changed in this documentation PR.

## Destructive event and attendee deletion audit

Reviewed the delete handlers in `backend/app/api/routes/events.py`, `backend/app/api/routes/event_registrations.py`, and `backend/app/api/routes/attendees.py`, alongside the model relationship and foreign-key cascade declarations.

- Event deletion is a permanent DELETE operation. The `Event` model cascades deletion to its registrations and attendance sessions; registrations cascade to attendance records, and attendance records cascade to correction history. Deleting an event can therefore remove the roster, session records, attendance history, and correction audit rows together.
- Attendee deletion is also permanent. The `Attendee` model cascades deletion to credentials, relationships, and registrations; registrations cascade to their attendance records and associated correction history. Removing an attendee can therefore erase records associated with previous events.
- The reviewed delete handlers do not require an explicit confirmation token, retention reason, archival state, or export/retention check at the API boundary. UI confirmation alone would not protect the API from an accidental or scripted destructive request.
- This may be intended for test data or full privacy erasure, but it conflicts with any expectation that attendance and correction history remain available for institutional reporting or audit. The repository review did not verify production retention requirements.
- Follow-up: establish retention and privacy-erasure requirements with the system owner. If historical attendance must be retained, prefer archive/deactivate workflows or a deliberate anonymization process over cascading hard deletion. Add tests that assert exactly which records survive event and attendee deletion, and document the intended irreversible effects.

This was a source review only. No application code, tests, migrations, or CI workflows were changed in this documentation PR.

## Student import workflow integrity

Reviewed `backend/app/api/routes/import_batches.py`, `backend/app/services/student_import.py`, `backend/app/services/student_promotion.py`, the import models, and `backend/tests/api/routes/test_import_batches.py`.

- Upload accepts `.csv` and `.xlsx`, rejects empty files, and validates parsed rows. The route reads the entire upload into memory with `await file.read()`; no application-level byte limit is enforced in this handler. Workbook parsing also materializes worksheet rows for processing. Configure and test a request/body limit at the application or reverse-proxy boundary, and consider streaming/row limits for large imports.
- Uploading another file to an existing batch appends new `StudentImportRecord` rows. `create_staging_records()` inserts rows but does not clear or replace previous staging records. The route then computes the response summary from the newly parsed file only, while the batch's records can contain rows from earlier uploads. This can make the validation summary disagree with the actual staging records used by promotion. Decide whether a batch is single-upload-only or whether re-upload atomically replaces unpromoted staging rows, and add a regression test.
- `PATCH /import-batches/{batch_id}` accepts `status` and `validation_summary` alongside metadata. The route applies these fields directly, while the upload and promotion handlers also manage status and validation summary. An Admin can therefore manually set workflow state or summary values without running the corresponding validation/promotion operation. Define which fields are user-editable and enforce legal state transitions in the API, rather than trusting client-supplied derived state.
- The promotion route checks batch status and the stored validation summary before calling the promotion service. The service independently promotes valid staging rows and marks a batch promoted when all valid rows have been promoted. Re-uploaded rows or manually edited status/summary fields make it especially important that promotion uses a consistent, authoritative batch snapshot.
- Existing route tests cover authentication and Admin permissions, malformed/empty/unsupported files, row validation, and promotion guards. The inspected tests do not establish a file-size limit, repeated-upload behavior, or rejection of client edits to derived status/summary fields.

Recommended follow-up: define batch lifecycle rules, make upload/re-upload behavior atomic and explicit, enforce upload size and row limits, and add regression tests for those cases. This is a source review; no application code or tests were changed in this documentation-only PR.

## Attendance export coverage and enrollment consistency

Reviewed `backend/app/api/routes/attendance.py`, `frontend/src/components/Records/RecordsWorkspace.tsx`, and `frontend/src/components/ClassRepresentative/RecordsWorkspace.tsx`.

- The implemented attendance export is CSV. The frontend's Export / Print workspace explicitly describes CSV as the supported export. XLSX, PDF, DOCX, and a dedicated printable pre-event roster were not found in this reviewed attendance-export path. Do not describe those formats or roster printouts as implemented unless another verified workflow is identified.
- Attendance list filtering for a section joins year-scoped `StudentEnrollment` records. The CSV export uses a different rule for non-Class-Representative users: it filters by the legacy `Student.section_id`. Class Representatives instead filter through `StudentEnrollment` and the assigned academic year. Given that enrollment and legacy section fields can diverge, an Admin's section-filtered list and exported CSV may contain different students. Use the same year-scoped enrollment rule for both paths, or document and test an intentional distinction.
- The export endpoint returns all matching rows in one CSV response and has no pagination parameter. Confirm expected roster/event sizes and add bounded or streamed export handling if large exports are expected.
- The export includes student number, full name, event, time in/out, attendance status, late flag, scan method, session, session date, and recorded timestamp. It does not include correction reason or correction history. If exports are intended to support audit/review, define whether correction details belong in a separate audit export rather than implying they are part of the attendance CSV.

Recommended follow-up: align Admin section filtering with the canonical enrollment model, add a regression test comparing filtered list and CSV membership, and state the current CSV-only scope in user-facing documentation. Decide separately whether printable rosters and additional export formats are required. This is a source review; no application code or tests were changed in this documentation-only PR.

## API authorization boundary audit: attendee relationships

Reviewed `backend/app/api/routes/attendee_relationships.py` against the neighboring attendee and credential route groups.

- `GET /api/v1/attendee-relationships/` and `GET /api/v1/attendee-relationships/{relationship_id}` require a `CurrentUser`, so they require an authenticated user, but neither route applies `require_admin` or an explicit role/assignment check.
- The list endpoint can return relationship rows across the entire database. Optional `attendee_id` and `related_student_id` parameters are filters, not authorization boundaries. The detail endpoint retrieves any relationship by ID without checking the caller's role or relationship to the linked student.
- In contrast, create, update, and delete operations in this route group use `require_admin`. The neighboring attendee and attendee-credential read routes also apply admin or scanner-permission dependencies. This makes the relationship read policy inconsistent with its write policy and adjacent resources.
- Impact depends on which user roles can authenticate in the deployed application. If student or other non-admin accounts can use these endpoints, they may be able to enumerate or retrieve attendee-to-student relationship data outside their own scope. Do not describe this as confirmed anonymous access: the handlers require `CurrentUser`.
- Follow-up: decide whether relationship reads are Admin-only or should support a defined, record-scoped role. Enforce the same policy on both list and detail endpoints, and add tests proving unauthorized roles cannot list global records or fetch a relationship by guessed/known ID. If Class Representatives need access, scope both endpoints to their assigned section and academic year instead of relying on optional query filters.

This is a source-code authorization finding, not a live penetration test. Other route groups still need endpoint-by-endpoint review; this section does not certify the API as fully audited.

## API authorization boundary audit: Class Representative assignment resolution

Reviewed `backend/app/api/deps.py`, `backend/app/api/routes/academic_registry.py`, and `backend/app/api/routes/students.py`.

- `class_rep_assignment()` filters by academic year only when the caller supplies `academic_year_id`; otherwise it orders assignments by `created_at DESC` and returns one row. This selects the most recently created assignment, not necessarily the current academic year.
- Several Class Representative reads use that helper when the year is omitted, including the section registry and student-detail/list paths. Other routes explicitly require or derive the year from an assignment. As a result, requests without an academic-year parameter can resolve to a future or historical assignment if that assignment was created most recently.
- The selected assignment still constrains section access in the reviewed routes, so this finding does not by itself establish cross-section data exposure. It is an academic-year correctness and predictable-scope issue that can make the representative see the wrong roster or receive confusing access denials.
- Follow-up: define the canonical default year for Class Representative requests, preferably the explicitly configured current academic year, and require an unambiguous assignment for that year. If historical-year access is supported, make it explicit in the request and verify the user's assignment for that year. Add tests with assignments in multiple years created out of chronological academic order and with no assignment for the current year.

## API authorization boundary audit: archived roster visibility

- `GET /api/v1/academic-registry/sections/{section_id}/students` checks a Class Representative's assigned section, then accepts `include_archived=true` without restricting that option to Admin roles. That flag removes both the student archive filter and the enrollment archive filter.
- This remains limited to the assigned section, but it lets a Class Representative request archived student and enrollment rows that the default roster excludes. Confirm whether representatives should have access to historical/archived roster entries. If not, reject or ignore `include_archived` for that role and test the restriction.
- Source review only. The audit has not yet verified every endpoint, dependency, and role combination through integration tests or live deployment testing.

## API validation audit: attendee relationship updates

Reviewed `backend/app/api/routes/attendee_relationships.py` and the `AttendeeRelationship` model in `backend/app/models.py`.

- Relationship creation checks whether the attendee/student pair already exists and returns HTTP 400 for a duplicate.
- Relationship updates validate that replacement attendee and student IDs exist, but do not check whether the resulting pair already belongs to a different relationship row.
- The database has a unique constraint on `(attendee_id, related_student_id)`, so a duplicate reassignment is rejected at the database layer. The route does not translate that constraint failure into a deliberate client error, which can turn an ordinary validation conflict into an unhandled server error.
- Follow-up: validate the final pair before updating, handle concurrent uniqueness conflicts safely, and test reassignment to an existing pair as well as partial updates that change either ID.

This is a source review; application code and tests were not changed in this documentation-only PR.

## API validation audit: Class Representative student quick-add

Reviewed `backend/app/api/routes/class_representatives.py`, especially `POST /api/v1/class-representatives/me/students`, and the `Student` model.

- The quick-add endpoint accepts an untyped `dict[str, Any]` rather than a dedicated request model. It manually checks for three required keys but does not apply the same explicit field validation and normalization contract used by typed student-create schemas.
- The duplicate check queries `student_number` using the untrimmed request value, while the new `Student` stores the value after trimming. A value with surrounding whitespace can therefore miss the pre-check even when its normalized value matches an existing student number. The database's unique constraint remains the final guard, but a collision may surface as a database error rather than a clear HTTP 409 response.
- Required values containing only whitespace can pass the key-presence check and then be stored as empty strings after trimming, unless another database constraint rejects them. This route also converts several fields to strings manually instead of relying on schema validation.
- Follow-up: introduce a dedicated validated request schema, normalize the student number before duplicate checks, reject blank required fields, and translate uniqueness conflicts into a consistent HTTP 409. Add tests for whitespace-normalized duplicates, blank names/student numbers, and malformed optional fields.

This is a source review, not proof that invalid records already exist in production. Application code and tests were not changed in this documentation-only PR.

## Public credential lookup: personal-data exposure review

Reviewed `backend/app/api/routes/attendee_credentials.py`, specifically `GET /api/v1/attendee-credentials/public/{credential_value}`.

- The endpoint has no authentication dependency. Anyone who knows an active credential value can receive the linked attendee's full name and attendee type, plus student number and section name when the attendee is linked to a student.
- The credential value acts as the lookup secret, but the endpoint does not establish that the requester is the credential owner or an authorized operator. A QR code or credential value that is photographed, forwarded, or otherwise exposed can therefore also expose the returned identity details.
- This is not evidence that credentials can be enumerated without knowing a value, and the endpoint may be intentionally public for a user-facing workflow. The remaining question is whether returning student number and section is necessary for that workflow and whether the credential should be treated as a bearer secret.
- Follow-up: document the endpoint's intended public use and threat model; minimize returned fields to what the workflow requires; consider an authenticated/scanner-only alternative for operational lookup; and add tests that lock down the intended response fields and authorization policy. Review rate limiting separately rather than assuming the public student QR limiter covers this route.

This is a source-code privacy review, not a live exploit test. Application code and tests were not changed in this documentation-only PR.

## Provisional remediation order

This is an implementation planning aid based on the source reviews above, not a claim that every finding has been reproduced in a running deployment. Confirm intended product behavior and add regression tests before changing application code.

### Priority 1: authorization and record integrity

1. Define and test the authorization policy for attendee-relationship list/detail reads. These endpoints currently require authentication but lack the Admin or record-scoped checks used by neighboring routes.
2. Make Class Representative academic-year resolution explicit. Avoid selecting the most recently created assignment when the intended scope is the current academic year.
3. Decide whether the public credential lookup needs to return student number and section. Minimize public personal-data responses and test the intended access policy.
4. Route all manual attendance corrections through one audited mutation path, or ensure every permitted mutation records the actor and reason. Keep late-status calculation consistent.
5. Make event-registration updates enforce the same closed-event and duplicate-pair rules as creation.
6. Make import-batch status and validation summaries server-owned workflow state. Define atomic re-upload behavior and enforce upload limits.
7. Use validated request models and consistent conflict handling for Class Representative student quick-add and attendee-relationship reassignment.

### Priority 2: academic and attendance consistency

1. Establish one canonical enrollment source for current section/status and reconcile or retire legacy student fields.
2. Align section-filtered attendance list results and CSV exports.
3. Enforce event/session lifecycle invariants when events move between draft, open, and closed states. Never reactivate a cancelled session implicitly.
4. Decide whether public student QR lookup is for currently enrolled students only or also former students, then enforce the chosen eligibility rule.
5. Define credential deactivation, reactivation, and deletion behavior, including whether retired credential history must be retained.
6. Set explicit request-size and row-count limits for student imports, and assess export bounds for expected dataset sizes.

### Priority 3: owner decisions and operational hardening

1. Confirm Class Representative access to archived roster records.
2. Establish retention and privacy-erasure rules before changing event, attendee, attendance, or correction-history deletion behavior.
3. Confirm whether historical correction details need a separate export or durable retention policy.
4. Decide whether additional export formats or printable pre-event rosters are requirements; current reviewed attendance export is CSV.
5. Review public credential lookup exposure, reverse-proxy trust, and rate-limiting behavior against the actual deployment topology.

Before closing the audit, complete the endpoint-by-endpoint authorization pass, connect findings to existing or missing tests, and distinguish verified behavior from open product decisions. Do not treat this provisional order as a substitute for reproducing the findings or reviewing production retention and privacy requirements.

## API authorization audit: user management and role transitions

Reviewed `backend/app/api/routes/users.py`, `backend/app/api/deps.py`, and the related tests in `backend/tests/api/routes/test_users.py`.

- User listing and account creation require Admin-level access. Creating Class Representative accounts is rejected in the general user route, and assigning privileged roles or Developer/scanner capabilities is restricted to Super Admins. Public signup uses the narrower `UserRegister` schema rather than accepting the full administrative user model.
- Reading `GET /api/v1/users/{user_id}` requires authentication. A user may read their own record; only Admin, Super Admin, or a platform superuser may read another user's record. Tests cover the normal user's self-read and denial for another user's ID.
- General user updates and deletion require Admin-level access. Admins are prevented from modifying or deleting Admin/Super Admin/Developer accounts, and privilege fields are Super Admin-only. Tests cover some role-promotion and Developer-isolation cases, but this review did not establish exhaustive coverage of every role/field combination.
- The dedicated Class Representative assignment workflow is enforced when a non-representative account is changed to the Class Representative role. However, the guard only rejects transitions *into* that role. An existing Class Representative account can submit a different role through `PATCH /api/v1/users/{user_id}`; this path does not visibly require the dedicated assignment workflow or reconcile that user's assignment rows. That may leave account role and assignment records inconsistent, depending on the update service and database constraints.
- Follow-up: decide whether Class Representative role changes in either direction must go through the assignment workflow. If so, reject demotion through the general user-update route or make that route explicitly revoke/reconcile assignments transactionally. Add tests for demoting an assigned representative, ensuring assignment rows are handled as intended, and verifying that Admins cannot bypass the dedicated workflow. Also add a role/privilege matrix for account update and deletion tests.

## API authorization audit: technical Developer endpoints

Reviewed `backend/app/api/routes/developer.py`, `backend/app/api/deps.py`, and `backend/tests/api/routes/test_developer.py`.

- System health and diagnostics require the independent Developer capability. The diagnostics response returns aggregate counts and database/runtime information rather than user or student rows.
- Audit-log reads use a separate dependency that permits Admin, Super Admin, platform superuser, or Developer capability. Results are paginated with a maximum page size of 100 and support filters; the response omits request payload contents.
- Tests establish that a student-role account with Developer capability can access technical diagnostics and audit logs but is denied operational event, student, academic-registry, and other Admin APIs. They also cover Admin access to audit logs, an ordinary user's denial, audit correlation for a failed mutation, and invalid audit-filter ranges.
- This route group appears intentionally separated from operational permissions in the inspected code. This is not a complete authorization certification: continue checking all registered routers and role/assignment combinations, including whether any other route accidentally grants technical Developer capability operational access.

This section is a source-and-test review. No application code or tests were changed in this documentation-only PR.

## Academic registry validation audit: student create and update payloads

Reviewed `backend/app/api/routes/academic_registry.py` and `backend/tests/api/routes/test_academic_registry.py`.

- The registry student-create and student-update handlers accept generic dictionaries rather than dedicated request models. Create validates required keys, verifies that the selected section belongs to the supplied academic year, rejects blank student numbers after trimming, and checks the student status enum. Existing tests cover missing fields, blank student number, invalid status, duplicate number, and section/year mismatch.
- Create trims first and last names before storing them but does not explicitly reject values that become empty after trimming. A whitespace-only required name can therefore reach the persistence path unless another constraint rejects it. Add tests for blank first/last names and enforce a clear 422 response.
- Update checks for a duplicate student number but compares and stores the raw submitted value. Unlike create, it does not normalize the updated student number before checking uniqueness or saving. A value with surrounding whitespace can produce inconsistent identifiers, and a normalized collision may reach the database constraint without a deliberate conflict response.
- Update also accepts person and enrollment fields from an untyped dictionary and performs manual field handling. The route has Class Representative section/year checks, including validation of a supplied enrollment ID against the representative's assigned scope, but typed schemas would make field-level validation and normalization more consistent.
- Follow-up: use dedicated create/update schemas or central validation helpers; trim and reject blank names; normalize student numbers before uniqueness checks and writes; translate uniqueness races into HTTP 409; and add regression tests for whitespace-padded updates, blank names, invalid status updates, and attempts to update an enrollment outside the representative's assignment.

This is a source-and-test review, not evidence that malformed records exist in production. No application code or tests were changed in this documentation-only PR.

## API authorization audit: organizations, people, and academic catalog

Reviewed `backend/app/api/routes/organizations.py`, `people.py`, `academic_programs.py`, `academic_catalog.py`, and their related route tests.

- Organization reads and list/search operations require Admin-level access. Organization create, update, and delete require Super Admin. Academic program list/detail reads require Admin, while create/update/delete require Super Admin. The route dependencies match the documented distinction between operational administration and global academic configuration.
- People list/detail/create/update/delete all require Admin-level access. The person response model includes contact fields such as email and contact number, so this is a meaningful personal-data boundary. The inspected test exercises CRUD using a superuser token but does not itself establish a complete denial matrix for student, Class Representative, scanner-only, and Developer-only users. Add explicit unauthorized-role coverage where not already provided by shared RBAC tests.
- Academic major list and section-major detail reads require an authenticated user but do not restrict by Admin role or Class Representative assignment. These responses expose academic catalog metadata rather than student records, so this is not equivalent to the previously documented relationship-read issue. Confirm whether the broad authenticated read access is intentional and document the policy; if it is intended for student-facing selectors, keep responses limited to catalog fields.
- The private user-creation route is included only when `FASTAPI_ENV` is `development` or `test`; it is not included by the API router for other environment values. In development/test it has no authentication dependency and can create a basic user account. This is consistent with a development helper, but deployment safety depends on the runtime environment being configured correctly. Add a startup/configuration assertion or deployment test proving production-like deployments do not register `/api/v1/private/users/`, and keep the route out of public deployments.
- The health-check route is public and returns only a boolean. The test-email utility requires the active-superuser dependency and returns a fixed success message; its test verifies the email send call is mocked, not actual SMTP delivery.

Recommended follow-up: extend the role matrix tests for people-data access, document the intended visibility of academic catalog metadata, and add an explicit production-route-registration check for development-only endpoints. These findings are based on route registration and source/test review, not live deployment inspection. No application code or tests were changed in this documentation-only PR.

## Scanner permission and event-roster credential disclosure

Reviewed `backend/app/api/routes/roster.py`, `backend/app/api/routes/attendance.py`, `backend/app/api/deps.py`, and `backend/tests/api/routes/test_roster.py`.

- The event roster endpoint is protected by `require_scanner_permission`. Its response includes each registered attendee's name, student number when applicable, attendance fields for a requested session, and every active credential's raw `credential_value`. The roster test explicitly asserts that active NFC and QR values are returned, and that a Class Representative account with `can_scan=True` can read the roster.
- This makes the scanner capability a bulk credential-read permission, not only permission to submit scans. A scanner-enabled account can retrieve all active credential values for every registered attendee in an event, including credentials unrelated to the immediate scan. The endpoint excludes inactive credentials and does not return email/contact number, but those controls do not reduce exposure of active bearer-like identifiers.
- Whether this is a defect depends on the credential model and operational needs. If scanners must preload identifiers for offline or local matching, the behavior may be intentional; however, the current roster endpoint is a normal API response and the inspected code does not establish an additional event assignment or scanner-station scope check.
- Follow-up: decide whether raw credential values are required in the roster response. Prefer returning only the minimum roster fields and resolving a scanned credential server-side, or provide a narrowly scoped roster payload only where offline scanning requires it. If bulk values are required, document the threat model, limit which events a scanner can access, and add tests for event scoping and the exact fields visible to scanner-only accounts.

This is a source-and-test review, not a live exploit or deployment test. No application code or tests were changed in this documentation-only PR.

## Academic section exports and bulk student contact data

Reviewed `backend/app/api/routes/academic_sections.py` and `backend/tests/api/routes/test_academic_registry.py`.

- The academic-section API has separate `GET /api/v1/academic-sections/{section_id}/export/xlsx` and `GET /api/v1/academic-sections/{section_id}/export/docx` routes. Both require Admin-level access and build their rows from non-archived students with non-archived enrollments in the section's academic year.
- The XLSX export includes student number, full name components, email, contact number, and legacy `Student.academic_status`. The DOCX export is a class list and uses the same enrollment-based row selection. These are separate from the attendance export, which is CSV-only in the reviewed attendance route; do not generalize that CSV limitation to all exports in the system.
- The academic registry test verifies that XLSX export uses the historical enrollment even when the legacy `Student.section_id` points elsewhere. The reviewed tests do not establish an explicit field-level privacy contract for exported contact information or an audit trail for each bulk export.
- Follow-up: confirm that email and contact number are required in downloadable class lists and limit fields to the documented purpose. Confirm whether bulk export actions should be audit-logged given that the files contain student contact data. Keep route authorization tests for non-admin roles and export-field assertions aligned with the approved policy.

This is a source-and-test review, not a live deployment test. No application code or tests were changed in this documentation-only PR.

## Academic-year current-state integrity and authorization

Reviewed `backend/app/api/routes/academic_registry.py`, `backend/app/student_academics.py`, and `backend/tests/api/routes/test_academic_registry.py`.

- Listing academic years requires Admin-level access. Creating an academic year and setting the current year require Super Admin access. Creation validates that the end year is exactly one after the start year, the label matches the year range, and a duplicate label returns HTTP 409.
- Setting the current year first updates all rows to `is_current = false`, then marks the selected row current in the same request transaction. The model defines uniqueness for the academic-year label, but the reviewed model does not define a database constraint limiting `is_current = true` to one row.
- The integration test confirms that a normal sequential set-current request leaves exactly one current year. It does not establish the invariant under concurrent requests. Two overlapping transactions can each clear the rows they see and mark different years current; without a database-level invariant or serialization strategy, application-level sequencing alone may not guarantee exactly one current year under concurrency.
- The code also permits a Super Admin to select any existing year as current, including an older year. That may be intentional for correcting the active academic year, but the operational implications for Class Representative assignment resolution and default academic-year behavior should be explicit.
- Follow-up: enforce the single-current-year invariant at the database or transaction/locking layer, and add a concurrency-oriented regression test if concurrent administrative requests are in scope. Document whether switching to a historical year is allowed and ensure year-dependent routes use the same canonical current-year rule.

This is a source-and-test review, not a concurrency test or live deployment test. No application code or tests were changed in this documentation-only PR.

## Scanner permission scope across attendance sessions

Reviewed `backend/app/api/deps.py`, `backend/app/api/routes/attendance_sessions.py`, `backend/app/api/routes/roster.py`, and attendance-session tests.

- `require_scanner_permission` allows Super Admins, Admins, platform superusers, and any active account with `can_scan = true`. The dependency checks the capability, not an assignment to a particular event, session, or scanner station.
- The attendance-session list endpoint accepts an optional `event_id`. A scanner-capable account can omit it and list sessions across events. The session detail endpoint accepts a session ID and returns that session after the same capability check; it does not verify a session assignment for the caller.
- The active-session lookup and event-roster routes similarly use scanner permission and a caller-supplied event ID. The roster route verifies that the event exists and, when supplied, that the session belongs to that event, but the reviewed code does not verify the caller is assigned to that event.
- This may be the intended operator model if scanner permission is deliberately global. If scanner accounts should be restricted to assigned events, the current dependency alone does not provide that boundary. A guessed or otherwise obtained event/session ID is not an assignment check.
- Follow-up: explicitly choose and document whether `can_scan` is global or event-scoped. If scoped, add an event/session assignment model and enforce it consistently on roster reads, session list/detail/active reads, and scan submissions. Add tests proving a scanner can access only authorized events and sessions, including requests that omit `event_id`.

This is a route and dependency review, not a live exploit test. No application code or tests were changed in this documentation-only PR.

## Direct attendance-session deletion and historical records

Reviewed `backend/app/api/routes/attendance_sessions.py` and the `AttendanceSession`, `Attendance`, and `AttendanceCorrection` model relationships in `backend/app/models.py`.

- Admin-level users can delete an attendance session after it is no longer active. The route returns a success message after deleting the session; it does not require a retention check, reason, archival step, or explicit API-level confirmation.
- The `AttendanceSession.attendance_records` relationship uses delete cascade. Each attendance record's `corrections` relationship also uses delete cascade, and the correction model's attendance foreign key is configured with `ON DELETE CASCADE`.
- Therefore, deleting a closed session can permanently remove its attendance records and the correction history attached to those records. The route's active-session guard prevents deletion while active, but does not protect historical records.
- This is a separate deletion path from deleting an event or attendee. The existing event/attendee deletion review already notes that their cascades can remove attendance history; direct session deletion creates the same retention concern even when the event and attendee remain.
- Follow-up: confirm the institutional retention and privacy-erasure policy. If attendance history must be preserved, consider preventing deletion of sessions with attendance, archiving sessions, or using a deliberate retention workflow. Add tests that assert exactly which attendance and correction rows remain after session deletion.

This is based on route and model inspection, not a live database deletion test. No application code or tests were changed in this documentation-only PR.

## Direct event-registration deletion and attendance history

Reviewed `backend/app/api/routes/event_registrations.py` and the `EventRegistration`, `Attendance`, and `AttendanceCorrection` model relationships in `backend/app/models.py`.

- The Admin-only `DELETE /event-registrations/{registration_id}` route permanently deletes the registration without checking whether it has attendance records or correction history.
- `EventRegistration.attendance` is configured with delete cascade, and `Attendance.registration_id` uses a cascading foreign key. Deleting a registration therefore deletes its attendance rows. Attendance corrections also cascade from their parent attendance row, so correction history is removed as well.
- This is another direct deletion path that can erase historical attendance while the parent event and attendee remain. It is distinct from deleting the event, attendee, or attendance session.
- The registration PATCH route also permits changing the event or attendee on an existing registration after confirming the replacement records exist. It does not reject the change when attendance already references that registration, so historical attendance associated through that registration may subsequently be presented under the new event or attendee. The route also does not reapply the create route's closed-event or duplicate-registration checks; those gaps are recorded in the event-registration update validation finding above.
- Follow-up: define whether registrations with attendance can be deleted or reassigned. If attendance history must remain stable, block deletion/reassignment after attendance exists or use an explicit archive/retention workflow. Add tests for registration deletion with attendance and corrections, and for attempts to change event/attendee on a registration with existing attendance.

This is based on route and model inspection, not a live database deletion test. No application code or tests were changed in this documentation-only PR.
