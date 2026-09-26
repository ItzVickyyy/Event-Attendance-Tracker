from typing import Any

from sqlmodel import Session, create_engine, select

from app import crud
from app.account_assignments import OrganizationMembership, UserSectionAssignment  # noqa: F401
from app.academic_catalog import AcademicMajor, AcademicSectionMajor  # noqa: F401
from app.core.config import settings
from app.models import User, UserCreate, UserRole

engine = create_engine(str(settings.DATABASE_URL), pool_pre_ping=True)
test_engine = (
    create_engine(str(settings.TEST_DATABASE_URL), pool_pre_ping=True)
    if settings.TEST_DATABASE_URL
    else None
)


# Make sure all SQLModel models are imported before initializing the DB.
# This keeps the additional academic/account tables registered in SQLModel.metadata.


def init_db(session: Session, engine_to_use: Any = None) -> None:
    from sqlmodel import SQLModel

    target_engine = engine_to_use or engine
    SQLModel.metadata.create_all(target_engine)

    user = session.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    if not user:
        user_in = UserCreate(
            email=settings.FIRST_SUPERUSER,
            password=settings.FIRST_SUPERUSER_PASSWORD,
            is_superuser=True,
            role=UserRole.super_admin,
            can_scan=True,
        )
        crud.create_user(session=session, user_create=user_in)
