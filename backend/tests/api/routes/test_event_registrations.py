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


def test_registration_rejected_for_closed_event(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create a closed Event
    event_res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"Closed Event {random_lower_string()[:6]}",
            "event_date": "2026-10-01",
            "attendance_mode": "time_in_only",
            "status": "closed",
        },
    )
    event_id = event_res.json()["id"]

    # 2. Create Person & Attendee
    p_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "Closed",
            "last_name": "EventTester",
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

    # 3. Attempt to register against the closed event -> 400
    reg_res = client.post(
        f"{settings.API_V1_STR}/event-registrations/",
        headers=superuser_token_headers,
        json={
            "event_id": event_id,
            "attendee_id": att_id,
            "registration_status": "registered",
        },
    )
    assert reg_res.status_code == 400
    assert "closed" in reg_res.json()["detail"].lower()

def test_registration_update_rejects_closed_event(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    open_event_res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"Open Event {random_lower_string()[:6]}",
            "event_date": "2026-10-01",
            "attendance_mode": "time_in_only",
            "status": "open",
        },
    )
    assert open_event_res.status_code == 200
    open_event_id = open_event_res.json()["id"]

    closed_event_res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"Closed Event {random_lower_string()[:6]}",
            "event_date": "2026-10-01",
            "attendance_mode": "time_in_only",
            "status": "closed",
        },
    )
    assert closed_event_res.status_code == 200
    closed_event_id = closed_event_res.json()["id"]

    person_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "Closed",
            "last_name": "EventRegistration",
            "email": random_email(),
        },
    )
    assert person_res.status_code == 200
    attendee_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=superuser_token_headers,
        json={"person_id": person_res.json()["id"], "attendee_type": "guest"},
    )
    assert attendee_res.status_code == 200

    registration_res = client.post(
        f"{settings.API_V1_STR}/event-registrations/",
        headers=superuser_token_headers,
        json={
            "event_id": open_event_id,
            "attendee_id": attendee_res.json()["id"],
            "registration_status": "registered",
        },
    )
    assert registration_res.status_code == 200
    registration_id = registration_res.json()["id"]

    move_to_closed = client.patch(
        f"{settings.API_V1_STR}/event-registrations/{registration_id}",
        headers=superuser_token_headers,
        json={"event_id": closed_event_id},
    )
    assert move_to_closed.status_code == 400
    assert move_to_closed.json()["detail"] == "Cannot register for a closed event"

    close_source_event = client.patch(
        f"{settings.API_V1_STR}/events/{open_event_id}",
        headers=superuser_token_headers,
        json={"status": "closed"},
    )
    assert close_source_event.status_code == 200

    cancel_registration = client.patch(
        f"{settings.API_V1_STR}/event-registrations/{registration_id}",
        headers=superuser_token_headers,
        json={"registration_status": "cancelled"},
    )
    assert cancel_registration.status_code == 200

    reactivate_registration = client.patch(
        f"{settings.API_V1_STR}/event-registrations/{registration_id}",
        headers=superuser_token_headers,
        json={"registration_status": "registered"},
    )
    assert reactivate_registration.status_code == 400
    assert (
        reactivate_registration.json()["detail"]
        == "Cannot register for a closed event"
    )

