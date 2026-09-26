from typing import Any

from sqlmodel import Session, create_engine, select

from app import crud
from app.core.config import settings
from app.models import User, UserCreate, UserRole

engine = create_engine(str(settings.DATABASE_URL), pool_pre_ping=True)
test_engine = (
    create_engine(str(settings.TEST_DATABASE_URL), pool_pre_ping=True)
    if settings.TEST_DATABASE_URL
    else None
)


# make sure all SQLModel models are imported (app.models) before initializing DB
# otherwise, SQLModel might fail to initialize relationships properly
# for more details: https://github.com/fastapi/full-stack-fastapi-template/issues/28


def init_db(session: Session, engine_to_use: Any = None) -> None:
    # Tables should be created with Alembic migrations
    # But if you don't want to use migrations, create
    # the tables un-commenting the next lines
    from sqlmodel import SQLModel

    # This works because the models are already imported and registered from app.models
    # Use the passed engine, or fall back to the production engine if not specified
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
        user = crud.create_user(session=session, user_create=user_in)
