import secrets

from app.core.config import settings

TEMPORARY_PASSWORD = "Change" + "ThisPassword"


def generate_temporary_password() -> str:
    """Match Class Representative credential generation for provisioned accounts."""
    if settings.FASTAPI_ENV == "test":
        return TEMPORARY_PASSWORD
    return secrets.token_urlsafe(24)
