import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlmodel import select

from app import crud
from app.api.deps import CurrentUser, SessionDep, require_super_admin
from app.core.config import settings
from app.models import Person, Student, User, UserCreate, UserPublic, UserRole
from app.student_academics import (
    AcademicYear,
    ClassRepresentativeAssignment,
    ClassRepresentativeCreate,
    StudentEnrollment,
)
from app.utils import generate_new_account_email, send_email

router = APIRouter(prefix="/class-representatives", tags=["class-representatives"])

TEMPORARY_PASSWORD = "ChangeThisPassword"


def _assignment_row(
    session: SessionDep, user_id: uuid.UUID, academic_year_id: uuid.UUID | None = None
) -> dict[str, Any] | None:
    query = """
        SELECT cra.id, cra.user_id, cra.academic_year_id, cra.section_id,
               ay.label AS academic_year, p.program_code, p.program_name,
               s.section_code, s.year_level,
               COUNT(DISTINCT CASE WHEN st.archived_at IS NULL THEN se.id END) AS student_count
        FROM class_representative_assignments cra
        JOIN academic_years ay ON ay.id = cra.academic_year_id
        JOIN academic_sections s ON s.id = cra.section_id
        JOIN academic_programs p ON p.id = s.program_id
        LEFT JOIN student_enrollments se
          ON se.section_id = s.id AND se.academic_year_id = ay.id
        LEFT JOIN students st ON st.id = se.student_id
        WHERE cra.user_id = :user_id
    """
    params: dict[str, Any] = {"user_id": user_id}
    if academic_year_id:
        query += " AND cra.academic_year_id = :academic_year_id"
        params["academic_year_id"] = academic_year_id
    query += """
        GROUP BY cra.id, cra.user_id, cra.academic_year_id, cra.section_id,
                 ay.label, p.program_code, p.program_name, s.section_code, s.year_level
        ORDER BY ay.start_year DESC
        LIMIT 1
    """
    row = session.execute(text(query), params).mappings().first()
    return dict(row) if row else None


@router.get("/me")
def read_my_assignment(
    session: SessionDep,
    current_user: CurrentUser,
    academic_year_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    if current_user.role != UserRole.class_representative:
        raise HTTPException(\n            status_code=403, detail="Class Representative access required"\n        )
    row = _assignment_row(session, current_user.id, academic_year_id)
    if not row:
        raise HTTPException(\n            status_code=404, detail="No Class Representative assignment found"\n        )
    return row


@router.get("/me/students")
def read_my_students(
    session: SessionDep,
    current_user: CurrentUser,
    academic_year_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    assignment = _assignment_row(session, current_user.id, academic_year_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="No Class Representative assignment found")
    rows = (
        session.execute(
            text("""
            SELECT s.id, s.student_number, p.first_name, p.middle_name, p.last_name,
                   p.name_extension AS extension, p.email, p.contact_number,
                   se.student_status, se.id AS enrollment_id
            FROM student_enrollments se
            JOIN students s ON s.id = se.student_id
            JOIN people p ON p.id = s.person_id
            WHERE se.section_id = :section_id
              AND se.academic_year_id = :academic_year_id
              AND s.archived_at IS NULL
            ORDER BY p.last_name, p.first_name, s.student_number
        """),
        {
            "section_id": assignment["section_id"],
            "academic_year_id": assignment["academic_year_id"],
        },
    ).mappings().all()
    return {"data": [dict(row) for row in rows], "count": len(rows)}


@router.post("/me/students")
def create_my_student(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: dict[str, Any],
) -> dict[str, Any]:
    assignment = _assignment_row(session, current_user.id)
    if not assignment:
        raise HTTPException(status_code=403, detail="No Class Representative assignment found")
    required = {"student_number", "first_name", "last_name"}
    if not required.issubset(payload):
        raise HTTPException(\n            status_code=422,\n            detail="student_number, first_name, and last_name are required",\n        )
    if session.exec(
        select(Student).where(Student.student_number == str(payload["student_number"]))
    ).first():
        raise HTTPException(\n            status_code=409, detail="A student with this student number already exists"\n        )
    person = Person(
        first_name=str(payload["first_name"]).strip(),
        middle_name=str(payload["middle_name"]).strip()\n        if payload.get("middle_name")\n        else None,
        last_name=str(payload["last_name"]).strip(),
        name_extension=str(payload["extension"]).strip()\n        if payload.get("extension")\n        else None,
        email=str(payload["email"]).strip() if payload.get("email") else None,
        contact_number=str(payload["contact_number"]).strip()\n        if payload.get("contact_number")\n        else None,
    )
    session.add(person)
    session.flush()
    student = Student(
        person_id=person.id,
        student_number=str(payload["student_number"]).strip(),
        section_id=assignment["section_id"],
    )
    session.add(student)
    session.flush()
    enrollment = StudentEnrollment(
        student_id=student.id,
        academic_year_id=assignment["academic_year_id"],
        section_id=assignment["section_id"],
    )
    session.add(enrollment)
    session.commit()
    return {
        "id": student.id,
        "enrollment_id": enrollment.id,
        "message": "Student added successfully",
    }


@router.get("/", dependencies=[Depends(require_super_admin)])
def list_class_representatives(
    session: SessionDep, _current_user: CurrentUser
) -> dict[str, Any]:
    rows = (
        session.execute(
            text("""
            SELECT u.id, u.email, u.full_name, u.is_active,
                   cra.id AS assignment_id, cra.academic_year_id, cra.section_id,
                   ay.label AS academic_year, p.program_code, s.section_code, s.year_level
            FROM "user" u
            LEFT JOIN class_representative_assignments cra ON cra.user_id = u.id
            LEFT JOIN academic_years ay ON ay.id = cra.academic_year_id
            LEFT JOIN academic_sections s ON s.id = cra.section_id
            LEFT JOIN academic_programs p ON p.id = s.program_id
            WHERE u.role = 'class_representative'
            ORDER BY u.full_name, ay.start_year DESC NULLS LAST
        """)
        )
        .mappings()
        .all()
    )    return {"data": [dict(row) for row in rows], "count": len(rows)}


@router.post(\n    "/", response_model=UserPublic, dependencies=[Depends(require_super_admin)]\n)
def create_class_representative(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    payload: ClassRepresentativeCreate,
) -> User:
    if crud.get_user_by_email(session=session, email=payload.email):
        raise HTTPException(\n            status_code=409, detail="A user with this email already exists"\n        )
    year = session.get(AcademicYear, payload.academic_year_id)
    section = (
        session.execute(
            text("SELECT id, academic_year_id FROM academic_sections WHERE id=:id"),
            {"id": payload.section_id},
        )
        .mappings()
        .first()
    )
    if not year or not section:
        raise HTTPException(\n            status_code=404, detail="Academic year or section not found"\n        )
    if section["academic_year_id"] != year.id:
        raise HTTPException(\n            status_code=400, detail="Section does not belong to the selected academic year"\n        )
    full_name = " ".join(
        part
        for part in [
            payload.first_name.strip(),
            f"{payload.middle_initial.strip()}."
            if payload.middle_initial
            and not payload.middle_initial.strip().endswith(".")
            else (
                payload.middle_initial.strip() if payload.middle_initial else ""
            ),
            payload.last_name.strip(),
            payload.extension.strip() if payload.extension else "",
        ]
        if part
    )
    user = crud.create_user(
        session=session,
        user_create=UserCreate(
            email=payload.email,
            password=TEMPORARY_PASSWORD,
            role=UserRole.class_representative,
            full_name=full_name,
            can_scan=False,
        ),
    )
    user.must_change_password = True
    session.add(user)
    assignment = ClassRepresentativeAssignment(
        user_id=user.id,
        academic_year_id=year.id,
        section_id=section["id"],
    )
    session.add(assignment)
    session.commit()
    session.refresh(user)
    if settings.emails_enabled:
        email_data = generate_new_account_email(
            email_to=user.email,
            username=user.email,
            password=TEMPORARY_PASSWORD,
        )
        send_email(\n            email_to=user.email,\n            subject=email_data.subject,\n            html_content=email_data.html_content,\n        )
    return user
