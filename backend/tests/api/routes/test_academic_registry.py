from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.config import settings
from tests.utils.utils import random_email, random_lower_string


def _api(path: str) -> str:
    return f"{settings.API_V1_STR}{path}"


def _current_year_and_program(
    client: TestClient, headers: dict[str, str]
) -> tuple[dict, dict]:
    years = client.get(_api("/academic-registry/academic-years"), headers=headers)
    assert years.status_code == 200
    year = next(year for year in years.json()["data"] if year["is_current"])
    sections = client.get(_api("/academic-registry/sections"), headers=headers)
    assert sections.status_code == 200
    section = next(
        section
        for section in sections.json()["data"]
        if section["program_code"] == "BSIT"
        and section["academic_year_id"] == year["id"]
    )
    return year, section


def test_academic_registry_student_and_enrollment_lifecycle(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    year, existing_section = _current_year_and_program(client, headers)
    student_number = f"REG-{random_lower_string()[:10].upper()}"

    created = client.post(
        _api("/academic-registry/students"),
        headers=headers,
        json={
            "student_number": student_number,
            "first_name": "Casey",
            "middle_name": "R",
            "last_name": "Learner",
            "email": random_email(),
            "section_id": existing_section["id"],
            "academic_year_id": year["id"],
            "student_status": "regular",
        },
    )
    assert created.status_code == 200
    student = created.json()
    assert student["student_number"] == student_number
    assert student["qr_registered"] is True

    details = client.get(
        _api(f"/academic-registry/students/{student['id']}"), headers=headers
    )
    assert details.status_code == 200
    assert details.json()["first_name"] == "Casey"

    roster = client.get(
        _api(f"/academic-registry/sections/{existing_section['id']}/students"),
        headers=headers,
    )
    assert roster.status_code == 200
    assert any(row["id"] == student["id"] for row in roster.json()["data"])

    updated = client.patch(
        _api(f"/academic-registry/students/{student['id']}"),
        headers=headers,
        json={
            "first_name": "Casey Updated",
            "student_number": f"{student_number}-U",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["first_name"] == "Casey Updated"
    assert updated.json()["student_number"] == f"{student_number}-U"

    duplicate_number = client.post(
        _api("/academic-registry/students"),
        headers=headers,
        json={
            "student_number": f"{student_number}-U",
            "first_name": "Duplicate",
            "last_name": "Student",
            "section_id": existing_section["id"],
            "academic_year_id": year["id"],
        },
    )
    assert duplicate_number.status_code == 409

    start_year = 2100 + uuid4().int % 800
    next_year = client.post(
        _api("/academic-registry/academic-years"),
        headers=headers,
        json={
            "label": f"{start_year}-{start_year + 1}",
            "start_year": start_year,
            "end_year": start_year + 1,
        },
    )
    assert next_year.status_code == 200

    section_code = f"Z{random_lower_string()[:6].upper()}"
    new_section = client.post(
        _api("/academic-registry/sections"),
        headers=headers,
        json={
            "program_id": existing_section["program_id"],
            "academic_year_id": next_year.json()["id"],
            "year_level": "1st Year",
            "section_code": section_code,
        },
    )
    assert new_section.status_code == 200
    assert new_section.json()["section_code"] == section_code

    enrollment_payload = {
        "student_id": student["id"],
        "section_id": new_section.json()["id"],
        "academic_year_id": next_year.json()["id"],
        "student_status": "irregular",
    }
    enrollment = client.post(
        _api("/academic-registry/enrollments"),
        headers=headers,
        json=enrollment_payload,
    )
    assert enrollment.status_code == 200

    duplicate_enrollment = client.post(
        _api("/academic-registry/enrollments"),
        headers=headers,
        json=enrollment_payload,
    )
    assert duplicate_enrollment.status_code == 409

    enrollment_id = enrollment.json()["id"]
    changed_enrollment = client.patch(
        _api(f"/academic-registry/enrollments/{enrollment_id}"),
        headers=headers,
        json={"student_status": "regular"},
    )
    assert changed_enrollment.status_code == 200
    assert changed_enrollment.json()["student_status"] == "regular"

    changed_section = client.patch(
        _api(f"/academic-registry/sections/{new_section.json()['id']}"),
        headers=headers,
        json={"section_code": f"{section_code}-B"},
    )
    assert changed_section.status_code == 200
    assert changed_section.json()["section_code"] == f"{section_code}-B"


def test_academic_registry_rejects_invalid_student_and_section_payloads(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    year, existing_section = _current_year_and_program(client, headers)

    missing_student_fields = client.post(
        _api("/academic-registry/students"),
        headers=headers,
        json={"student_number": "MISSING-FIELDS"},
    )
    assert missing_student_fields.status_code == 422

    invalid_status = client.post(
        _api("/academic-registry/students"),
        headers=headers,
        json={
            "student_number": f"BAD-{random_lower_string()[:10].upper()}",
            "first_name": "Invalid",
            "last_name": "Status",
            "section_id": existing_section["id"],
            "academic_year_id": year["id"],
            "student_status": "not-a-status",
        },
    )
    assert invalid_status.status_code == 422

    missing_section_fields = client.post(
        _api("/academic-registry/sections"),
        headers=headers,
        json={"section_code": "MISSING"},
    )
    assert missing_section_fields.status_code == 422

    invalid_major = client.post(
        _api("/academic-registry/sections"),
        headers=headers,
        json={
            "program_id": existing_section["program_id"],
            "academic_year_id": year["id"],
            "year_level": "3rd Year",
            "section_code": f"X{random_lower_string()[:5].upper()}",
        },
    )
    assert invalid_major.status_code == 400

    unknown_section = client.patch(
        _api(f"/academic-registry/sections/{uuid4()}"),
        headers=headers,
        json={"section_code": "X"},
    )
    assert unknown_section.status_code == 404

    unknown_student = client.get(
        _api(f"/academic-registry/students/{uuid4()}"), headers=headers
    )
    assert unknown_student.status_code == 404


def test_academic_year_validation_and_set_current_lifecycle(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    start_year = 2200 + uuid4().int % 500
    invalid_end = client.post(
        _api("/academic-registry/academic-years"),
        headers=headers,
        json={
            "label": f"{start_year}-{start_year + 2}",
            "start_year": start_year,
            "end_year": start_year + 2,
        },
    )
    assert invalid_end.status_code == 422

    invalid_label = client.post(
        _api("/academic-registry/academic-years"),
        headers=headers,
        json={
            "label": f"{start_year + 1}-{start_year + 2}",
            "start_year": start_year,
            "end_year": start_year + 1,
        },
    )
    assert invalid_label.status_code == 422

    current_year, _ = _current_year_and_program(client, headers)
    created = client.post(
        _api("/academic-registry/academic-years"),
        headers=headers,
        json={
            "label": f"{start_year}-{start_year + 1}",
            "start_year": start_year,
            "end_year": start_year + 1,
        },
    )
    assert created.status_code == 200
    next_id = created.json()["id"]

    duplicate = client.post(
        _api("/academic-registry/academic-years"),
        headers=headers,
        json={
            "label": f"{start_year}-{start_year + 1}",
            "start_year": start_year,
            "end_year": start_year + 1,
        },
    )
    assert duplicate.status_code == 409

    set_current = client.post(
        _api(f"/academic-registry/academic-years/{next_id}/set-current"),
        headers=headers,
    )
    assert set_current.status_code == 200
    assert set_current.json()["is_current"] is True
    years = client.get(_api("/academic-registry/academic-years"), headers=headers)
    assert years.status_code == 200
    assert sum(1 for year in years.json()["data"] if year["is_current"]) == 1
    assert (
        client.post(
            _api(f"/academic-registry/academic-years/{uuid4()}/set-current"),
            headers=headers,
        ).status_code
        == 404
    )
    assert current_year["id"] != next_id


def test_academic_registry_student_update_duplicate_and_enrollment_validation(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    year, section = _current_year_and_program(client, headers)
    first_number = f"UPD-{random_lower_string()[:10].upper()}"
    second_number = f"UPD-{random_lower_string()[:10].upper()}"

    def create_student(number: str, first_name: str) -> dict:
        response = client.post(
            _api("/academic-registry/students"),
            headers=headers,
            json={
                "student_number": number,
                "first_name": first_name,
                "last_name": "Validation",
                "section_id": section["id"],
                "academic_year_id": year["id"],
            },
        )
        assert response.status_code == 200
        return response.json()

    first = create_student(first_number, "First")
    second = create_student(second_number, "Second")

    duplicate_number = client.patch(
        _api(f"/academic-registry/students/{first['id']}"),
        headers=headers,
        json={"student_number": second_number},
    )
    assert duplicate_number.status_code == 409

    updated = client.patch(
        _api(f"/academic-registry/students/{first['id']}"),
        headers=headers,
        json={
            "middle_name": "M",
            "email": random_email(),
            "contact_number": "09170000000",
            "student_status": "irregular",
            "enrollment_id": first["enrollment_id"],
        },
    )
    assert updated.status_code == 200
    assert updated.json()["middle_name"] == "M"

    assert (
        client.patch(
            _api(f"/academic-registry/students/{uuid4()}"),
            headers=headers,
            json={"first_name": "Missing"},
        ).status_code
        == 404
    )
    assert (
        client.patch(
            _api(f"/academic-registry/enrollments/{uuid4()}"),
            headers=headers,
            json={"student_status": "regular"},
        ).status_code
        == 404
    )

    bad_section = client.patch(
        _api(f"/academic-registry/enrollments/{first['enrollment_id']}"),
        headers=headers,
        json={"section_id": str(uuid4())},
    )
    assert bad_section.status_code == 404
    assert second["id"] != first["id"]
