from fastapi.testclient import TestClient

from app.core.config import settings
from tests.utils.utils import random_lower_string


def test_event_crud(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create Organization
    org_res = client.post(
        f"{settings.API_V1_STR}/organizations/",
        headers=superuser_token_headers,
        json={"name": f"Org_{random_lower_string()[:8]}"},
    )
    org_id = org_res.json()["id"]

    # 2. Create Event
    event_data = {
        "event_name": f"Orientation {random_lower_string()[:6]}",
        "description": "Annual General Orientation",
        "event_date": "2026-09-15",
        "start_time": "08:00:00",
        "end_time": "12:00:00",
        "attendance_mode": "time_in_only",
        "organization_id": org_id,
        "status": "draft",
    }
    r = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json=event_data,
    )
    assert r.status_code == 200
    event_id = r.json()["id"]
    assert r.json()["event_name"] == event_data["event_name"]

    # 3. Read Events with filter
    filter_res = client.get(
        f"{settings.API_V1_STR}/events/?organization_id={org_id}",
        headers=superuser_token_headers,
    )
    assert filter_res.status_code == 200
    assert filter_res.json()["count"] >= 1

    # 4. Update Event
    update_res = client.patch(
        f"{settings.API_V1_STR}/events/{event_id}",
        headers=superuser_token_headers,
        json={
            "status": "open",
            "academic_year_id": r.json()["academic_year_id"],
            "eligible_section_ids": ["section-a", "section-b"],
        },
    )
    assert update_res.status_code == 200
    assert update_res.json()["status"] == "open"
    assert update_res.json()["academic_year_id"] == r.json()["academic_year_id"]
    assert update_res.json()["eligible_section_ids"] == ["section-a", "section-b"]

    # 5. Delete Event
    del_res = client.delete(
        f"{settings.API_V1_STR}/events/{event_id}",
        headers=superuser_token_headers,
    )
    assert del_res.status_code == 200


def test_event_reverting_to_draft_deactivates_attendance_session(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    event_response = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=headers,
        json={
            "event_name": f"Draft Transition {random_lower_string()[:6]}",
            "event_date": "2026-10-17",
            "attendance_mode": "time_in_only",
            "status": "open",
        },
    )
    assert event_response.status_code == 200
    event_id = event_response.json()["id"]

    before = client.get(
        f"{settings.API_V1_STR}/attendance-sessions/?event_id={event_id}",
        headers=headers,
    )
    assert before.status_code == 200
    assert len(before.json()["data"]) == 1
    assert before.json()["data"][0]["status"] == "OPEN"
    assert before.json()["data"][0]["is_active"] is True

    updated = client.patch(
        f"{settings.API_V1_STR}/events/{event_id}",
        headers=headers,
        json={"status": "draft"},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "draft"

    after = client.get(
        f"{settings.API_V1_STR}/attendance-sessions/?event_id={event_id}",
        headers=headers,
    )
    assert after.status_code == 200
    assert len(after.json()["data"]) == 1
    assert after.json()["data"][0]["status"] == "SCHEDULED"
    assert after.json()["data"][0]["is_active"] is False

def test_event_closed_to_draft_resets_non_cancelled_sessions(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    event = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=headers,
        json={
            "event_name": f"Reopened Draft {random_lower_string()[:6]}",
            "event_date": "2026-10-18",
            "attendance_mode": "time_in_only",
            "status": "open",
        },
    )
    assert event.status_code == 200
    event_id = event.json()["id"]

    created_session = client.post(
        f"{settings.API_V1_STR}/attendance-sessions/",
        headers=headers,
        json={
            "event_id": event_id,
            "session_date": "2026-10-18",
            "name": "Additional Scheduled Session",
            "session_type": "TIME_IN",
            "status": "SCHEDULED",
            "display_order": 1,
            "is_active": False,
        },
    )
    assert created_session.status_code == 200
    scheduled_session_id = created_session.json()["id"]

    cancelled_session = client.patch(
        f"{settings.API_V1_STR}/attendance-sessions/{scheduled_session_id}",
        headers=headers,
        json={"status": "CANCELLED"},
    )
    assert cancelled_session.status_code == 200

    closed = client.patch(
        f"{settings.API_V1_STR}/events/{event_id}",
        headers=headers,
        json={"status": "closed"},
    )
    assert closed.status_code == 200

    after_close = client.get(
        f"{settings.API_V1_STR}/attendance-sessions/?event_id={event_id}",
        headers=headers,
    )
    assert after_close.status_code == 200
    sessions_after_close = after_close.json()["data"]
    assert all(row["status"] in {"CLOSED", "CANCELLED"} for row in sessions_after_close)
    assert all(row["is_active"] is False for row in sessions_after_close)
    assert next(
        row for row in sessions_after_close if row["id"] == scheduled_session_id
    )["status"] == "CANCELLED"

    drafted = client.patch(
        f"{settings.API_V1_STR}/events/{event_id}",
        headers=headers,
        json={"status": "draft"},
    )
    assert drafted.status_code == 200

    after_draft = client.get(
        f"{settings.API_V1_STR}/attendance-sessions/?event_id={event_id}",
        headers=headers,
    )
    assert after_draft.status_code == 200
    sessions_after_draft = after_draft.json()["data"]
    assert all(row["is_active"] is False for row in sessions_after_draft)
    assert next(
        row for row in sessions_after_draft if row["id"] != scheduled_session_id
    )["status"] == "SCHEDULED"
    assert next(
        row for row in sessions_after_draft if row["id"] == scheduled_session_id
    )["status"] == "CANCELLED"
