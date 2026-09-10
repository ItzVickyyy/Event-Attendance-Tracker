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
a website on an NFC-capable Android phone and uses the phone's browser
as the scanner — no separate app install required.

The intended flow is:

School ID → Officer's phone browser reads NFC UID → System identifies
the student → System records attendance (time-in or time-out) →
Attendance can be viewed, printed, and exported from the same website

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

------------------------------------------------------------------------

## 2. Core Idea

The NFC UID is the identifier of the physical school ID.

The student masterlist is the source of student information.

The attendance system connects the two.

Conceptually:

NFC UID → Student record → Attendance record

The system must not assume that the NFC chip itself contains the
student's name, student number, year, or section. The UID is treated as
an opaque key, nothing more.

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
    unlikely (4-byte UID space), but the system should still treat
    `nfc_uid` as unique in the database and fail loudly (not silently) if
    a duplicate is ever detected during registration.

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

Initial student fields:

-   student_id
-   student_number
-   first_name
-   middle_name
-   last_name
-   extension
-   year
-   section
-   nfc_uid
-   nfc_registered
-   created_at
-   updated_at

The database will initially be populated by importing the college
masterlist.

Example:

  Student Number   Name            Year & Section   NFC UID
  ---------------- --------------- ---------------- ----------------
  2024-00001       Student One     BSIT 3A          Not registered
  2024-00002       Student Two     BSIT 3A          Not registered
  2024-00003       Student Three   BSIT 3B          Not registered

Most students may initially have no NFC UID. That is acceptable.

### Import process (masterlist → app database)

1.  Export/obtain the masterlist as CSV or Excel from whoever maintains
    it (department secretary, adviser, etc.).
2.  Map masterlist columns to the app's student fields (Student Number,
    Name split into first/middle/last/extension, Year, Section).
3.  Run the import into a staging table first, not directly into the live
    table.
4.  Validate: no duplicate Student Numbers, no blank required fields,
    consistent Year/Section formatting (e.g., always "BSIT 3A", not a mix
    of "3A-BSIT" and "BSIT-3A").
5.  Flag and manually review any rows that fail validation instead of
    silently dropping or silently importing them.
6.  Promote the staging table into the live `students` table.
7.  Keep the original masterlist file archived (outside the app) in case
    a re-import or audit is needed later.

Re-imports (e.g., new semester, corrected data) should update existing
records by `student_number` rather than creating duplicates.

------------------------------------------------------------------------

## 6. NFC Registration

Students should not have to manually type all of their information if
they already exist in the masterlist.

Preferred registration process:

1.  Search for the student using their Student Number or name.
2.  Display the matching student record.
3.  Confirm the student's identity.
4.  Ask the student to tap their school ID against the officer's phone.
5.  The web page reads the NFC UID via Web NFC (Section 3.1).
6.  Associate the UID with that student.
7.  Save the association.

Example:

Student Number: 2024-00001

Name: Student One

Action: TAP SCHOOL ID

NFC UID detected: 8F:49:5B:74

Save association.

After registration:

8F:49:5B:74 → Student One → 2024-00001 → BSIT 3A

### Where registration happens

To avoid one bottleneck line just replacing another, NFC registration
should ideally be:

-   **Rolling/ambient**: built into the normal attendance flow, so a
    student's very first scan at any event doubles as their registration
    (see Section 7 fallback flow) — no separate registration event
    needed.
-   **Optionally batched**: officers can also run a dedicated
    "registration day" booth before a big event if a fast head start is
    wanted, using the same search → confirm → tap flow, from the same
    website.

### Re-registration / lost ID handling

If a student loses their ID or gets a replacement:

1.  Officer searches the student record.
2.  Officer selects "Replace NFC ID".
3.  System requires confirmation (this is a deliberate, logged action,
    not a silent overwrite) because it breaks the link to the old UID.
4.  Student taps the new ID.
5.  New UID replaces the old one on the student record.
6.  The old UID is retired (kept in a history/log for audit purposes, but
    no longer resolves to the student going forward).

------------------------------------------------------------------------

## 7. Unregistered NFC IDs

The system must handle students whose NFC UID has not yet been
registered.

Suggested fallback flow:

NFC UID detected → UID not found → Search student by Student Number or
name → Confirm student → Associate UID → Record attendance

This allows NFC registration to happen gradually instead of requiring
every student to be registered before the first event, and it means
attendance and registration can effectively happen in the same tap for a
first-time student — the officer just does one extra search step.

------------------------------------------------------------------------

## 8. No NFC ID (Manual Fallback Path)

Some situations will not have a usable NFC ID at all:

-   Student forgot their ID at home.
-   Student's ID is damaged, demagnetized, or otherwise unreadable.
-   Student has not been issued an ID yet (e.g., new/transferee student).
-   The scanning officer's phone/browser can't use Web NFC at all (see
    8.1 below — this is not a rare edge case for this project, it's an
    expected regular occurrence given Web NFC's Android-Chromium-only
    support).

**Plan:**

1.  Attendance scanner page always has a visible "No ID / Manual Entry"
    button alongside the tap-to-scan state — it is not hidden in a menu.
2.  Manual entry opens the same student search used elsewhere (by Student
    Number or name).
3.  Officer selects the correct student and confirms identity visually
    (this is why Year & Section and, ideally, a small role/photo
    reference if available, matter — reduces impersonation risk).
4.  Attendance is recorded with a `scan_method` of `manual` instead of
    `nfc`, so later reports can show how many check-ins were manual vs.
    tapped (useful for gauging ID adoption/damage rates, and Web NFC
    device compatibility, over time).
5.  No NFC UID is created or modified from a manual entry — manual entry
    never silently registers a UID; UID registration only happens through
    the explicit flow in Section 6.
6.  Manual entry should require the same duplicate-prevention check as a
    normal scan (Section 11) — a student can't be marked present twice
    for the same event just because one check-in was manual.

### 8.1 Device/browser fallback

Because Web NFC only works on Android + a Chromium-based browser
(Section 3.1), the system should treat "officer's device can't scan NFC
at all" as a first-class, expected case — not a crash or dead end:

-   On page load, the scanner page should feature-detect Web NFC support
    (checking for `NDEFReader` in the browser) and, if unsupported,
    immediately show the manual-entry flow as the primary interface
    instead of a broken "tap to scan" button.
-   Sites/committees where the assigned officer has an iPhone (Safari, no
    Web NFC support at all) should default straight to manual entry —
    this should be communicated clearly, not discovered mid-event.
-   Where budget allows, a low-cost external USB/Bluetooth NFC reader
    connected to a laptop running Chrome desktop is **not** an option
    under Web NFC's current Android-only restriction — this rules out a
    "reader at a table" style setup for now unless a native companion app
    is built later (see Section 25, open questions).

This keeps the door open (any student can always be checked in) without
weakening the NFC-based flow for everyone else.

------------------------------------------------------------------------

## 9. Attendance Flow (Time-In and Time-Out)

The system records both **time-in** and **time-out**, not just a single
presence flag. This supports events that need to track how long a
student stayed (e.g., seminars with a minimum attendance duration) as
well as simple one-tap presence events.

### Mode selection per event

When an officer creates or opens an event, they choose an attendance
mode:

-   **Time-in only** — a single tap marks the student present. Simplest
    mode, good for short events, general assemblies, orientation.
-   **Time-in + Time-out** — the scanner provides explicit **Time-In** and
    **Time-Out** actions. The officer selects the intended action before
    scanning. Time-Out is only valid when a time-in exists. Good for
    seminars, training sessions, or anything requiring proof of a minimum
    stay duration.

### Scanning flow

1.  Officer opens the website on their phone.
2.  Officer logs in (see Section 21, roles/access control).
3.  Officer selects or creates an event, and confirms its attendance
    mode (time-in only, or time-in + time-out).
4.  The Scanner page is opened.
5.  Student taps their school ID on the phone (or the officer uses manual
    entry, per Section 8).
6.  The browser reads the NFC UID via Web NFC.
7.  System looks up the UID.
8.  Student information is displayed for a brief confirmation moment.
9.  Officer selects **Time-In** or **Time-Out** before scanning.
10. System validates the selected action:
    -   **Time-In** → record time-in if the student has not already timed in.
    -   **Time-Out** → record time-out only when the event requires time-out
        and the student has a valid time-in with no existing time-out.
    -   Duplicate or invalid action → reject it with a clear status such as
        **Already Recorded**, **Already Completed**, or **Time-In Required**.
11. For time-in-only events, the **Time-Out** action is unavailable.
12. Screen returns to a ready-to-scan state.

The system must not infer the officer's intended action solely from the
number of previous taps. The same explicit Time-In/Time-Out controls and
validation rules apply to NFC scanning and manual entry.

### Example — time-in only event

TAP YOUR ID

NFC UID: 8F:49:5B:74

Student: Student One

Year & Section: BSIT 3A

Status: Present (Time-In)

Time: 08:42:15 AM

Then:

READY FOR NEXT STUDENT

### Example — time-in + time-out event

First tap:

Student: Student One — Status: Time-In recorded — 08:42:15 AM

Second tap (later):

Student: Student One — Status: Time-Out recorded — 11:58:40 AM — Duration
present: 3h 16m

------------------------------------------------------------------------

## 10. Attendance Database

Student information and attendance records should be separated.

### Students

Fields:

-   student_id
-   student_number
-   first_name
-   middle_name
-   last_name
-   extension
-   year
-   section
-   nfc_uid
-   nfc_registered

### Events

Fields:

-   event_id
-   event_name
-   event_date
-   start_time
-   end_time
-   attendance_mode (`time_in_only` | `time_in_time_out`)
-   organizer (e.g., "CCS Student Council" — supports future multi-org use)
-   status (`draft` | `open` | `closed`)

### Attendance

Fields:

-   attendance_id
-   event_id
-   student_id
-   time_in
-   time_out (nullable — only filled for time-in + time-out events, or
    left null if the student never tapped out)
-   status (`present` | `time_in_only` | `completed` | `incomplete`)
-   scan_method (`nfc` | `manual`)
-   scanned_by (which officer/user account recorded it — ties into
    Section 21's user accounts, useful for accountability and sync
    debugging)
-   synced (boolean — whether this record has reached the central
    database yet; see Section 13 on offline support)
-   created_at / updated_at

One student can have many attendance records across different events.

Example:

Student One → CCS Seminar → Time-In 08:42:15 AM → Time-Out 11:58:40 AM →
Status: Completed

Student One → CCS General Assembly → Time-In 09:00:02 AM → Status:
Present (time-in only event, no time-out expected)

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

### Phase 3 — Student Database and Import

-   Define the Student SQLModel schema (Section 5).
-   Build masterlist import (CSV/Excel → staging → validated → live).
-   Student list/search views in the dashboard.

Use fake/sample student data during development when possible.

------------------------------------------------------------------------

### Phase 4 — NFC Registration

Implement:

-   Student search
-   NFC scanning (reusing the Phase 2 proof of concept)
-   Manual fallback entry (Section 8)
-   UID-to-student association
-   NFC registration status
-   Reassignment/update of an existing UID when authorized

Goal:

Masterlist student → Tap school ID (or manual search) → UID linked to
student

------------------------------------------------------------------------

### Phase 5 — Event Management

Implement:

-   Create event
-   Event name, date, start/end time
-   Attendance mode selection (time-in only vs. time-in + time-out)
-   Open attendance / close attendance
-   Event list, event status (draft/open/closed)

------------------------------------------------------------------------

### Phase 6 — Attendance Scanner (Time-In / Time-Out)

Implement:

-   NFC UID detection (online mode first, offline mode deferred to
    Phase 7)
-   Student lookup
-   Student confirmation display
-   Time-in recording
-   Time-out recording (for events in that mode)
-   Duplicate/already-completed prevention (database-level uniqueness
    constraint, Section 12)
-   Ready-to-scan screen
-   Unknown/unregistered ID handling (Section 7)
-   Manual/no-ID entry path (Section 8)

------------------------------------------------------------------------

### Phase 7 — Offline Mode and Sync (PWA)

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

### Phase 8 — Roles and Access Control

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

### Phase 9 — Attendance Dashboard

Implement:

-   Total registered students, Present count, Absent count, Attendance
    rate
-   Live view: currently-in vs. completed (for time-in + time-out events)
-   Search/filter, attendance history, per-student history
-   Recent scans feed
-   Manual correction tool with audit logging

------------------------------------------------------------------------

### Phase 10 — Print and Export

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

### Phase 11 — School API Integration

Only after the standalone system works.

Tasks:

-   Obtain API documentation
-   Understand authentication
-   Determine available student/ID endpoints
-   Implement read-only integration (server-side, from FastAPI)
-   Test with authorized sample records
-   Add API failure fallback to the local database

------------------------------------------------------------------------

### Phase 12 — Multi-Organization Expansion

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

The system should be designed around student identity, not around the
NFC chip.

NFC is one way to identify a student.

The student's Student Number should remain the primary student
identifier in the application's database.

Conceptually:

Student Number → Student

NFC UID → Physical ID Card → Student

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
-   Register a student's NFC UID via Web NFC on a supported Android
    phone/browser
-   Identify a registered student from a scan
-   Record time-in (and time-out, for events configured that way)
-   Prevent duplicate/conflicting attendance records
-   Handle unregistered NFC IDs and no-ID/no-Web-NFC-support situations
    via manual entry
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

School ID → NFC UID detected in browser → UID found in database →
Student displayed

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

The end goal is a simple event attendance website that allows Student
Council or authorized event staff to use ordinary NFC-capable Android
phones (via the browser) as attendance scanners — offline-capable,
syncing automatically, with time-in/time-out tracking, a live dashboard,
role-based access, and one-click export/print in the formats officers
actually need.

The ideal experience is:

Officer logs into the website → Opens the event's Scanner page → Student
taps school ID → Student is recognized → Time-in (and later time-out) is
recorded, online or offline → Scanner is immediately ready for the next
student → Officer checks the live dashboard during the event → Officer
exports or prints a finished report right after

The system should be simple enough for event staff to operate quickly
from a phone browser with nothing to install, reliable enough for real
school events even with the platform constraints of Web NFC, flexible
enough to work with either a locally maintained student database or an
officially provided school API, and general enough — starting from CCS —
to grow into a shared tool for other college organizations.