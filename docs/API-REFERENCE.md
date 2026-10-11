# API and Authorization Reference

**Status:** Initial route-module inventory, checked against `backend/app/api/main.py`, `backend/app/api/deps.py`, and selected route implementations on 2026-10-10.

The configured API prefix is `/api/v1` by default. Confirm `API_V1_STR` in the active environment before using these paths. For the exact request/response schemas and parameters, use the running application's OpenAPI documentation at `/docs` and `/api/v1/openapi.json`.

This is a grouped route-module guide, not an exhaustive endpoint-by-endpoint contract. It does not replace OpenAPI or tests.

## Registered route groups

| Route module | Prefix / area | Purpose |
|---|---|---|
| `login` | Authentication | Access token and account recovery flows |
| `developer` | Developer tools | Technical developer operations, including audit-log access |
| `users` | `/users` | User profile, password, and administrative user operations |
| `utils` | Utility endpoints | Application utility routes |
| `organizations` | `/organizations` | Organization records |
| `academic_programs` | `/academic-programs` | Academic program records |
| `academic_sections` | `/academic-sections` | Academic section records |
| `academic_catalog` | `/academic-catalog` | Major catalog and section-major assignments |
| `academic_registry` | `/academic-registry` | Academic years, section registry, and student enrollments |
| `people` | `/people` | Person records |
| `students` | `/students` | Student masterlist operations |
| `attendees` | `/attendees` | Event attendee records |
| `attendee_credentials` | Attendee credentials | QR/NFC credential operations |
| `attendee_relationships` | Attendee relationships | Links between attendees, such as guardians and students |
| `events` | `/events` | Event CRUD and event lifecycle |
| `roster` | `/events/{event_id}/roster` | Event roster data for scanner-permitted users |
| `event_registrations` | Event registrations | Attendee registration for events |
| `attendance` | `/attendance` | Attendance queries, scan recording, and CSV export |
| `attendance_sessions` | `/attendance-sessions` | Attendance-session lifecycle and active-session selection |
| `attendance_corrections` | Attendance corrections | Audited attendance correction workflow |
| `class_representatives` | `/class-representatives` | Representative assignments and assigned-section student operations |
| `import_batches` | Import batches | Student masterlist import and staging |
| `public_student_qr` | Public student QR | Public-facing student QR operations |

The `private` router is included only when `FASTAPI_ENV` is `development` or `test`.

## Authorization model

Authorization is enforced in backend dependencies. Frontend visibility is not a security boundary.

- **Super Admin**: represented by the `super_admin` application role and/or the platform's `is_superuser` override, depending on the specific dependency.
- **Admin**: `admin` role; can access routes guarded by `require_admin`.
- **Class Representative**: assigned to a section for an academic year. Representative-specific routes verify assignment and restrict student/attendance access to that assignment where implemented.
- **Student**: `student` application role.
- **Developer capability**: `is_developer` is separate from business administration. Developer routes use `require_developer`.
- **Scanner permission**: `can_scan` is an independent permission. `require_scanner_permission` also allows Super Admin/Admin and platform superusers.

The `UserRole` enum in `backend/app/models.py` currently contains `super_admin`, `admin`, `class_representative`, and `student`. Technical Developer access is a separate boolean capability, not a `UserRole` enum value.

Users with `must_change_password=true` are blocked from ordinary authenticated API access until they change their password. The dependency allows the current-user and password-change paths required to complete that step.

### Important examples checked in source

- Event routes use `require_admin`; Class Representatives are explicitly denied access to event listing/detail routes.
- Attendance listing uses `require_class_rep_or_higher`, then scopes Class Representative results to the assigned section and academic year.
- Attendance-session reads use `require_scanner_permission`; session creation, update, activation, closing, and deletion use `require_admin`.
- Class Representative management/list/create routes require `require_super_admin`, while `/class-representatives/me` and its student routes check the current user's role and assignment.
- The user-creation route blocks ordinary Admins from creating privileged accounts or granting scanner access. Class Representative accounts must use the dedicated assignment workflow.

These examples describe the inspected source and should be backed by authorization tests when behavior changes. Do not infer that every endpoint in a route module shares the same permission.

### Selected endpoint behavior

| Endpoint | Verified behavior | Access control / caveat |
|---|---|---|
| `POST /api/v1/public/student-qr` | Returns the existing student QR credential after an exact student-number and normalized-name match. | Public self-service route; 12 attempts per 60 seconds per derived client key in the current process. Rate-limit state is in-memory and per-process. The endpoint trusts the first `X-Forwarded-For` value whenever supplied, without validating the proxy at this route. Production must ensure trusted proxies overwrite client-supplied values. The in-memory per-process limiter also retains per-client dictionary keys after timestamp lists expire, so rotating keys can grow process memory. Use a bounded/shared rate limiter with trusted client-IP handling before public deployment. Unknown students and identity mismatches return the same 404 response. |
| `GET /api/v1/academic-registry/academic-years` | Lists academic years. | Admin or higher. |
| `POST /api/v1/academic-registry/academic-years` | Creates an academic year after validating consecutive years and the `YYYY-YYYY` label. | Super Admin only. |
| `POST /api/v1/academic-registry/academic-years/{id}/set-current` | Clears the current flag on all years and marks the selected year current. | Super Admin only. |
| `GET /api/v1/academic-registry/sections` | Lists section registry data, optionally filtered by academic year. | Admin/Super Admin or assigned Class Representative; representative result is limited to their assignment. |
| `GET /api/v1/academic-registry/sections/{section_id}/students` | Lists students enrolled in the section's academic year. Archived students/enrollments are excluded unless requested. | Representative must match the assigned section. |
| `GET /api/v1/academic-sections/{section_id}/export/xlsx` | Downloads an academic section's student roster as XLSX. | Admin or higher. This is a section-roster export, not an attendance-report export. |
| `GET /api/v1/academic-sections/{section_id}/export/docx` | Downloads an academic section's student roster as DOCX. | Admin or higher. This is a section-roster export, not an attendance-report export. |
| `POST /api/v1/students/` | Creates a student. | Admin or higher. |
| `PATCH /api/v1/students/{student_id}` | Updates a student after checking access and validating related records and duplicate identifiers. | Admin/Super Admin or Class Representative assigned to the student's active enrollment; representatives cannot move students between sections, but the current request model also permits edits to student number, person linkage, and academic status. See the audit for the least-privilege field-policy decision. |
| `DELETE /api/v1/students/{student_id}` | Archives a representative's enrollment in their assigned year, or archives the student record for Admin/Super Admin. | Not a hard-delete contract. Admin/Super Admin archival leaves year-scoped enrollment rows active, although default roster queries hide the archived student. See the audit for the retention/restoration policy decision. |
| `POST /api/v1/import-batches/{batch_id}/promote` | Promotes a validated import batch through `StudentPromotionService`. | Admin or higher; blocked if the batch is not validated, contains invalid/conflict rows, or its summary reconciliation is not matched. |
| `POST /api/v1/attendance-corrections/` | Records an audited correction for an existing attendance record. | Admin or higher. The reason is limited to 500 characters but is not constrained to non-empty text; nullable time fields cannot currently be cleared through this payload because `null` is treated like an omitted field. See the documentation audit. |
| `GET /api/v1/attendee-relationships/` and `GET /api/v1/attendee-relationships/{relationship_id}` | Lists relationship records or retrieves one record by ID. | Any authenticated user can read these routes in the reviewed implementation; neither route applies `require_admin` or an explicit ownership/scope check. This is a documented authorization gap under review. |
| `GET /api/v1/attendee-credentials/public/{credential_value}` | Looks up an active credential and returns attendee ID/type, full person name, and, when linked to a student, student number and legacy section name. | Public bearer-value lookup. Anyone who obtains the credential value can request these fields; the route does not apply the public student-QR route's visible attempt limiter. See the audit for privacy and access-policy decisions. |
| `POST /api/v1/password-recovery/{email}` | Sends a password-recovery email when the account exists and returns a generic response either way. | Public route. No application-level throttling was found in the reviewed route/middleware; verify edge controls. See the audit for abuse-control considerations. |
| `POST /api/v1/reset-password/` | Resets an active user's password using a valid reset token. | Public token-based flow. Tokens expire after the configured interval (48 hours by default); the reviewed helper does not invalidate a token after use. The handler also does not clear `must_change_password`, unlike `PATCH /api/v1/users/me/password`. See the documentation audit for these unresolved behaviors. |
| `PATCH /api/v1/event-registrations/{registration_id}` | Changes the event, attendee, or registration status after validating that replacement event/attendee records exist. | Admin only. The route does not reapply create-time closed-event or duplicate-pair checks, and does not block reassignment when attendance history already exists. See the documentation audit. |
| `DELETE /api/v1/event-registrations/{registration_id}` | Permanently deletes the registration. | Admin only. Attendance rows cascade from the registration, and correction history cascades from attendance. Confirm retention requirements before treating this as a safe cleanup operation. See the documentation audit. |
| `DELETE /api/v1/attendance-sessions/{session_id}` | Deletes a session only when it is not active. | Admin only. The reviewed model relationships cascade session deletion to its attendance records, and attendance deletion cascades to correction records. Closing a session is not equivalent to retaining its history if it is later deleted. Confirm retention policy before use. |
| `DELETE /api/v1/attendees/{attendee_id}` | Permanently deletes an attendee record. | Admin only. Reviewed model relationships cascade deletion to linked credentials, relationships, registrations, attendance, and correction history. This is destructive deletion, not archival. Confirm retention and privacy-erasure policy before relying on it for routine cleanup. |

These are selected behaviors verified in route code and tests, not a complete endpoint list. Confirm the active router prefix and trailing-slash conventions against OpenAPI before copying a path into a client.

## Attendance export

The current `GET /api/v1/attendance/export` route returns **CSV**. It supports filters for event, academic year, status, attendance session, scan method, session date, attendee type, section, and late status. Class Representative exports are scoped to their assigned section/year in the route implementation.

Excel, Word, PDF, and printable roster export are not confirmed as implemented by this route. Treat those formats as planned unless another implemented endpoint is found.

## How to keep this reference accurate

When routes change:

1. Check `backend/app/api/main.py` for registered routers.
2. Check each route decorator and its dependencies in `backend/app/api/routes/`.
3. Check authorization behavior in `backend/app/api/deps.py` and route-specific checks.
4. Add or update tests for allowed and denied access.
5. Regenerate the frontend client using the repository's documented script.
6. Keep this overview grouped and concise; use generated OpenAPI for the full endpoint contract.
