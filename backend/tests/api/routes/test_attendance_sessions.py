from fastapi.testclient import TestClient

from app.core.config import settings
from tests.utils.utils import random_email, random_lower_string


def _create_registered_attendee(client: TestClient, headers: dict[str, str], event_id: str) -> tuple[str, str]:
    person = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=headers,
        json={"first_name": "Session", "last_name": random_lower_string()[:8], "email": random_email()},
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
        json={"event_id": event_id, "attendee_id": attendee["id"], "registration_status": "registered"},
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

    attendee_id, _ = _create_registered_attendee(client, superuser_token_headers, event_id)

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
        json={"event_id": event_id, "credential_value": credential, "scan_method": "nfc"},
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
        headers={**superuser_token_headers, "X-Attendance-Session-ID": second_session["id"]},
        json={"event_id": event_id, "credential_value": credential, "scan_method": "nfc"},
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
    attendee_id, _ = _create_registered_attendee(client, superuser_token_headers, event_id)
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
        json={"event_id": event_id, "credential_value": credential, "scan_method": "nfc"},
    )
    assert scan.status_code == 200
    assert scan.json()["attendance"]["is_late"] is True
