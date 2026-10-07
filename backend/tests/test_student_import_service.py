from uuid import uuid4

import pytest
from sqlmodel import select

from app.models import AcademicProgram, AcademicSection, AcademicYear, ImportBatch
from app.services.student_import import StudentImportService


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
