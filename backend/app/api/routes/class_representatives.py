import csv
import io
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import text
from sqlmodel import select

from app import crud
from app.api.deps import CurrentUser, SessionDep, require_super_admin
from app.core.config import settings
from app.models import Person, Student, User, UserCreate, UserPublic, UserRole
from app.services import account_provisioning
from app.services.student_credentials import ensure_student_qr_credential
from app.student_academics import (
    AcademicYear,
    ClassRepresentativeAssignment,
    ClassRepresentativeCreate,
    StudentEnrollment,
)
from app.utils import generate_new_account_email, send_email

TEMPORARY_PASSWORD = account_provisioning.TEMPORARY_PASSWORD
_generate_temporary_password = account_provisioning.generate_temporary_password

router = APIRouter(prefix="/class-representatives", tags=["class-representatives"])


def _assignment_row(
    session: SessionDep, user_id: uuid.UUID, academic_year_id: uuid.UUID | None = None
) -> dict[str, Any] | None:
    query = """
        SELECT cra.id, cra.user_id, cra.academic_year_id, cra.section_id,
               ay.label AS academic_year, p.program_code, p.program_name,
               s.section_code, s.section_name, s.year_level,
               COUNT(DISTINCT CASE
                   WHEN st.archived_at IS NULL AND se.archived_at IS NULL THEN se.id
               END) AS student_count
        FROM class_representative_assignments cra
        JOIN academic_years ay ON ay.id = cra.academic_year_id
        JOIN academic_sections s ON s.id = cra.section_id
        JOIN academic_programs p ON p.id = s.program_id
        LEFT JOIN student_enrollments se
          ON se.section_id = s.id AND se.academic_year_id = ay.id
         AND se.archived_at IS NULL
        LEFT JOIN students st ON st.id = se.student_id
        WHERE cra.user_id = :user_id
    """
    params: dict[str, Any] = {"user_id": user_id}
    if academic_year_id:
        query += " AND cra.academic_year_id = :academic_year_id"
        params["academic_year_id"] = academic_year_id
    query += """
        GROUP BY cra.id, cra.user_id, cra.academic_year_id, cra.section_id,
                 ay.label, ay.start_year, p.program_code, p.program_name, s.section_code, s.section_name, s.year_level
        ORDER BY ay.start_year DESC
        LIMIT 1
    """
    row = session.connection().execute(text(query), params).mappings().first()
    return dict(row) if row else None


@router.get("/me")
def read_my_assignment(
    session: SessionDep,
    current_user: CurrentUser,
    academic_year_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    if current_user.role != UserRole.class_representative:
        raise HTTPException(
            status_code=403, detail="Class Representative access required"
        )
    row = _assignment_row(session, current_user.id, academic_year_id)
    if not row:
        raise HTTPException(
            status_code=404, detail="No Class Representative assignment found"
        )
    return row


@router.get("/me/students")
def read_my_students(
    session: SessionDep,
    current_user: CurrentUser,
    academic_year_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    if current_user.role != UserRole.class_representative:
        raise HTTPException(
            status_code=403, detail="Class Representative access required"
        )
    assignment = _assignment_row(session, current_user.id, academic_year_id)
    if not assignment:
        raise HTTPException(
            status_code=404, detail="No Class Representative assignment found"
        )
    rows = (
        session.connection()
        .execute(
            text("""
            SELECT s.id, s.student_number, p.first_name, p.middle_name, p.last_name,
                   p.name_extension AS extension, p.email, p.contact_number,
                   se.student_status, se.id AS enrollment_id
            FROM student_enrollments se
            JOIN students s ON s.id = se.student_id
            JOIN people p ON p.id = s.person_id
            WHERE se.section_id = :section_id
              AND se.academic_year_id = :academic_year_id
              AND se.archived_at IS NULL
              AND s.archived_at IS NULL
            ORDER BY p.last_name, p.first_name, s.student_number
        """),
            {
                "section_id": assignment["section_id"],
                "academic_year_id": assignment["academic_year_id"],
            },
        )
        .mappings()
        .all()
    )
    return {"data": [dict(row) for row in rows], "count": len(rows)}


@router.post("/me/students")
def create_my_student(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: dict[str, Any],
    academic_year_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    if current_user.role != UserRole.class_representative:
        raise HTTPException(
            status_code=403, detail="Class Representative access required"
        )
    assignment = _assignment_row(session, current_user.id, academic_year_id)
    if not assignment:
        raise HTTPException(
            status_code=403, detail="No Class Representative assignment found"
        )
    required = {"student_number", "first_name", "last_name"}
    if not required.issubset(payload):
        raise HTTPException(
            status_code=422,
            detail="student_number, first_name, and last_name are required",
        )
    if session.exec(
        select(Student).where(Student.student_number == str(payload["student_number"]))
    ).first():
        raise HTTPException(
            status_code=409, detail="A student with this student number already exists"
        )
    person = Person(
        first_name=str(payload["first_name"]).strip(),
        middle_name=str(payload["middle_name"]).strip()
        if payload.get("middle_name")
        else None,
        last_name=str(payload["last_name"]).strip(),
        name_extension=str(payload["extension"]).strip()
        if payload.get("extension")
        else None,
        email=str(payload["email"]).strip() if payload.get("email") else None,
        contact_number=str(payload["contact_number"]).strip()
        if payload.get("contact_number")
        else None,
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
    ensure_student_qr_credential(session, student)
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
        session.connection()
        .execute(
            text("""
            SELECT u.id, u.email, u.full_name, u.is_active,
                   cra.id AS assignment_id, cra.academic_year_id, cra.section_id,
                   ay.label AS academic_year, p.program_code, s.section_code, s.section_name, s.year_level
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
    )
    return {"data": [dict(row) for row in rows], "count": len(rows)}


@router.post(
    "/", response_model=UserPublic, dependencies=[Depends(require_super_admin)]
)
def create_class_representative(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    payload: ClassRepresentativeCreate,
) -> User:
    if not settings.emails_enabled and settings.FASTAPI_ENV != "test":
        raise HTTPException(
            status_code=503,
            detail="Email delivery must be configured before creating Class Representative accounts",
        )
    if crud.get_user_by_email(session=session, email=payload.email):
        raise HTTPException(
            status_code=409, detail="A user with this email already exists"
        )
    year = session.get(AcademicYear, payload.academic_year_id)
    section = (
        session.connection()
        .execute(
            text("SELECT id, academic_year_id FROM academic_sections WHERE id=:id"),
            {"id": payload.section_id},
        )
        .mappings()
        .first()
    )
    if not year or not section:
        raise HTTPException(
            status_code=404, detail="Academic year or section not found"
        )
    if section["academic_year_id"] != year.id:
        raise HTTPException(
            status_code=400,
            detail="Section does not belong to the selected academic year",
        )
    middle_initial = payload.middle_initial.strip() if payload.middle_initial else ""
    full_name = " ".join(
        part
        for part in [
            payload.first_name.strip(),
            f"{middle_initial}."
            if middle_initial and not middle_initial.endswith(".")
            else middle_initial,
            payload.last_name.strip(),
            payload.extension.strip() if payload.extension else "",
        ]
        if part
    )
    temporary_password = _generate_temporary_password()
    user = crud.create_user(
        session=session,
        user_create=UserCreate(
            email=payload.email,
            password=temporary_password,
            role=UserRole.class_representative,
            full_name=full_name,
            first_name=payload.first_name.strip(),
            middle_name=middle_initial.rstrip(".") or None,
            last_name=payload.last_name.strip(),
            name_extension=payload.extension.strip() if payload.extension else None,
            can_scan=False,
        ),
        commit=False,
    )
    user.must_change_password = True
    session.add(user)
    assignment = ClassRepresentativeAssignment(
        user_id=user.id,
        academic_year_id=year.id,
        section_id=section["id"],
    )
    session.add(assignment)
    session.flush()
    if settings.emails_enabled:
        try:
            email_data = generate_new_account_email(
                email_to=user.email,
                username=user.email,
                password=temporary_password,
            )
            send_email(
                email_to=user.email,
                subject=email_data.subject,
                html_content=email_data.html_content,
            )
        except Exception as exc:
            session.rollback()
            raise HTTPException(
                status_code=503,
                detail=(
                    "Class Representative account was not created because "
                    "credentials could not be delivered. Check email delivery "
                    "and retry."
                ),
            ) from exc
    session.commit()
    session.refresh(user)
    return user


@router.post(
    "/import",
    dependencies=[Depends(require_super_admin)],
    include_in_schema=False,
)
async def import_class_representatives(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """Import representatives from CSV after validating every row."""
    filename = (file.filename or "").lower()
    if not filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Upload a CSV file")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    try:
        reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
        required_headers = {
            "email",
            "first name",
            "last name",
            "academic year",
            "section",
        }
        headers = {
            str(header or "").strip().lower() for header in (reader.fieldnames or [])
        }
        if not required_headers.issubset(headers):
            raise HTTPException(
                status_code=422,
                detail=(
                    "CSV headers must include Email, First Name, Last Name, "
                    "Academic Year, and Section"
                ),
            )
        rows = list(reader)
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400, detail="CSV must use UTF-8 encoding"
        ) from exc

    if not rows:
        raise HTTPException(status_code=400, detail="CSV contains no data rows")
    if len(rows) > 500:
        raise HTTPException(status_code=400, detail="Import is limited to 500 rows")

    normalized: list[dict[str, Any]] = []
    seen_emails: set[str] = set()
    errors: list[str] = []
    for index, row in enumerate(rows, start=2):
        values = {
            str(key or "").strip().lower(): str(value or "").strip()
            for key, value in row.items()
        }
        email = values.get("email", "").lower()
        first_name = values.get("first name", "")
        middle_initial = values.get("middle initial", "")
        last_name = values.get("last name", "")
        extension = values.get("extension", "")
        year_label = values.get("academic year", "")
        section_label = values.get("section", "")
        row_errors: list[str] = []

        if not email or "@" not in email:
            row_errors.append("valid email is required")
        if not first_name or not last_name:
            row_errors.append("first and last name are required")
        if not year_label or not section_label:
            row_errors.append("academic year and section are required")
        if email and (
            email in seen_emails or crud.get_user_by_email(session=session, email=email)
        ):
            row_errors.append("email is duplicated or already registered")

        year = (
            session.exec(
                select(AcademicYear).where(AcademicYear.label == year_label)
            ).first()
            if year_label
            else None
        )
        section_row = None
        if year and section_label:
            section_row = (
                session.connection()
                .execute(
                    text("""
                        SELECT s.id, s.academic_year_id
                        FROM academic_sections s
                        JOIN academic_programs p ON p.id = s.program_id
                        WHERE s.academic_year_id = :year_id
                          AND (
                            s.section_name = :section
                            OR s.section_code = :section
                            OR p.program_code || ' ' || s.section_name = :section
                          )
                        LIMIT 1
                    """),
                    {"year_id": year.id, "section": section_label},
                )
                .mappings()
                .first()
            )

        if year_label and not year:
            row_errors.append("academic year not found")
        if section_label and not section_row:
            row_errors.append("section not found for the selected academic year")
        if row_errors:
            errors.append(f"Row {index}: {', '.join(row_errors)}")
            continue
        if year is None or section_row is None:
            errors.append(
                f"Row {index}: academic year or section could not be resolved"
            )
            continue

        seen_emails.add(email)
        normalized.append(
            {
                "email": email,
                "first_name": first_name,
                "middle_initial": middle_initial,
                "last_name": last_name,
                "extension": extension,
                "year": year,
                "section_id": section_row["id"],
            }
        )

    if errors:
        raise HTTPException(status_code=422, detail=errors)
    if not settings.emails_enabled and settings.FASTAPI_ENV != "test":
        raise HTTPException(
            status_code=503,
            detail=(
                "Email delivery must be configured before importing "
                "Class Representative accounts"
            ),
        )

    created: list[tuple[User, str]] = []
    try:
        for row in normalized:
            middle = row["middle_initial"].rstrip(".")
            full_name = " ".join(
                part
                for part in (
                    row["first_name"],
                    f"{middle}." if middle else "",
                    row["last_name"],
                    row["extension"],
                )
                if part
            )
            temporary_password = _generate_temporary_password()
            user = crud.create_user(
                session=session,
                user_create=UserCreate(
                    email=row["email"],
                    password=temporary_password,
                    role=UserRole.class_representative,
                    full_name=full_name,
                    first_name=row["first_name"],
                    middle_name=middle or None,
                    last_name=row["last_name"],
                    name_extension=row["extension"] or None,
                    can_scan=False,
                ),
                commit=False,
            )
            user.must_change_password = True
            session.add(user)
            session.add(
                ClassRepresentativeAssignment(
                    user_id=user.id,
                    academic_year_id=row["year"].id,
                    section_id=row["section_id"],
                )
            )
            session.flush()
            created.append((user, temporary_password))

        if settings.emails_enabled:
            for user, temporary_password in created:
                email_data = generate_new_account_email(
                    email_to=user.email,
                    username=user.email,
                    password=temporary_password,
                )
                send_email(
                    email_to=user.email,
                    subject=email_data.subject,
                    html_content=email_data.html_content,
                )
        session.commit()
    except Exception as exc:
        session.rollback()
        raise HTTPException(
            status_code=503,
            detail=(
                "Import was rolled back because account credentials could not be "
                "delivered. Check email delivery and retry."
            ),
        ) from exc

    return {"created_count": len(created), "count": len(created)}
