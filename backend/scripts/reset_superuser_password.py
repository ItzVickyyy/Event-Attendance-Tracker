"""Explicitly repair the configured first Super Admin account.

Run from the backend directory after checking FIRST_SUPERUSER and
FIRST_SUPERUSER_PASSWORD in the environment or root .env file:

    uv run python scripts/reset_superuser_password.py

This command changes only the configured Super Admin account. It is never
run automatically during application startup.
"""

import logging

from sqlalchemy import func
from sqlmodel import Session, select

from app.core.config import settings
from app.core.db import engine
from app.core.security import get_password_hash
from app.models import User, UserRole

logger = logging.getLogger(__name__)


def reset_configured_superuser_password(session: Session) -> User:
    """Reset the configured Super Admin's password and canonical account flags."""
    configured_email = str(settings.FIRST_SUPERUSER).strip()
    matches = session.exec(
        select(User).where(func.lower(User.email) == configured_email.lower())
    ).all()

    if not matches:
        raise RuntimeError(
            f"No existing account matches FIRST_SUPERUSER '{configured_email}'. "
            "Start the application once to create the configured first Super Admin, "
            "then run this command again."
        )
    if len(matches) != 1:
        raise RuntimeError(
            "Multiple accounts match FIRST_SUPERUSER without regard to letter case. "
            "Resolve the duplicate accounts manually before retrying."
        )

    user = matches[0]
    user.email = configured_email
    user.hashed_password = get_password_hash(settings.FIRST_SUPERUSER_PASSWORD)
    user.role = UserRole.super_admin
    user.is_superuser = True
    user.is_active = True
    user.can_scan = True
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    with Session(engine) as session:
        user = reset_configured_superuser_password(session)

    logger.info("Super Admin credentials repaired for %s.", user.email)
    logger.info(
        "Restart the backend if needed, then sign in with the configured credentials."
    )


if __name__ == "__main__":
    main()
