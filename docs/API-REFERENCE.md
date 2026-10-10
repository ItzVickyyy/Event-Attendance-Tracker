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
| `academic_catalog` | Academic catalog | Academic catalog and year-related operations |
| `academic_registry` | Academic registry | Academic registry operations |
| `people` | `/people` | Person records |
| `students` | `/students` | Student masterlist operations |
| `attendees` | `/attendees` | Event attendee records |
| `attendee_credentials` | Attendee credentials | QR/NFC credential operations |
| `attendee_relationships` | Attendee relationships | Links between attendees, such as guardians and students |
| `events` | `/events` | Event CRUD and event lifecycle |
| `roster` | Roster | Event roster operations |
| `event_registrations` | Event registrations | Attendee registration for events |
| `attendance` | `/attendance` | Attendance queries, scanning, correction-related workflows, and CSV export |
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
