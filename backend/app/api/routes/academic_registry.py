import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, require_admin
from app.models import AcademicMajor, AcademicSection, Student
from app.student_academics import (
    AcademicYear,
    AcademicYearPublic,
    AcademicYearsPublic,
    SectionRegistryPublic,
    SectionRegistryRow,
    StudentEnrollment,
    StudentEnrollmentCreate,
    StudentEnrollmentPublic,
    StudentEnrollmentUpdate,
    StudentRosterPublic,
    StudentRosterRow,
)

router = APIRouter(prefix="/academic-registry", tags=["academic-registry"])


def _section_row_query() -> str:
    return """
        SELECT
            s.id,
            s.program_id,
            p.program_code,
            p.program_name,
            m.code AS major_code,
            m.name AS major_name,
            s.section_code,
            s.year_level,
            ay.id AS academic_year_id,
            ay.label AS academic_year,
            COUNT(DISTINCT CASE WHEN st.archived_at IS NULL THEN se.id END) AS enrolled
        FROM academic_sections s
        JOIN academic_programs p ON p.id = s.program_id
        JOIN academic_years ay ON ay.id = s.academic_year_id
        LEFT JOIN academic_section_majors sm ON sm.section_id = s.id
        LEFT JOIN academic_majors m ON m.id = sm.major_id
        LEFT JOIN student_enrollments se ON se.section_id = s.id AND se.academic_year_id = ay.id
        LEFT JOIN students st ON st.id = se.student_id
        GROUP BY s.id, s.program_id, p.program_code, p.program_name,
                 m.code, m.name, s.section_code, s.year_level, ay.id, ay.label
        ORDER BY p.program_code, s.year_level, m.code NULLS FIRST, s.section_code
    """


@router.get("/academic-years", response_model=AcademicYearsPublic)
def read_academic_years(session: SessionDep, _current_user: CurrentUser) -> Any:
    years = session.exec(select(AcademicYear).order_by(AcademicYear.start_year.desc())).all()
    return AcademicYearsPublic(
        data=[AcademicYearPublic.model_validate(year) for year in years], count=len(years)
    )


@router.get("/sections", response_model=SectionRegistryPublic)
def read_sections(session: SessionDep, _current_user: CurrentUser) -> Any:
    rows = session.execute(text(_section_row_query())).mappings().all()
    data = [SectionRegistryRow(**dict(row)) for row in rows]
    return SectionRegistryPublic(data=data, count=len(data))


@router.get("/sections/{section_id}/students", response_model=StudentRosterPublic)
def read_section_students(
    session: SessionDep,
    _current_user: CurrentUser,
    section_id: uuid.UUID,
    include_archived: bool = False,
) -> Any:
    archived_filter = "" if include_archived else "AND s.archived_at IS NULL"
    query = text(f"""
        SELECT
            s.id,
            s.student_number,
            p.last_name,
            p.first_name,
            p.middle_name,
            p.name_extension AS extension,
            p.email,
            p.contact_number,
            se.student_status,
            se.id AS enrollment_id,
            EXISTS (
                SELECT 1 FROM attendees a
                JOIN attendee_credentials c ON c.attendee_id = a.id
                WHERE a.person_id = s.person_id
                  AND CAST(c.credential_type AS TEXT) = 'nfc'
                  AND c.is_active = true
            ) AS nfc_registered,
            EXISTS (
                SELECT 1 FROM attendees a
                JOIN attendee_credentials c ON c.attendee_id = a.id
                WHERE a.person_id = s.person_id
                  AND CAST(c.credential_type AS TEXT) = 'qr'
                  AND c.is_active = true
            ) AS qr_registered
        FROM student_enrollments se
        JOIN students s ON s.id = se.student_id
        JOIN people p ON p.id = s.person_id
        WHERE se.section_id = :section_id
        {archived_filter}
        ORDER BY p.last_name, p.first_name, s.student_number
    """)
    rows = session.execute(query, {"section_id": section_id}).mappings().all()
    data = [StudentRosterRow(**dict(row)) for row in rows]
    return StudentRosterPublic(data=data, count=len(data))


@router.post("/enrollments", response_model=StudentEnrollmentPublic, dependencies=[Depends(require_admin)])
def create_enrollment(
    *, session: SessionDep, _current_user: CurrentUser, enrollment_in: StudentEnrollmentCreate
) -> Any:
    student = session.get(Student, enrollment_in.student_id)
    section = session.get(AcademicSection, enrollment_in.section_id)
    year = session.get(AcademicYear, enrollment_in.academic_year_id)
    if not student or not section or not year:
        raise HTTPException(status_code=404, detail="Student, section, or academic year not found")

    existing = session.exec(
        select(StudentEnrollment).where(
            StudentEnrollment.student_id == enrollment_in.student_id,
            StudentEnrollment.academic_year_id == enrollment_in.academic_year_id,
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Student is already enrolled for this academic year")

    enrollment = StudentEnrollment.model_validate(enrollment_in)
    session.add(enrollment)
    session.commit()
    session.refresh(enrollment)
    return enrollment


@router.patch("/enrollments/{enrollment_id}", response_model=StudentEnrollmentPublic, dependencies=[Depends(require_admin)])
def update_enrollment(
    *, session: SessionDep, _current_user: CurrentUser, enrollment_id: uuid.UUID, enrollment_in: StudentEnrollmentUpdate
) -> Any:
    enrollment = session.get(StudentEnrollment, enrollment_id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    updates = enrollment_in.model_dump(exclude_unset=True)
    if "section_id" in updates and updates["section_id"] is not None and not session.get(AcademicSection, updates["section_id"]):
        raise HTTPException(status_code=404, detail="Academic section not found")
    enrollment.sqlmodel_update(updates)
    session.add(enrollment)
    session.commit()
    session.refresh(enrollment)
    return enrollment


@router.post("/sections", response_model=SectionRegistryRow, dependencies=[Depends(require_admin)])
def create_section(*, session: SessionDep, _current_user: CurrentUser, payload: dict[str, Any]) -> Any:
    required = {"program_id", "academic_year_id", "year_level", "section_code"}
    if not required.issubset(payload):
        raise HTTPException(status_code=422, detail=f"Required fields: {', '.join(sorted(required))}")
    program_id = uuid.UUID(str(payload["program_id"]))
    academic_year_id = uuid.UUID(str(payload["academic_year_id"]))
    major_id = uuid.UUID(str(payload["major_id"])) if payload.get("major_id") else None
    year_level = str(payload["year_level"])
    section_code = str(payload["section_code"]).strip().upper()
    year = session.get(AcademicYear, academic_year_id)
    if not year:
        raise HTTPException(status_code=404, detail="Academic year not found")
    if major_id:
        major = session.get(AcademicMajor, major_id)
        if not major or major.program_id != program_id:
            raise HTTPException(status_code=400, detail="Major does not belong to the selected course")
        if year_level not in {"3rd Year", "4th Year"}:
            raise HTTPException(status_code=400, detail="Major is only valid for third- and fourth-year sections")
    elif year_level in {"3rd Year", "4th Year"}:
        raise HTTPException(status_code=400, detail="A major is required for third- and fourth-year sections")

    program = session.execute(text("SELECT program_code, program_name FROM academic_programs WHERE id = :id"), {"id": program_id}).mappings().first()
    if not program:
        raise HTTPException(status_code=404, detail="Course not found")

    section_id = uuid.uuid4()
    try:
        session.execute(text("""
            INSERT INTO academic_sections (id, program_id, year_level, section_name, academic_year, academic_year_id, section_code, created_at, updated_at)
            VALUES (:id, :program_id, :year_level, :section_code, :academic_year, :academic_year_id, :section_code, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """), {
            "id": section_id, "program_id": program_id, "year_level": year_level,
            "section_code": section_code, "academic_year": year.label, "academic_year_id": academic_year_id,
        })
        if major_id:
            session.execute(text("""
                INSERT INTO academic_section_majors (id, section_id, major_id, created_at, updated_at)
                VALUES (:id, :section_id, :major_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """), {"id": uuid.uuid4(), "section_id": section_id, "major_id": major_id})
        session.commit()
    except Exception:
        session.rollback()
        raise HTTPException(status_code=409, detail="Unable to create section. Check for a duplicate section.")

    return _get_section(session, section_id)


@router.patch("/sections/{section_id}", response_model=SectionRegistryRow, dependencies=[Depends(require_admin)])
def update_section(*, session: SessionDep, _current_user: CurrentUser, section_id: uuid.UUID, payload: dict[str, Any]) -> Any:
    section = session.get(AcademicSection, section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Academic section not found")
    allowed = {"program_id", "academic_year_id", "year_level", "section_code", "major_id"}
    unknown = set(payload) - allowed
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown fields: {', '.join(sorted(unknown))}")
    current_year_id = session.execute(text("SELECT academic_year_id FROM academic_sections WHERE id = :id"), {"id": section_id}).scalar_one()
    current_section_code = session.execute(text("SELECT section_code FROM academic_sections WHERE id = :id"), {"id": section_id}).scalar_one()
    values = {
        "program_id": uuid.UUID(str(payload.get("program_id", section.program_id))),
        "academic_year_id": uuid.UUID(str(payload.get("academic_year_id"))) if payload.get("academic_year_id") else current_year_id,
        "year_level": str(payload.get("year_level", section.year_level)),
        "section_code": str(payload.get("section_code", current_section_code)).strip().upper(),
    }
    major_id = uuid.UUID(str(payload["major_id"])) if payload.get("major_id") else None
    if values["year_level"] in {"3rd Year", "4th Year"} and not major_id:
        existing_major = session.execute(text("SELECT major_id FROM academic_section_majors WHERE section_id = :id"), {"id": section_id}).scalar_one_or_none()
        major_id = existing_major
    if values["year_level"] in {"3rd Year", "4th Year"} and not major_id:
        raise HTTPException(status_code=400, detail="A major is required for third- and fourth-year sections")
    if major_id:
        major = session.get(AcademicMajor, major_id)
        if not major or major.program_id != values["program_id"]:
            raise HTTPException(status_code=400, detail="Major does not belong to the selected course")
    year = session.get(AcademicYear, values["academic_year_id"])
    if not year:
        raise HTTPException(status_code=404, detail="Academic year not found")

    session.execute(text("""
        UPDATE academic_sections
        SET program_id = :program_id, year_level = :year_level, section_code = :section_code,
            section_name = :section_code, academic_year_id = :academic_year_id,
            academic_year = :academic_year, updated_at = CURRENT_TIMESTAMP
        WHERE id = :id
    """), {**values, "academic_year": year.label, "id": section_id})
    session.execute(text("DELETE FROM academic_section_majors WHERE section_id = :id"), {"id": section_id})
    if major_id:
        session.execute(text("""
            INSERT INTO academic_section_majors (id, section_id, major_id, created_at, updated_at)
            VALUES (:id, :section_id, :major_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """), {"id": uuid.uuid4(), "section_id": section_id, "major_id": major_id})
    session.commit()
    return _get_section(session, section_id)


def _get_section(session: SessionDep, section_id: uuid.UUID) -> SectionRegistryRow:
    base_query = _section_row_query().replace("ORDER BY p.program_code, s.year_level, m.code NULLS FIRST, s.section_code", "")
    row = session.execute(text(f"SELECT * FROM ({base_query}) section_rows WHERE id = :section_id"), {"section_id": section_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Academic section not found")
    return SectionRegistryRow(**dict(row))
