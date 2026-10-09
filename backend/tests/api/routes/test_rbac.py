from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import (
    UserCreate,
    UserRole,
)
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string


def create_user_with_role(
    db: Session,
    role: UserRole,
    can_scan: bool = False,
    is_superuser: bool = False,
    is_developer: bool = False,
) -> tuple[UserCreate, str]:
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(
        email=email,
        password=password,
        role=role,
        can_scan=can_scan,
        is_superuser=is_superuser,
        is_developer=is_developer,
    )
    crud.create_user(session=db, user_create=user_in)
    return user_in, password


def get_token_headers_for_role(
    client: TestClient,
    db: Session,
    role: UserRole,
    can_scan: bool = False,
    is_superuser: bool = False,
    is_developer: bool = False,
) -> dict[str, str]:
    user_in, password = create_user_with_role(
        db=db,
        role=role,
        can_scan=can_scan,
        is_superuser=is_superuser,
        is_developer=is_developer,
    )
    return user_authentication_headers(
        client=client, email=user_in.email, password=password
    )


def test_unauthenticated_requests_return_401_with_bearer_header(
    client: TestClient,
) -> None:
    # 1. Test unauthenticated request on protected endpoints
    endpoints = [
        ("GET", f"{settings.API_V1_STR}/users/me"),
        ("GET", f"{settings.API_V1_STR}/academic-programs/"),
        ("GET", f"{settings.API_V1_STR}/attendance/"),
    ]
    for method, url in endpoints:
        if method == "GET":
            response = client.get(url)
        response_data = response.json()
        assert response.status_code == 401
        assert response.headers.get("www-authenticate") == "Bearer"
        assert response_data["detail"] == "Not authenticated"


def test_invalid_token_returns_401_with_bearer_header(client: TestClient) -> None:
    headers = {"Authorization": "Bearer invalid_token_12345"}
    response = client.get(f"{settings.API_V1_STR}/users/me", headers=headers)
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"
    assert response.json()["detail"] == "Could not validate credentials"


def test_invalid_token_payload_returns_401_with_bearer_header(
    client: TestClient,
) -> None:
    # Create a JWT with valid signature but invalid payload for TokenPayload
    # TokenPayload requires `sub` to be a string if present
    # We bypass jwt.decode's default sub validation to test Pydantic validation
    import jwt

    from app.core import security
    from app.core.config import settings

    payload = {"sub": 123, "exp": 9999999999}  # sub as int (should be str)
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=security.ALGORITHM)

    # Use options to disable jwt's sub validation so we hit Pydantic validation
    # We directly test the endpoint which will use the fixed code path
    response = client.get(
        f"{settings.API_V1_STR}/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"
    assert response.json()["detail"] == "Could not validate credentials"


def test_role_hierarchy_admin_mutations(client: TestClient, db: Session) -> None:
    student_headers = get_token_headers_for_role(
        client, db, role=UserRole.student, can_scan=False
    )
    class_rep_headers = get_token_headers_for_role(
        client, db, role=UserRole.class_representative, can_scan=False
    )
    admin_headers = get_token_headers_for_role(
        client, db, role=UserRole.admin, can_scan=False
    )
    super_admin_headers = get_token_headers_for_role(
        client, db, role=UserRole.super_admin, can_scan=True, is_superuser=True
    )
    dev_headers = get_token_headers_for_role(
        client, db, role=UserRole.student, can_scan=True, is_developer=True
    )

    # Attempt to create an academic program with Student -> 403
    payload = {
        "program_code": f"BSIT-{random_lower_string()[:4]}",
        "program_name": "BS Information Tech",
    }
    r = client.post(
        f"{settings.API_V1_STR}/academic-programs/",
        headers=student_headers,
        json=payload,
    )
    assert r.status_code == 403

    # Attempt to create an academic program with Class Rep -> 403
    payload2 = {
        "program_code": f"BSCS-{random_lower_string()[:4]}",
        "program_name": "BS Computer Science",
    }
    r = client.post(
        f"{settings.API_V1_STR}/academic-programs/",
        headers=class_rep_headers,
        json=payload2,
    )
    assert r.status_code == 403

    # Admin handles operations, not global academic configuration.
    r = client.post(
        f"{settings.API_V1_STR}/academic-programs/",
        headers=admin_headers,
        json=payload,
    )
    assert r.status_code == 403

    # Super Admin -> 200
    r = client.post(
        f"{settings.API_V1_STR}/academic-programs/",
        headers=super_admin_headers,
        json=payload2,
    )
    assert r.status_code == 200
    assert r.json()["program_code"] == payload2["program_code"]

    # Developer access is technical only and does not grant business administration.
    payload3 = {
        "program_code": f"BSECE-{random_lower_string()[:4]}",
        "program_name": "BS Electronics Eng",
    }
    r = client.post(
        f"{settings.API_V1_STR}/academic-programs/", headers=dev_headers, json=payload3
    )
    assert r.status_code == 403


def test_scanner_permission_matrix(client: TestClient, db: Session) -> None:
    # Setup test event, registered attendee, and credential
    person_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=get_token_headers_for_role(client, db, role=UserRole.admin),
        json={"first_name": "Jane", "last_name": "Doe", "email": random_email()},
    )
    person_id = person_res.json()["id"]

    attendee_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=get_token_headers_for_role(client, db, role=UserRole.admin),
        json={"person_id": person_id, "attendee_type": "student"},
    )
    attendee_id = attendee_res.json()["id"]

    cred_val1 = f"QR_{random_lower_string()[:8]}"
    client.post(
        f"{settings.API_V1_STR}/attendee-credentials/",
        headers=get_token_headers_for_role(client, db, role=UserRole.admin),
        json={
            "attendee_id": attendee_id,
            "credential_type": "qr",
            "credential_value": cred_val1,
            "is_active": True,
        },
    )

    event_res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=get_token_headers_for_role(client, db, role=UserRole.admin),
        json={
            "event_name": f"Summit {random_lower_string()}",
            "event_date": "2026-09-12",
            "status": "open",
        },
    )
    event_id = event_res.json()["id"]

    client.post(
        f"{settings.API_V1_STR}/event-registrations/",
        headers=get_token_headers_for_role(client, db, role=UserRole.admin),
        json={
            "event_id": event_id,
            "attendee_id": attendee_id,
            "registration_status": "registered",
        },
    )

    scan_payload = {
        "event_id": event_id,
        "credential_value": cred_val1,
        "scan_method": "qr",
    }

    # Student without can_scan -> 403
    student_no_scan = get_token_headers_for_role(
        client, db, role=UserRole.student, can_scan=False
    )
    r = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=student_no_scan,
        json=scan_payload,
    )
    assert r.status_code == 403

    # Student with can_scan=True (e.g. scanner volunteer) -> 200
    student_with_scan = get_token_headers_for_role(
        client, db, role=UserRole.student, can_scan=True
    )
    r = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=student_with_scan,
        json=scan_payload,
    )
    assert r.status_code == 200
    assert r.json()["attendee_id"] == attendee_id

    # Class Rep without can_scan -> 403
    class_rep_no_scan = get_token_headers_for_role(
        client, db, role=UserRole.class_representative, can_scan=False
    )
    # create second attendee & credential
    p2 = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=get_token_headers_for_role(client, db, role=UserRole.admin),
        json={"first_name": "Bob", "last_name": "Smith", "email": random_email()},
    ).json()
    att2 = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=get_token_headers_for_role(client, db, role=UserRole.admin),
        json={"person_id": p2["id"], "attendee_type": "student"},
    ).json()
    cred_val2 = f"QR_{random_lower_string()[:8]}"
    client.post(
        f"{settings.API_V1_STR}/attendee-credentials/",
        headers=get_token_headers_for_role(client, db, role=UserRole.admin),
        json={
            "attendee_id": att2["id"],
            "credential_type": "qr",
            "credential_value": cred_val2,
            "is_active": True,
        },
    )

    client.post(
        f"{settings.API_V1_STR}/event-registrations/",
        headers=get_token_headers_for_role(client, db, role=UserRole.admin),
        json={
            "event_id": event_id,
            "attendee_id": att2["id"],
            "registration_status": "registered",
        },
    )

    scan_payload2 = {
        "event_id": event_id,
        "credential_value": cred_val2,
        "scan_method": "qr",
    }
    r = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=class_rep_no_scan,
        json=scan_payload2,
    )
    assert r.status_code == 403

    # Class Rep with can_scan=True -> 200
    class_rep_with_scan = get_token_headers_for_role(
        client, db, role=UserRole.class_representative, can_scan=True
    )
    r = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=class_rep_with_scan,
        json=scan_payload2,
    )
    assert r.status_code == 200
    assert r.json()["attendee_id"] == att2["id"]

    # Admin without can_scan set explicitly (role is Admin) -> 200 (Admins always can scan)
    p3 = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=get_token_headers_for_role(client, db, role=UserRole.admin),
        json={"first_name": "Alice", "last_name": "Wonder", "email": random_email()},
    ).json()
    att3 = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=get_token_headers_for_role(client, db, role=UserRole.admin),
        json={"person_id": p3["id"], "attendee_type": "student"},
    ).json()
    cred_val3 = f"NFC_{random_lower_string()[:8]}"
    client.post(
        f"{settings.API_V1_STR}/attendee-credentials/",
        headers=get_token_headers_for_role(client, db, role=UserRole.admin),
        json={
            "attendee_id": att3["id"],
            "credential_type": "nfc",
            "credential_value": cred_val3,
            "is_active": True,
        },
    )

    client.post(
        f"{settings.API_V1_STR}/event-registrations/",
        headers=get_token_headers_for_role(client, db, role=UserRole.admin),
        json={
            "event_id": event_id,
            "attendee_id": att3["id"],
            "registration_status": "registered",
        },
    )

    scan_payload3 = {
        "event_id": event_id,
        "credential_value": cred_val3,
        "scan_method": "nfc",
    }
    admin_headers = get_token_headers_for_role(
        client, db, role=UserRole.admin, can_scan=False
    )
    r = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=admin_headers,
        json=scan_payload3,
    )
    assert r.status_code == 200
    assert r.json()["attendee_id"] == att3["id"]


def test_attendance_correction_requires_admin(client: TestClient, db: Session) -> None:
    student_with_scan = get_token_headers_for_role(
        client, db, role=UserRole.student, can_scan=True
    )
    admin_headers = get_token_headers_for_role(
        client, db, role=UserRole.admin, can_scan=False
    )

    # Student scanner cannot create correction -> 403
    corr_payload = {
        "attendance_id": "00000000-0000-0000-0000-000000000000",
        "corrected_status": "present",
        "reason": "Test correction",
    }
    r = client.post(
        f"{settings.API_V1_STR}/attendance-corrections/",
        headers=student_with_scan,
        json=corr_payload,
    )
    assert r.status_code == 403

    # Admin passes RBAC check (returns 404 because attendance record id is fictitious)
    r_admin = client.post(
        f"{settings.API_V1_STR}/attendance-corrections/",
        headers=admin_headers,
        json=corr_payload,
    )
    assert r_admin.status_code == 404


def test_admin_user_management_hierarchy(client: TestClient, db: Session) -> None:
    admin_headers = get_token_headers_for_role(client, db, role=UserRole.admin)
    super_admin_headers = get_token_headers_for_role(
        client, db, role=UserRole.super_admin, is_superuser=True
    )

    # Admins may create operational accounts such as Class Representatives.
    create_class_rep = client.post(
        f"{settings.API_V1_STR}/users/",
        headers=admin_headers,
        json={
            "email": random_email(),
            "password": random_lower_string(),
            "role": UserRole.class_representative.value,
        },
    )
    assert create_class_rep.status_code == 200
    class_rep_id = create_class_rep.json()["id"]

    # Admins cannot grant scanner capability while creating an account.
    create_scanner = client.post(
        f"{settings.API_V1_STR}/users/",
        headers=admin_headers,
        json={
            "email": random_email(),
            "password": random_lower_string(),
            "role": UserRole.student.value,
            "can_scan": True,
        },
    )
    assert create_scanner.status_code == 403

    # Admins cannot create other administrators.
    create_admin = client.post(
        f"{settings.API_V1_STR}/users/",
        headers=admin_headers,
        json={
            "email": random_email(),
            "password": random_lower_string(),
            "role": UserRole.admin.value,
        },
    )
    assert create_admin.status_code == 403

    # Admins cannot grant scanner permissions through the general Users API.
    grant_scanner = client.patch(
        f"{settings.API_V1_STR}/users/{class_rep_id}",
        headers=admin_headers,
        json={"can_scan": True},
    )
    assert grant_scanner.status_code == 403

    # Super Admins can create administrator accounts.
    create_admin_by_super_admin = client.post(
        f"{settings.API_V1_STR}/users/",
        headers=super_admin_headers,
        json={
            "email": random_email(),
            "password": random_lower_string(),
            "role": UserRole.admin.value,
        },
    )
    assert create_admin_by_super_admin.status_code == 200
    admin_id = create_admin_by_super_admin.json()["id"]

    # Admins cannot change or delete another Admin account.
    update_admin = client.patch(
        f"{settings.API_V1_STR}/users/{admin_id}",
        headers=admin_headers,
        json={"is_active": False},
    )
    assert update_admin.status_code == 403
    delete_admin = client.delete(
        f"{settings.API_V1_STR}/users/{admin_id}",
        headers=admin_headers,
    )
    assert delete_admin.status_code == 403


def test_super_admin_cannot_delete_self_by_role_only(
    client: TestClient, db: Session
) -> None:
    # The role itself must protect Super Admin accounts even if a legacy row
    # has is_superuser=False.
    headers = get_token_headers_for_role(
        client, db, role=UserRole.super_admin, is_superuser=False
    )
    response = client.delete(f"{settings.API_V1_STR}/users/me", headers=headers)
    assert response.status_code == 403


def test_class_representative_can_reach_scoped_attendance_read_routes(
    client: TestClient, db: Session
) -> None:
    class_rep_headers = get_token_headers_for_role(
        client, db, role=UserRole.class_representative, can_scan=False
    )

    # A Class Representative is authorized for these read routes, but must have
    # an assignment before the collection/export endpoints return any records.
    list_response = client.get(
        f"{settings.API_V1_STR}/attendance/", headers=class_rep_headers
    )
    assert list_response.status_code == 403
    assert "assigned" in list_response.json()["detail"].lower()

    export_response = client.get(
        f"{settings.API_V1_STR}/attendance/export", headers=class_rep_headers
    )
    assert export_response.status_code == 403
    assert "assignment" in export_response.json()["detail"].lower()

    # The detail route is reachable, but a nonexistent record remains not found.
    detail_response = client.get(
        f"{settings.API_V1_STR}/attendance/00000000-0000-0000-0000-000000000000",
        headers=class_rep_headers,
    )
    assert detail_response.status_code == 404
    assert detail_response.json()["detail"] == "Attendance record not found"
