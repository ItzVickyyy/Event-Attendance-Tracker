from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import UserCreate, UserRole
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string


def _create_user(db: Session, *, is_developer: bool) -> tuple[str, str]:
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(
        email=email,
        password=password,
        role=UserRole.student,
        is_superuser=False,
        is_developer=is_developer,
        can_scan=False,
    )
    crud.create_user(session=db, user_create=user_in)
    return email, password


def test_developer_can_read_diagnostics_but_not_admin_data(
    client: TestClient, db: Session
) -> None:
    email, _password = _create_user(db, is_developer=True)
    headers = authentication_token_from_email(client=client, email=email, db=db)

    health = client.get(f"{settings.API_V1_STR}/developer/health", headers=headers)
    assert health.status_code == 200
    assert health.json()["database_status"] == "connected"

    diagnostics = client.get(
        f"{settings.API_V1_STR}/developer/diagnostics", headers=headers
    )
    assert diagnostics.status_code == 200
    assert "total_attendance_records" in diagnostics.json()

    users = client.get(f"{settings.API_V1_STR}/users/", headers=headers)
    assert users.status_code == 403

    corrections = client.get(
        f"{settings.API_V1_STR}/attendance-corrections/", headers=headers
    )
    assert corrections.status_code == 403


def test_non_developer_cannot_read_system_diagnostics(
    client: TestClient, db: Session
) -> None:
    email, _password = _create_user(db, is_developer=False)
    headers = authentication_token_from_email(client=client, email=email, db=db)

    response = client.get(
        f"{settings.API_V1_STR}/developer/health", headers=headers
    )
    assert response.status_code == 403
