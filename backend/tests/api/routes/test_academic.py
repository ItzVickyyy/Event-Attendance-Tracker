from fastapi.testclient import TestClient

from app.core.config import settings
from tests.utils.utils import random_lower_string


def test_create_and_read_academic_program(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    code = f"BSIT_{random_lower_string()[:6].upper()}"
    data = {"program_code": code, "program_name": "Information Technology"}
    r = client.post(
        f"{settings.API_V1_STR}/academic-programs/",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 200
    content = r.json()
    assert content["program_code"] == code
    program_id = content["id"]

    get_all = client.get(
        f"{settings.API_V1_STR}/academic-programs/",
        headers=superuser_token_headers,
    )
    assert get_all.status_code == 200
    assert get_all.json()["count"] >= 1

    get_one = client.get(
        f"{settings.API_V1_STR}/academic-programs/{program_id}",
        headers=superuser_token_headers,
    )
    assert get_one.status_code == 200
    assert get_one.json()["id"] == program_id


def test_academic_section_lifecycle(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    code = f"BSCS_{random_lower_string()[:6].upper()}"
    p_res = client.post(
        f"{settings.API_V1_STR}/academic-programs/",
        headers=superuser_token_headers,
        json={"program_code": code, "program_name": "Computer Science"},
    )
    program_id = p_res.json()["id"]

    section_data = {
        "program_id": program_id,
        "year_level": "3",
        "section_name": "CS-3A",
        "academic_year": "2026-2027",
    }
    s_res = client.post(
        f"{settings.API_V1_STR}/academic-sections/",
        headers=superuser_token_headers,
        json=section_data,
    )
    assert s_res.status_code == 200
    section_id = s_res.json()["id"]
    assert s_res.json()["section_name"] == "CS-3A"

    filter_res = client.get(
        f"{settings.API_V1_STR}/academic-sections/?program_id={program_id}&year_level=3",
        headers=superuser_token_headers,
    )
    assert filter_res.status_code == 200
    assert len(filter_res.json()["data"]) == 1

    update_res = client.patch(
        f"{settings.API_V1_STR}/academic-sections/{section_id}",
        headers=superuser_token_headers,
        json={"section_name": "CS-3B"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["section_name"] == "CS-3B"

    del_res = client.delete(
        f"{settings.API_V1_STR}/academic-sections/{section_id}",
        headers=superuser_token_headers,
    )
    assert del_res.status_code == 200


def test_academic_section_roster_exports(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    code = f"BSIT_{random_lower_string()[:6].upper()}"
    program = client.post(
        f"{settings.API_V1_STR}/academic-programs/",
        headers=superuser_token_headers,
        json={"program_code": code, "program_name": "Information Technology"},
    )
    assert program.status_code == 200

    section = client.post(
        f"{settings.API_V1_STR}/academic-sections/",
        headers=superuser_token_headers,
        json={
            "program_id": program.json()["id"],
            "year_level": "3",
            "section_name": "WMAD 3A",
            "academic_year": "2026-2027",
        },
    )
    assert section.status_code == 200
    section_id = section.json()["id"]

    xlsx = client.get(
        f"{settings.API_V1_STR}/academic-sections/{section_id}/export/xlsx",
        headers=superuser_token_headers,
    )
    assert xlsx.status_code == 200
    assert xlsx.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert xlsx.content[:2] == b"PK"

    docx = client.get(
        f"{settings.API_V1_STR}/academic-sections/{section_id}/export/docx",
        headers=superuser_token_headers,
    )
    assert docx.status_code == 200
    assert docx.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert docx.content[:2] == b"PK"
