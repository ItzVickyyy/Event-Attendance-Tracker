from fastapi.testclient import TestClient

from app.core.config import settings


def test_academic_years_expose_current_year(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{settings.API_V1_STR}/academic-registry/academic-years",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    years = response.json()["data"]
    current = [year for year in years if year["is_current"]]
    assert len(current) == 1
    assert current[0]["label"] == "2026-2027"


def test_super_admin_can_create_and_switch_academic_year(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    create = client.post(
        f"{settings.API_V1_STR}/academic-registry/academic-years",
        headers=superuser_token_headers,
        json={
            "label": "2027-2028",
            "start_year": 2027,
            "end_year": 2028,
        },
    )
    assert create.status_code == 200
    new_year = create.json()
    assert new_year["is_current"] is False

    activate = client.post(
        f"{settings.API_V1_STR}/academic-registry/academic-years/{new_year['id']}/set-current",
        headers=superuser_token_headers,
    )
    assert activate.status_code == 200
    assert activate.json()["is_current"] is True

    listed = client.get(
        f"{settings.API_V1_STR}/academic-registry/academic-years",
        headers=superuser_token_headers,
    )
    assert listed.status_code == 200
    years = listed.json()["data"]
    current = [year for year in years if year["is_current"]]
    assert current == [new_year | {"is_current": True}]

    old_year = next(year for year in years if year["label"] == "2026-2027")
    assert old_year["is_current"] is False

    restore_current = client.post(
        f"{settings.API_V1_STR}/academic-registry/academic-years/{old_year['id']}/set-current",
        headers=superuser_token_headers,
    )
    assert restore_current.status_code == 200
    assert restore_current.json()["is_current"] is True


def test_academic_year_creation_rejects_invalid_range(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{settings.API_V1_STR}/academic-registry/academic-years",
        headers=superuser_token_headers,
        json={
            "label": "2028-2030",
            "start_year": 2028,
            "end_year": 2030,
        },
    )
    assert response.status_code == 422


def test_event_defaults_to_current_academic_year(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    years = client.get(
        f"{settings.API_V1_STR}/academic-registry/academic-years",
        headers=superuser_token_headers,
    )
    assert years.status_code == 200
    current = next(year for year in years.json()["data"] if year["is_current"])

    event = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": "Academic Year Foundation Test Event",
            "event_date": "2026-10-05",
            "status": "draft",
        },
    )
    assert event.status_code == 200
    assert event.json()["academic_year_id"] == current["id"]
