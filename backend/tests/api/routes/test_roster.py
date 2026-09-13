import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models import UserRole
from tests.utils.user import get_token_headers_for_role
from tests.utils.utils import random_email, random_lower_string


def _create_event(
    client: TestClient, headers: dict[str, str], *, status: str = "open"
) -> str:
    res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=headers,
        json={
            "event_name": f"Roster Event {random_lower_string()[:5]}",
            "event_date": "2026-09-15",
            "status": status,
        },
    )
    return res.json()["id"]


def _create_attendee(
    client: TestClient,
    headers: dict[str, str],
    attendee_type: str,
    *,
    student_number: str | None = None,
    credentials: list[tuple[str, str, bool]] | None = None,
) -> str:
    p_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=headers,
        json={
            "first_name": f"First{random_lower_string()[:4]}",
            "last_name": f"Last{random_lower_string()[:4]}",
            "email": random_email(),
        },
    )
    person_id = p_res.json()["id"]

    if student_number is not None:
        client.post(
            f"{settings.API_V1_STR}/students/",
            headers=headers,
            json={"person_id": person_id, "student_number": student_number},
        )

    att_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=headers,
        json={"person_id": person_id, "attendee_type": attendee_type},
    )
    att_id = att_res.json()["id"]

    for cred_type, cred_value, is_active in credentials or []:
        client.post(
            f"{settings.API_V1_STR}/attendee-credentials/",
            headers=headers,
            json={
                "attendee_id": att_id,
                "credential_type": cred_type,
                "credential_value": cred_value,
                "is_active": is_active,
            },
        )

    return att_id


def _register(
    client: TestClient,
    headers: dict[str, str],
    *,
    event_id: str,
    attendee_id: str,
    registration_status: str = "registered",
) -> None:
    client.post(
        f"{settings.API_V1_STR}/event-registrations/",
        headers=headers,
        json={
            "event_id": event_id,
            "attendee_id": attendee_id,
            "registration_status": registration_status,
        },
    )


def test_roster_returns_registered_attendees(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create open event
    event_id = _create_event(client, superuser_token_headers)

    # 2. Create registered attendees with credentials
    student_num = f"2026-{random_lower_string()[:5].upper()}"
    nfc_uid = f"NFC_{random_lower_string()[:8].upper()}"
    student_att = _create_attendee(
        client,
        superuser_token_headers,
        "student",
        student_number=student_num,
        credentials=[("nfc", nfc_uid, True)],
    )

    qr_code = f"QR_{random_lower_string()[:8].upper()}"
    faculty_att = _create_attendee(
        client,
        superuser_token_headers,
        "faculty",
        credentials=[("qr", qr_code, True)],
    )

    _register(
        client, superuser_token_headers, event_id=event_id, attendee_id=student_att
    )
    _register(
        client, superuser_token_headers, event_id=event_id, attendee_id=faculty_att
    )

    # 3. Fetch roster
    res = client.get(
        f"{settings.API_V1_STR}/events/{event_id}/roster",
        headers=superuser_token_headers,
    )
    assert res.status_code == 200, res.text
    payload = res.json()
    assert payload["count"] == 2

    by_attendee = {entry["attendee_id"]: entry for entry in payload["data"]}

    student_entry = by_attendee[student_att]
    assert student_entry["event_id"] == event_id
    assert student_entry["registration_status"] == "registered"
    assert student_entry["student_number"] == student_num
    assert student_entry["credentials"] == [
        {"credential_type": "nfc", "credential_value": nfc_uid, "is_active": True}
    ]
    # PII pruning: email/contact_number must never leak into the roster
    assert "email" not in student_entry
    assert "contact_number" not in student_entry

    faculty_entry = by_attendee[faculty_att]
    assert faculty_entry["student_number"] is None
    assert faculty_entry["credentials"] == [
        {"credential_type": "qr", "credential_value": qr_code, "is_active": True}
    ]


def test_roster_excludes_cancelled_registrations(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create open event
    event_id = _create_event(client, superuser_token_headers)

    # 2. Registered attendee + cancelled attendee
    registered_att = _create_attendee(client, superuser_token_headers, "guest")
    cancelled_att = _create_attendee(client, superuser_token_headers, "guest")
    _register(
        client, superuser_token_headers, event_id=event_id, attendee_id=registered_att
    )
    _register(
        client,
        superuser_token_headers,
        event_id=event_id,
        attendee_id=cancelled_att,
        registration_status="cancelled",
    )

    # 3. Fetch roster -> only registered attendee returned
    res = client.get(
        f"{settings.API_V1_STR}/events/{event_id}/roster",
        headers=superuser_token_headers,
    )
    assert res.status_code == 200, res.text
    payload = res.json()
    assert payload["count"] == 1
    assert payload["data"][0]["attendee_id"] == registered_att


def test_roster_excludes_inactive_credentials(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create open event
    event_id = _create_event(client, superuser_token_headers)

    # 2. Attendee with one active and one inactive credential
    active_nfc = f"NFC_{random_lower_string()[:8].upper()}"
    inactive_qr = f"QR_{random_lower_string()[:8].upper()}"
    att_id = _create_attendee(
        client,
        superuser_token_headers,
        "student",
        credentials=[("nfc", active_nfc, True), ("qr", inactive_qr, False)],
    )
    _register(client, superuser_token_headers, event_id=event_id, attendee_id=att_id)

    # 3. Fetch roster -> only the active credential is exposed
    res = client.get(
        f"{settings.API_V1_STR}/events/{event_id}/roster",
        headers=superuser_token_headers,
    )
    assert res.status_code == 200, res.text
    creds = res.json()["data"][0]["credentials"]
    assert creds == [
        {"credential_type": "nfc", "credential_value": active_nfc, "is_active": True}
    ]


def test_roster_nonexistent_event_404(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    res = client.get(
        f"{settings.API_V1_STR}/events/{uuid.uuid4()}/roster",
        headers=superuser_token_headers,
    )
    assert res.status_code == 404
    assert "Event not found" in res.json()["detail"]


def test_roster_rbac(
    client: TestClient, db: Session, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create open event with one registered attendee
    event_id = _create_event(client, superuser_token_headers)
    att_id = _create_attendee(client, superuser_token_headers, "student")
    _register(client, superuser_token_headers, event_id=event_id, attendee_id=att_id)

    url = f"{settings.API_V1_STR}/events/{event_id}/roster"

    # 2. Unauthenticated -> 401
    r_unauth = client.get(url)
    assert r_unauth.status_code == 401

    # 3. User without scanner permission -> 403
    no_scan_headers = get_token_headers_for_role(
        client, db, role=UserRole.student, can_scan=False
    )
    r_forbidden = client.get(url, headers=no_scan_headers)
    assert r_forbidden.status_code == 403
    assert "The user does not have scanner permissions" in r_forbidden.json()["detail"]

    # 4. User with can_scan=True -> 200
    officer_headers = get_token_headers_for_role(
        client, db, role=UserRole.class_representative, can_scan=True
    )
    r_authorized = client.get(url, headers=officer_headers)
    assert r_authorized.status_code == 200
    assert r_authorized.json()["count"] == 1
