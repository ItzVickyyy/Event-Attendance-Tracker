from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.config import settings
from tests.utils.utils import random_email, random_lower_string


def _api(path: str) -> str:
    return f"{settings.API_V1_STR}{path}"


def _person(client: TestClient, headers: dict[str, str], first_name: str = "Test") -> dict:
    response = client.post(
        _api("/people/"),
        headers=headers,
        json={
            "first_name": first_name,
            "last_name": random_lower_string()[:8],
            "email": random_email(),
        },
    )
    assert response.status_code == 200
    return response.json()


def _attendee(client: TestClient, headers: dict[str, str], attendee_type: str = "guest") -> dict:
    person = _person(client, headers)
    response = client.post(
        _api("/attendees/"),
        headers=headers,
        json={"person_id": person["id"], "attendee_type": attendee_type},
    )
    assert response.status_code == 200
    return response.json()


def _student(client: TestClient, headers: dict[str, str]) -> dict:
    person = _person(client, headers, "Student")
    response = client.post(
        _api("/students/"),
        headers=headers,
        json={
            "person_id": person["id"],
            "student_number": f"TEST-{random_lower_string()[:10].upper()}",
        },
    )
    assert response.status_code == 200
    return response.json()


def test_attendee_list_filters_crud_and_missing_records(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    attendee = _attendee(client, headers, "guest")
    person_id = attendee["person_id"]

    listing = client.get(
        _api("/attendees/?attendee_type=guest&search=Test"),
        headers=headers,
    )
    assert listing.status_code == 200
    assert any(row["id"] == attendee["id"] for row in listing.json()["data"])

    by_person = client.get(
        _api(f"/attendees/?person_id={person_id}&skip=0&limit=1"),
        headers=headers,
    )
    assert by_person.status_code == 200
    assert by_person.json()["count"] == 1

    detail = client.get(_api(f"/attendees/{attendee['id']}"), headers=headers)
    assert detail.status_code == 200

    missing = client.get(_api(f"/attendees/{uuid4()}"), headers=headers)
    assert missing.status_code == 404

    changed_person = _person(client, headers, "Changed")
    updated = client.patch(
        _api(f"/attendees/{attendee['id']}"),
        headers=headers,
        json={"person_id": changed_person["id"], "attendee_type": "student"},
    )
    assert updated.status_code == 200
    assert updated.json()["person_id"] == changed_person["id"]

    missing_update = client.patch(
        _api(f"/attendees/{uuid4()}"), headers=headers, json={"attendee_type": "guest"}
    )
    assert missing_update.status_code == 404

    deleted = client.delete(_api(f"/attendees/{attendee['id']}"), headers=headers)
    assert deleted.status_code == 200
    assert client.delete(_api(f"/attendees/{attendee['id']}"), headers=headers).status_code == 404


def test_attendee_creation_and_person_reassignment_reject_invalid_or_duplicate(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    person = _person(client, headers)
    payload = {"person_id": person["id"], "attendee_type": "guest"}
    created = client.post(_api("/attendees/"), headers=headers, json=payload)
    assert created.status_code == 200

    duplicate = client.post(_api("/attendees/"), headers=headers, json=payload)
    assert duplicate.status_code == 400

    unknown_person = client.post(
        _api("/attendees/"),
        headers=headers,
        json={"person_id": str(uuid4()), "attendee_type": "guest"},
    )
    assert unknown_person.status_code == 404

    other_person = _person(client, headers, "Other")
    other_attendee = client.post(
        _api("/attendees/"),
        headers=headers,
        json={"person_id": other_person["id"], "attendee_type": "guest"},
    ).json()
    conflict = client.patch(
        _api(f"/attendees/{created.json()['id']}"),
        headers=headers,
        json={"person_id": other_person["id"]},
    )
    assert conflict.status_code == 400

    invalid_person = client.patch(
        _api(f"/attendees/{created.json()['id']}"),
        headers=headers,
        json={"person_id": str(uuid4())},
    )
    assert invalid_person.status_code == 404
    assert other_attendee["id"]


def test_attendee_relationship_lifecycle_and_validation(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    attendee = _attendee(client, headers)
    student = _student(client, headers)
    payload = {
        "attendee_id": attendee["id"],
        "related_student_id": student["id"],
        "relationship_type": "guardian",
    }

    created = client.post(_api("/attendee-relationships/"), headers=headers, json=payload)
    assert created.status_code == 200
    relationship_id = created.json()["id"]

    listing = client.get(
        _api(f"/attendee-relationships/?attendee_id={attendee['id']}&related_student_id={student['id']}"),
        headers=headers,
    )
    assert listing.status_code == 200
    assert listing.json()["count"] == 1

    duplicate = client.post(_api("/attendee-relationships/"), headers=headers, json=payload)
    assert duplicate.status_code == 400

    detail = client.get(_api(f"/attendee-relationships/{relationship_id}"), headers=headers)
    assert detail.status_code == 200

    other_attendee = _attendee(client, headers)
    other_student = _student(client, headers)
    updated = client.patch(
        _api(f"/attendee-relationships/{relationship_id}"),
        headers=headers,
        json={"attendee_id": other_attendee["id"], "related_student_id": other_student["id"]},
    )
    assert updated.status_code == 200

    assert client.get(_api(f"/attendee-relationships/{uuid4()}"), headers=headers).status_code == 404
    assert client.patch(
        _api(f"/attendee-relationships/{relationship_id}"),
        headers=headers,
        json={"attendee_id": str(uuid4())},
    ).status_code == 404
    assert client.patch(
        _api(f"/attendee-relationships/{relationship_id}"),
        headers=headers,
        json={"related_student_id": str(uuid4())},
    ).status_code == 404
    assert client.delete(_api(f"/attendee-relationships/{relationship_id}"), headers=headers).status_code == 200
    assert client.delete(_api(f"/attendee-relationships/{relationship_id}"), headers=headers).status_code == 404


def test_attendee_relationship_create_requires_existing_attendee_and_student(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    student = _student(client, headers)
    assert client.post(
        _api("/attendee-relationships/"),
        headers=headers,
        json={
            "attendee_id": str(uuid4()),
            "related_student_id": student["id"],
            "relationship_type": "guardian",
        },
    ).status_code == 404

    attendee = _attendee(client, headers)
    assert client.post(
        _api("/attendee-relationships/"),
        headers=headers,
        json={
            "attendee_id": attendee["id"],
            "related_student_id": str(uuid4()),
            "relationship_type": "guardian",
        },
    ).status_code == 404


def test_attendee_credential_management_and_public_lookup(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    attendee = _attendee(client, headers)
    value = f"TEST-{random_lower_string()[:12].upper()}"
    payload = {
        "attendee_id": attendee["id"],
        "credential_type": "nfc",
        "credential_value": value,
        "is_active": True,
    }
    created = client.post(_api("/attendee-credentials/"), headers=headers, json=payload)
    assert created.status_code == 200
    credential_id = created.json()["id"]

    duplicate = client.post(_api("/attendee-credentials/"), headers=headers, json=payload)
    assert duplicate.status_code == 400

    listing = client.get(
        _api(f"/attendee-credentials/?attendee_id={attendee['id']}&credential_type=nfc&is_active=true"),
        headers=headers,
    )
    assert listing.status_code == 200
    assert listing.json()["count"] == 1

    public = client.get(_api(f"/attendee-credentials/public/{value}"), headers=headers)
    assert public.status_code == 200
    assert public.json()["attendee_id"] == attendee["id"]

    changed_value = f"TEST-{random_lower_string()[:12].upper()}"
    updated = client.patch(
        _api(f"/attendee-credentials/{credential_id}"),
        headers=headers,
        json={"credential_value": changed_value, "is_active": False},
    )
    assert updated.status_code == 200
    assert client.get(_api(f"/attendee-credentials/public/{changed_value}"), headers=headers).status_code == 404

    assert client.get(_api(f"/attendee-credentials/{credential_id}"), headers=headers).status_code == 200
    assert client.get(_api(f"/attendee-credentials/{uuid4()}"), headers=headers).status_code == 404
    assert client.patch(
        _api(f"/attendee-credentials/{uuid4()}"), headers=headers, json={"is_active": True}
    ).status_code == 404
    assert client.delete(_api(f"/attendee-credentials/{credential_id}"), headers=headers).status_code == 200
    assert client.delete(_api(f"/attendee-credentials/{credential_id}"), headers=headers).status_code == 404


def test_credential_creation_and_update_reject_missing_or_duplicate_values(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    first = _attendee(client, headers)
    second = _attendee(client, headers)
    value = f"UNIQUE-{random_lower_string()[:10].upper()}"
    one = client.post(
        _api("/attendee-credentials/"),
        headers=headers,
        json={"attendee_id": first["id"], "credential_type": "nfc", "credential_value": value},
    )
    assert one.status_code == 200

    duplicate = client.patch(
        _api(f"/attendee-credentials/{one.json()['id']}"),
        headers=headers,
        json={"credential_value": value},
    )
    assert duplicate.status_code == 200

    other = client.post(
        _api("/attendee-credentials/"),
        headers=headers,
        json={
            "attendee_id": second["id"],
            "credential_type": "nfc",
            "credential_value": f"OTHER-{random_lower_string()[:10].upper()}",
        },
    )
    assert other.status_code == 200

    conflict = client.patch(
        _api(f"/attendee-credentials/{other.json()['id']}"),
        headers=headers,
        json={"credential_value": value},
    )
    assert conflict.status_code == 400

    assert client.post(
        _api("/attendee-credentials/"),
        headers=headers,
        json={
            "attendee_id": str(uuid4()),
            "credential_type": "nfc",
            "credential_value": f"MISSING-{random_lower_string()[:10].upper()}",
        },
    ).status_code == 404

    assert client.patch(
        _api(f"/attendee-credentials/{other.json()['id']}"),
        headers=headers,
        json={"attendee_id": str(uuid4())},
    ).status_code == 404
