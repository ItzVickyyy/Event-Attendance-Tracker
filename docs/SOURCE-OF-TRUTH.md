# NFC Event Attendance Tracker — Source of Truth / System Specification

## Source of Truth

Status: Planning
Project type: **Web application** (browser-based, not a native mobile app)
Repository: https://github.com/ItzVickyyy/Event-Attendance-Tracker
Base template: Full Stack FastAPI Template (`fastapi/full-stack-fastapi-template`)
Primary goal: Build a practical attendance tracker that uses school IDs
through a phone's browser-based NFC reader, replacing manual paper
sign-in sheets.

> **Architecture change log:** the project was originally scoped as a
> native Android application. As of this revision, it is being built as
> a **website** on top of an already-cloned FastAPI + React template.
> This is a meaningful shift, not a cosmetic one — it changes how NFC
> scanning works (Section 3.1), how offline mode has to be implemented
> (Section 13), and the technology stack (Section 23). Sections below
> have been updated accordingly; anything still referencing "the app" in
> a native-app sense should be read as "the web app."

------------------------------------------------------------------------

## 1. Project Goal

Build an event attendance tracker where a Student Council officer opens
a website on an appropriate device and uses the browser as the attendance
scanner — no separate app install required for the web-based flow.

The intended flow is:

NFC tap OR QR scan OR manual search → System identifies attendee →
System records attendance (time-in or time-out) → Attendance can be
viewed, printed, and exported from the same website

The system should be usable for CCS (College of Computer Studies) events
first, and should be designed from day one so it can later support other
college events and organizations without a rewrite.

### Why this matters (the problem being solved)

Whenever there is an event, students currently have to fall in line to
manually write their name/student number on a paper attendance sheet.
This is slow, creates bottlenecks at entrances, produces sheets that are
hard to read, hard to tally, and hard to turn into a report afterward.
The goal is to cut check-in time per student down to roughly a tap and a
glance (target: under 2 seconds per scan), and to make the resulting data
usable immediately (dashboard, print, export) instead of requiring manual
encoding after the event.

### Non-goals (for the first version)

-   This is not a payment or e-wallet system.
-   This is not a replacement for the official school ID system.
-   This is not intended to read/write protected/encrypted sectors of the
    MIFARE card.
-   This is not, initially, a multi-organization platform — CCS is the
    pilot, other colleges come later.
-   This is not a native mobile app — see Section 3.1 for what that
    trade-off means for NFC scanning.


## 2. Core Idea

The NFC UID is one identifier for a physical school ID. It is not the only way an attendee can be identified.

The student masterlist remains the source of student information for students. Other attendee types (Faculty, Staff, Parent/Guardian, and Guest) may be registered directly for an event with only the information needed for attendance.

The attendance system connects identification methods to an attendee, then connects that attendee to an event and attendance record.

Conceptually:

NFC UID / QR Identifier / Manual Search → Attendee record → Event Registration → Attendance record

The system must not assume that the NFC chip itself contains the
student's name, student number, year, or section. The UID is treated as
an opaque key, nothing more.

## 2.1 Event-Day Attendance Problem and Solution

### Why this matters (the problem being solved)

Whenever there is an event, students currently have to fall in line to manually write their name and student number on a paper attendance sheet. The current process can require students to follow a line assigned to their year level and, after reaching the attendance area, ask for their section and find the paper sheet assigned to that section before writing their information.

This creates several problems:

- Students are forced into specific lines based on year level.
- Students may have to search for the correct section sheet.
- Officers must manage many separate paper sheets at the entrance.
- Handwriting can be difficult to read.
- Paper sheets are slow to tally and consolidate after the event.
- Long lines create bottlenecks at entrances, especially when many students arrive at the same time.

### Proposed solution

The system should allow students and other registered attendees to use **any available attendance line**. They no longer need to choose a line based on year level or find a paper sheet for their section.

An officer simply identifies the attendee using one of the supported methods:

- **NFC** — tap a registered school ID or NFC credential.
- **QR Code** — scan the attendee's QR code.
- **Manual Search** — search and select the attendee when NFC or QR is unavailable.

The system automatically identifies the person, records the attendance against the correct event, and stores the timestamp. The attendee can therefore use any scanner station instead of being directed to a year-level/section-specific paper line.

The goal is not necessarily to eliminate every physical line. Officers may still need to scan people one at a time. The goal is to remove the unnecessary sorting work at the entrance and make every scanner station interchangeable.

### Simple event-day flow

```text
Attendee arrives
       ↓
Choose any available scanner line
       ↓
NFC tap OR QR scan OR Manual Search
       ↓
System identifies attendee
       ↓
System records attendance automatically
       ↓
Attendee proceeds into the event
```

The scanner should immediately return to a **Ready for Next Attendee** state after a successful or rejected scan.

### Example

Instead of: 

```text
Year 1 Line → Find Section 1A Paper → Write Name
Year 2 Line → Find Section 2B Paper → Write Name
Year 3 Line → Find Section 3A Paper → Write Name
Year 4 Line → Find Section 4C Paper → Write Name
```

the new process is:

```text
Any Line → Scan/Tap → System finds the person → Attendance recorded
```

This is the core operational benefit of the system during an event.

------------------------------------------------------------------------

## 2.2 Attendee Types

The system should not be designed only around students. The core attendance model should support multiple types of people who may attend an event:

- **Student** — a currently enrolled student and the primary NFC school-ID user.
- **Faculty** — teaching or academic personnel attending an event.
- **Staff** — non-faculty school personnel or authorized staff members.
- **Parent/Guardian** — a parent or guardian attending with or in relation to a student.
- **Guest** — an event guest who is not a student, faculty member, staff member, or parent/guardian.

These are attendee classifications, not separate attendance systems. All attendee types should use the same event registration and attendance infrastructure.

Conceptually:

```text
Attendee
├── Student
├── Faculty
├── Staff
├── Parent/Guardian
└── Guest
```

### Parent/Guardian relationship

A Parent/Guardian should be represented as a separate attendee, while optionally being linked to the student they are accompanying.

Example:

```text
Student: Juan Dela Cruz
        ↓
Parent/Guardian: Maria Dela Cruz
Relationship: Mother
```

The relationship should support values such as Mother, Father, Guardian, Grandparent, Sibling, or Other.

A Parent/Guardian should **not** be required to create a system login simply to attend an event. They may be registered as an event attendee without having an authenticated user account.

### Independent attendance

Every attendee must have an independent attendance record. A student's attendance must not automatically mark their Parent/Guardian, and a Parent/Guardian's attendance must not automatically mark the student.

Example:

```text
Juan Dela Cruz     → Present at 8:15 AM
Maria Dela Cruz    → Present at 8:18 AM
```

If Juan arrives but Maria does not, the system must record only Juan as present.

------------------------------------------------------------------------

## 2.3 Multi-Method Attendee Identification

The system should be a **multi-method event attendance system**, not an NFC-only or QR-only system. NFC, QR, and manual search are identification methods that resolve to the same attendee and the same attendance record.

Conceptually:

```text
NFC ────────┐
QR Code ────┼──→ Identify Attendee → Validate → Record Attendance
Manual ─────┘
```

### NFC

NFC is the preferred fast path for attendees who have a registered NFC credential. For students, the existing plan uses the physical school ID's NFC UID as the identifier.

NFC scanning should continue to follow the Web NFC constraints already documented in Section 3.1.

### QR Code

QR should be supported as another identification method. A registered attendee may be assigned a unique QR code that resolves to their attendee record.

QR codes are particularly useful for:

- Parent/Guardian attendees who do not have a school NFC ID.
- Guests who do not have a school NFC ID.
- Faculty or Staff who are not using a supported NFC credential.
- Backup identification when an NFC credential is unavailable.

The QR code should identify the attendee; it should not contain unnecessary personal information.

### Manual Search

Manual search remains a first-class fallback, not an emergency-only feature. It should be available when:

- An attendee forgot their ID.
- An NFC credential is unreadable.
- A QR code is unavailable or cannot be scanned.
- The officer's device does not support NFC.
- A Parent/Guardian or Guest has not been assigned an NFC credential.

The officer searches for the attendee, confirms the correct record, and records attendance.

### One attendee, multiple identification methods

An attendee may have more than one identification method. For example:

```text
Maria Dela Cruz
Parent/Guardian
├── QR Code: available
└── NFC Credential: optional
```

Both methods must resolve to the **same attendee**. Scanning the QR and then tapping NFC must not create two attendance records. Duplicate-prevention rules apply regardless of the identification method used.

Attendance records should store the method used, such as:

- `nfc`
- `qr`
- `manual`

This allows event organizers to see how attendance was collected and how often fallback methods were required.

------------------------------------------------------------------------

## 2.4 Event-Day Scanner Experience

The Scanner page should be designed for speed and simplicity. Officers should not need to understand the attendee's year level, section, or paper-sheet location before checking them in.

The scanner should provide three clear paths:

```text
┌─────────────────────────────────────┐
│          EVENT CHECK-IN             │
│                                     │
│  📳 Tap NFC                         │
│  📱 Scan QR                         │
│  🔍 Search Attendee                 │
│                                     │
└─────────────────────────────────────┘
```

### Successful identification

The system should briefly display the person's relevant information before or while confirming the attendance action:

```text
✓ CHECK-IN SUCCESSFUL

Maria Dela Cruz
PARENT/GUARDIAN

Linked Student: Juan Dela Cruz
Relationship: Mother

Time: 8:18 AM

READY FOR NEXT ATTENDEE
```

For a student:

```text
✓ CHECK-IN SUCCESSFUL

Juan Dela Cruz
STUDENT
BSIT 3A

Time: 8:15 AM

READY FOR NEXT ATTENDEE
```

### Duplicate identification

If the same attendee is scanned again during a time-in-only event, the system should show the existing attendance rather than creating another record:

```text
⚠ ALREADY RECORDED

Juan Dela Cruz
Checked in: 8:15 AM

READY FOR NEXT ATTENDEE
```

The same duplicate-prevention logic must apply whether the person was identified by NFC, QR, or manual search.

------------------------------------------------------------------------

## 2.5 Attendee Data Model Direction

The existing student-focused design should be expanded into a general attendee model without removing the separate Student database concept.

The recommended normalized conceptual structure is:

```text
People
├── Students ──→ Academic Sections ──→ Academic Programs
│
└── Attendees
     ├── Credentials (NFC / QR)
     └── Relationships ──→ Students

Attendees ──→ Event Registrations ──→ Attendance
```

For students, the attendee record references the student's person record rather than duplicating the entire masterlist. Identification credentials, parent/guardian relationships, event registration, and attendance are stored in their own related tables.

For Parent/Guardian attendees, the system should store the minimum information required for event attendance, such as:

- Full name
- Relationship to student
- Linked student, when applicable
- Contact information only when genuinely needed by an event feature
- QR/NFC identifier when assigned

For Faculty, Staff, and Guests, the system should likewise collect only the information required to register and identify them for the event.

### Event registration

Registration should connect an attendee to a specific event. This keeps the person's identity separate from their attendance at any one event.

Conceptually:

```text
Person / Attendee
       ↓
Event Registration
       ↓
Attendance Record
```

This allows the same person to attend multiple events without creating a new permanent person record every time.

------------------------------------------------------------------------

## 2.6 Parent/Guardian Event-Day Flow

Parent/Guardian support should follow the same scanner flow as other attendees.

### Before the event

1. Student registers for the event.
2. Registration asks whether a Parent/Guardian will attend.
3. If yes, the Parent/Guardian is registered as a separate attendee.
4. The system links the Parent/Guardian to the student.
5. The system provides a QR code and/or NFC credential when applicable.

### During the event

```text
Parent/Guardian arrives
        ↓
Uses any available scanner line
        ↓
QR / NFC / Manual Search
        ↓
System identifies Parent/Guardian
        ↓
System displays linked student
        ↓
Attendance recorded
```

The Parent/Guardian does not need to find the student's year-level line or section sheet.

### Important rule

Parent/Guardian attendance is always independent from student attendance. The system should be able to answer:

- Is the student present?
- Is the Parent/Guardian present?
- What time did each person arrive?
- Which identification method was used?

------------------------------------------------------------------------

## 2.7 Event-Day Dashboard by Attendee Type

The live dashboard should be able to summarize attendance across all attendee types.

Example:

```text
EVENT ATTENDANCE

Total Registered: 500
Present:          327

Students          215 / 300
Faculty            42 / 50
Staff              35 / 40
Parents/Guardians  30 / 80
Guests              5 / 30
```

Organizers should also be able to filter the live attendance list by attendee type.

Useful filters include:

- Attendee Type
- Name
- Student Number, for students
- Year & Section, for students
- Linked Student, for Parent/Guardian attendees
- Attendance Status
- Identification Method

------------------------------------------------------------------------

## 2.8 Attendance Hardware and Operational Principle

The system should not force the event organizer to use one specific identification technology. The goal is to make the **scanner station** flexible.

A station may support:

```text
NFC + QR + Manual Search
```

or, depending on the available device and event setup:

```text
QR + Manual Search
```

or:

```text
NFC + Manual Search
```

All stations should connect to the same event and use the same attendance rules.

This means an event can deploy multiple scanner stations and allow attendees to use any station. The backend must safely handle simultaneous scans and prevent duplicate records, as already required by Section 12.

The existing Web NFC limitations remain unchanged: NFC scanning from the website requires a supported Android/Chromium environment. QR and manual search provide important alternatives for unsupported devices and attendee types without NFC credentials.

------------------------------------------------------------------------

------------------------------------------------------------------------


------------------------------------------------------------------------

## 3. Current NFC Discovery

A school ID was tested using an NFC-capable phone.

The scan reported:

-   Tag type: ISO 14443-3A
-   Chip: NXP MIFARE Classic 1K
-   UID observed during testing: 8F:49:5B:74
-   ATQA: 0x0004
-   SAK: 0x08
-   Memory: 1 KB
-   Technologies: MifareClassic, NfcA, NdefFormatable

This confirms that the phone can detect the school's NFC ID.

The UID is currently the most useful value for the attendance prototype.

Important: Do not write to, format, or modify the school ID while
testing.

### Technical notes and risks to keep in mind

-   MIFARE Classic UIDs are normally factory-set and **read-only** on
    genuine cards, but low-cost "magic"/UID-changeable clone cards exist
    that allow the UID to be rewritten. Since school IDs are presumably
    issued through the school (not self-purchased blanks), this risk is
    low but worth being aware of if IDs are ever lost/replaced informally.
-   A 4-byte UID (as observed: `8F:49:5B:74`) is standard for MIFARE
    Classic 1K and is unique per card from the manufacturer, which is
    good enough for this use case — the system does not need to read
    protected sectors, only the UID broadcast during anti-collision.
-   The UID is exposed at the ISO 14443-3A level before any sector-level
    authentication happens, which is why it's readable without keys or
    cracking anything — this keeps the project inside "authorized NFC
    reading" (see Section 24). No keys, no bypassing, no writing.
-   UID collisions across the whole student population are astronomically
    unlikely (4-byte UID space), but the system should still enforce
    uniqueness of the NFC credential value at the database level and fail
    loudly (not silently) if a duplicate is ever detected during registration.

### 3.1 Reading the UID from a website (Web NFC API)

Since this is now a website rather than a native Android app, NFC
scanning has to go through the browser's **Web NFC API**
(`NDEFReader`), not Android's native NFC APIs. This is good news and bad
news:

**Good news:** Web NFC's reading event exposes a `serialNumber`
property — the tag's UID, formatted exactly like what was observed in
testing (e.g. `8F:49:5B:74`). So the core plan (scan → get UID → look up
student) works essentially unchanged, just from JavaScript in the
browser instead of a native Android app.

**Bad news — real constraints to design around:**

-   **Chromium-on-Android only.** Web NFC ships only in Chromium-based
    browsers on Android — Chrome, Samsung Internet, Edge, Opera for
    Android. It does **not** work in Safari on iOS/iPadOS/macOS, does
    not work in desktop Chrome/Edge/Firefox even with an NFC reader
    attached, and does not work in Firefox for Android. In practice: the
    scanning officer's phone must be Android, and they must use a
    Chromium-based mobile browser.
-   **HTTPS required.** Web NFC only works in a secure context. The
    deployed site must be served over HTTPS (the template's Traefik
    reverse proxy with automatic HTTPS covers this in production; local
    dev over plain HTTP will need a workaround like a tunneled HTTPS URL
    or `localhost`, which browsers treat as secure).
-   **Explicit permission + user gesture.** The browser will prompt for
    NFC permission, and scanning typically needs to be kicked off from a
    user action (e.g., tapping "Start Scanning") rather than starting
    automatically on page load.
-   **Foreground-tab requirement.** Scanning generally only works while
    the page is open and active in the foreground — the officer can't
    background the browser tab and expect scans to keep registering.
    This has implications for the offline-mode design (Section 13):
    "offline" here means "the scanning page still works and queues data
    without a network connection," not "scanning happens with the phone
    locked in someone's pocket."
-   **Experimental/unstable spec.** Web NFC is still marked experimental
    by browser vendors. Behavior should be verified directly on the
    actual target devices/Chrome versions officers will use, not assumed
    from documentation alone, and a fallback path (Section 8.1) is not
    optional — it's required.

**Practical device requirement to write down explicitly:** every officer
who will scan attendance needs an NFC-capable **Android** phone running a
recent version of **Chrome (or another Chromium-based Android browser)**.
This should be confirmed for the CCS officer team before relying on
NFC scanning for a real event — see Section 22 (org roster) for who that
covers.

------------------------------------------------------------------------

## 4. Student Data Available

A college student masterlist is already available.

The masterlist includes:

-   Student Number
-   Complete Name
-   Year & Section
-   Birthday
-   Other student information

Only the information necessary for attendance should be imported into
the attendance system.

The complete original masterlist should remain separate from the
application's operational database where practical.

### Data minimization checklist

Fields the attendance app actually needs:

-   Student Number ✅
-   Complete Name ✅
-   Year & Section ✅

Fields the attendance app should **not** import unless a real feature
needs them:

-   Birthday ❌ (no attendance feature currently needs it)
-   Home address, contact numbers, guardian info, etc. ❌
-   Any other personal data not directly tied to identifying a student in
    the attendance list ❌

If a future feature genuinely needs a field (e.g., birthday for a
"today's birthdays" widget), that decision and its justification should
be written down before the field is imported.

------------------------------------------------------------------------

## 5. Student Database Plan

The application should have its own student database, modeled with
**SQLModel** (per the FastAPI template's ORM choice) and stored in
**PostgreSQL**.

The database must follow **relational database normalization principles,
with the operational schema designed to satisfy at least Third Normal Form
(3NF)**. The purpose is to avoid duplicated student, section, attendee,
event, credential, and attendance data while keeping relationships explicit.

### Normalization requirements

The database design must follow these rules:

1. **One fact is stored in one appropriate place.** For example, a student's
   name belongs to the person/student data, while an event's name belongs to
   the event table and should not be copied into every attendance row.
2. **No repeating groups or comma-separated values.** A student must not have
   fields such as `event_ids = "1,2,3"` or `qr_codes = "A,B"`.
3. **Use primary keys and foreign keys for relationships.** Related records
   should reference IDs instead of duplicating descriptive data.
4. **Keep many-to-many relationships in junction tables.** Student/event
   participation is represented by `event_registrations`, not repeated event
   columns on `students`.
5. **Separate identification credentials from the person record.** NFC and QR
   are identification methods and may change or exist in multiples; they
   should not require duplicated person records.
6. **Separate event registration from attendance.** Registration answers
   "who is expected/allowed to attend this event?" while attendance answers
   "what happened when this attendee arrived?".
7. **Avoid storing derived values as authoritative data.** Dashboard totals,
   attendance rates, and present/absent counts should be calculated from
   registrations and attendance records rather than manually stored and
   updated in multiple places.
8. **Use nullable foreign keys only when the relationship is genuinely
   optional.** For example, a Parent/Guardian may optionally be linked to a
   student depending on the event.
9. **Do not duplicate student information in Parent/Guardian, Faculty, Staff,
   or Guest records.** Store the person once and represent relationships
   through foreign keys.

### Normalized academic structure

Year and section information should not be repeated as free-text fields on
every student row. Instead, use a normalized academic section table.

Conceptually:

```text
Academic Program
    ↓
Academic Section
    ↓
Student
```

Recommended tables/fields:

**academic_programs**

- `program_id` (PK)
- `program_code` (unique, e.g. `BSIT`, `BSCS`)
- `program_name`

**academic_sections**

- `section_id` (PK)
- `program_id` (FK → `academic_programs.program_id`)
- `year_level`
- `section_name`
- `academic_year`

A uniqueness constraint should prevent duplicate sections for the same
program, year level, section name, and academic year.

### Students

The student table should contain student-specific facts only:

**students**

- `student_id` (PK)
- `person_id` (FK → `people.person_id`, unique)
- `student_number` (unique)
- `section_id` (FK → `academic_sections.section_id`)
- `created_at`
- `updated_at`

The student's name should not be repeated in `students` if it already exists
in `people`. Year, program, and section should be obtained through the
`section_id` relationship.

Example normalized relationship:

```text
Person
  ↓
Student → Academic Section → Academic Program
```

The database may use a staging table for masterlist imports, but staging data
must be validated before it is promoted into the normalized operational
schema.

### Import process (masterlist → app database)

1. Export/obtain the masterlist as CSV or Excel from whoever maintains it.
2. Import the raw file into a **staging table** that is separate from the
   operational tables.
3. Validate required fields and detect duplicate student numbers.
4. Normalize program and section values against `academic_programs` and
   `academic_sections` instead of copying the same text into every student.
5. Create or update the corresponding `people` record.
6. Create or update the corresponding `students` record using foreign keys.
7. Flag rows that fail validation for manual review instead of silently
   dropping or importing them.
8. Keep the original masterlist archived outside the operational database for
   audit/re-import purposes.

Most students may initially have no NFC credential. That is acceptable.
NFC registration is handled separately from the student masterlist.

------------------------------------------------------------------------

## 10. Attendance Database

The attendance database must use a **normalized relational structure**. The
schema should target **Third Normal Form (3NF)**: each table represents one
subject/fact set, non-key attributes depend on the key, and relationships
between entities are represented with foreign keys or junction tables.

The recommended operational model is:

```text
Organization
    │
    ├── Users
    │
    └── Events
           │
           └── Event Registrations ─── Attendees ─── People
                                      │       │
                                      │       ├── Student (optional)
                                      │       └── Credentials
                                      │
                                      └── Parent/Guardian Relationships

Event Registration
        ↓
Attendance
```

### 10.1 People

**people** stores identity/contact facts that are common to a person,
regardless of attendee type.

Fields:

- `person_id` (PK)
- `first_name`
- `middle_name` (nullable)
- `last_name`
- `name_extension` (nullable)
- `contact_number` (nullable)
- `email` (nullable)
- `created_at`
- `updated_at`

Do not store attendee type, event, attendance status, NFC UID, or QR code in
this table because those facts belong to other relationships.

### 10.2 Academic Programs and Sections

**academic_programs**

- `program_id` (PK)
- `program_code` (unique)
- `program_name`

**academic_sections**

- `section_id` (PK)
- `program_id` (FK → `academic_programs.program_id`)
- `year_level`
- `section_name`
- `academic_year`

These tables prevent repeating values such as `BSIT`, `BSCS`, `3rd Year`, or
`3A` across every student row.

### 10.3 Students

**students** contains only student-specific information.

Fields:

- `student_id` (PK)
- `person_id` (FK → `people.person_id`, unique)
- `student_number` (unique)
- `section_id` (FK → `academic_sections.section_id`)
- `created_at`
- `updated_at`

Student number remains the primary business identifier for student lookup,
while `student_id` is the internal relational primary key.

### 10.4 Attendees

**attendees** represents a person participating in the attendance system.
It should not duplicate the person's name.

Fields:

- `attendee_id` (PK)
- `person_id` (FK → `people.person_id`, unique)
- `attendee_type` (`student` | `faculty` | `staff` | `parent_guardian` | `guest`)
- `created_at`
- `updated_at`

For the current scope, one person has one attendee record. If future
requirements allow one person to participate in multiple roles, the design
can be extended with a separate attendee-role junction table rather than
adding multiple role columns.

For students, the attendee is linked to the student's `person_id`; the
student-specific record remains in `students`.

### 10.5 Parent/Guardian Relationships

Parent/Guardian relationships must be stored separately from the attendee
record because the same relationship can connect two existing people and
should not be embedded as repeated student/parent fields.

**attendee_relationships**

- `relationship_id` (PK)
- `attendee_id` (FK → `attendees.attendee_id`)
- `related_student_id` (FK → `students.student_id`)
- `relationship_type` (`mother` | `father` | `guardian` | `grandparent` | `sibling` | `other`)
- `created_at`

A database constraint should ensure that the relationship is only used for a
Parent/Guardian attendee when required by the business rules.

This means:

```text
Parent/Guardian Attendee
        ↓
Attendee Relationship
        ↓
Student
```

The student's name and the Parent/Guardian's name are not duplicated into
the relationship table.

### 10.6 Identification Credentials

NFC and QR codes are identification methods, not separate attendee types.
They should be stored in a normalized credential table so one attendee can
have multiple credentials and credentials can be replaced without changing
the person record.

**attendee_credentials**

- `credential_id` (PK)
- `attendee_id` (FK → `attendees.attendee_id`)
- `credential_type` (`nfc` | `qr`)
- `credential_value` (unique)
- `is_active`
- `created_at`
- `updated_at`

Examples:

```text
Attendee A → NFC → UID-001
Attendee A → QR  → QR-ABC123
```

The database must enforce uniqueness of the credential value so the same
NFC UID or QR identifier cannot identify two active attendees.

This replaces the denormalized approach of putting `nfc_uid` and
`qr_identifier` directly on the attendee/person row.

### 10.7 Events

**events** contains facts about an event only.

Fields:

- `event_id` (PK)
- `event_name`
- `event_date`
- `start_time`
- `end_time`
- `attendance_mode` (`time_in_only` | `time_in_time_out`)
- `organization_id` (FK → `organizations.organization_id`)
- `status` (`draft` | `open` | `closed`)
- `created_at`
- `updated_at`

The organizer/organization name should not be copied into every event or
attendance row. It should be resolved through the organization relationship.

### 10.8 Organizations

**organizations** supports the current CCS scope while keeping the database
ready for future multi-organization use.

Fields:

- `organization_id` (PK)
- `organization_name` (unique)
- `created_at`
- `updated_at`

### 10.9 Event Registrations

**event_registrations** is the junction table between attendees and events.
It represents expected/allowed participation and keeps registration separate
from actual attendance.

Fields:

- `registration_id` (PK)
- `event_id` (FK → `events.event_id`)
- `attendee_id` (FK → `attendees.attendee_id`)
- `registration_status` (e.g. `registered` | `cancelled`)
- `registered_at`
- `created_at`
- `updated_at`

A unique constraint on `(event_id, attendee_id)` must prevent duplicate
registrations for the same attendee and event.

### 10.10 Attendance

**attendance** stores what happened during the event. It should reference
the event registration rather than repeating attendee/event identity data.

Fields:

- `attendance_id` (PK)
- `registration_id` (FK → `event_registrations.registration_id`, unique)
- `time_in`
- `time_out` (nullable)
- `status` (`present` | `time_in_only` | `completed` | `incomplete`)
- `scan_method` (`nfc` | `qr` | `manual`)
- `scanned_by` (FK → `users.id`, nullable when a controlled offline import
  requires it)
- `created_at`
- `updated_at`

The unique `registration_id` constraint means there is at most one canonical
attendance record per attendee per event. Time-in and time-out are state
changes to that attendance record, not separate duplicate attendance rows.

### 10.11 Attendance Audit / Corrections

If an authorized officer corrects an attendance record, the correction should
be stored in a separate audit table rather than overwriting history without a
record of what happened.

**attendance_corrections**

- `correction_id` (PK)
- `attendance_id` (FK → `attendance.attendance_id`)
- `corrected_by` (FK → `users.id`)
- `reason`
- `old_time_in` (nullable)
- `new_time_in` (nullable)
- `old_time_out` (nullable)
- `new_time_out` (nullable)
- `old_status` (nullable)
- `new_status` (nullable)
- `corrected_at`

This preserves an auditable history without storing multiple conflicting
"current" values in the attendance table.

### 10.12 Normalized relationship summary

```text
organizations
    └── events
          └── event_registrations
                └── attendance

people
    ├── students
    │     └── academic_sections
    │            └── academic_programs
    │
    └── attendees
          ├── attendee_credentials
          └── attendee_relationships ─── students

users ─── attendance.scanned_by
users ─── attendance_corrections.corrected_by
```

### 10.13 Normalization acceptance criteria

The implementation is considered normalized when:

- A person's name is stored once and referenced by ID.
- Student program/year/section data is represented through normalized
  academic tables rather than repeated text on every student.
- NFC/QR credentials are stored in a dedicated credential table.
- Parent/Guardian-to-student links are stored in a relationship table.
- Event participation is stored in `event_registrations`.
- Attendance references the registration and does not repeat event/person
  details.
- Attendance dashboards calculate totals from normalized records.
- Duplicate registrations and duplicate credentials are prevented with
  database-level unique constraints.
- Foreign-key constraints protect referential integrity.
- Deletion/update behavior is explicitly defined for related records rather
  than relying on accidental database behavior.

This normalized structure should be treated as the database design direction
for the implementation. SQLModel models, Pydantic schemas, CRUD operations,
API endpoints, migrations, seed data, and tests should follow these same
relationships rather than introducing denormalized convenience fields.

------------------------------------------------------------------------

## 11. Duplicate Scan Prevention

The system should prevent accidental duplicate attendance.

Rules depend on the event's attendance mode:

-   **Time-in only events**: if a student taps again after already being
    marked present, the system shows "Already Recorded" with the original
    timestamp. No new record is created.
-   **Time-in + time-out events**: the *first* tap after having no record
    is time-in. The *second* tap is time-out. A *third* tap (after both
    are filled) shows "Already Completed" with both timestamps — it does
    not overwrite the time-out.

Example:

First scan: ✓ Time-In Recorded — 08:42:15 AM

Second scan (same event): ✓ Time-Out Recorded — 11:58:40 AM

Third scan (same event): Already Completed — In: 08:42:15 AM / Out:
11:58:40 AM

The system should not create multiple attendance records for the same
student and event unless an authorized staff function explicitly allows
it — for example, a manual "correct this record" action performed by an
Admin or higher (Section 21), which should be logged
(who changed it, old value, new value, when).

------------------------------------------------------------------------

## 12. Multi-Scanner Support

Because this is a website rather than a single native app installation,
multiple officers can independently open the Scanner page from their own
phones at the same time, all pointed at the same event. This is
effectively "free" multi-device support compared to the original
native-app plan, as long as the backend correctly handles concurrent
writes:

-   Each attendance record captures `scanned_by` (which officer's account
    made the scan) for accountability.
-   The **earliest timestamp wins** if, in a race condition, two officers
    somehow submit a time-in (or time-out) for the same student within
    the same event at nearly the same moment — the backend should treat
    the attendance record as already-existing for the second request and
    return "Already Recorded" rather than creating a duplicate row.
-   This should be enforced with a database-level uniqueness constraint
    on (event_id, student_id, type of record) rather than relying purely
    on application logic, to close the race condition properly.

------------------------------------------------------------------------

## 13. Offline Support and Sync

Officers may be scanning at venues with poor or no internet connectivity
(gyms, open grounds, buildings with weak WiFi). Since this is now a
website rather than a native app with its own local database, offline
support needs to be implemented as a **Progressive Web App (PWA)**
rather than assumed "for free."

### What changes moving from native app to website

The original plan assumed a native Android app with its own SQLite/Room
database as the source of truth during scanning, syncing to a central
server later. A website does not get that behavior automatically — a
plain web page with no special handling simply fails to load or fails to
submit data when there's no connection. To get equivalent offline
behavior, the frontend needs:

-   A **service worker** (installable via the Vite PWA plugin or similar,
    since the template's frontend is Vite-based) that caches the
    Scanner page's static assets (HTML/CSS/JS) so the page itself still
    loads with no connection.
-   **IndexedDB** (browser-native local database) to store the event's
    student roster locally (downloaded while online, before scanning
    starts) and to queue attendance records written while offline.
-   A **background sync** mechanism that detects when connectivity
    returns and pushes queued attendance records to the FastAPI backend.

This is a real, non-trivial piece of engineering that the original
native-app plan got closer to "for free" — it should be scoped and
estimated as its own work item, not assumed to fall out of the FastAPI
template.

### Design principle (unchanged intent, different implementation)

The phone's **local (IndexedDB) data is the source of truth during an
event**. The PostgreSQL backend is a synchronized copy, not a dependency
for real-time scanning during the event itself. This means:

-   The event's student roster should be downloaded/cached to the browser
    **before** the event starts (e.g., when the officer opens the event
    page while still online), so lookups never need a live connection
    mid-event.
-   New attendance records are written to IndexedDB first, then queued
    for sync — the same tap-and-confirm UX should work identically
    online or offline from the officer's point of view.

### Sync flow

1.  Attendance records are created locally (IndexedDB) and marked
    `synced = false`.
2.  When the browser detects connectivity (via the Background Sync API
    or a simpler periodic retry), a sync process uploads unsynced records
    to the FastAPI backend.
3.  On a successful `2xx` response, the local record is marked
    `synced = true`.
4.  If the upload fails (e.g., connection drops mid-sync), the record
    stays queued and retries later — no data is lost or silently
    discarded.
5.  Officers should be able to see a simple sync status indicator on the
    Scanner page (e.g., "12 records pending sync" / "All synced ✓") so
    they know the state of their data without needing to dig into
    dev tools.

### Multi-device conflict handling

Ties directly into Section 12 — the backend's uniqueness constraint on
(event_id, student_id, record type) is what actually resolves conflicts
when multiple officers' queued offline records sync at overlapping
times. The **earliest timestamp wins**; the losing duplicate is kept in a
conflict log rather than silently discarded, so officers can review what
happened if numbers look off.

### What "offline" does NOT need to support

-   Creating a *new event* fully offline is a nice-to-have, not a
    requirement — events are typically planned ahead of time while
    online. The critical offline requirement is *scanning attendance for
    an already-downloaded event*.
-   Exporting reports offline is possible in principle (the browser has
    the data locally in IndexedDB) but is a lower priority than exports
    generated from the fully-synced PostgreSQL database, since other
    officers' devices may not have synced yet. Treat "export" as an
    online, backend-driven feature for the first version.
-   Remember Section 3.1's foreground-tab constraint: offline mode covers
    "no internet connection," not "browser tab closed or backgrounded."
    Web NFC scanning still requires the page to be open and active.

------------------------------------------------------------------------

## 14. No NFC ID — cross-reference

See Section 8 above; the manual entry path also serves as the fallback
whenever a device simply cannot run Web NFC at all (Section 8.1).

------------------------------------------------------------------------

## 15. Attendance Dashboard (for Student Council Officers)

The dashboard is the primary tool officers use before, during, and after
an event.

### Before the event

-   List of upcoming/draft events.
-   Quick access to "download student list for offline use" per event
    (triggers the IndexedDB caching described in Section 13).
-   Registration progress: how many students have a registered NFC UID
    out of total students (helps gauge readiness).

### During the event (live view)

-   Running count: Total expected, Present, Not yet arrived.
-   For time-in + time-out events: additional counts for Currently In
    (timed in, not yet out) vs. Completed (timed in and out).
-   Recent scans feed (last N check-ins, newest first) so an officer can
    spot-check without scrolling through the full list.
-   Sync status indicator (see Section 13).

### After the event

-   Total registered/expected, Present count, Absent count, Attendance
    rate (%).
-   For time-in + time-out events: average duration stayed, list of
    incomplete records (timed in but never timed out) flagged for
    officer follow-up.
-   Search/filter by Year, Section, or name within the event's attendance
    list.
-   Per-student attendance history across multiple events (useful for
    org membership/requirement tracking, e.g., "attended 4 of 5 required
    events").
-   Manual correction tool (with the audit logging described in Section
    11) for fixing mistaken entries.

Per the officer roster document, the dashboard should expose (at
minimum) **Dashboard, Events, Students, Records, and Scanner** as
distinct sections for Admin accounts — see Section 21.

------------------------------------------------------------------------

## 16. Printing and Exporting

Attendance data needs to leave the app in forms officers and advisers
actually use: spreadsheets for tallying, Word docs for reports that need
letterheads/signatures, PDFs for printing/archiving, and quick printouts
posted on a corkboard or handed to an adviser.

### Supported export formats

-   **Excel (.xlsx)** — primary format for further tallying/analysis.
    Columns: Student Number, Name, Year & Section, Time-In, Time-Out (if
    applicable), Duration, Status, Scan Method.
-   **CSV** — lightweight, universal, good for importing into other
    tools or the school's own systems.
-   **Word (.docx)** — for formal attendance reports that may need a
    letterhead, event details header, and a signature block (e.g., "Noted
    by: [Adviser Name]").
-   **PDF** — for archiving and for printing; should look correct without
    requiring the recipient to have Excel/Word installed.

Since the backend is Python/FastAPI, these can be generated server-side
(e.g., `openpyxl` for Excel, `python-docx` for Word, a PDF library such
as `WeasyPrint` or `reportlab`) and served as a downloadable file from a
dedicated export endpoint — this fits naturally into the FastAPI
template's existing API-route structure.

### Report contents (typical export)

Header block:

Event: CCS Week 2026
Date: [event date] — Time: [start] to [end]
Attendance Mode: Time-In + Time-Out

Summary:

Total Students: 520 — Present: 387 — Absent: 133 — Attendance Rate: 74.4%

Then the detailed per-student table (Student Number, Name, Year &
Section, Time-In, Time-Out, Duration, Status).

### Printable attendance sheets

Two distinct printable needs, which should both be supported:

1.  **Pre-event blank/manual backup sheet** — a printable PDF listing all
    expected students with blank Time-In/Time-Out columns, for the rare
    case the website or an officer's phone is unavailable and officers
    must fall back to paper temporarily. Generated from the roster before
    the event.
2.  **Post-event filled report** — the completed attendance data printed
    directly from the export (PDF/Word), formatted to fit standard paper
    (Letter or A4), with reasonable margins and a signature line, ready
    to be handed to an adviser or filed.

Since this is a website, "print" can also just mean a browser-native
print stylesheet (`@media print` CSS) on the dashboard's report view, in
addition to the downloadable PDF/Word export — this is a cheap addition
worth including alongside the file-based exports.

------------------------------------------------------------------------

## 17. School API Option

A possible future integration is an API from the school's existing
student or ID system.

Because the project is intended for school events and there may be an
opportunity to coordinate with the Dean, ask whether the existing ID
system provides an API or another authorized integration method.

Questions to ask:

1.  Does the current school ID system have an API?
2.  Can an authorized application submit an NFC UID and receive the
    corresponding student record?
3.  Is there an existing mapping between NFC UID and Student Number?
4.  Can the system provide a read-only API?
5.  Can access be restricted to an authorized application?
6.  Is there existing documentation for integrating with the student/ID
    system?

Do not assume an API exists until the school confirms it.

------------------------------------------------------------------------

## 18. API Integration Architecture

If the school provides an API, the FastAPI backend can call it
server-side to identify students.

Possible flow:

NFC UID → FastAPI backend → School API → Student Number / Student Record
→ Attendance System

Example conceptual request:

GET student information using NFC UID

Possible response:

-   Student Number
-   Name
-   Year
-   Section

The exact endpoint, authentication, response format, and permissions
depend entirely on the school's actual system.

The API should ideally be read-only for this project.

------------------------------------------------------------------------

## 19. API Fallback

The application should not depend completely on the school API.

Preferred lookup order:

1.  School API, if available and authorized
2.  Local application database (PostgreSQL)
3.  Manual student lookup and NFC registration

This ensures the attendance system can continue working even if the API
is unavailable, and it stays consistent with the offline-first design in
Section 13 — the API, if it ever exists, is just another data source
that gets cached locally, not a new hard dependency.

------------------------------------------------------------------------

## 20. Phone as the NFC Scanner

The intended hardware setup is a normal NFC-capable Android phone, used
through its browser — no dedicated NFC reader and no separate app
install required for the first version (see Section 3.1 for the Web NFC
constraints this depends on).

Basic setup:

Android phone → Chrome (or another Chromium-based browser) → Website →
NFC enabled → Student taps school ID

The first technical proof of concept should verify that the website can
consistently receive the NFC UID from the school ID via `NDEFReader`, on
the actual phones officers will use.

------------------------------------------------------------------------

## 21. Roles and Access Control

The system uses the following roles only. No additional role names should be introduced unless this Source of Truth is explicitly revised.

### Developer

Technical/system-level access for maintaining the application infrastructure and implementation. This role is separate from normal attendance operations and should not be treated as an ordinary dashboard operator.

### Super Admin

Highest application-administration role. Has full access to application management, organization-wide attendance operations, users/roles, system settings, audit logs, data correction, and other administrative functions. The Super Admin can adjust event attendance rules such as the Time-Out cutoff/grace period and can authorize attendance corrections.

### Admin

Day-to-day organization-wide operator. Has access to Dashboard, Events, Students, Records, and Scanner, plus operational attendance management. Admin can manage the masterlist, register/reassign NFC UIDs, operate scanners, and perform permitted attendance administration. Sensitive system-level settings and Super Admin-only controls remain restricted.

### Class Representative

Section-scoped role. A Class Representative may manage students and attendance-related information for their own assigned section, subject to the permissions defined for that section. They cannot access organization-wide administration or other sections unless explicitly granted a separate permission.

### Student

Represents the student record in the system. A student account is not required for the core attendance flow. Student-facing/self-service features are optional and must not be required for NFC scanning, manual attendance, or attendance reporting.

### Scanner Permission

Scanning is treated as an explicit permission/capability rather than being tied only to a role name. Authorized scanners may include the Dean, Student Council Advisers, and Student Council Officers. The permission should be enforced server-side and through the UI.

### Permission Principles

- Use route-level and action-level permission checks rather than scattered hardcoded role checks.
- Masterlist import, NFC UID reassignment, and manual attendance corrections require Admin or higher unless a narrower permission is explicitly defined.
- Attendance corrections must be auditable, retaining the original value, corrected value, reason, actor, and timestamp.
- Super Admin controls must include configurable Time-Out cutoff/grace-period settings.
- A student who was genuinely present but could not time in may request an authorized Time-In adjustment from a Super Admin or designated executive officer.
- Role names and boundaries must remain consistent across the frontend, backend, database seed data, and documentation.

## 22. Student Council Officers — A.Y. 2026-2027 (Reference Roster)

Captured here for reference since it directly maps to who gets which
access level (Section 21). This should be treated as a living reference
— update it as officers change, rather than hardcoding it into the
application itself (the actual source of truth for who has what role
should live in the user database, not this document).

### Executive Officers

  Role                 Name
  --------------------- -----------------------
  President             James Ceasar Repalda
  Vice President         Matthew Banasihan
  Executive Secretary    Kenneth Punla
  Recording Secretary    Vic John Salen
  Treasurer              John Ryan Malabanan
  Auditor                Renz Robles

### Administrative

  Role                     Name
  ------------------------ -----------------------------
  Business Manager          Adrian Padilla
  Business Manager          Andrew Flores
  Event Coordinator         Ivan Angelo Cano
  Event Coordinator         Abby Marjery Peñarubia
  PIO for Publication       Justin Rain Aquino
  PIO for Documentation     Gerlyn Mae Salamero
  PIO for Documentation     Princess Leonah Angeles
  Creative Designer         Philix Nashley Ebron
  Creative Designer         Jerelle Aeron Hernandez

### Year Representatives

  Role                     Name
  ------------------------ -----------------------------
  BSIT 1st Year Representative      Adrian Padilla
  BSIT 2nd Year Representative      Andrew Flores
  BSIT 3rd Year Representative      Ivan Angelo Cano
  BSIT 4th Year Representative      Abby Marjery Peñarubia
  BSCS 1st Year Representative      Justin Rain Aquino
  BSCS 2nd Year Representative      Gerlyn Mae Salamero
  BSCS 3rd Year Representative      Princess Leonah Angeles
  BSCS 4th Year Representative      Philix Nashley Ebron
  SSC CSS Representative            Jerelle Aeron Hernandez

### Committees

**Finance and Marketing Committee**

-   Head: Treasurer John Ryan Malabanan
-   Auditor Renz Robles
-   Business Manager Adrian Padilla
-   Business Manager Andrew Flores
-   BSCS 3rd Year Representative Enrique Dela Solidad
-   BSCS 2nd Year Representative Jasmine Roque

**Information and Documentation Committee**

-   Head: Executive Secretary Kenneth Punla
-   Creative Designer Nashley Ebron
-   Creative Designer Jerelle Aeron Hernandez
-   PIO for Publication Justin Rain Aquino
-   PIO for Documentation Gerlyn Mae Salamero
-   PIO for Documentation Princess Leonah Angeles
-   BSIT 3rd Year Representative John Jery Eugenio Asis
-   BSIT 2nd Year Representative Marjorie Fernandez

**Plans and Events Committee**

-   Head: Recording Secretary Vic John Salen
-   Event Coordinator Ivan Angelo Cano
-   Event Coordinator Abby P. Peñarubia
-   BSCS 1st Year Representative Chris Banasihan

### Backend

-   **FastAPI** — Python web framework for the API.
-   **SQLModel** — ORM for SQL database interactions (built on
    SQLAlchemy + Pydantic).
-   **Pydantic** — data validation and settings management (used by
    FastAPI).
-   **PostgreSQL** — primary SQL database.

### Frontend

-   **React** with **TypeScript**, built with **Vite**.
-   Built into the backend application and served by FastAPI on the same
    domain as the API (no separate frontend host needed).
-   **Tailwind CSS** and **shadcn/ui** for components.
-   An automatically generated frontend API client (typed calls into the
    FastAPI backend).
-   **Playwright** for end-to-end testing.
-   Dark mode support out of the box.

### Auth

-   **JWT (JSON Web Token)** authentication.
-   Secure password hashing by default.
-   Email-based password recovery, with **React Email** templates and
    **Mailpit** for local email testing during development.

### Infrastructure / deployment

-   **Docker Compose** for local services and self-hosted deployment.
-   **Traefik** as a reverse proxy with automatic HTTPS — this is what
    satisfies Web NFC's secure-context requirement (Section 3.1) in
    production.
-   **FastAPI Cloud** as an available managed deployment option
    (alternative to self-hosting via Docker Compose).
-   CI/CD via **GitHub Actions**; tests via **Pytest** (backend) and
    **Playwright** (end-to-end).

### What still needs to be added on top of the template

The template is a strong general-purpose starting point but doesn't ship
with anything NFC- or attendance-specific. On top of it, this project
still needs:

-   Web NFC integration in the React frontend (`NDEFReader` usage,
    feature detection, permission flow — Section 3.1).
-   PWA support (service worker + IndexedDB + background sync) for
    offline scanning — **not part of the base template**, needs to be
    added explicitly (e.g., via `vite-plugin-pwa`) — Section 13.
-   The domain-specific data models: Student, Event, Attendance (Section
    10), built on top of the template's existing User model rather than
    replacing it (Student Council officer accounts = Users; Students
    being scanned are a separate, non-authenticating table).
-   RBAC/role field and permission checks layered onto the template's
    existing JWT auth (Section 21).
-   Export generation (`openpyxl`, `python-docx`, a PDF library) — Section
    16.
-   Masterlist import tooling (Section 5).

------------------------------------------------------------------------

## 24. Development Roadmap

### Phase 1 — Repo Setup and Environment

-   Confirm the cloned template runs locally end-to-end (Docker Compose
    up, backend + frontend + Postgres + Mailpit all working).
-   Confirm the existing template auth flow (register/login/JWT) works
    as a baseline before adding project-specific features.
-   Set up `.env` values for this project (project name, DB name, etc.).

------------------------------------------------------------------------

### Phase 2 — Web NFC Proof of Concept

Build a minimal page that:

-   Feature-detects Web NFC (`NDEFReader` in `window`).
-   Requests permission and starts a scan.
-   Reads and displays the tag's `serialNumber` (UID).
-   Does not attempt to write to the card.
-   Is tested on the actual Android phone(s) officers will use, over
    HTTPS (or `localhost`, which counts as a secure context).

Goal:

School ID → Officer's phone (Chrome/Android) → Website → UID displayed

This is the first technical milestone, and de-risks the single biggest
unknown introduced by moving from native app to website (Section 3.1).

------------------------------------------------------------------------

### Phase 3 — Database Foundation and Student Import

-   Define the normalized SQLModel schema (Section 5 and Section 10).
-   Build masterlist import (CSV/Excel → staging → validated → live).
-   Student list/search views in the dashboard.

Use fake/sample student data during development when possible.

------------------------------------------------------------------------

### Phase 4 — Attendee Types and Registration

Implement:

-   General attendee model and event registration
-   Student attendee mapping to the existing Student database
-   Faculty attendee registration
-   Staff attendee registration
-   Parent/Guardian attendee registration and Student relationship
-   Guest attendee registration
-   Minimal attendee data collection per type

### Phase 5 — NFC and QR Identification

Implement:

-   Student/attendee search
-   NFC scanning (reusing the Phase 2 proof of concept)
-   QR identifier generation and registration for attendees who need it
-   Multi-method identification resolution to the same attendee
-   Manual fallback entry (Section 8)
-   Credential-to-attendee association
-   Credential registration status
-   Reassignment/deactivation of an existing credential when authorized
-   Duplicate prevention across NFC, QR, and manual methods

Goal:

Attendee → NFC/QR credential (when available) → Credential lookup → Attendee

------------------------------------------------------------------------

### Phase 6 — Event Management

Implement:

-   Create event
-   Event name, date, start/end time
-   Create normalized event registrations linking attendees to events
-   Attendance mode selection (time-in only vs. time-in + time-out)
-   Open attendance / close attendance
-   Event list, event status (draft/open/closed)

------------------------------------------------------------------------

### Phase 7 — Attendance Scanner (Time-In / Time-Out)

Implement:

-   NFC UID detection (online mode first, offline mode deferred to
    Phase 8)
-   QR code scanning/identification
-   Attendee lookup
-   Attendee confirmation display
-   Time-in recording
-   Time-out recording (for events in that mode)
-   Duplicate/already-completed prevention (database-level uniqueness
    constraint, Section 12)
-   Ready-to-scan screen
-   Unknown/unregistered ID handling (Section 7)
-   Manual/no-ID entry path (Section 8)

------------------------------------------------------------------------

### Phase 8 — Offline Mode and Sync (PWA)

Implement:

-   Service worker for the Scanner page (Vite PWA plugin or similar)
-   IndexedDB roster caching and attendance queueing
-   Background sync of queued records when connectivity returns
-   Sync status indicator for officers
-   Conflict handling for concurrent scans (Section 13)

This is scoped as its own phase (rather than bundled into Phase 6)
because, per Section 13, it's meaningfully more work on a website than it
would have been in the originally-planned native app.

------------------------------------------------------------------------

### Phase 9 — Roles and Access Control

Implement:

-   `role` field on the user model, layered on the template's existing
    auth
-   Route-level and action-level permission checks for Developer, Super Admin,
    Admin, Class Representative, and Student (per Section 21)
-   Explicit scanner capability/permission for authorized scanners
-   Admin-or-higher gating for masterlist import, UID reassignment, and
    manual attendance corrections
-   Super Admin controls for Time-Out cutoff/grace-period settings and
    authorized attendance adjustments

------------------------------------------------------------------------

### Phase 10 — Attendance Dashboard

Implement:

-   Total registered students, Present count, Absent count, Attendance
    rate
-   Live view: currently-in vs. completed (for time-in + time-out events)
-   Search/filter, attendance history, per-student history
-   Recent scans feed
-   Manual correction tool with audit logging

------------------------------------------------------------------------

### Phase 11 — Print and Export

Implement:

-   Excel (.xlsx) export
-   CSV export
-   Word (.docx) export with report header/signature block
-   PDF export/print
-   Browser print stylesheet for the dashboard's report view
-   Pre-event blank printable roster (paper backup)

Example report:

Event: CCS Week 2026

Total Students: 520 Present: 387 Absent: 133 Attendance Rate: 74.4%

------------------------------------------------------------------------

### Phase 12 — School API Integration

Only after the standalone system works.

Tasks:

-   Obtain API documentation
-   Understand authentication
-   Determine available student/ID endpoints
-   Implement read-only integration (server-side, from FastAPI)
-   Test with authorized sample records
-   Add API failure fallback to the local database

------------------------------------------------------------------------

### Phase 13 — Multi-Organization Expansion

Once CCS is running smoothly:

-   Generalize "organizer" from a hardcoded CCS assumption to a proper
    field/entity other colleges/orgs can use.
-   Allow scoping of dashboards and student lists per organization.
-   Revisit Section 21's role scope for multi-org officer accounts (e.g.,
    does Super Admin become cross-org, or per-org?).

This is the biggest long-term goal, so earlier phases should be built
with this generalization in mind even before Phase 12 is actually
implemented (e.g., not hardcoding "CCS" into core logic where an
`organizer` field would do).

------------------------------------------------------------------------

## 25. Important Design Principle

The system should be designed around attendee identity, not around the
NFC chip.

NFC is one way to identify an attendee. QR and manual search are additional
identification paths.

The student's Student Number should remain the primary business identifier
for student lookup, while internal database relationships use stable primary
keys and foreign keys.

Conceptually:

Student Number → Student → Attendee
NFC UID / QR Identifier → Credential → Attendee
Attendee → Event Registration → Attendance

This makes the system easier to maintain if an ID card is replaced or
its NFC UID changes — and it also makes the system resilient to Web
NFC's platform limitations (Section 3.1): whenever NFC can't be used at
all, manual entry against Student Number/name is a first-class path, not
a degraded one.

------------------------------------------------------------------------

## 26. Security and Privacy

The masterlist contains student information.

Only information required for attendance should be imported into the
application (see Section 4's data minimization checklist).

The system should:

-   Avoid storing unnecessary student information
-   Restrict administrative functions (masterlist import, UID
    reassignment, record correction) to Admin accounts or higher (Section 21)
-   Protect the student database (standard production hardening for the
    PostgreSQL instance — network access restricted, credentials not
    committed to the repo, backups handled sensibly)
-   Serve the site over HTTPS in production (required both for general
    good practice and because Web NFC will not work otherwise — Section
    3.1)
-   Use authorized access for any school API
-   Prefer read-only school API access
-   Avoid exposing the full masterlist to ordinary event staff — event
    staff scanning attendance should only need to see the info relevant
    to identifying who they're scanning (name, year/section), not
    unrelated personal data
-   Keep attendance data separate from unrelated student information
-   Log administrative actions (UID reassignment, manual attendance
    correction) with who/what/when, per Sections 6 and 11
-   Treat officer accounts and passwords with the same care as any other
    user accounts — the template's JWT auth and password hashing give a
    reasonable baseline, but role assignment (who gets Admin vs. Super
    Admin) should be a deliberate, tracked decision, not ad hoc

Do not attempt to bypass NFC authentication, access protected sectors
without authorization, or modify school IDs.

The project should work through authorized NFC reading and legitimate
school data access.

------------------------------------------------------------------------

## 27. Project Success Criteria

The first complete version should be able to:

-   Import a college student masterlist
-   Search for students
-   Use a normalized PostgreSQL schema designed to satisfy Third Normal Form (3NF)
-   Enforce primary keys, foreign keys, unique constraints, and referential integrity at the database level
-   Keep people, students, academic sections, attendees, credentials, event registrations, and attendance as separate related entities
-   Prevent duplicate event registrations and duplicate attendance records through database constraints
-   Support Parent/Guardian relationships without duplicating student or person information
-   Register a student's NFC UID via Web NFC on a supported Android
    phone/browser
-   Register QR identifiers where needed
-   Identify a registered attendee through NFC, QR, or manual search
-   Support Student, Faculty, Staff, Parent/Guardian, and Guest attendee types
-   Link Parent/Guardian attendees to their student without merging their
    attendance records
-   Record time-in (and time-out, for events configured that way)
-   Prevent duplicate/conflicting attendance records
-   Handle unregistered NFC IDs, unavailable QR credentials, and
    no-ID/no-Web-NFC-support situations via manual entry
-   Work fully offline during an event (via PWA/IndexedDB) and sync
    automatically once online
-   View attendance on a live dashboard during the event
-   Enforce role-based access (Admin minimum for administrative
    functions)
-   Export attendance data to Excel, CSV, Word, and PDF
-   Produce a printable attendance sheet (both pre-event blank and
    post-event filled)
-   Continue working without the school API
-   Integrate with a school API later if access is approved

------------------------------------------------------------------------

## 28. Immediate Next Steps

Do not build the entire system immediately.

Start with these tasks, in order:

1.  Get the cloned FastAPI template running locally end-to-end (Docker
    Compose, Postgres, existing auth flow).
2.  Build the Web NFC proof-of-concept page and test it on the actual
    Android phone(s) that will be used, over a real HTTPS URL — this is
    the single riskiest unknown in the new (web) architecture and should
    be de-risked first, not last.
3.  Create a small fake student database.
4.  Connect a scanned UID to a fake student record.

The first successful test should look like:

NFC tap OR QR scan → Identifier resolved in browser → Attendee found in
database → Attendee displayed → Attendance ready to record

Once that works, add:

5.  Real masterlist importing and NFC registration.
6.  Time-in/time-out event scanning.
7.  Roles/access control (Section 21) — needed before this leaves a
    small trusted testing group, since the template's auth is on by
    default but role restrictions are not.
8.  Offline-first storage and sync (PWA) — build this once the online
    path is solid, since it adds real complexity (Section 13) and is
    easier to reason about once the "happy path" already works.

The school API should be treated as a future integration path, not a
dependency for the first prototype.

------------------------------------------------------------------------

## 29. Open Questions / To Decide

-   **Student self-service:** decide later which optional student-facing
    features, if any, should be implemented after the core attendance flow.
-   **Officer device compatibility:** confirm the actual NFC-capable Android
    devices and Chromium browsers that will be used in deployment.
-   **Offline storage recovery:** determine the final operational procedure
    for recovering unsynced attendance if an officer's phone is lost, cleared,
    or becomes unusable during an event.

------------------------------------------------------------------------

## 30. Current Project Vision

The end goal is a simple multi-method event attendance website that allows
Student Council or authorized event staff to use browser-based scanner
stations to identify attendees through NFC, QR, or manual search —
offline-capable, syncing automatically, with time-in/time-out tracking, a
live dashboard, role-based access, and one-click export/print in the formats
officers actually need.

The ideal experience is:

Officer logs into the website → Opens the event's Scanner page → Attendee
uses NFC, QR, or manual search → Attendee is recognized → Time-in (and later
time-out) is recorded, online or offline → Scanner is immediately ready for
the next attendee → Officer checks the live dashboard during the event →
Officer exports or prints a finished report right after

The system should be simple enough for event staff to operate quickly
from a phone browser with nothing to install, reliable enough for real
school events even with the platform constraints of Web NFC, flexible
enough to work with either a locally maintained student database or an
officially provided school API, and general enough — starting from CCS —
to grow into a shared tool for other college organizations.