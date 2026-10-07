import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app import crud
from app.api.deps import (
    CurrentUser,
    SessionDep,
    require_admin,
)
from app.core.config import settings
from app.core.security import get_password_hash, verify_password
from app.models import (
    Message,
    UpdatePassword,
    User,
    UserRole,
    UserCreate,
    UserPublic,
    UserRegister,
    UsersPublic,
    UserUpdate,
    UserUpdateMe,
)
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

    count_statement = select(func.count()).select_from(User)
    count = session.exec(count_statement).one()

    statement = (
        select(User).order_by(col(User.created_at).desc()).offset(skip).limit(limit)
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
    is_super_admin = current_user.is_superuser or current_user.role == UserRole.super_admin
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
        name_extension = (user_in.name_extension or current_user.name_extension or "").strip()

        if not first_name or not last_name:
            raise HTTPException(status_code=422, detail="First name and last name are required")

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
    if current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="Super users are not allowed to delete themselves"
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


@router.get("/{user_id}", response_model=UserPublic)
def read_user_by_id(
    user_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    """
    Get a specific user by id.
    """
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user == current_user:
        return user
    if current_user.is_superuser or current_user.role in (
        UserRole.super_admin,
        UserRole.admin,
    ):
        return user
    raise HTTPException(
        status_code=403,
        detail="The user doesn't have enough privileges",
    )


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
    is_super_admin = current_user.is_superuser or current_user.role == UserRole.super_admin
    submitted_fields = user_in.model_dump(exclude_unset=True)
    if db_user.id == current_user.id and is_super_admin:
        requested_role = submitted_fields.get("role", db_user.role)
        requested_superuser = submitted_fields.get("is_superuser", db_user.is_superuser)
        if (
            (db_user.role == UserRole.super_admin and requested_role != UserRole.super_admin)
            or (db_user.is_superuser and requested_superuser is False)
        ):
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
        raise HTTPException(
            status_code=403, detail="Admins are not allowed to delete themselves"
        )
    is_super_admin = current_user.is_superuser or current_user.role == UserRole.super_admin
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
