from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.config import settings
from tests.utils.utils import random_email, random_lower_string


def _create_registered_attendee(
    client: TestClient, headers: dict[str, str], event_id: str
) -> tuple[str, str]:
    person = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=headers,
        json={
            "first_name": "Session",
            "last_name": random_lower_string()[:8],
            "email": random_email(),
        },
    ).json()
    attendee = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=headers,
        json={"person_id": person["id"], "attendee_type": "guest"},
    ).json()
    client.post(
        f"{settings.API_V1_STR}/attendee-credentials/",
        headers=headers,
        json={
            "attendee_id": attendee["id"],
            "credential_type": "nfc",
            "credential_value": f"NFC_{random_lower_string()[:10].upper()}",
            "is_active": True,
        },
    )
    client.post(
        f"{settings.API_V1_STR}/event-registrations/",
        headers=headers,
        json={
            "event_id": event_id,
            "attendee_id": attendee["id"],
            "registration_status": "registered",
        },
    )
    return attendee["id"], person["id"]


def test_attendance_sessions_allow_multiple_records_per_registration(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    event = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"Session Event {random_lower_string()[:6]}",
            "event_date": "2026-10-04",
            "attendance_mode": "time_in_only",
            "status": "open",
        },
    ).json()
    event_id = event["id"]

    attendee_id, _ = _create_registered_attendee(
        client, superuser_token_headers, event_id
    )

    sessions = client.get(
        f"{settings.API_V1_STR}/attendance-sessions/?event_id={event_id}",
        headers=superuser_token_headers,
    )
    assert sessions.status_code == 200
    first = sessions.json()["data"][0]
    assert first["is_active"] is True

    credential = client.get(
        f"{settings.API_V1_STR}/attendee-credentials/?attendee_id={attendee_id}",
        headers=superuser_token_headers,
    ).json()["data"][0]["credential_value"]

    first_scan = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers={**superuser_token_headers, "X-Attendance-Session-ID": first["id"]},
        json={
            "event_id": event_id,
            "credential_value": credential,
            "scan_method": "nfc",
        },
    )
    assert first_scan.status_code == 200

    second_session = client.post(
        f"{settings.API_V1_STR}/attendance-sessions/",
        headers=superuser_token_headers,
        json={
            "event_id": event_id,
            "session_date": "2026-10-04",
            "name": "Afternoon Time-In",
            "session_type": "TIME_IN",
            "status": "SCHEDULED",
            "display_order": 1,
            "is_active": False,
        },
    ).json()

    activated = client.post(
        f"{settings.API_V1_STR}/attendance-sessions/{second_session['id']}/activate",
        headers=superuser_token_headers,
    )
    assert activated.status_code == 200
    assert activated.json()["is_active"] is True

    second_scan = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers={
            **superuser_token_headers,
            "X-Attendance-Session-ID": second_session["id"],
        },
        json={
            "event_id": event_id,
            "credential_value": credential,
            "scan_method": "nfc",
        },
    )
    assert second_scan.status_code == 200

    attendance = client.get(
        f"{settings.API_V1_STR}/attendance/?event_id={event_id}&attendee_id={attendee_id}",
        headers=superuser_token_headers,
    )
    assert attendance.status_code == 200
    assert attendance.json()["count"] == 2
    assert {row["attendance_session_id"] for row in attendance.json()["data"]} == {
        first["id"],
        second_session["id"],
    }


def test_session_late_cutoff_is_calculated_server_side(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    event = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"Late Event {random_lower_string()[:6]}",
            "event_date": "2026-10-04",
            "attendance_mode": "time_in_only",
            "status": "open",
        },
    ).json()
    event_id = event["id"]
    attendee_id, _ = _create_registered_attendee(
        client, superuser_token_headers, event_id
    )
    credential = client.get(
        f"{settings.API_V1_STR}/attendee-credentials/?attendee_id={attendee_id}",
        headers=superuser_token_headers,
    ).json()["data"][0]["credential_value"]

    sessions = client.get(
        f"{settings.API_V1_STR}/attendance-sessions/?event_id={event_id}",
        headers=superuser_token_headers,
    ).json()["data"]
    session_id = sessions[0]["id"]

    updated = client.patch(
        f"{settings.API_V1_STR}/attendance-sessions/{session_id}",
        headers=superuser_token_headers,
        json={"late_cutoff": "00:00"},
    )
    assert updated.status_code == 200

    scan = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers={**superuser_token_headers, "X-Attendance-Session-ID": session_id},
        json={
            "event_id": event_id,
            "credential_value": credential,
            "scan_method": "nfc",
        },
    )
    assert scan.status_code == 200
    assert scan.json()["attendance"]["is_late"] is True


def test_attendance_session_lifecycle_filters_and_status_transitions(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    event = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=headers,
        json={
            "event_name": f"Session CRUD {random_lower_string()[:6]}",
            "event_date": "2026-10-04",
            "attendance_mode": "time_in_only",
            "status": "open",
        },
    )
    assert event.status_code == 200
    event_id = event.json()["id"]

    sessions_response = client.get(
        f"{settings.API_V1_STR}/attendance-sessions/?event_id={event_id}",
        headers=headers,
    )
    assert sessions_response.status_code == 200
    first = sessions_response.json()["data"][0]
    assert first["is_active"] is True

    active = client.get(
        f"{settings.API_V1_STR}/attendance-sessions/active/{event_id}",
        headers=headers,
    )
    assert active.status_code == 200
    assert active.json()["id"] == first["id"]

    second_response = client.post(
        f"{settings.API_V1_STR}/attendance-sessions/",
        headers=headers,
        json={
            "event_id": event_id,
            "session_date": "2026-10-04",
            "name": "Session CRUD Inactive",
            "session_type": "TIME_IN",
            "status": "SCHEDULED",
            "display_order": 2,
            "is_active": False,
        },
    )
    assert second_response.status_code == 200
    second_id = second_response.json()["id"]

    scheduled = client.get(
        f"{settings.API_V1_STR}/attendance-sessions/?event_id={event_id}&status=SCHEDULED",
        headers=headers,
    )
    assert scheduled.status_code == 200
    assert any(row["id"] == second_id for row in scheduled.json()["data"])

    activated = client.patch(
        f"{settings.API_V1_STR}/attendance-sessions/{second_id}",
        headers=headers,
        json={"status": "OPEN"},
    )
    assert activated.status_code == 200
    assert activated.json()["is_active"] is True

    first_after = client.get(
        f"{settings.API_V1_STR}/attendance-sessions/{first['id']}", headers=headers
    )
    assert first_after.status_code == 200
    assert first_after.json()["is_active"] is False
    assert first_after.json()["status"] == "CLOSED"

    blocked_delete = client.delete(
        f"{settings.API_V1_STR}/attendance-sessions/{second_id}", headers=headers
    )
    assert blocked_delete.status_code == 400

    closed = client.post(
        f"{settings.API_V1_STR}/attendance-sessions/{second_id}/close", headers=headers
    )
    assert closed.status_code == 200
    assert closed.json()["is_active"] is False
    assert closed.json()["status"] == "CLOSED"

    deleted = client.delete(
        f"{settings.API_V1_STR}/attendance-sessions/{second_id}", headers=headers
    )
    assert deleted.status_code == 200

    missing_id = random_lower_string()[:8]
    assert (
        client.get(
            f"{settings.API_V1_STR}/attendance-sessions/{missing_id}", headers=headers
        ).status_code
        == 422
    )


def test_attendance_session_rejects_invalid_event_and_active_status(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    missing_event = client.get(
        f"{settings.API_V1_STR}/attendance-sessions/active/{random_lower_string()[:8]}",
        headers=headers,
    )
    assert missing_event.status_code == 422

    event = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=headers,
        json={
            "event_name": f"Session Invalid {random_lower_string()[:6]}",
            "event_date": "2026-10-04",
            "attendance_mode": "time_in_only",
            "status": "open",
        },
    )
    assert event.status_code == 200
    event_id = event.json()["id"]

    invalid_active = client.post(
        f"{settings.API_V1_STR}/attendance-sessions/",
        headers=headers,
        json={
            "event_id": event_id,
            "session_date": "2026-10-04",
            "name": "Invalid Active Session",
            "session_type": "TIME_IN",
            "status": "SCHEDULED",
            "display_order": 3,
            "is_active": True,
        },
    )
    assert invalid_active.status_code == 400

    closed_event = client.patch(
        f"{settings.API_V1_STR}/events/{event_id}",
        headers=headers,
        json={"status": "closed"},
    )
    assert closed_event.status_code == 200
    rejected = client.post(
        f"{settings.API_V1_STR}/attendance-sessions/",
        headers=headers,
        json={
            "event_id": event_id,
            "session_date": "2026-10-04",
            "name": "Closed Event Session",
            "session_type": "TIME_IN",
            "status": "SCHEDULED",
            "display_order": 4,
            "is_active": False,
        },
    )
    assert rejected.status_code == 400


def test_missing_attendance_session_resources_return_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    missing_event_id = uuid4()
    missing_session_id = uuid4()

    active = client.get(
        f"{settings.API_V1_STR}/attendance-sessions/active/{missing_event_id}",
        headers=headers,
    )
    assert active.status_code == 404

    event = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=headers,
        json={
            "event_name": f"Missing Session {random_lower_string()[:6]}",
            "event_date": "2026-10-04",
            "attendance_mode": "time_in_only",
            "status": "open",
        },
    )
    assert event.status_code == 200
    event_id = event.json()["id"]

    sessions = client.get(
        f"{settings.API_V1_STR}/attendance-sessions/?event_id={event_id}",
        headers=headers,
    )
    assert sessions.status_code == 200
    active_session_id = sessions.json()["data"][0]["id"]
    closed = client.post(
        f"{settings.API_V1_STR}/attendance-sessions/{active_session_id}/close",
        headers=headers,
    )
    assert closed.status_code == 200

    no_active_session = client.get(
        f"{settings.API_V1_STR}/attendance-sessions/active/{event_id}",
        headers=headers,
    )
    assert no_active_session.status_code == 404

    assert (
        client.get(
            f"{settings.API_V1_STR}/attendance-sessions/{missing_session_id}",
            headers=headers,
        ).status_code
        == 404
    )
    assert (
        client.patch(
            f"{settings.API_V1_STR}/attendance-sessions/{missing_session_id}",
            headers=headers,
            json={"name": "Missing"},
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"{settings.API_V1_STR}/attendance-sessions/{missing_session_id}/activate",
            headers=headers,
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"{settings.API_V1_STR}/attendance-sessions/{missing_session_id}/close",
            headers=headers,
        ).status_code
        == 404
    )
    assert (
        client.delete(
            f"{settings.API_V1_STR}/attendance-sessions/{missing_session_id}",
            headers=headers,
        ).status_code
        == 404
    )


def test_cancelled_session_cannot_be_activated_after_event_closes(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    event = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=headers,
        json={
            "event_name": f"Cancelled Session {random_lower_string()[:6]}",
            "event_date": "2026-10-04",
            "attendance_mode": "time_in_only",
            "status": "open",
        },
    )
    assert event.status_code == 200
    event_id = event.json()["id"]

    created = client.post(
        f"{settings.API_V1_STR}/attendance-sessions/",
        headers=headers,
        json={
            "event_id": event_id,
            "session_date": "2026-10-04",
            "name": "Cancelled Test Session",
            "session_type": "TIME_IN",
            "status": "SCHEDULED",
            "display_order": 2,
            "is_active": False,
        },
    )
    assert created.status_code == 200
    session_id = created.json()["id"]

    cancelled = client.patch(
        f"{settings.API_V1_STR}/attendance-sessions/{session_id}",
        headers=headers,
        json={"status": "CANCELLED"},
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "CANCELLED"
    assert cancelled.json()["is_active"] is False

    closed_event = client.patch(
        f"{settings.API_V1_STR}/events/{event_id}",
        headers=headers,
        json={"status": "closed"},
    )
    assert closed_event.status_code == 200

    activation = client.post(
        f"{settings.API_V1_STR}/attendance-sessions/{session_id}/activate",
        headers=headers,
    )
    assert activation.status_code == 400
    assert (
        activation.json()["detail"]
        == "Event must be open before a session can be activated"
    )


def test_creating_active_session_closes_previous_active_session(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    event = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=headers,
        json={
            "event_name": f"Active Session Replacement {random_lower_string()[:6]}",
            "event_date": "2026-10-04",
            "attendance_mode": "time_in_only",
            "status": "open",
        },
    )
    assert event.status_code == 200
    event_id = event.json()["id"]

    existing = client.get(
        f"{settings.API_V1_STR}/attendance-sessions/?event_id={event_id}",
        headers=headers,
    )
    assert existing.status_code == 200
    previous_session = existing.json()["data"][0]
    assert previous_session["is_active"] is True

    created = client.post(
        f"{settings.API_V1_STR}/attendance-sessions/",
        headers=headers,
        json={
            "event_id": event_id,
            "session_date": "2026-10-04",
            "name": "Replacement Active Session",
            "session_type": "TIME_IN",
            "status": "OPEN",
            "display_order": 2,
            "is_active": True,
        },
    )
    assert created.status_code == 200
    assert created.json()["is_active"] is True

    previous = client.get(
        f"{settings.API_V1_STR}/attendance-sessions/{previous_session['id']}",
        headers=headers,
    )
    assert previous.status_code == 200
    assert previous.json()["is_active"] is False
    assert previous.json()["status"] == "CLOSED"
