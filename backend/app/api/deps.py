from collections.abc import Callable, Generator
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from sqlalchemy import text
from sqlmodel import Session

from app.core import security
from app.core.config import settings
from app.core.db import engine, test_engine
from app.models import TokenPayload, User, UserRole

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/login/access-token"
)


def get_db() -> Generator[Session]:
    # Use test_engine only when running tests (FASTAPI_ENV=test),
    # otherwise use the production/development engine.
    target_engine = test_engine if settings.FASTAPI_ENV == "test" else engine
    with Session(target_engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]


def get_current_user(
    session: SessionDep, token: TokenDep, request: Request
) -> User:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not token_data.sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = session.get(User, token_data.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    # A Developer account is a technical identity, not an operational account.
    # Deny access by default to every business API and allow only system
    # diagnostics plus the account's own profile/password endpoints.
    if user.role == UserRole.developer:
        path = request.url.path.rstrip("/")
        allowed_account_paths = {
            f"{settings.API_V1_STR}/users/me",
            f"{settings.API_V1_STR}/users/me/password",
        }
        developer_prefix = f"{settings.API_V1_STR}/developer/"
        if path not in allowed_account_paths and not request.url.path.startswith(
            developer_prefix
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Developer accounts do not have access to operational APIs",
            )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(
    allowed_roles: list[UserRole] | set[UserRole] | tuple[UserRole, ...],
) -> Callable[[User], User]:
    """Require an allowed application role.

    The explicit superuser flag remains the platform-wide override. The
    Developer role itself is intentionally not included in business/admin
    roles. Developer accounts should be created with is_superuser=False.
    """
    allowed_set = set(allowed_roles)

    def role_checker(current_user: CurrentUser) -> User:
        if current_user.is_superuser:
            return current_user
        if current_user.role not in allowed_set:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="The user does not have sufficient permissions for this operation",
            )
        return current_user

    return role_checker


def require_scanner_permission(current_user: CurrentUser) -> User:
    """Require an operator role or explicit scanner permission."""
    if current_user.is_superuser:
        return current_user
    if current_user.role in (UserRole.super_admin, UserRole.admin):
        return current_user
    if current_user.can_scan:
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="The user does not have scanner permissions",
    )


def require_developer(current_user: CurrentUser) -> User:
    """Require the separate Developer capability or legacy Developer role."""
    if current_user.is_developer or current_user.role == UserRole.developer:
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Developer access is required",
    )


# Developer access is separate from business administration.

require_super_admin = require_role([UserRole.super_admin])
require_admin = require_role([UserRole.super_admin, UserRole.admin])


def class_rep_assignment(
    session: Session,
    current_user: User,
    academic_year_id=None,
):
    if (
        current_user.role != UserRole.class_representative
        and not current_user.is_superuser
    ):
        return None
    query = """
        SELECT id, academic_year_id, section_id
        FROM class_representative_assignments
        WHERE user_id = :user_id
    """
    params = {"user_id": current_user.id}
    if academic_year_id is not None:
        query += " AND academic_year_id = :academic_year_id"
        params["academic_year_id"] = academic_year_id
    query += " ORDER BY created_at DESC LIMIT 1"
    return session.execute(text(query), params).mappings().first()


def require_class_rep_assignment(
    session: Session,
    current_user: User,
    academic_year_id=None,
):
    assignment = class_rep_assignment(session, current_user, academic_year_id)
    if current_user.role == UserRole.class_representative and assignment is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No Class Representative section is assigned for this academic year",
        )
    return assignment


require_class_rep_or_higher = require_role(
    [
        UserRole.super_admin,
        UserRole.admin,
        UserRole.class_representative,
    ]
)


def get_current_active_superuser(current_user: CurrentUser) -> User:
    if not current_user.is_superuser and current_user.role != UserRole.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges",
        )
    return current_user
