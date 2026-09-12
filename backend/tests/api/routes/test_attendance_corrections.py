from fastapi.testclient import TestClient

from app.core.config import settings
from tests.utils.utils import random_email, random_lower_string


def test_attendance_correction_audit(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create Event & Attendee & Registration & Attendance
    event_res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"Event {random_lower_string()[:5]}",
            "event_date": "2026-09-15",
            "attendance_mode": "time_in_only",
        },
    )
    event_id = event_res.json()["id"]

    p_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "Audit",
            "last_name": "User",
            "email": random_email(),
        },
    )
    p_id = p_res.json()["id"]

    att_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=superuser_token_headers,
        json={"person_id": p_id, "attendee_type": "guest"},
    )
    att_id = att_res.json()["id"]

    reg_res = client.post(
        f"{settings.API_V1_STR}/event-registrations/",
        headers=superuser_token_headers,
        json={"event_id": event_id, "attendee_id": att_id},
    )
    reg_id = reg_res.json()["id"]

    att_rec_res = client.post(
        f"{settings.API_V1_STR}/attendance/",
        headers=superuser_token_headers,
        json={"registration_id": reg_id, "scan_method": "manual"},
    )
    attendance_id = att_rec_res.json()["id"]

    # 2. Create Attendance Correction
    corr_res = client.post(
        f"{settings.API_V1_STR}/attendance-corrections/",
        headers=superuser_token_headers,
        json={
            "attendance_id": attendance_id,
            "old_status": "present",
            "new_status": "completed",
            "reason": "Medical certificate submitted",
        },
    )
    assert corr_res.status_code == 200
    corr_id = corr_res.json()["id"]
    assert corr_res.json()["reason"] == "Medical certificate submitted"
    assert corr_res.json()["new_status"] == "completed"

    # 3. Read Corrections
    get_res = client.get(
        f"{settings.API_V1_STR}/attendance-corrections/?attendance_id={attendance_id}",
        headers=superuser_token_headers,
    )
    assert get_res.status_code == 200
    assert get_res.json()["count"] == 1
    assert get_res.json()["data"][0]["id"] == corr_id
