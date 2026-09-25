from collections.abc import Callable, Generator
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
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
    # otherwise use the production/development engine
    target_engine = test_engine if settings.FASTAPI_ENV == "test" else engine
    with Session(target_engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]


def get_current_user(session: SessionDep, token: TokenDep) -> User:
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
    user = session.get(User, token_data.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(
    allowed_roles: list[UserRole] | set[UserRole] | tuple[UserRole, ...],
) -> Callable[[User], User]:
    """
    Returns a FastAPI dependency that checks if the current user has one of the allowed roles.
    Superusers (or Developer/Super Admin) with appropriate roles pass automatically.
    """
    allowed_set = set(allowed_roles)

    def role_checker(current_user: CurrentUser) -> User:
        # Developer or Super Admin role or superuser flag check if permitted
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
    """
    Returns the user if they possess attendance scanning permission.
    Allowed:
    - Superusers / Developer / Super Admin / Admin (operators)
    - Any user with can_scan=True explicitly assigned (e.g. Dean, Student Council Advisers/Officers, Class Reps)
    """
    if current_user.is_superuser:
        return current_user
    if current_user.role in (UserRole.developer, UserRole.super_admin, UserRole.admin):
        return current_user
    if current_user.can_scan:
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="The user does not have scanner permissions",
    )


# Convenience role dependencies
require_developer = require_role([UserRole.developer])
require_super_admin = require_role([UserRole.developer, UserRole.super_admin])
require_admin = require_role([UserRole.developer, UserRole.super_admin, UserRole.admin])
require_class_rep_or_higher = require_role(
    [
        UserRole.developer,
        UserRole.super_admin,
        UserRole.admin,
        UserRole.class_representative,
    ]
)


def get_current_active_superuser(current_user: CurrentUser) -> User:
    if not current_user.is_superuser and current_user.role not in (
        UserRole.developer,
        UserRole.super_admin,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges",
        )
    return current_user
