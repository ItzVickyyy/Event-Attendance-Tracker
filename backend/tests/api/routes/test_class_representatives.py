from types import SimpleNamespace
from uuid import uuid4

from fastapi.testclient import TestClient

import app.api.routes.class_representatives as class_representatives_routes
from app.api.routes.class_representatives import (
    TEMPORARY_PASSWORD,
    _generate_temporary_password,
)
from app.core.config import settings
from tests.utils.utils import random_email, random_lower_string


def _api(path: str) -> str:
    return f"{settings.API_V1_STR}{path}"


def _create_representative(
    client: TestClient, headers: dict[str, str]
) -> tuple[dict, dict, str]:
    years = client.get(_api("/academic-registry/academic-years"), headers=headers)
    assert years.status_code == 200
    year = next(year for year in years.json()["data"] if year["label"] == "2026-2027")

    sections = client.get(_api("/academic-registry/sections"), headers=headers)
    assert sections.status_code == 200
    section = next(
        section
        for section in sections.json()["data"]
        if section["program_code"] == "BSIT"
        and section["section_name"] == "WMAD 3A"
        and section["academic_year_id"] == year["id"]
    )
    email = random_email()
    response = client.post(
        _api("/class-representatives/"),
        headers=headers,
        json={
            "email": email,
            "first_name": "Taylor",
            "middle_initial": "M",
            "last_name": "Student",
            "extension": "Jr.",
            "academic_year_id": year["id"],
            "section_id": section["id"],
        },
    )
    assert response.status_code == 200
    return response.json(), year, section["id"]


def _representative_headers(client: TestClient, email: str) -> dict[str, str]:
    response = client.post(
        _api("/login/access-token"),
        data={"username": email, "password": TEMPORARY_PASSWORD},
    )
    assert response.status_code == 200
    headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
    changed = client.patch(
        _api("/users/me/password"),
        headers=headers,
        json={
            "current_password": TEMPORARY_PASSWORD,
            "new_password": "ChangedPassword123!",
        },
    )
    assert changed.status_code == 200
    return headers


def test_temporary_password_blocks_api_until_changed(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    representative, _, _ = _create_representative(client, superuser_token_headers)
    login = client.post(
        _api("/login/access-token"),
        data={
            "username": representative["email"],
            "password": TEMPORARY_PASSWORD,
        },
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    blocked = client.get(_api("/class-representatives/me"), headers=headers)
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "password_change_required"

    changed = client.patch(
        _api("/users/me/password"),
        headers=headers,
        json={
            "current_password": TEMPORARY_PASSWORD,
            "new_password": "ChangedPassword123!",
        },
    )
    assert changed.status_code == 200

    allowed = client.get(_api("/class-representatives/me"), headers=headers)
    assert allowed.status_code == 200


def test_super_admin_can_manage_class_representative_assignment_and_students(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    representative, year, section_id = _create_representative(
        client, superuser_token_headers
    )
    assert representative["role"] == "class_representative"
    assert representative["must_change_password"] is True
    assert representative["full_name"] == "Taylor M. Student Jr."

    listing = client.get(
        _api("/class-representatives/"), headers=superuser_token_headers
    )
    assert listing.status_code == 200
    assert any(row["id"] == representative["id"] for row in listing.json()["data"])

    headers = _representative_headers(client, representative["email"])
    assignment = client.get(_api("/class-representatives/me"), headers=headers)
    assert assignment.status_code == 200
    assert assignment.json()["academic_year_id"] == year["id"]
    assert assignment.json()["section_id"] == section_id
    assert assignment.json()["student_count"] == 0

    students = client.get(_api("/class-representatives/me/students"), headers=headers)
    assert students.status_code == 200
    assert students.json()["count"] == 0

    payload = {
        "student_number": f"CR-{random_lower_string()[:10].upper()}",
        "first_name": "Jamie",
        "middle_name": "Q",
        "last_name": "Learner",
        "extension": "III",
        "email": random_email(),
        "contact_number": "09171234567",
    }
    created = client.post(
        _api("/class-representatives/me/students"), headers=headers, json=payload
    )
    assert created.status_code == 200
    assert created.json()["message"] == "Student added successfully"

    students = client.get(_api("/class-representatives/me/students"), headers=headers)
    assert students.status_code == 200
    assert students.json()["count"] == 1
    assert students.json()["data"][0]["student_number"] == payload["student_number"]

    duplicate = client.post(
        _api("/class-representatives/me/students"), headers=headers, json=payload
    )
    assert duplicate.status_code == 409


def test_class_representative_routes_reject_wrong_roles_and_missing_assignment(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    assignment = client.get(
        _api("/class-representatives/me"), headers=superuser_token_headers
    )
    assert assignment.status_code == 403

    students = client.get(
        _api("/class-representatives/me/students"), headers=superuser_token_headers
    )
    assert students.status_code == 403

    create_student = client.post(
        _api("/class-representatives/me/students"),
        headers=superuser_token_headers,
        json={
            "student_number": "SHOULD-BE-BLOCKED",
            "first_name": "Not",
            "last_name": "Allowed",
        },
    )
    assert create_student.status_code == 403


def test_class_representative_creation_rejects_duplicate_email(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    representative, year, section_id = _create_representative(
        client, superuser_token_headers
    )
    duplicate = client.post(
        _api("/class-representatives/"),
        headers=superuser_token_headers,
        json={
            "email": representative["email"],
            "first_name": "Other",
            "last_name": "Person",
            "academic_year_id": year["id"],
            "section_id": section_id,
        },
    )
    assert duplicate.status_code == 409


def test_class_representative_creation_rejects_unknown_academic_records(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        _api("/class-representatives/"),
        headers=superuser_token_headers,
        json={
            "email": random_email(),
            "first_name": "Taylor",
            "last_name": "Student",
            "academic_year_id": str(uuid4()),
            "section_id": str(uuid4()),
        },
    )
    assert response.status_code == 404


def test_class_representative_rejects_year_mismatch_and_scoped_lookup(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    representative, year, section_id = _create_representative(client, headers)
    existing_years = client.get(
        _api("/academic-registry/academic-years"), headers=headers
    )
    assert existing_years.status_code == 200
    # Pick a year beyond every existing row so this remains deterministic even
    # when the test database retains data created by earlier tests.
    start_year = max(year["end_year"] for year in existing_years.json()["data"]) + 1
    other_year = client.post(
        _api("/academic-registry/academic-years"),
        headers=headers,
        json={
            "label": f"{start_year}-{start_year + 1}",
            "start_year": start_year,
            "end_year": start_year + 1,
        },
    )
    assert other_year.status_code == 200

    mismatch = client.post(
        _api("/class-representatives/"),
        headers=headers,
        json={
            "email": random_email(),
            "first_name": "Wrong",
            "last_name": "Year",
            "academic_year_id": other_year.json()["id"],
            "section_id": section_id,
        },
    )
    assert mismatch.status_code == 400

    rep_headers = _representative_headers(client, representative["email"])
    wrong_year = client.get(
        _api(f"/class-representatives/me?academic_year_id={other_year.json()['id']}"),
        headers=rep_headers,
    )
    assert wrong_year.status_code == 404

    missing_fields = client.post(
        _api("/class-representatives/me/students"),
        headers=rep_headers,
        json={"first_name": "Missing"},
    )
    assert missing_fields.status_code == 422
    assert year["id"] != other_year.json()["id"]


def test_class_representative_creation_rolls_back_when_email_fails(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    monkeypatch,
) -> None:
    years = client.get(
        _api("/academic-registry/academic-years"), headers=superuser_token_headers
    )
    year = next(year for year in years.json()["data"] if year["label"] == "2026-2027")
    sections = client.get(
        _api("/academic-registry/sections"), headers=superuser_token_headers
    )
    section = next(
        section
        for section in sections.json()["data"]
        if section["program_code"] == "BSIT"
        and section["section_name"] == "WMAD 3A"
        and section["academic_year_id"] == year["id"]
    )
    email = random_email()
    monkeypatch.setattr(
        class_representatives_routes,
        "settings",
        SimpleNamespace(emails_enabled=True, FASTAPI_ENV="test"),
    )

    def fail_send_email(**_kwargs) -> None:
        raise RuntimeError("simulated SMTP failure")

    monkeypatch.setattr(class_representatives_routes, "send_email", fail_send_email)
    response = client.post(
        _api("/class-representatives/"),
        headers=superuser_token_headers,
        json={
            "email": email,
            "first_name": "Taylor",
            "middle_initial": "M",
            "last_name": "Student",
            "extension": "Jr.",
            "academic_year_id": year["id"],
            "section_id": section["id"],
        },
    )

    assert response.status_code == 503
    login = client.post(
        _api("/login/access-token"),
        data={"username": email, "password": TEMPORARY_PASSWORD},
    )
    assert login.status_code == 400
    listing = client.get(
        _api("/class-representatives/"), headers=superuser_token_headers
    )
    assert all(row["email"] != email for row in listing.json()["data"])


def test_temporary_password_is_random_outside_test_mode(monkeypatch) -> None:
    monkeypatch.setattr(settings, "FASTAPI_ENV", "development")

    first = _generate_temporary_password()
    second = _generate_temporary_password()

    assert first != second
    assert len(first) >= 32
    assert first != TEMPORARY_PASSWORD


def test_class_representative_cannot_modify_enrollment_outside_assigned_year(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    representative, year, _ = _create_representative(client, superuser_token_headers)
    rep_headers = _representative_headers(client, representative["email"])
    created = client.post(
        _api("/class-representatives/me/students"),
        headers=rep_headers,
        json={
            "student_number": f"SCOPE-{random_lower_string()[:10].upper()}",
            "first_name": "Scoped",
            "last_name": "Student",
        },
    )
    assert created.status_code == 200
    student_id = created.json()["id"]

    sections = client.get(
        _api("/academic-registry/sections"), headers=superuser_token_headers
    )
    assert sections.status_code == 200
    other_section = next(
        (
            section
            for section in sections.json()["data"]
            if section["academic_year_id"] != year["id"]
        ),
        None,
    )
    assert other_section is not None

    other_enrollment = client.post(
        _api("/academic-registry/enrollments"),
        headers=superuser_token_headers,
        json={
            "student_id": student_id,
            "section_id": other_section["id"],
            "academic_year_id": other_section["academic_year_id"],
            "student_status": "regular",
        },
    )
    assert other_enrollment.status_code == 200

    attempted_update = client.patch(
        _api(f"/academic-registry/students/{student_id}"),
        headers=rep_headers,
        json={
            "enrollment_id": other_enrollment.json()["id"],
            "student_status": "irregular",
        },
    )
    assert attempted_update.status_code == 403

    roster = client.get(
        _api(f"/academic-registry/sections/{other_section['id']}/students"),
        headers=superuser_token_headers,
    )
    assert roster.status_code == 200
    student_row = next(row for row in roster.json()["data"] if row["id"] == student_id)
    assert student_row["student_status"] == "regular"
