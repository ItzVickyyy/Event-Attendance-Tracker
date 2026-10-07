from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import AuditLog, UserCreate, UserRole
from tests.utils.user import (
    get_token_headers_for_role,
    user_authentication_headers,
)
from tests.utils.utils import random_email, random_lower_string


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



def test_developer_can_read_filtered_audit_logs(
    client: TestClient, db: Session
) -> None:
    headers = get_token_headers_for_role(
        client=client,
        db=db,
        role=UserRole.developer,
    )
    db.add(
        AuditLog(
            action="POST events",
            resource="events",
            method="POST",
            path="/api/v1/events/",
            status_code=201,
            outcome="success",
            duration_ms=12.5,
        )
    )
    db.commit()

    response = client.get(
        f"{settings.API_V1_STR}/developer/audit-logs?action=events&outcome=success",
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["data"][0]["action"] == "POST events"
    assert payload["data"][0]["outcome"] == "success"
    assert payload["data"][0]["duration_ms"] == 12.5


def test_non_developer_cannot_read_audit_logs(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{settings.API_V1_STR}/developer/audit-logs",
        headers=normal_user_token_headers,
    )

    assert response.status_code == 403



def test_developer_role_cannot_use_superuser_flag_to_access_operations(
    client: TestClient, db: Session
) -> None:
    email = random_email()
    password = random_lower_string()
    crud.create_user(
        session=db,
        user_create=UserCreate(
            email=email,
            password=password,
            role=UserRole.developer,
            is_developer=True,
            is_superuser=True,
        ),
    )
    headers = user_authentication_headers(
        client=client,
        email=email,
        password=password,
    )

    health = client.get(f"{settings.API_V1_STR}/developer/health", headers=headers)
    events = client.get(f"{settings.API_V1_STR}/events/", headers=headers)

    assert health.status_code == 200
    assert events.status_code == 403



def test_admin_can_review_audit_logs(
    client: TestClient, db: Session
) -> None:
    headers = get_token_headers_for_role(
        client=client,
        db=db,
        role=UserRole.admin,
    )

    response = client.get(
        f"{settings.API_V1_STR}/developer/audit-logs",
        headers=headers,
    )

    assert response.status_code == 200
