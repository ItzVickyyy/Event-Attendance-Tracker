from sqlalchemy import func
from sqlmodel import Session, select

from app.core.config import settings
from app.core.security import verify_password
from app.models import User, UserRole
from scripts.reset_superuser_password import reset_configured_superuser_password


def test_reset_configured_superuser_password_repairs_existing_account(
    db_session: Session,
) -> None:
    user = db_session.exec(
        select(User).where(func.lower(User.email) == str(settings.FIRST_SUPERUSER).lower())
    ).one()
    user.email = str(settings.FIRST_SUPERUSER).swapcase()
    user.hashed_password = "invalid-old-password-hash"
    user.role = UserRole.admin
    user.is_superuser = False
    user.is_active = False
    user.can_scan = False
    db_session.add(user)
    db_session.commit()

    repaired = reset_configured_superuser_password(db_session)

    assert repaired.id == user.id
    assert repaired.email == str(settings.FIRST_SUPERUSER)
    assert repaired.role == UserRole.super_admin
    assert repaired.is_superuser is True
    assert repaired.is_active is True
    assert repaired.can_scan is True
    verified, _ = verify_password(
        settings.FIRST_SUPERUSER_PASSWORD, repaired.hashed_password
    )
    assert verified
