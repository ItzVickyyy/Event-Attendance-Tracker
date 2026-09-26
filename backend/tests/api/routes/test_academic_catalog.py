from fastapi.testclient import TestClient

from app.core.config import settings


def test_seeded_2026_2027_academic_catalog(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    majors = client.get(
        f"{settings.API_V1_STR}/academic-catalog/majors",
        headers=superuser_token_headers,
    )
    assert majors.status_code == 200
    codes = {item["code"] for item in majors.json()["data"]}
    assert {"AMG", "SMP", "WMAD", "IS"}.issubset(codes)

    sections = client.get(
        f"{settings.API_V1_STR}/academic-sections/?academic_year=2026-2027",
        headers=superuser_token_headers,
    )
    assert sections.status_code == 200
    names = {item["section_name"] for item in sections.json()["data"]}
    assert {"BSCS" not in names, "WMAD 3A" in names, "WMAD 4B" in names} == {
        True,
        True,
    }


def test_section_major_assignment(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    programs = client.get(
        f"{settings.API_V1_STR}/academic-programs/",
        headers=superuser_token_headers,
    )
    assert programs.status_code == 200
    bsit = next(item for item in programs.json()["data"] if item["program_code"] == "BSIT")

    sections = client.get(
        f"{settings.API_V1_STR}/academic-sections/?program_id={bsit['id']}&academic_year=2026-2027",
        headers=superuser_token_headers,
    )
    section = next(item for item in sections.json()["data"] if item["section_name"] == "WMAD 3A")

    majors = client.get(
        f"{settings.API_V1_STR}/academic-catalog/majors?program_id={bsit['id']}",
        headers=superuser_token_headers,
    )
    wmad = next(item for item in majors.json()["data"] if item["code"] == "WMAD")

    assignment = client.put(
        f"{settings.API_V1_STR}/academic-catalog/sections/{section['id']}/major",
        headers=superuser_token_headers,
        json={"section_id": section["id"], "major_id": wmad["id"]},
    )
    assert assignment.status_code == 200
    assert assignment.json()["major"]["code"] == "WMAD"

    read_back = client.get(
        f"{settings.API_V1_STR}/academic-catalog/sections/{section['id']}/major",
        headers=superuser_token_headers,
    )
    assert read_back.status_code == 200
    assert read_back.json()["major"]["code"] == "WMAD"
