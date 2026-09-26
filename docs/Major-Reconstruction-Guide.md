# Major Reconstruction Guide
### Event Attendance Tracker — College of Computer Studies

**Status:** Planning locked — ready for implementation breakdown
**Academic Year context:** AY 2026–2027

---

## 1. Purpose of This Reconstruction

The original sitemap treated Students, Parent/Guardian, Faculty, Staff, and Guests as separate top-level record types, and exposed the Scanner only through a manual `?event_id=` URL. This caused two core problems:

1. **Unclear flow** — no single "entry point" object to organize the system around.
2. **No section-awareness** — Students had no grouping, which doesn't match how a college department actually operates (by section, per academic year).

This reconstruction re-centers the system around two real objects: **Students** (grouped by **Section**) and **Events**. Everything else — records, scanning, guardians, admin — hangs off one of those two rather than standing beside them.

---

## 2. Final Sitemap

Role-based access is controlled by **permissions + data scope**, not separate page trees. One sitemap, filtered per role.

```text
EVENT ATTENDANCE TRACKER
│
├── Dashboard
│   ├── Overview
│   ├── Recent Event Overview
│   └── Offline / Sync Status (read-only summary widget)
│
├── Events
│   ├── Event List
│   ├── Create Event
│   ├── Event Details
│   ├── Event Registration      (setup phase — defines eligibility)
│   ├── Event Roster            (live phase — generated attendee list + walk-ins)
│   └── Event Actions
│
├── Sections & Students
│   ├── Global Student Search   (header/dashboard-level, resolves to section)
│   └── Sections
│       ├── Section List         ← entry point, NOT a flat student list
│       └── Section Details
│           ├── Section Information
│           ├── Students
│           │   ├── Student List
│           │   ├── Student Details
│           │   │     ├── Guardian/Parent contact (field group, not a separate module)
│           │   │     ├── Attendance History
│           │   │     └── NFC Credential (issue / reissue / revoke)
│           │   └── (Add / Import / Edit / Remove — Admin only, see §4)
│           └── Section Attendance
│
├── Records
│   ├── Attendance Records
│   ├── Attendance History
│   ├── Incomplete Attendance     (tapped in, never tapped out)
│   └── Export / Print            (XLSX, Word, PDF, printable sheet)
│
├── Scanner                        (its own workspace, not buried in Event Details)
│   ├── Select Event
│   ├── NFC Scanner
│   ├── Manual Entry               (fallback for lost/broken cards)
│   ├── Time-In
│   ├── Time-Out
│   └── Offline / Sync Status      (source of truth — local queue + auto-resume)
│
├── Administration
│   ├── User Accounts
│   ├── Roles & Permissions
│   ├── Attendance Administration  (controlled corrections, audited)
│   ├── Scanner Permissions        (capability grant, independent of role)
│   └── Audit Logs
│
├── System Settings
│   ├── Attendance Rules           (grace period, cutoff — Super Admin only)
│   ├── Time-Out Settings
│   └── Organization Settings
│
└── My Account
    ├── Profile
    ├── Security
    └── Logout
```

### Sitemap decisions log

| Decision | Reasoning |
|---|---|
| Sections are the entry point under Sections & Students | Matches real operation — nobody browses "all 300 students," they browse a section |
| Students live *inside* their section, never as a standalone top-level page | Prevents flat-list clutter, mirrors how rosters are actually used |
| Parent/Guardian is a field group on Student Details, not its own page | It's data *about* a student, not an independent entity to browse |
| Faculty/Staff/Guest dropped as full record modules | No confirmed need for a full CRUD module; occasional non-student attendees are handled as ad-hoc entries on the Event Roster instead |
| Scanner is its own workspace, entry via "Select Event" | Fixes the old hidden-URL problem while keeping scanning fast for repeat use during an event |
| Event Registration vs. Event Roster are two phases, not two features | Registration = eligibility rules (which sections expected). Roster = the generated live list Scanner checks off, plus manual walk-in additions |
| Global Student Search added | Section-first browsing breaks lookups when you don't know the section (lost card, guardian call-in) — search resolves to the student's section |
| Offline/Sync Status appears twice but is one engine | Scanner is where offline queuing actually happens (weak-signal venues); Dashboard just displays a read-only summary of the same queue |

---

## 3. Roles & Scopes

**Model:** `Role → Permissions → Data Scope → Available pages/actions`

| Role | Scope | Main Responsibility |
|---|---|---|
| **Developer** | System-wide / technical | Dev & technical maintenance, not used for normal operations |
| **Super Admin** | Organization-wide | Full control, sensitive settings, high-impact attendance corrections |
| **Admin** | Organization-wide | Day-to-day operation: Dashboard, Events, Sections & Students, Records, Scanner |
| **Class Representative** | **Assigned section only** | Manage their own section's roster hygiene; view attendance; cannot scan |
| **Student** | **Self only** | Optional self-service — view own attendance. Not required for scanning |

### Default landing page per role

- **All roles except Class Representative** → Dashboard
- **Class Representative** → goes straight to **Section Details** for their assigned section (skips Section List entirely — a one-row list is a bad first impression for someone who only ever has one row)

### Class Representative — precise permission boundary

This is the most sensitive scope in the system and is defined narrowly on purpose:

**Can:**
- Edit their own section's info (e.g. section name/label, if permitted)
- Correct student **name/contact typos** within their section
- View who is present/absent for their section's events
- Export attendance as XLSX / Word / etc.
- Print the attendance sheet

**Cannot:**
- Operate the Scanner (view-only, not an operator role)
- Add or remove students from the section (enrollment changes affect org-wide headcounts — stays Admin-only)
- Edit or correct submitted attendance records (routes through Attendance Administration instead, where an Admin/Super Admin is accountable via audit log)
- Access other sections or organization-wide administration

### Scanner Permission — a capability, not a role

Scanner access can be granted independently of base role. Per the source of truth, this is explicitly allowed for:

- Dean
- Student Council Adviser
- Student Council Officer

This must be enforced **server-side**, never hidden purely in the UI.

```text
ROLE
  │
  ├── Determines what the user can access
  └── Determines their normal data scope
          │
          ▼
PERMISSIONS
  │
  ├── Determines what actions they can perform
  └── Can grant specific capabilities (e.g. Scanner access)
          │
          ▼
DATA SCOPE
  │
  ├── Organization-wide
  ├── Section-specific
  └── Self-only
```

---

## 4. Data Model Implications

These follow directly from the sitemap/role decisions above and should be locked before backend work starts.

### Section
- `course`, `year_level`, `block/letter`, `academic_year`, `adviser (optional)`
- `student_count` — computed, not stored
- Sections are **scoped to Academic Year** — a section is duplicated/promoted at year-end (e.g. BSCS 1A → 2A), never edited in place across years
- Status: active / archived (archived at year-end instead of deleted)

### Student
- `student_number`, `name`, `section_id`, `contact_info`
- `guardian_name`, `guardian_contact`, `guardian_relationship` (field group, not separate entity)
- Linked `NFCCredential` (see below)

### NFCCredential
- `card_uid`, `student_id`, `status (active/revoked)`, `issued_at`
- Decoupled from the student record itself so **card replacement doesn't require a data migration** — revoke old, issue new

### Event
- `name`, `date`, `location`, `status`
- `attendance_mode`: **Single Scan (Time-In only)** vs **Time-In/Time-Out** — set per event, not system-wide (a 30-minute assembly doesn't need duration tracking; a full-day seminar might)
- `eligible_sections/courses` (from Event Registration)
- Generated `roster` (from Event Roster) — supports manual walk-in additions

### AttendanceRecord
- `event_id`, `student_id`, `time_in`, `time_out (nullable)`
- `status`: **Present / Late / Excused / Absent / Incomplete**
  - *Incomplete* = tapped in, never tapped out — this is why "Incomplete Attendance" exists as its own view under Records
- Grace period / cutoff rules pulled from System Settings, only apply when `attendance_mode = Time-In/Time-Out`

---

## 5. Open Items Still Needing a Decision

Not yet resolved — flagged here so they aren't silently decided by whoever builds this:

1. **Section rename/edit permissions for Class Rep** — confirm exactly which section fields (name only? adviser? nothing?) they can touch, beyond student name/contact corrections.
2. **Walk-in attendee data retention** — when a non-roster guest is manually added at an event, does that record persist anywhere beyond that single event (e.g. a lightweight "Guest" log), or is it fully ephemeral?
3. **Guardian notification** — is automatic notification (SMS/email) to a guardian on absence an actual goal for this system, or just data-capture for manual follow-up? This affects whether guardian contact needs delivery-integration work at all.
4. **Sync conflict resolution** — if two scanner devices go offline and both queue a scan for the same student/event, how does sync reconcile duplicates on reconnect?

---

*This document reflects all planning decisions made through the sitemap, roles, and content-review discussions. Treat it as the source of truth for the reconstruction — update this file directly if scope changes rather than letting decisions live only in chat.*
