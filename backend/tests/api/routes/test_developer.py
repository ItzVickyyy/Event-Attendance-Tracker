from fastapi.testclient import TestClient
from sqlmodel import Session, select

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
        role=UserRole.student,
        is_developer=True,
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
        role=UserRole.student,
        is_developer=True,
    )

    profile = client.get(f"{settings.API_V1_STR}/users/me", headers=headers)
    events = client.get(f"{settings.API_V1_STR}/events/", headers=headers)
    academic_years = client.get(
        f"{settings.API_V1_STR}/academic-registry/academic-years",
        headers=headers,
    )
    users = client.get(f"{settings.API_V1_STR}/users/", headers=headers)
    students = client.get(f"{settings.API_V1_STR}/students/", headers=headers)
    people = client.get(f"{settings.API_V1_STR}/people/", headers=headers)
    organizations = client.get(
        f"{settings.API_V1_STR}/organizations/",
        headers=headers,
    )
    sessions = client.get(
        f"{settings.API_V1_STR}/attendance-sessions/",
        headers=headers,
    )

    assert profile.status_code == 200
    assert events.status_code == 403
    assert academic_years.status_code == 403
    assert users.status_code == 403
    assert students.status_code == 403
    assert people.status_code == 403
    assert organizations.status_code == 403
    assert sessions.status_code == 403


def test_developer_cannot_use_scanner_permission_by_role_alone(
    client: TestClient, db: Session
) -> None:
    headers = get_token_headers_for_role(
        client=client,
        db=db,
        role=UserRole.student,
        is_developer=True,
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
        role=UserRole.student,
        is_developer=True,
    )
    db.add(
        AuditLog(
            action="POST events",
            resource="events",
            method="POST",
            path="/api/v1/events/",
            request_id="audit-entry-test-01",
            status_code=201,
            outcome="success",
            duration_ms=12.5,
        )
    )
    db.commit()

    response = client.get(
        f"{settings.API_V1_STR}/developer/audit-logs?action=events&outcome=success&resource=events&status_code=201",
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["data"][0]["action"] == "POST events"
    assert payload["data"][0]["outcome"] == "success"
    assert payload["data"][0]["duration_ms"] == 12.5
    assert payload["data"][0]["request_id"] == "audit-entry-test-01"


def test_non_developer_cannot_read_audit_logs(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{settings.API_V1_STR}/developer/audit-logs",
        headers=normal_user_token_headers,
    )

    assert response.status_code == 403



def test_developer_capability_does_not_grant_operational_admin_access(
    client: TestClient, db: Session
) -> None:
    email = random_email()
    password = random_lower_string()
    crud.create_user(
        session=db,
        user_create=UserCreate(
            email=email,
            password=password,
            role=UserRole.student,
            is_developer=True,
            is_superuser=False,
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



def test_failed_mutation_is_audited_with_request_correlation_id(
    client: TestClient, db: Session
) -> None:
    headers = get_token_headers_for_role(
        client=client,
        db=db,
        role=UserRole.student,
        is_developer=True,
    )
    request_id = "developer-audit-test-01"
    headers["X-Request-ID"] = request_id

    event_id = "123e4567-e89b-12d3-a456-426614174000"
    response = client.patch(
        f"{settings.API_V1_STR}/events/{event_id}",
        headers=headers,
        json={},
    )

    assert response.status_code >= 400
    assert response.headers["x-request-id"] == request_id
    entry = db.exec(
        select(AuditLog).where(AuditLog.request_id == request_id)
    ).first()
    assert entry is not None
    assert entry.status_code == response.status_code
    assert entry.outcome == "failure"
    assert entry.path.endswith("/events/{event_id}")
    assert event_id not in entry.path
    assert entry.request_id == request_id


def test_audit_log_filters_reject_invalid_ranges(
    client: TestClient, db: Session
) -> None:
    headers = get_token_headers_for_role(
        client=client,
        db=db,
        role=UserRole.student,
        is_developer=True,
    )

    invalid_outcome = client.get(
        f"{settings.API_V1_STR}/developer/audit-logs?outcome=unknown",
        headers=headers,
    )
    invalid_range = client.get(
        f"{settings.API_V1_STR}/developer/audit-logs"
        "?start_at=2026-10-08T00:00:00Z&end_at=2026-10-07T00:00:00Z",
        headers=headers,
    )

    assert invalid_outcome.status_code == 422
    assert invalid_range.status_code == 422
