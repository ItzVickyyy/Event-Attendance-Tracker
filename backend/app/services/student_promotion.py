"""Student Import Promotion Service - staging -> operational schema.

Implements Phase 3, steps 4-6 of docs/SOURCE-OF-TRUTH.md's import process
("Normalize program/section", "Create/update Person", "Create/update
Student") for CLEAN (validation_status == valid) StudentImportRecord rows,
per the locked 3C-06 design.
"""

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from sqlmodel import Session, col, select

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
    get_datetime_utc,
)
from app.services.student_import import StudentImportService


@dataclass
class BlockedRow:
    """A valid, not-yet-promoted staging row that could not be promoted this
    run because required reference data was missing or ambiguous, rather
    than because the row itself is invalid/conflicting."""

    record_id: UUID
    source_sheet: str
    source_row: int
    raw_student_number: str | None
    reason: str


@dataclass
class PromotionResult:
    """Outcome of a single promote_import_batch() call."""

    import_batch_id: UUID
    total_staging_rows: int = 0
    eligible_rows: int = 0
    already_promoted_rows: int = 0
    newly_promoted_rows: int = 0
    invalid_rows_skipped: int = 0
    conflict_rows_skipped: int = 0
    blocked_rows: list[BlockedRow] = field(default_factory=list)
    batch_status: ImportBatchStatus | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "import_batch_id": str(self.import_batch_id),
            "total_staging_rows": self.total_staging_rows,
            "eligible_rows": self.eligible_rows,
            "already_promoted_rows": self.already_promoted_rows,
            "newly_promoted_rows": self.newly_promoted_rows,
            "invalid_rows_skipped": self.invalid_rows_skipped,
            "conflict_rows_skipped": self.conflict_rows_skipped,
            "blocked_rows": [
                {
                    "record_id": str(b.record_id),
                    "source_sheet": b.source_sheet,
                    "source_row": b.source_row,
                    "raw_student_number": b.raw_student_number,
                    "reason": b.reason,
                }
                for b in self.blocked_rows
            ],
            "batch_status": self.batch_status.value if self.batch_status else None,
        }


class StudentPromotionService:
    """Promotes clean StudentImportRecord staging rows into the operational
    Person/Student/AcademicProgram/AcademicSection schema.

    Only rows with validation_status == valid are eligible. Rows that are
    invalid or conflict_cross_program are never promoted and their
    validation_status is never modified here (that remains 3C-03/3C-04
    territory). Already-promoted rows (promoted_student_id is not None) are
    left untouched on subsequent calls, making the operation idempotent.
    """

    def __init__(self, session: Session):
        self.session = session
        self._import_service = StudentImportService(session)

    def promote_import_batch(self, import_batch_id: UUID) -> PromotionResult:
        import_batch = self.session.get(ImportBatch, import_batch_id)
        if import_batch is None:
            raise ValueError(f"ImportBatch {import_batch_id} not found")

        result = PromotionResult(import_batch_id=import_batch_id)

        all_rows = self.session.exec(
            select(StudentImportRecord).where(
                col(StudentImportRecord.import_batch_id) == import_batch_id
            )
        ).all()
        result.total_staging_rows = len(all_rows)

        valid_rows = [
            row for row in all_rows
            if row.validation_status == ImportValidationStatus.valid
        ]
        result.eligible_rows = len(valid_rows)
        result.invalid_rows_skipped = sum(
            1 for row in all_rows
            if row.validation_status == ImportValidationStatus.invalid
        )
        result.conflict_rows_skipped = sum(
            1 for row in all_rows
            if row.validation_status == ImportValidationStatus.conflict_cross_program
        )

        for row in valid_rows:
            if row.promoted_student_id is not None:
                # Already promoted by a previous run: leave untouched.
                result.already_promoted_rows += 1
                continue

            try:
                with self.session.begin_nested():
                    student = self._promote_row(import_batch, row)
                    row.promoted_student_id = student.id
                    row.promoted_at = get_datetime_utc()
                    self.session.add(row)
                    self.session.flush()
                result.newly_promoted_rows += 1
            except _PromotionBlocked as exc:
                result.blocked_rows.append(
                    BlockedRow(
                        record_id=row.id,
                        source_sheet=row.source_sheet,
                        source_row=row.source_row,
                        raw_student_number=row.raw_student_number,
                        reason=str(exc),
                    )
                )

        # Per the locked 3C-06 status semantics: the batch reaches `promoted`
        # once every eligible (valid) staging row has a promoted_student_id -
        # i.e. no blocked rows remain among valid rows, this run or before.
        # Invalid/conflict rows never block this (they are never eligible).
        remaining_unpromoted_valid = self.session.exec(
            select(StudentImportRecord).where(
                col(StudentImportRecord.import_batch_id) == import_batch_id,
                col(StudentImportRecord.validation_status) == ImportValidationStatus.valid,
                col(StudentImportRecord.promoted_student_id).is_(None),
            )
        ).all()

        if result.eligible_rows > 0 and not remaining_unpromoted_valid:
            import_batch.status = ImportBatchStatus.promoted
            import_batch.updated_at = get_datetime_utc()
            self.session.add(import_batch)

        result.batch_status = import_batch.status

        self.session.commit()
        return result

    def _promote_row(
        self, import_batch: ImportBatch, row: StudentImportRecord
    ) -> Student:
        """Promote a single eligible staging row. Raises _PromotionBlocked
        (caught by the caller, which rolls back just this row's savepoint)
        if required reference data is missing or ambiguous. Never fabricates
        data to work around a missing prerequisite."""

        try:
            program_code, year_level, section_name = (
                self._import_service._derive_section_from_sheet(row.source_sheet)
            )
        except ValueError as exc:
            raise _PromotionBlocked(str(exc)) from exc

        academic_program = self.session.exec(
            select(AcademicProgram).where(
                col(AcademicProgram.program_code) == program_code
            )
        ).first()
        if academic_program is None:
            # AcademicProgram.program_name is required and the staging data
            # never supplies a full program name (only the sheet-derived
            # code) - so a missing program cannot be safely auto-created.
            # Per the project's data model, this must be created via the
            # existing /academic-programs endpoint before promotion.
            raise _PromotionBlocked(
                f"AcademicProgram with program_code={program_code!r} does not "
                f"exist. Create it via the academic-programs API before "
                f"promoting this batch."
            )

        if not import_batch.academic_year:
            raise _PromotionBlocked(
                "ImportBatch has no academic_year set; cannot resolve/create "
                "the AcademicSection it belongs to."
            )

        academic_section = self._get_or_create_section(
            academic_program.id, year_level, section_name, import_batch.academic_year
        )

        academic_status = self._import_service._normalize_status(row.raw_status)
        academic_status_enum = (
            AcademicStatus(academic_status) if academic_status else None
        )

        existing_student = self.session.exec(
            select(Student).where(
                col(Student.student_number) == row.raw_student_number
            )
        ).first()

        if existing_student is not None:
            # Design decision #2: reuse the existing Student/Person, do not
            # create a duplicate. Update section/status only.
            existing_student.section_id = academic_section.id
            existing_student.academic_status = academic_status_enum
            existing_student.updated_at = get_datetime_utc()
            self.session.add(existing_student)
            self.session.flush()
            return existing_student

        person = Person(
            first_name=row.raw_first_name,
            middle_name=row.raw_middle_name,
            last_name=row.raw_last_name,
        )
        self.session.add(person)
        self.session.flush()

        student = Student(
            person_id=person.id,
            student_number=row.raw_student_number,
            section_id=academic_section.id,
            academic_status=academic_status_enum,
        )
        self.session.add(student)
        self.session.flush()
        return student

    def _get_or_create_section(
        self,
        program_id: UUID,
        year_level: str,
        section_name: str,
        academic_year: str,
    ) -> AcademicSection:
        existing = self.session.exec(
            select(AcademicSection).where(
                col(AcademicSection.program_id) == program_id,
                col(AcademicSection.year_level) == year_level,
                col(AcademicSection.section_name) == section_name,
                col(AcademicSection.academic_year) == academic_year,
            )
        ).first()
        if existing is not None:
            return existing

        section = AcademicSection(
            program_id=program_id,
            year_level=year_level,
            section_name=section_name,
            academic_year=academic_year,
        )
        self.session.add(section)
        self.session.flush()
        return section


class _PromotionBlocked(Exception):
    """Internal signal: this row cannot be promoted this run. Caught inside
    promote_import_batch(); never escapes to the caller."""


def promote_import_batch(session: Session, import_batch_id: UUID) -> PromotionResult:
    """Module-level convenience wrapper, matching student_import.py's
    module-level function convention."""
    service = StudentPromotionService(session)
    return service.promote_import_batch(import_batch_id)
