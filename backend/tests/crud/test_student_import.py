"""Tests for Student Import Service"""

import pytest
from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

from openpyxl import Workbook
from sqlmodel import Session, select

from app.models import ImportBatch, StudentImportRecord, ImportValidationStatus
from app.services.student_import import StudentImportService


@pytest.fixture
def student_import_service(db_session: Session) -> StudentImportService:
    """Create a StudentImportService with a test session"""
    return StudentImportService(session=db_session)


def create_test_xlsx_sheet(
    sheet_name: str,
    rows: list[dict],
    headers: list[str] = None
) -> bytes:
    """Helper to create a test XLSX workbook in memory"""
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name

    if headers:
        ws.append(headers)

    for row_data in rows:
        ws.append(list(row_data.values()))

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

    for parsed_row, expected in zip(parsed_rows, test_rows):
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
            "Student Number": " 00105 ",  # Extra whitespace
            "Last Name": "  Dela Cruz  ",  # Extra whitespace
            "First Name": "  Juan  ",  # Extra whitespace
            "Middle Name": "  Garcia  ",  # Extra whitespace
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

    # The return contract is unchanged: still the parsed row dicts, not ORM objects.
    assert len(parsed_rows) == 1
    assert parsed_rows[0]["raw_student_number"] == "00501"

    # The parser must now persist a staging record via the session.
    assert mock_session.add.call_count == 1
    persisted_record = mock_session.add.call_args[0][0]

    assert isinstance(persisted_record, StudentImportRecord)
    assert persisted_record.import_batch_id == import_batch.id
    assert persisted_record.source_sheet == "BSCS 1A"
    assert persisted_record.source_row == 2
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

    # Commit stays the caller's/route's responsibility, matching the project's
    # existing session convention (create_staging_records already only calls add()).
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