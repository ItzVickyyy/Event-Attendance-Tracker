from fastapi.testclient import TestClient

from app.core.config import settings
from tests.utils.utils import random_email, random_lower_string


def test_event_registration_crud(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create Event
    event_res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"Event {random_lower_string()[:6]}",
            "event_date": "2026-10-01",
            "attendance_mode": "time_in_only",
        },
    )
    event_id = event_res.json()["id"]

    # 2. Create Person & Attendee
    p_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "Test",
            "last_name": "Attendee",
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

    # 3. Create Event Registration
    reg_res = client.post(
        f"{settings.API_V1_STR}/event-registrations/",
        headers=superuser_token_headers,
        json={
            "event_id": event_id,
            "attendee_id": att_id,
            "registration_status": "registered",
        },
    )
    assert reg_res.status_code == 200
    reg_id = reg_res.json()["id"]

    # 4. Read Registrations
    get_res = client.get(
        f"{settings.API_V1_STR}/event-registrations/?event_id={event_id}",
        headers=superuser_token_headers,
    )
    assert get_res.status_code == 200
    assert get_res.json()["count"] == 1

    # 5. Update Registration
    update_res = client.patch(
        f"{settings.API_V1_STR}/event-registrations/{reg_id}",
        headers=superuser_token_headers,
        json={"registration_status": "cancelled"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["registration_status"] == "cancelled"

    # 6. Delete Registration
    del_res = client.delete(
        f"{settings.API_V1_STR}/event-registrations/{reg_id}",
        headers=superuser_token_headers,
    )
    assert del_res.status_code == 200
