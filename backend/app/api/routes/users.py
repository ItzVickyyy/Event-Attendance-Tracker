import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

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
    AcademicSection,
    Message,
    OfficerAccountCreate,
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
from app.student_academics import AcademicYear
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
    "/officer-positions",
    response_model=OfficerPositionsPublic,
    dependencies=[Depends(require_super_admin)],
)
def list_officer_positions(session: SessionDep, _current_user: CurrentUser) -> Any:
    positions = session.exec(select(OfficerPosition).order_by(OfficerPosition.name)).all()
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
        raise HTTPException(status_code=409, detail="This officer position already exists")
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
            raise HTTPException(status_code=409, detail="This officer position already exists")
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
    assigned = session.exec(
        select(User).where(User.position_id == position_id)
    ).first()
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
    if crud.get_user_by_email(session=session, email=email):
        raise HTTPException(status_code=409, detail="A user with this email already exists")
    student_number = payload.student_number.strip()
    if session.exec(
        select(User).where(User.student_number == student_number)
    ).first():
        raise HTTPException(
            status_code=409, detail="An account already exists for this Student ID"
        )
    year = session.get(AcademicYear, payload.academic_year_id)
    section = session.get(AcademicSection, payload.section_id)
    position = session.get(OfficerPosition, payload.position_id)
    if not year or not section:
        raise HTTPException(status_code=404, detail="Academic year or section not found")
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

    first_name = payload.first_name.strip()
    middle_initial = (payload.middle_initial or "").strip().rstrip(".")
    last_name = payload.last_name.strip()
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
    if (
        db_user.role != UserRole.class_representative
        and submitted_fields.get("role") == UserRole.class_representative
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "Class Representative role changes must use "
                "the dedicated assignment workflow"
            ),
        )
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
