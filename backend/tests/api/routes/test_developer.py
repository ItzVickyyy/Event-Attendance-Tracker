from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app import crud
from app.models import UserCreate, UserRole
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string
from tests.utils.user import get_token_headers_for_role


def test_developer_can_read_system_diagnostics(
    client: TestClient, db: Session
) -> None:
    headers = get_token_headers_for_role(
        client=client,
        db=db,
        role=UserRole.developer,
    )

    health = client.get(f"{settings.API_V1_STR}/developer/health", headers=headers)
    diagnostics = client.get(
        f"{settings.API_V1_STR}/developer/diagnostics", headers=headers
    )

    assert health.status_code == 200
    assert health.json()["status"] in {"healthy", "degraded"}
    assert "database_latency_ms" in health.json()
    assert diagnostics.status_code == 200
    assert diagnostics.json()["total_users"] >= 1
    assert "total_attendance_records" in diagnostics.json()


def test_developer_is_restricted_from_operational_and_admin_apis(
    client: TestClient, db: Session
) -> None:
    headers = get_token_headers_for_role(
        client=client,
        db=db,
        role=UserRole.developer,
    )

    profile = client.get(f"{settings.API_V1_STR}/users/me", headers=headers)
    events = client.get(f"{settings.API_V1_STR}/events/", headers=headers)
    academic_years = client.get(
        f"{settings.API_V1_STR}/academic-registry/academic-years",
        headers=headers,
    )
    users = client.get(f"{settings.API_V1_STR}/users/", headers=headers)

    assert profile.status_code == 200
    assert events.status_code == 403
    assert academic_years.status_code == 403
    assert users.status_code == 403


def test_developer_cannot_use_scanner_permission_by_role_alone(
    client: TestClient, db: Session
) -> None:
    headers = get_token_headers_for_role(
        client=client,
        db=db,
        role=UserRole.developer,
    )

    response = client.get(f"{settings.API_V1_STR}/attendance/", headers=headers)

    assert response.status_code == 403



def test_admin_can_also_have_independent_developer_access(
    client: TestClient, db: Session
) -> None:
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(
        email=email,
        password=password,
        role=UserRole.admin,
        is_developer=True,
    )
    crud.create_user(session=db, user_create=user_in)
    headers = user_authentication_headers(
        client=client,
        email=email,
        password=password,
    )

    dashboard = client.get(
        f"{settings.API_V1_STR}/developer/health",
        headers=headers,
    )
    events = client.get(f"{settings.API_V1_STR}/events/", headers=headers)

    assert dashboard.status_code == 200
    assert events.status_code == 200
