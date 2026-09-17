# Phase 3 — Student Data Field Mapping

## Purpose

Define exactly how fields from the actual `Masterlist.xlsx` should map into the Attendance Event Tracker's operational database versus import/source metadata.

The goal is to keep the attendance database clean and normalized while preserving enough information from the source masterlist for validation, provenance, and future expansion.

The current Source of Truth requires the operational schema to follow at least Third Normal Form (3NF) and emphasizes data minimization: only information necessary for attendance should be imported into the operational student database.

---

## 1. Person — Identity Information

The `Person` table should answer:

> Who is this human being?

### Masterlist → Person

| Masterlist field | Destination | Import? | Reason |
|---|---|---:|---|
| Last Name | `Person.last_name` | ✅ | Person identity |
| First Name | `Person.first_name` | ✅ | Person identity |
| Middle Name | `Person.middle_name` | ✅ | Person identity |
| Mobile Number | — | ❌ | Not currently needed |
| Email | — | ❌ | Not currently needed |
| Student Number | — | ❌ | Belongs to Student, not generic Person |
| Status | — | ❌ | Academic/student information |
| Subjects Enrolled | — | ❌ | Academic/source information |
| No. | — | ❌ | Spreadsheet numbering only |

### Operational model

```text
Person
├── id
├── first_name
├── middle_name
├── last_name
├── name_extension
├── contact_number       ← remains nullable for other future people
└── email                ← remains nullable for other future people
```

The existing nullable `contact_number` and `email` fields can remain because `Person` is also used by other attendee types. The masterlist importer should not populate them in this phase.

---

## 2. Student — Student-Specific Information

The `Student` table should answer:

> Which student is this, and what is their current academic classification/location in this imported masterlist?

### Recommended structure

```text
Student
├── id
├── person_id
├── student_number
├── section_id
└── academic_status
```

### Masterlist → Student

| Masterlist field | Destination | Notes |
|---|---|---|
| Student Number | `Student.student_number` | Student identifier |
| Section sheet | `Student.section_id` | Student's home/official section |
| Status | `Student.academic_status` | `Regular` / `Irregular` |
| Program | Through `AcademicSection → AcademicProgram` | Do not duplicate on Student |
| Year level | Through `AcademicSection` | Do not duplicate on Student |

The existing normalized relationship should be:

```text
AcademicProgram
      ↓
AcademicSection
      ↓
Student
```

### Schema change required

The current `Student` model does **not yet contain** `academic_status`. Phase 3 therefore requires a database migration to add this field to the operational `students` table.

Recommended controlled values:

```text
regular
irregular
```

The migration and corresponding SQLModel/API schema changes must be treated as part of this Phase 3 implementation, not as an assumed pre-existing field.

This avoids storing the same program and year-level facts redundantly on the student record.

---

## 3. Regular / Irregular Academic Status

The `Status` column should be represented as a controlled academic status rather than an arbitrary string.

Recommended values:

```text
regular
irregular
```

### Important provenance rule

The imported status should be treated as a **snapshot supplied by the masterlist**, not as an independently calculated or permanently registrar-certified fact.

The current masterlist classification was derived from class-list information. The Attendance Tracker should therefore:

- import the supplied status;
- not independently recompute Regular/Irregular;
- retain the source/import context;
- avoid presenting the imported status as an eternal academic truth.

For Phase 3, the recommended approach is:

```text
Student
└── academic_status = regular | irregular

ImportBatch
└── academic year / semester / source information

StudentImportRecord
└── raw_status = original source value
```

A full historical `StudentAcademicStatus` table is not required yet.

---

## 4. AcademicProgram — Program Should Not Be Duplicated on Student

The workbook encodes the program through its section sheets.

The masterlist contains 19 section sheets covering:

- 4 BSCS sections
- 15 BSIT sections

Therefore, program should be represented through the normalized section relationship.

Recommended structure:

```text
AcademicProgram
├── id
├── program_code
└── program_name
```

```text
AcademicSection
├── id
├── program_id
├── year_level
├── section_name
└── academic_year
```

```text
Student
├── student_number
└── section_id
```

A student's program and year level can then be obtained through their home section.

Example:

```text
AcademicProgram
id: 1
code: BSIT
name: Bachelor of Science in Information Technology
```

```text
AcademicSection
id: 42
program_id: 1
year_level: 4
section_name: WMAD 4A
academic_year: 2026-2027
```

```text
Student
student_number: 0423-XXXX
section_id: 42
academic_status: irregular
```

---

## 5. Subjects Enrolled — Do Not Put Into Person or Student

The workbook contains a `Subjects Enrolled` column with multiple subject entries separated within the cell.

This should **not** become a repeating or denormalized field on `Student`.

Do not implement:

```text
Student
└── subjects_enrolled = "subject1; subject2; subject3"
```

in the operational Student table.

Also do **not** introduce the full academic model yet:

```text
Subject
Offering
Enrollment
EventOffering
```

simply because the masterlist contains subject information.

### Why preserve it?

The source subject information may be useful later for features such as:

> Automatically registering everyone enrolled in a particular professor's class for an event.

However, that feature is not currently required.

For Phase 3, preserve the original source information in the import/source layer rather than prematurely normalizing it into a school academic enrollment system.

---

## 6. Source / Import Metadata

The source layer should preserve what the spreadsheet actually contained while keeping the operational database focused on attendance.

Conceptually:

```text
ImportBatch
├── id
├── source_filename
├── academic_year
├── semester
├── imported_at
└── ...
```

And:

```text
StudentImportRecord
├── import_batch_id
├── source_sheet
├── source_row
├── source_no
├── raw_student_number
├── raw_last_name
├── raw_first_name
├── raw_middle_name
├── raw_mobile_number       ← source provenance only if retention is justified
├── raw_email               ← source provenance only if retention is justified
├── raw_subjects_enrolled
├── raw_status
└── validation/result information
```

The exact table names and implementation details can be finalized during the implementation design.

## 7. Cross-Program Student Number Conflicts

The current workbook contains **5 student numbers that appear in more than one program's section sheets**. These are cross-program source conflicts and must not be silently merged, overwritten, or auto-resolved.

The importer must treat these as a staging/validation concern first.

### Required behavior

All source rows should still be loaded into `StudentImportRecord`, including the conflicting rows.

During validation/promotion:

```text
632 source rows
      │
      ├── 627 clean rows
      │      └── eligible for automatic promotion
      │
      └── 5 conflicting student numbers
             └── conflict_cross_program
                 pending human review
```

A student number that appears under more than one `source_sheet` across the BSCS and BSIT sections must be flagged with a conflict status such as:

```text
validation_status = conflict_cross_program
```

and must **not** automatically create or update an operational `Student` row.

### No silent identity decisions

The importer must never:

- use `student_number` as an upsert key when doing so would overwrite one conflicting source row with another;
- automatically choose one program/section/status;
- merge the two source rows into one `Person` or `Student`;
- create duplicate operational `Student` records with the same unique student number merely to bypass the conflict.

The system cannot determine from the masterlist alone whether each conflict represents a legitimate cross-program enrollment or a student-number/data-entry collision.

### Human resolution

The five conflicts must remain visible as unresolved staging records until an authorized human verifies the authoritative student record.

If the verification establishes that the records represent one student, the Attendance Tracker should import the authoritative home/official section and academic status supplied by the authoritative source. The Attendance Tracker must not independently decide the student's home section based on attendance needs.

If the conflict is determined to be a source/registrar data problem, it should be referred back to the authority maintaining the student-number records rather than silently repaired by the importer.

The importer should support a resolved/reviewed state in the staging records so that a verified conflict can later be promoted without changing the normal import rules.

### Event/attendance rule while unresolved

An unresolved conflict is **not eligible for normal student EventRegistration or Attendance** because no unambiguous operational `Student` identity exists yet.

Do not create a temporary `Student`, temporary `Attendee`, or name-only student identity to bypass the conflict.

If such a student needs to attend an event before the conflict is resolved, use the project's existing manual/paper operational fallback and resolve the identity afterward. The attendance system should not compromise student identity integrity to accommodate an unresolved import conflict.

### Separation of concerns

#### Operational database

```text
Person
Student
AcademicProgram
AcademicSection
Attendee
Event
EventRegistration
Attendance
```

#### Import/source layer

```text
ImportBatch
StudentImportRecord
```

The operational database contains what the Attendance Tracker needs.

The import layer preserves what the source spreadsheet actually said, subject to
data-minimization and retention decisions. Raw Mobile Number and Email should not
be exposed or populated as operational Person contact data merely because they
exist in the source workbook.

---

## 8. Mobile Number and Email

Do not import these fields into the operational database during this phase.

Although the masterlist contains:

- Mobile Number
- Email

the current Attendance Tracker does not need either field for:

- NFC identification;
- QR identification;
- manual student search;
- event registration;
- attendance recording.

The existing nullable `Person.contact_number` and `Person.email` fields should remain available for future attendee types/features, but this masterlist import should not populate them unless a future requirement explicitly justifies doing so.

---

## 9. Spreadsheet `No.` Column

The `No.` column is only a row/roster number within the source spreadsheet.

It is not:

- a student identifier;
- a database primary key;
- a registration ID;
- an attendance ID.

It may be retained as source metadata:

```text
source_sheet
source_row
source_no
```

but should never become an operational database identity.

---

## 10. Summary Sheet

The `Summary` sheet should **not create Student records**.

It is a summary/report of the section data.

Its totals should instead be used for validation after parsing/importing.

### Current workbook values

For the current `Masterlist.xlsx`, the Summary sheet reports:

```text
Total students: 632
Regular:        557
Irregular:       75
Sections:         19
```

These values are the current workbook's reconciliation baseline.

### Import-time reconciliation rule

The importer should **read the expected totals from the Summary sheet at import time** rather than hardcoding `632`, `557`, `75`, or `19` into the importer logic.

It should calculate the corresponding values from the section sheets and compare them with the Summary values:

```text
Calculated total  ↔ Summary total
Calculated Regular ↔ Summary Regular
Calculated Irregular ↔ Summary Irregular
Calculated sections ↔ Summary sections
```

If the calculated import results do not match the Summary expectations, the importer should report the discrepancy rather than silently proceeding as though the source were correct.

The Summary sheet is therefore a **validation source**, not an operational student source.

---

## 11. Complete Masterlist Field Mapping

| Masterlist data | Destination | Import? |
|---|---|---:|
| Student Number | `Student.student_number` | ✅ |
| Last Name | `Person.last_name` | ✅ |
| First Name | `Person.first_name` | ✅ |
| Middle Name | `Person.middle_name` | ✅ |
| Section sheet | `Student.section_id` | ✅ |
| Program encoded by section | `AcademicProgram` through section | ✅ |
| Year encoded by section | `AcademicSection.year_level` | ✅ |
| Status | `Student.academic_status` | ✅ |
| Academic year | `AcademicSection.academic_year` / import context | ✅ |
| Semester | Import/source context | ✅ |
| Subjects Enrolled | Import/source layer only | ⚠️ |
| Mobile Number | Nowhere operationally | ❌ |
| Email | Nowhere operationally | ❌ |
| No. | Source metadata only | ⚠️ |
| Summary statistics | Validation only | ⚠️ |

---

## 12. Recommended Operational Student Model

The Phase 3 operational model should therefore remain approximately:

```text
Person
────────────────────
id
first_name
middle_name
last_name
name_extension
email          nullable
contact_number nullable
```

The last two fields remain in the generic model but are not populated by this masterlist import.

```text
Student
────────────────────
id
person_id
student_number
section_id
academic_status
```

```text
AcademicProgram
────────────────────
id
program_code
program_name
```

```text
AcademicSection
────────────────────
id
program_id
year_level
section_name
academic_year
```

Import/source information is kept separately:

```text
ImportBatch
────────────────────
id
source_filename
academic_year
semester
imported_at
...
```

```text
StudentImportRecord
────────────────────
id
import_batch_id
source_sheet
source_row
source_no
raw_student_number
raw_last_name
raw_first_name
raw_middle_name
raw_mobile_number
raw_email
raw_subjects_enrolled
raw_status
validation_status
...
```

---

## 13. Attendance Architecture Remains Separate

The student academic data should remain separate from event attendance.

```text
Student
   ↓
EventRegistration
   ↓
Attendance
   ↓
NFC / QR / Manual
```

An Irregular student does not need special attendance behavior.

For example:

```text
Student
├── student_number
├── home_section = BSCS 1A
└── academic_status = irregular
```

can still simply be:

```text
Seminar
   ↓
EventRegistration
   ↓
Student
   ↓
NFC scan
   ↓
Attendance
```

The system does not need to know why the student is irregular in order to record attendance.

---

## 14. Important Design Principle

Do not turn the Attendance Tracker into a full academic information system merely because the source masterlist contains academic information.

The Phase 3 objective is:

> Build a reliable, organized student database for attendance while preserving enough source information to support validation, provenance, and future requirements.

The current operational focus is:

**People → Students → Programs/Sections → Events → Registrations → Attendance → NFC/QR credentials.**

A full:

**Subject → Offering → Enrollment**

model should only be introduced when a concrete feature requires it, such as automatic event registration based on class membership.
