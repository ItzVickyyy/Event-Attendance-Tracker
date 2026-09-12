from fastapi.testclient import TestClient

from app.core.config import settings
from tests.utils.utils import random_email, random_lower_string


def test_student_lifecycle(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create person
    p_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "StudentFirst",
            "last_name": "StudentLast",
            "email": random_email(),
        },
    )
    person_id = p_res.json()["id"]

    # 2. Create academic program & section
    code = f"BSIT_{random_lower_string()[:6].upper()}"
    prog_res = client.post(
        f"{settings.API_V1_STR}/academic-programs/",
        headers=superuser_token_headers,
        json={"program_code": code, "program_name": "IT"},
    )
    program_id = prog_res.json()["id"]

    sec_res = client.post(
        f"{settings.API_V1_STR}/academic-sections/",
        headers=superuser_token_headers,
        json={
            "program_id": program_id,
            "year_level": "1",
            "section_name": "1A",
            "academic_year": "2026-2027",
        },
    )
    section_id = sec_res.json()["id"]

    # 3. Create student
    student_num = f"2026-{random_lower_string()[:5].upper()}"
    student_res = client.post(
        f"{settings.API_V1_STR}/students/",
        headers=superuser_token_headers,
        json={
            "person_id": person_id,
            "student_number": student_num,
            "section_id": section_id,
        },
    )
    assert student_res.status_code == 200
    student_id = student_res.json()["id"]
    assert student_res.json()["student_number"] == student_num

    # 4. Search student
    search_res = client.get(
        f"{settings.API_V1_STR}/students/?search={student_num}",
        headers=superuser_token_headers,
    )
    assert search_res.status_code == 200
    assert search_res.json()["count"] == 1

    # 5. Read by ID
    get_res = client.get(
        f"{settings.API_V1_STR}/students/{student_id}",
        headers=superuser_token_headers,
    )
    assert get_res.status_code == 200

    # 6. Update student
    new_num = f"2026-{random_lower_string()[:5].upper()}"
    patch_res = client.patch(
        f"{settings.API_V1_STR}/students/{student_id}",
        headers=superuser_token_headers,
        json={"student_number": new_num},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["student_number"] == new_num

    # 7. Delete student
    del_res = client.delete(
        f"{settings.API_V1_STR}/students/{student_id}",
        headers=superuser_token_headers,
    )
    assert del_res.status_code == 200
