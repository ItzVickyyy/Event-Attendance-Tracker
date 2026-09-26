"""Tests for Student Import Promotion Service (3C-06)"""

from unittest.mock import MagicMock

import pytest
from sqlmodel import Session, select

from app.models import (
    AcademicProgram,
    AcademicSection,
    AcademicStatus,
    ImportBatch,
    ImportBatchStatus,
    ImportValidationStatus,
    Person,
    Student,
    StudentImportRecord,
)
from app.services.student_import import StudentImportService
from app.services.student_promotion import StudentPromotionService

# ---------------------------------------------------------------------------
# Section-sheet parsing (item L.1) - no database required.
# ---------------------------------------------------------------------------


def test_derive_section_from_sheet_bscs_1a():
    service = StudentImportService(session=MagicMock())
    assert service._derive_section_from_sheet("BSCS 1A") == ("BSCS", "1", "A")


def test_derive_section_from_sheet_bsit_3a():
    service = StudentImportService(session=MagicMock())
    assert service._derive_section_from_sheet("BSIT 3A") == ("BSIT", "3", "A")


def test_derive_section_from_sheet_extra_whitespace():
    service = StudentImportService(session=MagicMock())
    assert service._derive_section_from_sheet("  BSCS   2B  ") == ("BSCS", "2", "B")


@pytest.mark.parametrize(
    "malformed_name",
    ["Summary", "BSCS", "1A", "BSCS1A", "", "   "],
)
def test_derive_section_from_sheet_malformed(malformed_name):
    service = StudentImportService(session=MagicMock())
    with pytest.raises(ValueError):
        service._derive_section_from_sheet(malformed_name)


def test_derive_program_from_sheet_unchanged():
    """_derive_program_from_sheet must remain lenient/unchanged by this task."""
    service = StudentImportService(session=MagicMock())
    assert service._derive_program_from_sheet("BSCS 1A") == "BSCS"
    # Still tolerant of malformed input, unlike the new strict helper.
    assert service._derive_program_from_sheet("Summary") == "SUMMARY"


# ---------------------------------------------------------------------------
# Database-backed promotion tests. These require a live PostgreSQL database
# with the 3B-02 / 3C-06 migrations applied (see db_session fixture in
# tests/conftest.py). In an environment without PostgreSQL, these are
# collected but fail at fixture setup - see the task's final report for how
# that was verified/handled in the sandbox.
# ---------------------------------------------------------------------------


def _make_batch(db_session: Session, academic_year: str = "2026-2027") -> ImportBatch:
    batch = ImportBatch(source_filename="masterlist.xlsx", academic_year=academic_year)
    db_session.add(batch)
    db_session.commit()
    db_session.refresh(batch)
    return batch


def _make_staging_row(
    db_session: Session,
    batch: ImportBatch,
    *,
    source_sheet: str = "BSCS 1A",
    source_row: int = 2,
    student_number: str = "00701",
    last_name: str = "Cruz",
    first_name: str = "Ana",
    status: str = "Regular",
    validation_status: ImportValidationStatus = ImportValidationStatus.valid,
    conflict_key: str | None = None,
) -> StudentImportRecord:
    row = StudentImportRecord(
        import_batch_id=batch.id,
        source_sheet=source_sheet,
        source_row=source_row,
        raw_student_number=student_number,
        raw_last_name=last_name,
        raw_first_name=first_name,
        raw_status=status,
        validation_status=validation_status,
        validation_errors=[],
        conflict_key=conflict_key,
    )
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    return row


def test_academic_program_get_or_create(db_session: Session):
    batch = _make_batch(db_session)
    program = AcademicProgram(program_code="PROA", program_name="Test Program A")
    db_session.add(program)
    db_session.commit()

    _make_staging_row(db_session, batch, source_sheet="PROA 1A", student_number="00711")
    service = StudentPromotionService(session=db_session)
    result = service.promote_import_batch(batch.id)

    assert result.newly_promoted_rows == 1
    assert result.blocked_rows == []

    programs = db_session.exec(
        select(AcademicProgram).where(AcademicProgram.program_code == "PROA")
    ).all()
    assert len(programs) == 1  # reused, not duplicated


def test_missing_academic_program_is_blocked_not_fabricated(db_session: Session):
    """No PROB AcademicProgram exists yet - promotion must not invent one."""
    batch = _make_batch(db_session)
    row = _make_staging_row(
        db_session, batch, source_sheet="PROB 1A", student_number="00712"
    )

    service = StudentPromotionService(session=db_session)
    result = service.promote_import_batch(batch.id)

    assert result.newly_promoted_rows == 0
    assert len(result.blocked_rows) == 1
    assert "AcademicProgram" in result.blocked_rows[0].reason
    db_session.refresh(row)
    assert row.promoted_student_id is None


def test_academic_section_get_or_create(db_session: Session):
    batch = _make_batch(db_session)
    program = AcademicProgram(program_code="PROC", program_name="Test Program C")
    db_session.add(program)
    db_session.commit()

    _make_staging_row(
        db_session, batch, source_sheet="PROC 1A", source_row=2, student_number="00721"
    )
    _make_staging_row(
        db_session, batch, source_sheet="PROC 1A", source_row=3, student_number="00722"
    )

    service = StudentPromotionService(session=db_session)
    result = service.promote_import_batch(batch.id)

    assert result.newly_promoted_rows == 2
    sections = db_session.exec(
        select(AcademicSection).where(AcademicSection.program_id == program.id)
    ).all()
    assert len(sections) == 1  # both rows share PROC 1A -> one section, reused
    assert sections[0].year_level == "1"
    assert sections[0].section_name == "A"
    assert sections[0].academic_year == "2026-2027"


def test_clean_row_creates_person_and_student(db_session: Session):
    batch = _make_batch(db_session)
    db_session.add(AcademicProgram(program_code="PROD", program_name="Test Program D"))
    db_session.commit()

    row = _make_staging_row(
        db_session,
        batch,
        source_sheet="PROD 1A",
        student_number="00731",
        last_name="Dela Cruz",
        first_name="Juan",
        status="Regular",
    )

    service = StudentPromotionService(session=db_session)
    result = service.promote_import_batch(batch.id)

    assert result.newly_promoted_rows == 1
    db_session.refresh(row)
    assert row.promoted_student_id is not None
    assert row.promoted_at is not None

    student = db_session.get(Student, row.promoted_student_id)
    assert student is not None
    assert student.student_number == "00731"
    assert student.academic_status == AcademicStatus.regular
    assert student.section is not None
    assert student.section.section_name == "A"

    person = db_session.get(Person, student.person_id)
    assert person is not None
    assert person.first_name == "Juan"
    assert person.last_name == "Dela Cruz"


def test_promotion_is_idempotent(db_session: Session):
    batch = _make_batch(db_session)
    db_session.add(AcademicProgram(program_code="PROE", program_name="Test Program E"))
    db_session.commit()

    _make_staging_row(db_session, batch, source_sheet="PROE 1A", student_number="00741")

    service = StudentPromotionService(session=db_session)
    first_result = service.promote_import_batch(batch.id)
    second_result = service.promote_import_batch(batch.id)

    assert first_result.newly_promoted_rows == 1
    assert second_result.newly_promoted_rows == 0
    assert second_result.already_promoted_rows == 1

    students = db_session.exec(
        select(Student).where(Student.student_number == "00741")
    ).all()
    assert len(students) == 1

    programs = db_session.exec(
        select(AcademicProgram).where(AcademicProgram.program_code == "PROE")
    ).all()
    assert len(programs) == 1

    sections = db_session.exec(
        select(AcademicSection).where(AcademicSection.program_id == programs[0].id)
    ).all()
    assert len(sections) == 1

    people = db_session.exec(
        select(Person).where(Person.id == students[0].person_id)
    ).all()
    assert len(people) == 1


def test_invalid_rows_are_not_promoted(db_session: Session):
    batch = _make_batch(db_session)
    db_session.add(AcademicProgram(program_code="PROF", program_name="Test Program F"))
    db_session.commit()

    row = _make_staging_row(
        db_session,
        batch,
        source_sheet="PROF 1A",
        student_number="00751",
        validation_status=ImportValidationStatus.invalid,
    )

    service = StudentPromotionService(session=db_session)
    result = service.promote_import_batch(batch.id)

    assert result.eligible_rows == 0
    assert result.invalid_rows_skipped == 1
    db_session.refresh(row)
    assert row.promoted_student_id is None
    assert row.validation_status == ImportValidationStatus.invalid  # untouched


def test_conflict_rows_are_not_promoted(db_session: Session):
    batch = _make_batch(db_session)
    db_session.add(AcademicProgram(program_code="PROG", program_name="Test Program G"))
    db_session.commit()

    row = _make_staging_row(
        db_session,
        batch,
        source_sheet="PROG 1A",
        student_number="00761",
        validation_status=ImportValidationStatus.conflict_cross_program,
        conflict_key="00761",
    )

    service = StudentPromotionService(session=db_session)
    result = service.promote_import_batch(batch.id)

    assert result.eligible_rows == 0
    assert result.conflict_rows_skipped == 1
    db_session.refresh(row)
    assert row.promoted_student_id is None
    assert (
        row.validation_status == ImportValidationStatus.conflict_cross_program
    )  # untouched


def test_existing_student_number_reused_across_batches(db_session: Session):
    program = AcademicProgram(program_code="PROH", program_name="Test Program H")
    db_session.add(program)
    db_session.commit()

    batch1 = _make_batch(db_session, academic_year="2025-2026")
    row1 = _make_staging_row(
        db_session,
        batch1,
        source_sheet="PROH 1A",
        student_number="00771",
        last_name="Reyes",
        first_name="Liza",
        status="Regular",
    )
    StudentPromotionService(session=db_session).promote_import_batch(batch1.id)
    db_session.refresh(row1)
    original_student_id = row1.promoted_student_id
    original_person_id = db_session.get(Student, original_student_id).person_id

    # Later import batch: same student, new section/status.
    batch2 = _make_batch(db_session, academic_year="2026-2027")
    row2 = _make_staging_row(
        db_session,
        batch2,
        source_sheet="PROH 2B",
        student_number="00771",
        last_name="Reyes",
        first_name="Liza",
        status="Irregular",
    )
    result2 = StudentPromotionService(session=db_session).promote_import_batch(
        batch2.id
    )

    assert result2.newly_promoted_rows == 1
    db_session.refresh(row2)
    assert row2.promoted_student_id == original_student_id  # same Student reused

    students = db_session.exec(
        select(Student).where(Student.student_number == "00771")
    ).all()
    assert len(students) == 1  # no duplicate Student

    student = students[0]
    assert student.person_id == original_person_id  # Person identity preserved
    assert student.academic_status == AcademicStatus.irregular  # status updated
    assert student.section.section_name == "B"  # section updated
    assert student.section.year_level == "2"


def test_batch_status_becomes_promoted_after_success(db_session: Session):
    batch = _make_batch(db_session)
    db_session.add(AcademicProgram(program_code="PROI", program_name="Test Program I"))
    db_session.commit()

    _make_staging_row(db_session, batch, source_sheet="PROI 1A", student_number="00781")

    assert batch.status == ImportBatchStatus.pending

    result = StudentPromotionService(session=db_session).promote_import_batch(batch.id)

    assert result.batch_status == ImportBatchStatus.promoted
    db_session.refresh(batch)
    assert batch.status == ImportBatchStatus.promoted


def test_batch_status_not_promoted_while_rows_blocked(db_session: Session):
    """No AcademicProgram exists, so the row is blocked, not promoted -
    the batch must not be marked `promoted`."""
    batch = _make_batch(db_session)
    _make_staging_row(db_session, batch, source_sheet="PROJ 1A", student_number="00791")

    result = StudentPromotionService(session=db_session).promote_import_batch(batch.id)

    assert result.batch_status != ImportBatchStatus.promoted
    db_session.refresh(batch)
    assert batch.status == ImportBatchStatus.pending
