from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.config import settings
from tests.utils.utils import random_lower_string


def _api(path: str) -> str:
    return f"{settings.API_V1_STR}{path}"


def _program_payload() -> dict[str, str]:
    suffix = random_lower_string()[:10].upper()
    return {
        "program_code": f"TMP-{suffix}",
        "program_name": f"Temporary Program {suffix}",
    }


def test_academic_program_crud_search_and_missing_records(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    payload = _program_payload()
    created = client.post(_api("/academic-programs/"), headers=headers, json=payload)
    assert created.status_code == 200
    program_id = created.json()["id"]

    listing = client.get(
        _api(f"/academic-programs/?search={payload['program_code']}"),
        headers=headers,
    )
    assert listing.status_code == 200
    assert listing.json()["count"] == 1
    assert listing.json()["data"][0]["id"] == program_id

    detail = client.get(_api(f"/academic-programs/{program_id}"), headers=headers)
    assert detail.status_code == 200

    changed = client.patch(
        _api(f"/academic-programs/{program_id}"),
        headers=headers,
        json={"program_name": "Updated Temporary Program"},
    )
    assert changed.status_code == 200
    assert changed.json()["program_name"] == "Updated Temporary Program"

    missing_id = str(uuid4())
    assert (
        client.get(
            _api(f"/academic-programs/{missing_id}"), headers=headers
        ).status_code
        == 404
    )
    assert (
        client.patch(
            _api(f"/academic-programs/{missing_id}"),
            headers=headers,
            json={"program_name": "Missing"},
        ).status_code
        == 404
    )
    assert (
        client.delete(
            _api(f"/academic-programs/{missing_id}"), headers=headers
        ).status_code
        == 404
    )

    deleted = client.delete(_api(f"/academic-programs/{program_id}"), headers=headers)
    assert deleted.status_code == 200
    assert deleted.json()["message"] == "Academic program deleted successfully"


def test_academic_program_rejects_duplicate_codes_on_create_and_update(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    first_payload = _program_payload()
    first = client.post(
        _api("/academic-programs/"), headers=headers, json=first_payload
    )
    assert first.status_code == 200

    duplicate = client.post(
        _api("/academic-programs/"), headers=headers, json=first_payload
    )
    assert duplicate.status_code == 400

    second_payload = _program_payload()
    second = client.post(
        _api("/academic-programs/"), headers=headers, json=second_payload
    )
    assert second.status_code == 200

    conflict = client.patch(
        _api(f"/academic-programs/{second.json()['id']}"),
        headers=headers,
        json={"program_code": first_payload["program_code"]},
    )
    assert conflict.status_code == 400

    same_code = client.patch(
        _api(f"/academic-programs/{first.json()['id']}"),
        headers=headers,
        json={"program_code": first_payload["program_code"]},
    )
    assert same_code.status_code == 200
