from io import BytesIO
from uuid import uuid4

import pytest
from openpyxl import Workbook
from sqlmodel import select

from app.models import AcademicProgram, AcademicSection, ImportBatch
from app.services.student_import import (
    StudentImportService,
    parse_student_import,
    validate_student_import,
)
from app.student_academics import AcademicYear


def test_import_section_resolver_normalizes_exact_and_legacy_references(
    db_session,
) -> None:
    program = db_session.exec(
        select(AcademicProgram).where(AcademicProgram.program_code == "BSIT")
    ).first()
    assert program is not None

    exact = db_session.exec(
        select(AcademicSection).where(
            AcademicSection.program_id == program.id,
            AcademicSection.academic_year == "2026-2027",
            AcademicSection.section_name == "WMAD 3A",
        )
    ).first()
    assert exact is not None

    batch = ImportBatch(
        source_filename="section-resolver.xlsx",
        academic_year="2026-2027",
    )
    service = StudentImportService(db_session)

    assert service._resolve_import_section(batch, "  bsit   wmad 3a  ") == exact
    assert service._resolve_import_section(batch, "UNKNOWN 1A") is None
    assert service._resolve_import_section(batch, "BSIT") is None
    assert service._resolve_import_section(batch, "   ") is None

    legacy = AcademicSection(
        program_id=program.id,
        year_level="1st Year",
        section_name="Legacy Section",
        section_code="9Z",
        academic_year="2026-2027",
        academic_year_id=exact.academic_year_id,
    )
    db_session.add(legacy)
    db_session.flush()

    resolved = service._resolve_import_section(batch, "BSIT 9Z")
    assert resolved is not None
    assert resolved.id == legacy.id

    no_year = ImportBatch(source_filename="no-year.xlsx")
    assert service._resolve_import_section(no_year, "BSIT WMAD 3A") is None


def test_default_import_section_name_and_missing_section_errors(db_session) -> None:
    program = db_session.exec(
        select(AcademicProgram).where(AcademicProgram.program_code == "BSIT")
    ).first()
    year = db_session.exec(
        select(AcademicYear).where(AcademicYear.label == "2026-2027")
    ).first()
    assert program is not None
    assert year is not None

    section = db_session.exec(
        select(AcademicSection).where(
            AcademicSection.program_id == program.id,
            AcademicSection.academic_year_id == year.id,
            AcademicSection.section_name == "WMAD 3A",
        )
    ).first()
    assert section is not None

    batch = ImportBatch(
        source_filename="default-section.xlsx",
        default_section_id=section.id,
    )
    service = StudentImportService(db_session)
    assert service._default_section_name(batch) == (
        f"{program.program_code} {section.year_level}{section.section_name}"
    )

    batch.default_section_id = uuid4()
    with pytest.raises(ValueError, match="default section no longer exists"):
        service._default_section_name(batch)


def _workbook_bytes() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "BSIT WMAD 3A"
    sheet.append(["No.", "Student Number", "Last Name", "First Name", "Status"])
    sheet.append([1, "SERVICE-10001", "Student", "Casey", "Regular"])
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def test_import_service_file_dispatch_and_compatibility_wrappers(db_session) -> None:
    batch = ImportBatch(
        source_filename="service-wrapper.xlsx",
        academic_year="2026-2027",
    )
    db_session.add(batch)
    db_session.flush()

    service = StudentImportService(db_session)
    with pytest.raises(ValueError, match="Unsupported file type"):
        service.parse_student_import_file(batch, b"anything", "students.txt")

    parsed = parse_student_import(db_session, batch, _workbook_bytes())
    assert len(parsed) == 1
    assert parsed[0]["raw_student_number"] == "SERVICE-10001"

    validation_batch = ImportBatch(
        source_filename="service-validation-wrapper.xlsx",
        academic_year="2026-2027",
    )
    db_session.add(validation_batch)
    db_session.flush()
    summary = validate_student_import(db_session, validation_batch, _workbook_bytes())
    assert summary["total_rows"] == 1
