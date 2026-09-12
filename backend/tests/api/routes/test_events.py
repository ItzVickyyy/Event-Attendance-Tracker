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
        json={"status": "open"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["status"] == "open"

    # 5. Delete Event
    del_res = client.delete(
        f"{settings.API_V1_STR}/events/{event_id}",
        headers=superuser_token_headers,
    )
    assert del_res.status_code == 200
