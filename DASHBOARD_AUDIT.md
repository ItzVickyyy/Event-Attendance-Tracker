# Dashboard Data Flow Audit (Read-Only)

Based on a read-only inspection of the Dashboard (`frontend/src/routes/_layout/index.tsx`) and the generated SDK types, here is the architectural audit of the issues and the recommended data flow under the new Registration-based attendee model.

## 1. Identified Issues (TypeScript & Functional)

- **Wrong Attendance Endpoint (`readAttendance` vs `readAttendances`)**: The Dashboard incorrectly calls `AttendanceService.readAttendance` (singular) for the event instead of `AttendanceService.readAttendances` (plural). The singular endpoint returns a single `AttendancePublic` object (which lacks a `.data` array), causing the `data.attendance.data` TypeScript errors.
- **Missing `student_id` / Unresolved Relationships**: The Recent Scans feed attempts to render `scan.student_id`. Under the normalized schema, `AttendancePublic` only contains a `registration_id`. It does not contain attendee or student information directly.
- **Missing `nfc_registered` flag**: The summary metrics attempt to count `students.filter(s => s.nfc_registered)`. The `StudentPublic` model no longer has this flag since NFC credentials are moved to the `AttendeeCredentials` subsystem.
- **Router Search Typos**: `router.location.search?.event_id` fails because `@tanstack/react-router` requires a `validateSearch` function to strictly type search params.
- **`AddEvent`/`EditEvent` Select callbacks**: The build errors in Event forms are due to passing `form.setValue("...")` directly to `onValueChange` instead of a closure like `(val) => form.setValue("...", val)`. 

## 2. Recommended Data Flow (Registration-Based Model)

Under the normalized architecture (Event -> EventRegistration -> Attendance), the Dashboard should leverage the Roster endpoint for hydration rather than global student lists.

### Step 1: Change the Query Hydration Strategy
The `getDashboardQueryOptions` should fetch the Event Roster rather than pulling all students globally.

### Step 2: Recalculate Metrics using the Roster
- **Total Expected (Roster Size)**: `roster.data.count`
- **Present/Absent**: Compare `attendance.data` against the `roster.data.count`.
- **NFC Metric Drop**: Replace the invalid `nfc_registered` calculation with a count of active `Roster` entries vs global students.

### Step 3: Hydrating "Recent Scans"
For the Recent Scans UI, the `scan.registration_id` must be mapped back to the attendee using the Roster data.
