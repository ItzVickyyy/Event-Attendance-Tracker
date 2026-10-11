import csv
import io
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from openpyxl import Workbook  # type: ignore[import-untyped]
from sqlmodel import col, delete, func, select

from app import crud
from app.api.deps import (
    CurrentUser,
    SessionDep,
    require_admin,
    require_super_admin,
)
from app.core.config import settings
from app.core.security import get_password_hash, verify_password
from app.models import (
    AcademicProgram,
    AcademicSection,
    Message,
    OfficerAccountCreate,
    OfficerAccountImportCommit,
    OfficerPosition,
    OfficerPositionCreate,
    OfficerPositionPublic,
    OfficerPositionsPublic,
    OfficerPositionUpdate,
    UpdatePassword,
    User,
    UserCreate,
    UserPublic,
    UserRegister,
    UserRole,
    UsersPublic,
    UserUpdate,
    UserUpdateMe,
)
from app.services.account_provisioning import generate_temporary_password
from app.services.officer_import import parse_officer_import_file
from app.student_academics import AcademicYear, ClassRepresentativeAssignment
from app.utils import generate_new_account_email, send_email

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/", response_model=UsersPublic)
def read_users(
    session: SessionDep,
    _current_user: User = Depends(require_admin),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Retrieve users.
    """

    # Developer accounts are isolated from ordinary account administration.
    count_statement = (
        select(func.count()).select_from(User).where(col(User.is_developer).is_(False))
    )
    count = session.exec(count_statement).one()

    statement = (
        select(User)
        .where(col(User.is_developer).is_(False))
        .order_by(col(User.created_at).desc())
        .offset(skip)
        .limit(limit)
    )
    users = session.exec(statement).all()

    users_public = [UserPublic.model_validate(user) for user in users]
    return UsersPublic(data=users_public, count=count)


@router.post("/", response_model=UserPublic)
def create_user(
    *,
    session: SessionDep,
    user_in: UserCreate,
    current_user: User = Depends(require_admin),
) -> Any:
    """
    Create new user.
    """
    if user_in.role == UserRole.class_representative:
        raise HTTPException(
            status_code=403,
            detail=(
                "Class Representative accounts must be created through "
                "the dedicated assignment workflow"
            ),
        )
    if any(
        (
            user_in.student_number,
            user_in.organization,
            user_in.position_id,
            user_in.academic_year_id,
            user_in.section_id,
        )
    ):
        raise HTTPException(
            status_code=403,
            detail="Officer account details must use the dedicated officer workflow",
        )

    is_super_admin = (
        current_user.is_superuser or current_user.role == UserRole.super_admin
    )
    if not is_super_admin and (
        user_in.is_superuser
        or user_in.is_developer
        or user_in.can_scan
        or user_in.role in (UserRole.admin, UserRole.super_admin)
    ):
        raise HTTPException(
            status_code=403,
            detail="Only a Super Admin can create privileged accounts or grant scanner access",
        )

    user = crud.get_user_by_email(session=session, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system.",
        )

    user = crud.create_user(session=session, user_create=user_in)
    if settings.emails_enabled and user_in.email:
        email_data = generate_new_account_email(
            email_to=user_in.email, username=user_in.email, password=user_in.password
        )
        send_email(
            email_to=user_in.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )
    return user


@router.patch("/me", response_model=UserPublic)
def update_user_me(
    *, session: SessionDep, user_in: UserUpdateMe, current_user: CurrentUser
) -> Any:
    """
    Update own user.
    """

    if user_in.email:
        existing_user = crud.get_user_by_email(session=session, email=user_in.email)
        if existing_user and existing_user.id != current_user.id:
            raise HTTPException(
                status_code=409, detail="User with this email already exists"
            )
    user_data = user_in.model_dump(exclude_unset=True)
    name_fields = {"first_name", "middle_name", "last_name", "name_extension"}
    if name_fields.intersection(user_data):
        first_name = (user_in.first_name or current_user.first_name or "").strip()
        middle_name = (user_in.middle_name or current_user.middle_name or "").strip()
        last_name = (user_in.last_name or current_user.last_name or "").strip()
        name_extension = (
            user_in.name_extension or current_user.name_extension or ""
        ).strip()

        if not first_name or not last_name:
            raise HTTPException(
                status_code=422, detail="First name and last name are required"
            )

        current_user.first_name = first_name
        current_user.middle_name = middle_name or None
        current_user.last_name = last_name
        current_user.name_extension = name_extension or None

        name_parts = [first_name]
        if middle_name:
            name_parts.append(middle_name)
        name_parts.append(last_name)
        if name_extension:
            name_parts.append(name_extension)
        user_data["full_name"] = " ".join(name_parts)

    current_user.sqlmodel_update(user_data)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user


@router.patch("/me/password", response_model=Message)
def update_password_me(
    *, session: SessionDep, body: UpdatePassword, current_user: CurrentUser
) -> Any:
    """
    Update own password.
    """
    verified, _ = verify_password(body.current_password, current_user.hashed_password)
    if not verified:
        raise HTTPException(status_code=400, detail="Incorrect password")
    if body.current_password == body.new_password:
        raise HTTPException(
            status_code=400, detail="New password cannot be the same as the current one"
        )
    hashed_password = get_password_hash(body.new_password)
    current_user.hashed_password = hashed_password
    current_user.must_change_password = False
    session.add(current_user)
    session.commit()
    return Message(message="Password updated successfully")


@router.get("/me", response_model=UserPublic)
def read_user_me(current_user: CurrentUser) -> Any:
    """
    Get current user.
    """
    return current_user


@router.delete("/me", response_model=Message)
def delete_user_me(session: SessionDep, current_user: CurrentUser) -> Any:
    """
    Delete own user.
    """
    if current_user.is_superuser or current_user.role == UserRole.super_admin:
        raise HTTPException(
            status_code=403,
            detail="Super users are not allowed to delete themselves",
        )
    session.delete(current_user)
    session.commit()
    return Message(message="User deleted successfully")


@router.post("/signup", response_model=UserPublic)
def register_user(session: SessionDep, user_in: UserRegister) -> Any:
    """
    Create new user without the need to be logged in.
    """
    user = crud.get_user_by_email(session=session, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system",
        )
    user_create = UserCreate.model_validate(user_in)
    user = crud.create_user(session=session, user_create=user_create)
    return user


@router.get(
    "/officers/import/template/csv",
    dependencies=[Depends(require_super_admin)],
)
def download_officer_import_csv_template() -> Response:
    headers = [
        "Student ID",
        "First Name",
        "Middle Initial",
        "Last Name",
        "Extension",
        "Academic Year",
        "Section",
        "Email",
        "Organization",
        "Role",
        "Position",
    ]
    output = io.StringIO(newline="")
    csv.writer(output).writerow(headers)
    return Response(
        content=output.getvalue().encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="CCS_Officer_Import_Template.csv"'
        },
    )


@router.get(
    "/officers/import/template/xlsx",
    dependencies=[Depends(require_super_admin)],
)
def download_officer_import_xlsx_template() -> Response:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Officers"
    sheet.append(
        [
            "Student ID",
            "First Name",
            "Middle Initial",
            "Last Name",
            "Extension",
            "Academic Year",
            "Section",
            "Email",
            "Organization",
            "Role",
            "Position",
        ]
    )
    output = io.BytesIO()
    workbook.save(output)
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="CCS_Officer_Import_Template.xlsx"'
        },
    )


@router.post(
    "/officers/import/preview",
    dependencies=[Depends(require_super_admin)],
)
async def preview_officer_import(
    session: SessionDep,
    _current_user: CurrentUser,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    filename = file.filename or "officer-import"
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    try:
        raw_rows = parse_officer_import_file(contents, filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    years = session.exec(select(AcademicYear)).all()
    programs = session.exec(select(AcademicProgram)).all()
    sections = session.exec(select(AcademicSection)).all()
    positions = session.exec(select(OfficerPosition)).all()
    years_by_label = {year.label.casefold(): year for year in years}
    programs_by_id = {program.id: program for program in programs}
    positions_by_name = {position.name.casefold(): position for position in positions}
    existing_emails = {
        str(email).casefold() for email in session.exec(select(User.email)).all()
    }
    existing_student_numbers = {
        number for number in session.exec(select(User.student_number)).all() if number
    }
    seen_emails: set[str] = set()
    seen_student_numbers: set[str] = set()
    preview_rows: list[dict[str, Any]] = []

    for row in raw_rows:
        errors: list[str] = []
        year_label = str(row.get("academic_year", "")).strip().casefold()
        year = years_by_label.get(year_label)
        if not year:
            errors.append(f"Unknown academic year: {row.get('academic_year', '')}")
        section = None
        if year:
            section_value = str(row.get("section", "")).strip().casefold()
            for candidate in sections:
                if candidate.academic_year_id != year.id:
                    continue
                program = programs_by_id.get(candidate.program_id)
                labels = {
                    candidate.section_name.casefold(),
                    candidate.section_code.casefold() if candidate.section_code else "",
                }
                if program:
                    labels.add(
                        f"{program.program_code} {candidate.section_name}".casefold()
                    )
                    labels.add(
                        f"{program.program_code} {candidate.year_level} {candidate.section_name}".casefold()
                    )
                if section_value in labels:
                    section = candidate
                    break
            if not section:
                errors.append(
                    f"Section '{row.get('section', '')}' was not found in {year.label}"
                )

        position_name = str(row.get("position", "")).strip()
        position = positions_by_name.get(position_name.casefold())
        if not position or not position.is_active:
            errors.append(f"Unknown or inactive position: {position_name}")

        role_value = (
            str(row.get("role", "")).strip().lower().replace(" ", "_").replace("-", "_")
        )
        if role_value in {"superadmin", "super_admin"}:
            role_value = UserRole.super_admin.value
        elif role_value == "admin":
            role_value = UserRole.admin.value
        else:
            errors.append("Role must be Super Admin or Admin")

        email = str(row.get("email", "")).strip().lower()
        student_number = str(row.get("student_number", "")).strip()
        if email and (email in existing_emails or email in seen_emails):
            errors.append(f"Duplicate email: {email}")
        if student_number and (
            student_number in existing_student_numbers
            or student_number in seen_student_numbers
        ):
            errors.append(f"Duplicate Student ID: {student_number}")
        if email:
            seen_emails.add(email)
        if student_number:
            seen_student_numbers.add(student_number)

        payload_data = None
        try:
            payload = OfficerAccountCreate.model_validate(
                {
                    "email": email,
                    "student_number": student_number,
                    "first_name": str(row.get("first_name", "")).strip(),
                    "middle_initial": str(row.get("middle_initial", "")).strip()
                    or None,
                    "last_name": str(row.get("last_name", "")).strip(),
                    "extension": str(row.get("extension", "")).strip() or None,
                    "organization": str(row.get("organization", "")).strip()
                    or "CCS Student Council",
                    "academic_year_id": year.id if year else None,
                    "section_id": section.id if section else None,
                    "role": role_value,
                    "position_id": position.id if position else None,
                }
            )
            payload_data = payload.model_dump(mode="json")
        except Exception as exc:
            errors.append(f"Invalid row data: {exc}")

        preview_rows.append(
            {
                "row_number": row["source_row"],
                "student_number": student_number,
                "full_name": " ".join(
                    part
                    for part in (
                        str(row.get("first_name", "")).strip(),
                        str(row.get("middle_initial", "")).strip(),
                        str(row.get("last_name", "")).strip(),
                        str(row.get("extension", "")).strip(),
                    )
                    if part
                ),
                "position_name": position.name if position else position_name,
                "payload": payload_data if not errors else None,
                "errors": errors,
            }
        )

    valid_rows = sum(
        1 for row in preview_rows if row["payload"] is not None and not row["errors"]
    )
    return {
        "total_rows": len(preview_rows),
        "valid_rows": valid_rows,
        "invalid_rows": len(preview_rows) - valid_rows,
        "can_import": valid_rows == len(preview_rows) and valid_rows > 0,
        "rows": preview_rows,
    }


@router.post(
    "/officers/import/commit",
    dependencies=[Depends(require_super_admin)],
)
def commit_officer_import(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    payload: OfficerAccountImportCommit,
) -> dict[str, Any]:
    if not settings.emails_enabled and settings.FASTAPI_ENV != "test":
        raise HTTPException(
            status_code=503,
            detail="Email delivery must be configured before importing officer accounts",
        )

    normalized_rows: list[OfficerAccountCreate] = []
    seen_emails: set[str] = set()
    seen_student_numbers: set[str] = set()
    for row in payload.rows:
        email = str(row.email).strip().lower()
        student_number = row.student_number.strip()
        if (
            email in seen_emails
            or session.exec(select(User).where(func.lower(User.email) == email)).first()
        ):
            raise HTTPException(status_code=409, detail=f"Duplicate email: {email}")
        if (
            student_number in seen_student_numbers
            or session.exec(
                select(User).where(User.student_number == student_number)
            ).first()
        ):
            raise HTTPException(
                status_code=409, detail=f"Duplicate Student ID: {student_number}"
            )
        seen_emails.add(email)
        seen_student_numbers.add(student_number)
        year = session.get(AcademicYear, row.academic_year_id)
        section = session.get(AcademicSection, row.section_id)
        position = session.get(OfficerPosition, row.position_id)
        if not year or not section or section.academic_year_id != row.academic_year_id:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid academic year or section for Student ID {student_number}",
            )
        if not position or not position.is_active:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid or inactive position for Student ID {student_number}",
            )
        if row.role not in (UserRole.super_admin, UserRole.admin):
            raise HTTPException(
                status_code=422, detail="Officer accounts must use Super Admin or Admin"
            )
        normalized_rows.append(
            row.model_copy(
                update={
                    "email": email,
                    "student_number": student_number,
                    "first_name": row.first_name.strip(),
                    "middle_initial": row.middle_initial.strip().rstrip(".")
                    if row.middle_initial
                    else None,
                    "last_name": row.last_name.strip(),
                    "extension": row.extension.strip() if row.extension else None,
                    "organization": row.organization.strip(),
                }
            )
        )

    created: list[tuple[User, str]] = []
    for row in normalized_rows:
        middle_initial = (row.middle_initial or "").strip().rstrip(".")
        extension = (row.extension or "").strip()
        full_name = " ".join(
            part
            for part in (
                row.first_name,
                f"{middle_initial}." if middle_initial else "",
                row.last_name,
                extension,
            )
            if part
        )
        temporary_password = generate_temporary_password()
        user = crud.create_user(
            session=session,
            user_create=UserCreate(
                email=row.email,
                password=temporary_password,
                role=row.role,
                is_superuser=row.role == UserRole.super_admin,
                can_scan=True,
                full_name=full_name,
                first_name=row.first_name,
                middle_name=middle_initial or None,
                last_name=row.last_name,
                name_extension=extension or None,
                student_number=row.student_number,
                organization=row.organization,
                position_id=row.position_id,
                academic_year_id=row.academic_year_id,
                section_id=row.section_id,
                must_change_password=True,
            ),
            commit=False,
        )
        user.must_change_password = True
        session.add(user)
        created.append((user, temporary_password))

    try:
        session.commit()
    except Exception:
        session.rollback()
        raise

    delivery_failures: list[str] = []
    if settings.emails_enabled:
        for user, temporary_password in created:
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
            except Exception:
                delivery_failures.append(str(user.email))
    return {
        "created_count": len(created),
        "delivery_failures": delivery_failures,
    }


@router.get(
    "/officer-positions",
    response_model=OfficerPositionsPublic,
    dependencies=[Depends(require_admin)],
)
def list_officer_positions(session: SessionDep, _current_user: CurrentUser) -> Any:
    positions = session.exec(
        select(OfficerPosition).order_by(OfficerPosition.name)
    ).all()
    return OfficerPositionsPublic(
        data=[OfficerPositionPublic.model_validate(position) for position in positions],
        count=len(positions),
    )


@router.post(
    "/officer-positions",
    response_model=OfficerPositionPublic,
    dependencies=[Depends(require_super_admin)],
)
def create_officer_position(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    payload: OfficerPositionCreate,
) -> OfficerPosition:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Position name is required")
    existing = session.exec(
        select(OfficerPosition).where(func.lower(OfficerPosition.name) == name.lower())
    ).first()
    if existing:
        raise HTTPException(
            status_code=409, detail="This officer position already exists"
        )
    position = OfficerPosition(name=name, is_active=payload.is_active)
    session.add(position)
    session.commit()
    session.refresh(position)
    return position


@router.patch(
    "/officer-positions/{position_id}",
    response_model=OfficerPositionPublic,
    dependencies=[Depends(require_super_admin)],
)
def update_officer_position(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    position_id: uuid.UUID,
    payload: OfficerPositionUpdate,
) -> OfficerPosition:
    position = session.get(OfficerPosition, position_id)
    if not position:
        raise HTTPException(status_code=404, detail="Officer position not found")
    values = payload.model_dump(exclude_unset=True)
    if "name" in values and values["name"] is not None:
        name = values["name"].strip()
        if not name:
            raise HTTPException(status_code=422, detail="Position name is required")
        existing = session.exec(
            select(OfficerPosition).where(
                func.lower(OfficerPosition.name) == name.lower(),
                OfficerPosition.id != position_id,
            )
        ).first()
        if existing:
            raise HTTPException(
                status_code=409, detail="This officer position already exists"
            )
        values["name"] = name
    position.sqlmodel_update(values)
    session.add(position)
    session.commit()
    session.refresh(position)
    return position


@router.delete(
    "/officer-positions/{position_id}",
    dependencies=[Depends(require_super_admin)],
)
def delete_officer_position(
    *, session: SessionDep, _current_user: CurrentUser, position_id: uuid.UUID
) -> Message:
    position = session.get(OfficerPosition, position_id)
    if not position:
        raise HTTPException(status_code=404, detail="Officer position not found")
    assigned = session.exec(select(User).where(User.position_id == position_id)).first()
    if assigned:
        raise HTTPException(
            status_code=409,
            detail="This position is assigned to an account. Deactivate it instead.",
        )
    session.delete(position)
    session.commit()
    return Message(message="Officer position deleted successfully")


@router.post(
    "/officers",
    response_model=UserPublic,
    dependencies=[Depends(require_super_admin)],
)
def create_officer_account(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    payload: OfficerAccountCreate,
) -> User:
    if not settings.emails_enabled and settings.FASTAPI_ENV != "test":
        raise HTTPException(
            status_code=503,
            detail="Email delivery must be configured before creating officer accounts",
        )
    email = str(payload.email).strip().lower()
    student_number = payload.student_number.strip()
    first_name = payload.first_name.strip()
    last_name = payload.last_name.strip()
    if not student_number or not first_name or not last_name:
        raise HTTPException(
            status_code=422,
            detail="Student ID, first name, and last name are required",
        )
    if session.exec(select(User).where(func.lower(User.email) == email)).first():
        raise HTTPException(
            status_code=409, detail="A user with this email already exists"
        )
    if session.exec(select(User).where(User.student_number == student_number)).first():
        raise HTTPException(
            status_code=409, detail="An account already exists for this Student ID"
        )
    year = session.get(AcademicYear, payload.academic_year_id)
    section = session.get(AcademicSection, payload.section_id)
    position = session.get(OfficerPosition, payload.position_id)
    if not year or not section:
        raise HTTPException(
            status_code=404, detail="Academic year or section not found"
        )
    if section.academic_year_id != year.id:
        raise HTTPException(
            status_code=400,
            detail="Section does not belong to the selected academic year",
        )
    if not position or not position.is_active:
        raise HTTPException(status_code=400, detail="Select an active officer position")
    if payload.role not in (UserRole.super_admin, UserRole.admin):
        raise HTTPException(
            status_code=422,
            detail="Officer accounts must use the Super Admin or Admin system role",
        )

    middle_initial = (payload.middle_initial or "").strip().rstrip(".")
    extension = (payload.extension or "").strip()
    full_name = " ".join(
        part
        for part in (
            first_name,
            f"{middle_initial}." if middle_initial else "",
            last_name,
            extension,
        )
        if part
    )
    temporary_password = generate_temporary_password()
    user = crud.create_user(
        session=session,
        user_create=UserCreate(
            email=email,
            password=temporary_password,
            role=payload.role,
            is_superuser=payload.role == UserRole.super_admin,
            can_scan=payload.role in (UserRole.super_admin, UserRole.admin),
            full_name=full_name,
            first_name=first_name,
            middle_name=middle_initial or None,
            last_name=last_name,
            name_extension=extension or None,
            student_number=student_number,
            organization=payload.organization.strip(),
            position_id=position.id,
            academic_year_id=year.id,
            section_id=section.id,
            must_change_password=True,
        ),
        commit=False,
    )
    user.must_change_password = True
    session.add(user)
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
                    "Officer account was not created because credentials could not "
                    "be delivered. Check email delivery and retry."
                ),
            ) from exc
    session.commit()
    session.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserPublic)
def read_user_by_id(
    user_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    """Get a specific user without leaking user existence to non-admins."""
    may_read_other_users = current_user.is_superuser or current_user.role in (
        UserRole.super_admin,
        UserRole.admin,
    )
    if user_id != current_user.id and not may_read_other_users:
        raise HTTPException(
            status_code=403,
            detail="The user doesn't have enough privileges",
        )
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/{user_id}", response_model=UserPublic)
def update_user(
    *,
    session: SessionDep,
    user_id: uuid.UUID,
    user_in: UserUpdate,
    current_user: User = Depends(require_admin),
) -> Any:
    """
    Update a user.
    """

    db_user = session.get(User, user_id)
    if not db_user:
        raise HTTPException(
            status_code=404,
            detail="The user with this id does not exist in the system",
        )
    is_super_admin = (
        current_user.is_superuser or current_user.role == UserRole.super_admin
    )
    submitted_fields = user_in.model_dump(exclude_unset=True)
    officer_profile_fields = {
        "first_name",
        "middle_name",
        "last_name",
        "name_extension",
        "student_number",
        "organization",
        "position_id",
    }
    officer_assignment_fields = {"academic_year_id", "section_id"}
    officer_fields = officer_profile_fields | officer_assignment_fields
    if officer_fields.intersection(submitted_fields) and not is_super_admin:
        raise HTTPException(
            status_code=403,
            detail="Only a Super Admin can edit officer account details",
        )
    if officer_profile_fields.intersection(submitted_fields):
        student_number = submitted_fields.get("student_number", db_user.student_number)
        if student_number:
            duplicate_student = session.exec(
                select(User).where(
                    User.student_number == student_number,
                    User.id != db_user.id,
                )
            ).first()
            if duplicate_student:
                raise HTTPException(
                    status_code=409,
                    detail="An account already exists for this Student ID",
                )
        first_name = submitted_fields.get("first_name", db_user.first_name)
        last_name = submitted_fields.get("last_name", db_user.last_name)
        if (
            not first_name
            or not str(first_name).strip()
            or not last_name
            or not str(last_name).strip()
        ):
            raise HTTPException(
                status_code=422,
                detail="First name and last name are required",
            )
        position_id = submitted_fields.get("position_id", db_user.position_id)
        if position_id:
            position = session.get(OfficerPosition, position_id)
            if not position or not position.is_active:
                raise HTTPException(
                    status_code=400,
                    detail="Select an active officer position",
                )
        middle_name = submitted_fields.get("middle_name", db_user.middle_name)
        middle_name = (middle_name or "").strip().rstrip(".")
        extension = submitted_fields.get("name_extension", db_user.name_extension)
        extension = (extension or "").strip()
        first_name = str(first_name).strip()
        last_name = str(last_name).strip()
        submitted_fields.update(
            {
                "first_name": first_name,
                "middle_name": middle_name or None,
                "last_name": last_name,
                "name_extension": extension or None,
                "full_name": " ".join(
                    part
                    for part in (
                        first_name,
                        f"{middle_name}." if middle_name else "",
                        last_name,
                        extension,
                    )
                    if part
                ),
            }
        )

    requested_role = submitted_fields.get("role")
    promoting_to_class_rep = (
        db_user.role != UserRole.class_representative
        and requested_role == UserRole.class_representative
    )
    updating_class_rep_assignment = (
        db_user.role == UserRole.class_representative
        and requested_role in (None, UserRole.class_representative)
        and bool(officer_assignment_fields.intersection(submitted_fields))
    )
    assignment_fields_submitted = bool(
        officer_assignment_fields.intersection(submitted_fields)
    )
    assignment_update: tuple[AcademicYear, AcademicSection] | None = None
    if promoting_to_class_rep or assignment_fields_submitted:
        year_id = submitted_fields.get("academic_year_id", db_user.academic_year_id)
        section_id = submitted_fields.get("section_id", db_user.section_id)
        if not year_id or not section_id:
            if promoting_to_class_rep:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "Class Representative role changes require an academic year "
                        "and section assignment"
                    ),
                )
            raise HTTPException(
                status_code=422,
                detail="Academic year and section must both be selected",
            )
        year = session.get(AcademicYear, year_id)
        section = session.get(AcademicSection, section_id)
        if not year or not section:
            raise HTTPException(
                status_code=404, detail="Academic year or section not found"
            )
        if section.academic_year_id != year.id:
            raise HTTPException(
                status_code=400,
                detail="Section does not belong to the selected academic year",
            )
        submitted_fields["academic_year_id"] = year.id
        submitted_fields["section_id"] = section.id
        if promoting_to_class_rep or updating_class_rep_assignment:
            assignment_update = (year, section)
            if promoting_to_class_rep and not (
                db_user.student_number
                or db_user.position_id
                or db_user.organization
            ):
                # Keep assignment data in the assignment table for ordinary
                # accounts instead of duplicating it on the user profile.
                submitted_fields["academic_year_id"] = None
                submitted_fields["section_id"] = None

    if requested_role == UserRole.class_representative:
        submitted_fields["can_scan"] = False
        submitted_fields["is_superuser"] = False
    if db_user.id == current_user.id and is_super_admin:
        if submitted_fields.get("is_active") is False:
            raise HTTPException(
                status_code=403,
                detail="You cannot deactivate your own Super Admin account",
            )
        requested_role = submitted_fields.get("role", db_user.role)
        requested_superuser = submitted_fields.get("is_superuser", db_user.is_superuser)
        if (
            db_user.role == UserRole.super_admin
            and requested_role != UserRole.super_admin
        ) or (db_user.is_superuser and requested_superuser is False):
            raise HTTPException(
                status_code=403,
                detail="You cannot remove your own Super Admin privileges",
            )
    if not is_super_admin:
        if (
            db_user.role in (UserRole.admin, UserRole.super_admin)
            or db_user.is_superuser
            or db_user.is_developer
        ):
            raise HTTPException(
                status_code=403,
                detail="Only a Super Admin can modify Admin or Super Admin accounts",
            )
        if (
            "is_superuser" in submitted_fields
            or "is_developer" in submitted_fields
            or "can_scan" in submitted_fields
            or submitted_fields.get("role") in (UserRole.admin, UserRole.super_admin)
        ):
            raise HTTPException(
                status_code=403,
                detail="Only a Super Admin can change administrative, Developer, or scanner privileges",
            )
    if user_in.email:
        existing_user = crud.get_user_by_email(session=session, email=user_in.email)
        if existing_user and existing_user.id != user_id:
            raise HTTPException(
                status_code=409, detail="User with this email already exists"
            )

    if db_user.role == UserRole.class_representative and requested_role not in (
        None,
        UserRole.class_representative,
    ):
        session.exec(
            delete(ClassRepresentativeAssignment).where(
                col(ClassRepresentativeAssignment.user_id) == db_user.id
            )
        )
    if assignment_update:
        year, section = assignment_update
        assignment = session.exec(
            select(ClassRepresentativeAssignment).where(
                col(ClassRepresentativeAssignment.user_id) == db_user.id,
                col(ClassRepresentativeAssignment.academic_year_id) == year.id,
            )
        ).first()
        if assignment:
            assignment.section_id = section.id
            session.add(assignment)
        else:
            session.add(
                ClassRepresentativeAssignment(
                    user_id=db_user.id,
                    academic_year_id=year.id,
                    section_id=section.id,
                )
            )

    if officer_fields.intersection(submitted_fields):
        user_in = user_in.model_copy(update=submitted_fields)
    db_user = crud.update_user(session=session, db_user=db_user, user_in=user_in)
    return db_user


@router.delete("/{user_id}")
def delete_user(
    session: SessionDep,
    user_id: uuid.UUID,
    current_user: User = Depends(require_admin),
) -> Message:
    """
    Delete a user.
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user == current_user:
        detail = (
            "Super users are not allowed to delete themselves"
            if current_user.is_superuser or current_user.role == UserRole.super_admin
            else "Admins are not allowed to delete themselves"
        )
        raise HTTPException(status_code=403, detail=detail)
    is_super_admin = (
        current_user.is_superuser or current_user.role == UserRole.super_admin
    )
    if not is_super_admin and (
        user.role in (UserRole.admin, UserRole.super_admin)
        or user.is_superuser
        or user.is_developer
    ):
        raise HTTPException(
            status_code=403,
            detail="Only a Super Admin can delete Admin or Super Admin accounts",
        )
    session.delete(user)
    session.commit()
    return Message(message="User deleted successfully")
