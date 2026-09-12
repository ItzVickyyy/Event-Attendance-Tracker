from fastapi.testclient import TestClient

from app.core.config import settings
from tests.utils.utils import random_email, random_lower_string


def test_person_crud(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    first_name = f"Jane_{random_lower_string()[:5]}"
    last_name = f"Doe_{random_lower_string()[:5]}"
    email = random_email()

    # Create
    create_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "contact_number": "09123456789",
        },
    )
    assert create_res.status_code == 200
    person_id = create_res.json()["id"]

    # Read All / Search
    search_res = client.get(
        f"{settings.API_V1_STR}/people/?search={first_name}",
        headers=superuser_token_headers,
    )
    assert search_res.status_code == 200
    assert search_res.json()["count"] >= 1

    # Read One
    get_res = client.get(
        f"{settings.API_V1_STR}/people/{person_id}",
        headers=superuser_token_headers,
    )
    assert get_res.status_code == 200
    assert get_res.json()["first_name"] == first_name

    # Update
    update_res = client.patch(
        f"{settings.API_V1_STR}/people/{person_id}",
        headers=superuser_token_headers,
        json={"first_name": "UpdatedName"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["first_name"] == "UpdatedName"

    # Delete
    del_res = client.delete(
        f"{settings.API_V1_STR}/people/{person_id}",
        headers=superuser_token_headers,
    )
    assert del_res.status_code == 200
