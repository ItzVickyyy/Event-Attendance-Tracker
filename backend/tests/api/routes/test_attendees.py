from fastapi.testclient import TestClient

from app.core.config import settings
from tests.utils.utils import random_email, random_lower_string


def test_attendee_and_credentials_and_relationships(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create person 1 (Student)
    p1_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "Alice",
            "last_name": "Student",
            "email": random_email(),
        },
    )
    p1_id = p1_res.json()["id"]

    # Create Student record
    student_num = f"2026-{random_lower_string()[:5].upper()}"
    student_res = client.post(
        f"{settings.API_V1_STR}/students/",
        headers=superuser_token_headers,
        json={"person_id": p1_id, "student_number": student_num},
    )
    student_id = student_res.json()["id"]

    # 2. Create person 2 (Guardian)
    p2_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "Bob",
            "last_name": "Guardian",
            "email": random_email(),
        },
    )
    p2_id = p2_res.json()["id"]

    # 3. Create Attendee for person 1
    att1_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=superuser_token_headers,
        json={"person_id": p1_id, "attendee_type": "student"},
    )
    assert att1_res.status_code == 200
    att1_id = att1_res.json()["id"]

    # 4. Create Attendee for person 2 (Guardian)
    att2_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=superuser_token_headers,
        json={"person_id": p2_id, "attendee_type": "parent_guardian"},
    )
    assert att2_res.status_code == 200
    att2_id = att2_res.json()["id"]

    # 5. Create Credential (NFC) for Attendee 1
    nfc_uid = f"NFC_{random_lower_string()[:8].upper()}"
    cred_res = client.post(
        f"{settings.API_V1_STR}/attendee-credentials/",
        headers=superuser_token_headers,
        json={
            "attendee_id": att1_id,
            "credential_type": "nfc",
            "credential_value": nfc_uid,
            "is_active": True,
        },
    )
    assert cred_res.status_code == 200
    cred_id = cred_res.json()["id"]

    # Lookup credential
    lookup_res = client.get(
        f"{settings.API_V1_STR}/attendee-credentials/lookup/{nfc_uid}",
        headers=superuser_token_headers,
    )
    assert lookup_res.status_code == 200
    assert lookup_res.json()["id"] == cred_id

    # 6. Create Relationship between Attendee 2 (Guardian) and Student 1
    rel_res = client.post(
        f"{settings.API_V1_STR}/attendee-relationships/",
        headers=superuser_token_headers,
        json={
            "attendee_id": att2_id,
            "related_student_id": student_id,
            "relationship_type": "guardian",
        },
    )
    assert rel_res.status_code == 200
    assert rel_res.json()["relationship_type"] == "guardian"
