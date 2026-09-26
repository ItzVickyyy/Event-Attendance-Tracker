"""Tests for Student Import Service"""

from io import BytesIO
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from openpyxl import Workbook
from sqlmodel import Session, select

from app.models import ImportBatch, ImportValidationStatus, StudentImportRecord
from app.services.student_import import StudentImportService


@pytest.fixture
def student_import_service(db_session: Session) -> StudentImportService:
    """Create a StudentImportService with a test session"""
    return StudentImportService(session=db_session)


DEFAULT_MASTERLIST_HEADERS = [
    "No.",
    "Student Number",
    "Last Name",
    "First Name",
    "Middle Name",
    "Mobile Number",
    "Email",
    "Subjects Enrolled",
    "Status",
]


def create_test_xlsx_sheet(
    sheet_name: str,
    rows: list[dict],
    headers: list[str] = None
) -> bytes:
    """Helper that mirrors the real Masterlist sheet layout.

    The real workbook has a title row, a blank row, then the student-table
    headers. Keep that structure in unit-test fixtures so header detection and
    source-row provenance are exercised by the same shape as production data.
    """
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name

    headers = headers or DEFAULT_MASTERLIST_HEADERS
    ws.append([f"BSCS — Section {sheet_name} — Class List (test fixture)"])
    ws.append([])
    ws.append(headers)

    for row_data in rows:
        ws.append([row_data.get(header) for header in headers])

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def create_test_xlsx_workbook(
    sheets: dict[str, list[dict]],
    headers: list[str] = None
) -> bytes:
    """Helper to create a test XLSX workbook with multiple sheets in memory"""
    wb = Workbook()
    ws = wb.active
    ws.title = list(sheets.keys())[0]

    for sheet_name, rows in sheets.items():
        if sheet_name != list(sheets.keys())[0]:
            ws = wb.create_sheet(title=sheet_name)

        if headers:
            ws.append(headers)

        for row_data in rows:
            ws.append(list(row_data.values()))

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def create_test_xlsx_workbook_with_summary(
    sections: dict[str, list[dict]],
    headers: list[str],
    summary_values: dict[str, int] | None = None,
    summary_labels: dict[str, str] | None = None,
) -> bytes:
    """Helper to build a test workbook containing section sheets plus a
    "Summary" sheet, in the label/value-per-row layout described by
    docs/Phase-3-Student-Data-Field-Mapping.md section 10:

        Total students: <value>
        Regular:        <value>
        Irregular:      <value>
        Sections:       <value>

    `summary_values` supplies whichever of "total_students", "regular",
    "irregular", "sections" should appear on the Summary sheet (omitted
    keys are left off the sheet entirely, simulating a figure that
    cannot be located). `summary_labels` optionally overrides the label
    text used for a given metric, to exercise label-matching robustness.
    """
    wb = Workbook()
    ws = wb.active
    first_section = list(sections.keys())[0]
    ws.title = first_section

    for sheet_name, rows in sections.items():
        if sheet_name != first_section:
            ws = wb.create_sheet(title=sheet_name)
        else:
            ws = wb[first_section]

        ws.append(headers)
        for row_data in rows:
            ws.append(list(row_data.values()))

    default_labels = {
        "total_students": "Total students:",
        "regular": "Regular:",
        "irregular": "Irregular:",
        "sections": "Sections:",
    }
    labels = {**default_labels, **(summary_labels or {})}

    summary_ws = wb.create_sheet(title="Summary")
    for metric, value in (summary_values or {}).items():
        summary_ws.append([labels[metric], value])

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def test_parse_clean_workbook(
    student_import_service: StudentImportService,
    db_session: Session,
):
    """Test parsing a clean, valid XLSX workbook"""
    import_batch = ImportBatch(
        source_filename="test_masterlist.xlsx",
        academic_year="2026-2027",
        semester="1st Semester"
    )
    db_session.add(import_batch)
    db_session.commit()
    db_session.refresh(import_batch)

    headers = ["No.", "Student Number", "Last Name", "First Name", "Middle Name"]

    test_rows = [
        {
            "No.": 1,
            "Student Number": "00101",
            "Last Name": "Dela Cruz",
            "First Name": "Juan",
            "Middle Name": "Garcia",
        },
        {
            "No.": 2,
            "Student Number": "00102",
            "Last Name": "Santos",
            "First Name": "Maria",
            "Middle Name": None,
        }
    ]

    xlsx_data = create_test_xlsx_sheet("BSCS 1A", test_rows, headers)

    parsed_rows = student_import_service.parse_student_import(import_batch, xlsx_data)

    assert len(parsed_rows) == 2

    for parsed_row, expected in zip(parsed_rows, test_rows, strict=True):
        assert parsed_row["source_sheet"] == "BSCS 1A"
        assert parsed_row["raw_student_number"] == expected["Student Number"]
        assert parsed_row["raw_last_name"] == expected["Last Name"]
        assert parsed_row["raw_first_name"] == expected["First Name"]
        assert parsed_row["raw_middle_name"] == expected["Middle Name"]
        assert parsed_row["validation_status"] == ImportValidationStatus.valid
        assert len(parsed_row["validation_errors"]) == 0

    assert len(db_session.exec(select(StudentImportRecord)).all()) == 2


def test_preserve_leading_zero_student_numbers(
    student_import_service: StudentImportService,
    db_session: Session,
):
    """Test that leading zeros in student numbers are preserved"""
    import_batch = ImportBatch(
        source_filename="test_masterlist.xlsx",
        academic_year="2026-2027",
        semester="1st Semester"
    )
    db_session.add(import_batch)
    db_session.commit()
    db_session.refresh(import_batch)

    test_rows = [
        {"No.": 1, "Student Number": "00423"},  # Has leading zeros
        {"No.": 2, "Student Number": "00423-XXXX"},  # More leading zeros
    ]

    xlsx_data = create_test_xlsx_sheet("BSCS 1A", test_rows)
    parsed_rows = student_import_service.parse_student_import(import_batch, xlsx_data)

    assert len(parsed_rows) == 2
    assert parsed_rows[0]["raw_student_number"] == "00423"
    assert parsed_rows[1]["raw_student_number"] == "00423-XXXX"


def test_missing_student_number_validation(
    student_import_service: StudentImportService,
    db_session: Session,
):
    """Test that missing student numbers are detected as invalid"""
    import_batch = ImportBatch(
        source_filename="test_masterlist.xlsx",
        academic_year="2026-2027",
        semester="1st Semester"
    )
    db_session.add(import_batch)
    db_session.commit()
    db_session.refresh(import_batch)

    test_rows = [
        {
            "No.": 1,
            "Student Number": None,  # Missing student number
            "Last Name": "Dela Cruz",
            "First Name": "Juan",
            "Middle Name": "Garcia",
        },
    ]

    xlsx_data = create_test_xlsx_sheet("BSCS 1A", test_rows)
    parsed_rows = student_import_service.parse_student_import(import_batch, xlsx_data)

    assert len(parsed_rows) == 1
    assert parsed_rows[0]["validation_status"] == ImportValidationStatus.invalid
    assert "Missing student number" in parsed_rows[0]["validation_errors"]


def test_missing_required_name_fields_validation(
    student_import_service: StudentImportService,
    db_session: Session,
):
    """Test that missing required name fields are detected as invalid"""
    import_batch = ImportBatch(
        source_filename="test_masterlist.xlsx",
        academic_year="2026-2027",
        semester="1st Semester"
    )
    db_session.add(import_batch)
    db_session.commit()
    db_session.refresh(import_batch)

    test_rows = [
        {
            "No.": 1,
            "Student Number": "00103",
            "Last Name": None,  # Missing last name
            "First Name": None,  # Missing first name
        },
    ]

    xlsx_data = create_test_xlsx_sheet("BSCS 1A", test_rows)
    parsed_rows = student_import_service.parse_student_import(import_batch, xlsx_data)

    assert len(parsed_rows) == 1
    assert parsed_rows[0]["validation_status"] == ImportValidationStatus.invalid
    assert len(parsed_rows[0]["validation_errors"]) > 0


def test_duplicate_student_numbers_detection(
    student_import_service: StudentImportService,
    db_session: Session,
):
    """Test that duplicate student numbers within the import are detected"""
    import_batch = ImportBatch(
        source_filename="test_masterlist.xlsx",
        academic_year="2026-2027",
        semester="1st Semester"
    )
    db_session.add(import_batch)
    db_session.commit()
    db_session.refresh(import_batch)

    test_rows = [
        {
            "No.": 1,
            "Student Number": "00104",
            "Last Name": "Dela Cruz",
            "First Name": "Juan",
        },
        {
            "No.": 2,
            "Student Number": "00104",  # Duplicate
            "Last Name": "Dela Cruz",
            "First Name": "Maria",
        }
    ]

    xlsx_data = create_test_xlsx_sheet("BSCS 1A", test_rows)
    parsed_rows = student_import_service.parse_student_import(import_batch, xlsx_data)

    assert len(parsed_rows) == 2
    assert parsed_rows[0]["validation_status"] == ImportValidationStatus.valid
    assert parsed_rows[1]["validation_status"] == ImportValidationStatus.invalid
    assert "Duplicate student number" in parsed_rows[1]["validation_errors"][0]


def test_cross_program_conflicts_detection(
    student_import_service: StudentImportService,
    db_session: Session,
):
    """Test that student numbers appearing in different sections are flagged as conflicts"""
    import_batch = ImportBatch(
        source_filename="test_masterlist.xlsx",
        academic_year="2026-2027",
        semester="1st Semester"
    )
    db_session.add(import_batch)
    db_session.commit()
    db_session.refresh(import_batch)

    headers = ["No.", "Student Number", "Last Name", "First Name"]

    xlsx_data = create_test_xlsx_workbook({
        "BSCS 1A": [
            {
                "No.": 1,
                "Student Number": "00201",
                "Last Name": "Rivera",
                "First Name": "Carlos",
            }
        ],
        "BSIT 1A": [
            {
                "No.": 1,
                "Student Number": "00201",
                "Last Name": "Rivera",
                "First Name": "Carlos",
            }
        ]
    }, headers)

    parsed_rows = student_import_service.parse_student_import(import_batch, xlsx_data)

    assert len(parsed_rows) == 2

    for row in parsed_rows:
        assert row["validation_status"] == ImportValidationStatus.conflict_cross_program
        assert "00201" in row["conflict_key"]

    records = db_session.exec(
        select(StudentImportRecord).where(
            StudentImportRecord.import_batch_id == import_batch.id
        )
    ).all()
    assert len(records) == 2


# --- 3C-03: conflict_cross_program must mean cross-PROGRAM, not merely
# cross-SHEET. These tests use a mocked session (like the 3C-02 persistence
# tests above) so they can run even when PostgreSQL/the 3B-02 migration is
# unavailable in the sandbox. ---


def test_same_program_different_sections_not_cross_program_conflict():
    """Case A: BSCS 1A + BSCS 2A, same student number.

    Different sections of the SAME program must NOT be classified as
    conflict_cross_program. The duplicate should instead be handled the
    same way an in-sheet duplicate is: one row valid, the other flagged
    invalid as a duplicate.
    """
    mock_session = MagicMock()
    service = StudentImportService(session=mock_session)

    import_batch = ImportBatch(id=uuid4(), source_filename="test_masterlist.xlsx")

    headers = ["No.", "Student Number", "Last Name", "First Name"]
    xlsx_data = create_test_xlsx_workbook(
        {
            "BSCS 1A": [
                {"No.": 1, "Student Number": "01001", "Last Name": "Reyes", "First Name": "Liza"}
            ],
            "BSCS 2A": [
                {"No.": 1, "Student Number": "01001", "Last Name": "Reyes", "First Name": "Liza"}
            ],
        },
        headers,
    )

    parsed_rows = service.parse_student_import(import_batch, xlsx_data)

    assert len(parsed_rows) == 2

    statuses = {row["validation_status"] for row in parsed_rows}
    assert ImportValidationStatus.conflict_cross_program not in statuses

    valid_rows = [r for r in parsed_rows if r["validation_status"] == ImportValidationStatus.valid]
    invalid_rows = [r for r in parsed_rows if r["validation_status"] == ImportValidationStatus.invalid]
    assert len(valid_rows) == 1
    assert len(invalid_rows) == 1
    assert "Duplicate student number" in invalid_rows[0]["validation_errors"][0]
    assert invalid_rows[0]["conflict_key"] == "01001"


def test_bsit_same_program_different_sections_not_cross_program_conflict():
    """Case B: BSIT 1A + BSIT 2A, same student number -> not conflict_cross_program."""
    mock_session = MagicMock()
    service = StudentImportService(session=mock_session)

    import_batch = ImportBatch(id=uuid4(), source_filename="test_masterlist.xlsx")

    headers = ["No.", "Student Number", "Last Name", "First Name"]
    xlsx_data = create_test_xlsx_workbook(
        {
            "BSIT 1A": [
                {"No.": 1, "Student Number": "01002", "Last Name": "Torres", "First Name": "Miko"}
            ],
            "BSIT 2A": [
                {"No.": 1, "Student Number": "01002", "Last Name": "Torres", "First Name": "Miko"}
            ],
        },
        headers,
    )

    parsed_rows = service.parse_student_import(import_batch, xlsx_data)

    assert len(parsed_rows) == 2
    statuses = {row["validation_status"] for row in parsed_rows}
    assert ImportValidationStatus.conflict_cross_program not in statuses

    valid_rows = [r for r in parsed_rows if r["validation_status"] == ImportValidationStatus.valid]
    invalid_rows = [r for r in parsed_rows if r["validation_status"] == ImportValidationStatus.invalid]
    assert len(valid_rows) == 1
    assert len(invalid_rows) == 1


def test_cross_program_duplicate_still_flagged():
    """Case C: BSCS 1A + BSIT 1A, same student number -> conflict_cross_program,
    and conflict_key remains the student number."""
    mock_session = MagicMock()
    service = StudentImportService(session=mock_session)

    import_batch = ImportBatch(id=uuid4(), source_filename="test_masterlist.xlsx")

    headers = ["No.", "Student Number", "Last Name", "First Name"]
    xlsx_data = create_test_xlsx_workbook(
        {
            "BSCS 1A": [
                {"No.": 1, "Student Number": "01003", "Last Name": "Gomez", "First Name": "Ella"}
            ],
            "BSIT 1A": [
                {"No.": 1, "Student Number": "01003", "Last Name": "Gomez", "First Name": "Ella"}
            ],
        },
        headers,
    )

    parsed_rows = service.parse_student_import(import_batch, xlsx_data)

    assert len(parsed_rows) == 2
    for row in parsed_rows:
        assert row["validation_status"] == ImportValidationStatus.conflict_cross_program
        assert row["conflict_key"] == "01003"


def test_different_students_across_programs_not_conflicting():
    """Case D: different student numbers in BSCS 1A and BSIT 1A -> no conflict."""
    mock_session = MagicMock()
    service = StudentImportService(session=mock_session)

    import_batch = ImportBatch(id=uuid4(), source_filename="test_masterlist.xlsx")

    headers = ["No.", "Student Number", "Last Name", "First Name"]
    xlsx_data = create_test_xlsx_workbook(
        {
            "BSCS 1A": [
                {"No.": 1, "Student Number": "01004", "Last Name": "Diaz", "First Name": "Noel"}
            ],
            "BSIT 1A": [
                {"No.": 1, "Student Number": "01005", "Last Name": "Fuentes", "First Name": "Rae"}
            ],
        },
        headers,
    )

    parsed_rows = service.parse_student_import(import_batch, xlsx_data)

    assert len(parsed_rows) == 2
    for row in parsed_rows:
        assert row["validation_status"] == ImportValidationStatus.valid
        assert row["conflict_key"] is None


def test_same_program_duplicate_staging_persistence_compatibility():
    """3C-03 + 3C-02: a same-program, multi-section duplicate must still reach
    the staging layer via the existing create_staging_records() persistence
    path, unchanged from 3C-02, with the corrected (non-cross-program)
    validation_status."""
    mock_session = MagicMock()
    service = StudentImportService(session=mock_session)

    import_batch = ImportBatch(id=uuid4(), source_filename="test_masterlist.xlsx")

    headers = ["No.", "Student Number", "Last Name", "First Name"]
    xlsx_data = create_test_xlsx_workbook(
        {
            "BSCS 1A": [
                {"No.": 1, "Student Number": "01006", "Last Name": "Ramos", "First Name": "Kyle"}
            ],
            "BSCS 2A": [
                {"No.": 1, "Student Number": "01006", "Last Name": "Ramos", "First Name": "Kyle"}
            ],
        },
        headers,
    )

    parsed_rows = service.parse_student_import(import_batch, xlsx_data)

    assert len(parsed_rows) == 2
    assert mock_session.add.call_count == 2

    persisted_records = [call.args[0] for call in mock_session.add.call_args_list]
    for record in persisted_records:
        assert isinstance(record, StudentImportRecord)
        assert record.import_batch_id == import_batch.id
        assert record.raw_student_number == "01006"
        assert record.validation_status != ImportValidationStatus.conflict_cross_program

    statuses = {record.validation_status for record in persisted_records}
    assert statuses == {ImportValidationStatus.valid, ImportValidationStatus.invalid}
    mock_session.commit.assert_not_called()


def test_validation_summary(
    student_import_service: StudentImportService,
):
    """Test validation summary generation"""
    parsed_rows = [
        {"validation_status": ImportValidationStatus.valid},
        {"validation_status": ImportValidationStatus.valid},
        {"validation_status": ImportValidationStatus.invalid},
        {"validation_status": ImportValidationStatus.conflict_cross_program},
        {"validation_status": ImportValidationStatus.invalid},
    ]

    summary = student_import_service.get_validation_summary(parsed_rows)

    assert summary["total_rows"] == 5
    assert summary["valid_rows"] == 2
    assert summary["invalid_rows"] == 2
    assert summary["conflict_rows"] == 1
    assert summary["rows_by_status"][ImportValidationStatus.valid] == 2
    assert summary["rows_by_status"][ImportValidationStatus.invalid] == 2
    assert summary["rows_by_status"][ImportValidationStatus.conflict_cross_program] == 1


def test_empty_file_handling(
    student_import_service: StudentImportService,
    db_session: Session,
):
    """Test handling of empty/invalid XLSX file"""
    import_batch = ImportBatch(
        source_filename="test_masterlist.xlsx",
        academic_year="2026-2027",
        semester="1st Semester"
    )
    db_session.add(import_batch)
    db_session.commit()
    db_session.refresh(import_batch)

    with pytest.raises(ValueError, match="Failed to parse XLSX file"):
        student_import_service.parse_student_import(
            import_batch,
            b"invalid not an xlsx file"
        )


def test_whitespace_normalization(
    student_import_service: StudentImportService,
    db_session: Session,
):
    """Test that whitespace around cell values is normalized"""
    import_batch = ImportBatch(
        source_filename="test_masterlist.xlsx",
        academic_year="2026-2027",
        semester="1st Semester"
    )
    db_session.add(import_batch)
    db_session.commit()
    db_session.refresh(import_batch)

    test_rows = [
        {
            "No.": 1,
            "Student Number": " 00105 ",
            "Last Name": "  Dela Cruz  ",
            "First Name": "  Juan  ",
            "Middle Name": "  Garcia  ",
        },
    ]

    xlsx_data = create_test_xlsx_sheet("BSCS 1A", test_rows)
    parsed_rows = student_import_service.parse_student_import(import_batch, xlsx_data)

    assert len(parsed_rows) == 1
    assert parsed_rows[0]["raw_student_number"] == "00105"
    assert parsed_rows[0]["raw_last_name"] == "Dela Cruz"
    assert parsed_rows[0]["raw_first_name"] == "Juan"
    assert parsed_rows[0]["raw_middle_name"] == "Garcia"


def test_sections_as_source_sheet(
    student_import_service: StudentImportService,
    db_session: Session,
):
    """Test that section sheet names are preserved as source_sheet"""
    import_batch = ImportBatch(
        source_filename="test_masterlist.xlsx",
        academic_year="2026-2027",
        semester="1st Semester"
    )
    db_session.add(import_batch)
    db_session.commit()
    db_session.refresh(import_batch)

    test_rows = [
        {
            "No.": 1,
            "Student Number": "00301",
            "Last Name": "Lopez",
            "First Name": "Carlos",
        },
    ]

    xlsx_data = create_test_xlsx_sheet("BSCS 1A", test_rows)
    parsed_rows = student_import_service.parse_student_import(import_batch, xlsx_data)

    assert len(parsed_rows) == 1
    assert parsed_rows[0]["source_sheet"] == "BSCS 1A"


def test_header_detection_and_source_row_provenance(
    student_import_service: StudentImportService,
    db_session: Session,
):
    """The importer must locate the header after the real workbook preamble."""
    import_batch = ImportBatch(
        source_filename="test_masterlist.xlsx",
        academic_year="2026-2027",
        semester="1st Semester",
    )
    db_session.add(import_batch)
    db_session.commit()

    xlsx_data = create_test_xlsx_sheet(
        "CS 1A",
        [{
            "No.": 1,
            "Student Number": "0426-0016",
            "Last Name": "Adona",
            "First Name": "Patrick John",
            "Status": "Regular",
        }],
    )

    parsed_rows = student_import_service.parse_student_import(import_batch, xlsx_data)

    assert len(parsed_rows) == 1
    assert parsed_rows[0]["source_row"] == 4
    assert parsed_rows[0]["raw_student_number"] == "0426-0016"
    assert parsed_rows[0]["raw_last_name"] == "Adona"
    assert parsed_rows[0]["raw_first_name"] == "Patrick John"


@pytest.mark.parametrize(
    ("sheet_name", "expected"),
    [
        ("BSCS 1A", ("BSCS", "1", "A")),
        ("BSIT 1A", ("BSIT", "1", "A")),
        ("BSIT 3A", ("BSIT", "3", "A")),
        ("BSIT 4B", ("BSIT", "4", "B")),
        ("PROA 1A", ("PROA", "1", "A")),
    ],
)
def test_derive_section_from_masterlist_sheet_names(
    student_import_service: StudentImportService,
    sheet_name: str,
    expected: tuple[str, str, str],
):
    """_derive_section_from_sheet() uses the generic
    "<PROGRAM_CODE> <YEAR_LEVEL><SECTION_LETTERS>" contract (see
    test_student_promotion.py for the primary coverage of this contract,
    including malformed-input cases). Previously this parametrized case
    covered a narrower "CS"/"IT" sheet-naming convention that returned the
    full sheet name as the section name; that convention was never
    documented (docs/Phase-3-Student-Data-Field-Mapping.md and the rest of
    this file consistently use "BSCS"/"BSIT") and was incompatible with the
    synthetic program codes (e.g. "PROA") that StudentPromotionService's
    locked 3C-06 contract requires _derive_section_from_sheet() to support.
    """
    assert student_import_service._derive_section_from_sheet(sheet_name) == expected


def test_parse_student_import_persists_staging_records():
    """3C-02: parse_student_import() must persist parsed rows into the
    StudentImportRecord staging layer via the existing create_staging_records()
    helper, without requiring a live database (session is mocked here so this
    test can run even when the import-table migration, 3B-02, is unavailable).
    """
    mock_session = MagicMock()
    service = StudentImportService(session=mock_session)

    import_batch = ImportBatch(
        id=uuid4(),
        source_filename="test_masterlist.xlsx",
        academic_year="2026-2027",
        semester="1st Semester",
    )

    headers = [
        "No.",
        "Student Number",
        "Last Name",
        "First Name",
        "Middle Name",
        "Mobile Number",
        "Email",
        "Subjects Enrolled",
        "Status",
    ]
    test_rows = [
        {
            "No.": 1,
            "Student Number": "00501",
            "Last Name": "Cruz",
            "First Name": "Ana",
            "Middle Name": "Reyes",
            "Mobile Number": "09171234567",
            "Email": "ana.cruz@example.com",
            "Subjects Enrolled": "CS101; CS102",
            "Status": "Regular",
        }
    ]
    xlsx_data = create_test_xlsx_sheet("BSCS 1A", test_rows, headers)

    parsed_rows = service.parse_student_import(import_batch, xlsx_data)

    assert len(parsed_rows) == 1
    assert parsed_rows[0]["raw_student_number"] == "00501"

    assert mock_session.add.call_count == 1
    persisted_record = mock_session.add.call_args[0][0]

    assert isinstance(persisted_record, StudentImportRecord)
    assert persisted_record.import_batch_id == import_batch.id
    assert persisted_record.source_sheet == "BSCS 1A"
    assert persisted_record.source_row == 4
    assert persisted_record.raw_student_number == "00501"
    assert persisted_record.raw_last_name == "Cruz"
    assert persisted_record.raw_first_name == "Ana"
    assert persisted_record.raw_middle_name == "Reyes"
    assert persisted_record.raw_mobile_number == "09171234567"
    assert persisted_record.raw_email == "ana.cruz@example.com"
    assert persisted_record.raw_subjects_enrolled == "CS101; CS102"
    assert persisted_record.raw_status == "Regular"
    assert persisted_record.validation_status == ImportValidationStatus.valid
    assert persisted_record.validation_errors == []
    assert persisted_record.conflict_key is None

    mock_session.commit.assert_not_called()


def test_parse_student_import_persists_conflicting_rows():
    """3C-02: conflict/invalid rows must also reach the staging layer so they
    remain visible for later, out-of-scope conflict resolution (3C-03)."""
    mock_session = MagicMock()
    service = StudentImportService(session=mock_session)

    import_batch = ImportBatch(id=uuid4(), source_filename="test_masterlist.xlsx")

    headers = ["No.", "Student Number", "Last Name", "First Name"]
    xlsx_data = create_test_xlsx_workbook(
        {
            "BSCS 1A": [
                {"No.": 1, "Student Number": "00601", "Last Name": "Rivera", "First Name": "Carlos"}
            ],
            "BSIT 1A": [
                {"No.": 1, "Student Number": "00601", "Last Name": "Rivera", "First Name": "Carlos"}
            ],
        },
        headers,
    )

    parsed_rows = service.parse_student_import(import_batch, xlsx_data)

    assert len(parsed_rows) == 2
    assert mock_session.add.call_count == 2

    persisted_records = [call.args[0] for call in mock_session.add.call_args_list]
    for record in persisted_records:
        assert record.validation_status == ImportValidationStatus.conflict_cross_program
        assert record.conflict_key == "00601"
        assert record.import_batch_id == import_batch.id


def test_create_staging_records(
    student_import_service: StudentImportService,
    db_session: Session,
):
    """Test that StudentImportRecord staging records are created correctly"""
    import_batch = ImportBatch(
        source_filename="test_masterlist.xlsx",
        academic_year="2026-2027",
        semester="1st Semester"
    )
    db_session.add(import_batch)
    db_session.commit()
    db_session.refresh(import_batch)

    parsed_rows = [
        {
            "source_sheet": "BSCS 1A",
            "source_row": 1,
            "source_no": 1,
            "raw_student_number": "00401",
            "raw_last_name": "Sanchez",
            "raw_first_name": "Ana",
            "raw_middle_name": "Reyes",
            "raw_mobile_number": "09999999999",
            "raw_email": "ana.sanchez@example.com",
            "raw_subjects_enrolled": "CS101; CS102",
            "raw_status": "Regular",
            "validation_status": ImportValidationStatus.valid,
            "validation_errors": [],
            "conflict_key": None,
        }
    ]

    records = student_import_service.create_staging_records(import_batch, parsed_rows)

    assert len(records) == 1
    assert isinstance(records[0], StudentImportRecord)
    assert records[0].import_batch_id == import_batch.id
    assert records[0].source_sheet == "BSCS 1A"
    assert records[0].raw_student_number == "00401"
    assert records[0].raw_last_name == "Sanchez"
    assert records[0].raw_first_name == "Ana"
    assert records[0].raw_middle_name == "Reyes"
    assert records[0].raw_mobile_number == "09999999999"
    assert records[0].raw_email == "ana.sanchez@example.com"
    assert records[0].raw_subjects_enrolled == "CS101; CS102"
    assert records[0].raw_status == "Regular"
    assert records[0].validation_status == ImportValidationStatus.valid
    assert len(records[0].validation_errors) == 0
    assert records[0].conflict_key is None


# ---------------------------------------------------------------------------
# 3C-04: Summary Reconciliation
# ---------------------------------------------------------------------------

_RECONCILIATION_HEADERS = ["No.", "Student Number", "Last Name", "First Name", "Status"]


def test_summary_reconciliation_matching_workbook():
    """Test 1: Summary values that exactly match the discovered section-sheet
    data reconcile successfully, with no discrepancy reported."""
    mock_session = MagicMock()
    service = StudentImportService(session=mock_session)

    import_batch = ImportBatch(id=uuid4(), source_filename="test_masterlist.xlsx")

    sections = {
        "BSCS 1A": [
            {"No.": 1, "Student Number": "10001", "Last Name": "Aquino", "First Name": "Liza", "Status": "Regular"},
            {"No.": 2, "Student Number": "10002", "Last Name": "Bautista", "First Name": "Marc", "Status": "Irregular"},
        ],
        "BSIT 1A": [
            {"No.": 1, "Student Number": "10003", "Last Name": "Cruz", "First Name": "Nina", "Status": "Regular"},
        ],
    }
    xlsx_data = create_test_xlsx_workbook_with_summary(
        sections,
        _RECONCILIATION_HEADERS,
        summary_values={"total_students": 3, "regular": 2, "irregular": 1, "sections": 2},
    )

    parsed_rows = service.parse_student_import(import_batch, xlsx_data)
    assert len(parsed_rows) == 3
    assert all(row["source_sheet"] != "Summary" for row in parsed_rows)

    reconciliation = service.get_summary_reconciliation()
    assert reconciliation["summary_sheet_found"] is True
    assert reconciliation["status"] == "matched"
    assert reconciliation["discrepancies"] == []
    for metric in ("total_students", "regular", "irregular", "sections"):
        assert reconciliation["checks"][metric]["status"] == "matched"


def test_summary_reconciliation_total_mismatch():
    """Test 2: A Summary total that differs from the discovered section-sheet
    total must be reported explicitly."""
    mock_session = MagicMock()
    service = StudentImportService(session=mock_session)

    import_batch = ImportBatch(id=uuid4(), source_filename="test_masterlist.xlsx")

    sections = {
        "BSCS 1A": [
            {"No.": 1, "Student Number": "20001", "Last Name": "Diaz", "First Name": "Tomas", "Status": "Regular"},
            {"No.": 2, "Student Number": "20002", "Last Name": "Espino", "First Name": "Faye", "Status": "Regular"},
        ],
    }
    xlsx_data = create_test_xlsx_workbook_with_summary(
        sections,
        _RECONCILIATION_HEADERS,
        summary_values={"total_students": 5, "regular": 2, "irregular": 0, "sections": 1},
    )

    parsed_rows = service.parse_student_import(import_batch, xlsx_data)
    assert len(parsed_rows) == 2

    reconciliation = service.get_summary_reconciliation()
    assert reconciliation["status"] == "mismatched"
    total_check = reconciliation["checks"]["total_students"]
    assert total_check["status"] == "mismatched"
    assert total_check["declared"] == 5
    assert total_check["calculated"] == 2
    assert any("Total students" in msg for msg in reconciliation["discrepancies"])


def test_summary_reconciliation_regular_irregular_mismatch():
    """Test 3: A Summary regular/irregular count that differs from the
    supplied Status values on the section sheets must be reported."""
    mock_session = MagicMock()
    service = StudentImportService(session=mock_session)

    import_batch = ImportBatch(id=uuid4(), source_filename="test_masterlist.xlsx")

    sections = {
        "BSCS 1A": [
            {"No.": 1, "Student Number": "30001", "Last Name": "Garcia", "First Name": "Ivy", "Status": "Regular"},
            {"No.": 2, "Student Number": "30002", "Last Name": "Herrera", "First Name": "Joel", "Status": "Irregular"},
            {"No.": 3, "Student Number": "30003", "Last Name": "Ilagan", "First Name": "Kaye", "Status": "Irregular"},
        ],
    }
    xlsx_data = create_test_xlsx_workbook_with_summary(
        sections,
        _RECONCILIATION_HEADERS,
        summary_values={"total_students": 3, "regular": 2, "irregular": 1, "sections": 1},
    )

    service.parse_student_import(import_batch, xlsx_data)
    reconciliation = service.get_summary_reconciliation()

    assert reconciliation["status"] == "mismatched"
    regular_check = reconciliation["checks"]["regular"]
    irregular_check = reconciliation["checks"]["irregular"]
    assert regular_check["status"] == "mismatched"
    assert regular_check["declared"] == 2
    assert regular_check["calculated"] == 1
    assert irregular_check["status"] == "mismatched"
    assert irregular_check["declared"] == 1
    assert irregular_check["calculated"] == 2
    assert reconciliation["checks"]["total_students"]["status"] == "matched"
    assert reconciliation["checks"]["sections"]["status"] == "matched"


def test_summary_reconciliation_section_count_mismatch():
    """Test 4: A Summary section count that differs from the number of
    recognized section sheets must be reported."""
    mock_session = MagicMock()
    service = StudentImportService(session=mock_session)

    import_batch = ImportBatch(id=uuid4(), source_filename="test_masterlist.xlsx")

    sections = {
        "BSCS 1A": [
            {"No.": 1, "Student Number": "40001", "Last Name": "Javier", "First Name": "Lito", "Status": "Regular"},
        ],
        "BSIT 1A": [
            {"No.": 1, "Student Number": "40002", "Last Name": "Katigbak", "First Name": "Mae", "Status": "Regular"},
        ],
    }
    xlsx_data = create_test_xlsx_workbook_with_summary(
        sections,
        _RECONCILIATION_HEADERS,
        summary_values={"total_students": 2, "regular": 2, "irregular": 0, "sections": 5},
    )

    service.parse_student_import(import_batch, xlsx_data)
    reconciliation = service.get_summary_reconciliation()

    assert reconciliation["status"] == "mismatched"
    sections_check = reconciliation["checks"]["sections"]
    assert sections_check["status"] == "mismatched"
    assert sections_check["declared"] == 5
    assert sections_check["calculated"] == 2


def test_summary_reconciliation_no_hardcoded_totals():
    """Test 5: reconciliation must work against arbitrary, dynamically
    supplied Summary figures - not the known Masterlist.xlsx totals of
    632/557/75/19. This workbook matches on purpose, using numbers with no
    relation to the known workbook, to prove nothing is hardcoded."""
    mock_session = MagicMock()
    service = StudentImportService(session=mock_session)

    import_batch = ImportBatch(id=uuid4(), source_filename="test_masterlist.xlsx")

    sections = {
        "BSCS 1A": [
            {"No.": i, "Student Number": f"5{i:04d}", "Last Name": "Lopez", "First Name": f"Student{i}", "Status": "Regular"}
            for i in range(1, 6)
        ]
        + [
            {"No.": i, "Student Number": f"5{i:04d}", "Last Name": "Lopez", "First Name": f"Student{i}", "Status": "Irregular"}
            for i in range(6, 8)
        ],
        "BSIT 1A": [
            {"No.": 1, "Student Number": "59001", "Last Name": "Marquez", "First Name": "Nico", "Status": "Regular"},
        ],
        "BSIT 1B": [
            {"No.": 1, "Student Number": "59002", "Last Name": "Ong", "First Name": "Pia", "Status": "Regular"},
        ],
    }
    xlsx_data = create_test_xlsx_workbook_with_summary(
        sections,
        _RECONCILIATION_HEADERS,
        summary_values={"total_students": 9, "regular": 7, "irregular": 2, "sections": 3},
    )

    parsed_rows = service.parse_student_import(import_batch, xlsx_data)
    assert len(parsed_rows) == 9

    reconciliation = service.get_summary_reconciliation()
    assert reconciliation["status"] == "matched"
    assert reconciliation["checks"]["total_students"]["calculated"] == 9
    assert reconciliation["checks"]["regular"]["calculated"] == 7
    assert reconciliation["checks"]["irregular"]["calculated"] == 2
    assert reconciliation["checks"]["sections"]["calculated"] == 3


def test_summary_reconciliation_missing_summary_sheet_is_unavailable():
    """A workbook with no Summary sheet at all must be reported as
    unavailable rather than silently treated as a match."""
    mock_session = MagicMock()
    service = StudentImportService(session=mock_session)

    import_batch = ImportBatch(id=uuid4(), source_filename="test_masterlist.xlsx")

    xlsx_data = create_test_xlsx_workbook(
        {
            "BSCS 1A": [
                {"No.": 1, "Student Number": "60001", "Last Name": "Perez", "First Name": "Ruel"},
            ],
        },
        ["No.", "Student Number", "Last Name", "First Name"],
    )

    service.parse_student_import(import_batch, xlsx_data)
    reconciliation = service.get_summary_reconciliation()

    assert reconciliation["summary_sheet_found"] is False
    assert reconciliation["status"] == "unavailable"
    assert reconciliation["discrepancies"] == ["Summary sheet not found in workbook."]


def test_summary_reconciliation_unknown_status_values_reported_unavailable():
    """If a section sheet supplies a Status value that is neither Regular
    nor Irregular, the regular/irregular reconciliation must be reported as
    unavailable rather than silently treating the row as not-regular."""
    mock_session = MagicMock()
    service = StudentImportService(session=mock_session)

    import_batch = ImportBatch(id=uuid4(), source_filename="test_masterlist.xlsx")

    sections = {
        "BSCS 1A": [
            {"No.": 1, "Student Number": "70001", "Last Name": "Quimson", "First Name": "Sam", "Status": "Regular"},
            {"No.": 2, "Student Number": "70002", "Last Name": "Rosales", "First Name": "Tina", "Status": "Leave of Absence"},
        ],
    }
    xlsx_data = create_test_xlsx_workbook_with_summary(
        sections,
        _RECONCILIATION_HEADERS,
        summary_values={"total_students": 2, "regular": 1, "irregular": 1, "sections": 1},
    )

    service.parse_student_import(import_batch, xlsx_data)
    reconciliation = service.get_summary_reconciliation()

    assert reconciliation["checks"]["regular"]["status"] == "unavailable"
    assert reconciliation["checks"]["irregular"]["status"] == "unavailable"
    assert reconciliation["checks"]["total_students"]["status"] == "matched"
    assert reconciliation["checks"]["sections"]["status"] == "matched"
    assert reconciliation["status"] == "unavailable"
