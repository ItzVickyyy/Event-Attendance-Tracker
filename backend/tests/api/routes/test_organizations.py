from fastapi.testclient import TestClient

from app.core.config import settings
from tests.utils.utils import random_lower_string


def test_create_organization(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    name = f"Org_{random_lower_string()[:8]}"
    data = {"name": name, "description": "Test Organization"}
    response = client.post(
        f"{settings.API_V1_STR}/organizations/",
        headers=superuser_token_headers,
        json=data,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["name"] == name
    assert content["description"] == "Test Organization"
    assert "id" in content


def test_read_organizations(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{settings.API_V1_STR}/organizations/",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    content = response.json()
    assert "data" in content
    assert "count" in content


def test_read_organization_by_id(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    name = f"Org_{random_lower_string()[:8]}"
    r = client.post(
        f"{settings.API_V1_STR}/organizations/",
        headers=superuser_token_headers,
        json={"name": name, "description": "Desc"},
    )
    org_id = r.json()["id"]

    response = client.get(
        f"{settings.API_V1_STR}/organizations/{org_id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["id"] == org_id
    assert content["name"] == name


def test_update_organization(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    name = f"Org_{random_lower_string()[:8]}"
    r = client.post(
        f"{settings.API_V1_STR}/organizations/",
        headers=superuser_token_headers,
        json={"name": name, "description": "Desc"},
    )
    org_id = r.json()["id"]

    updated_name = f"Updated_{random_lower_string()[:8]}"
    response = client.patch(
        f"{settings.API_V1_STR}/organizations/{org_id}",
        headers=superuser_token_headers,
        json={"name": updated_name},
    )
    assert response.status_code == 200
    content = response.json()
    assert content["name"] == updated_name


def test_delete_organization(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    name = f"Org_{random_lower_string()[:8]}"
    r = client.post(
        f"{settings.API_V1_STR}/organizations/",
        headers=superuser_token_headers,
        json={"name": name, "description": "Desc"},
    )
    org_id = r.json()["id"]

    response = client.delete(
        f"{settings.API_V1_STR}/organizations/{org_id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    assert response.json() == {"message": "Organization deleted successfully"}

    get_res = client.get(
        f"{settings.API_V1_STR}/organizations/{org_id}",
        headers=superuser_token_headers,
    )
    assert get_res.status_code == 404
