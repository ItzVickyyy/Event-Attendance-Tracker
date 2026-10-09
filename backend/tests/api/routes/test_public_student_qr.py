from fastapi.testclient import TestClient

from app.api.routes import public_student_qr
from app.core.config import settings
from tests.utils.utils import random_lower_string


def test_normalize_collapses_whitespace_and_case() -> None:
    assert public_student_qr._normalize("  Jane   DOE ") == "jane doe"


def test_rate_limit_blocks_attempts_and_recovers_after_window(
    monkeypatch,
) -> None:
    public_student_qr._attempts.clear()
    now = 100.0
    monkeypatch.setattr(public_student_qr.time, "monotonic", lambda: now)

    for _ in range(public_student_qr.MAX_ATTEMPTS):
        assert public_student_qr._allow_request("test-client") is True
    assert public_student_qr._allow_request("test-client") is False

    now += public_student_qr.WINDOW_SECONDS + 1
    assert public_student_qr._allow_request("test-client") is True
    public_student_qr._attempts.clear()


def test_public_qr_lookup_rejects_missing_required_fields(
    client: TestClient,
) -> None:
    public_student_qr._attempts.clear()
    response = client.post(
        f"{settings.API_V1_STR}/public/student-qr",
        headers={"X-Forwarded-For": "198.51.100.11"},
        json={
            "student_number": " ",
            "first_name": " ",
            "last_name": "Student",
        },
    )
    assert response.status_code == 422
    assert "required" in response.json()["detail"].lower()


def test_public_qr_lookup_rejects_oversized_fields(
    client: TestClient,
) -> None:
    public_student_qr._attempts.clear()
    response = client.post(
        f"{settings.API_V1_STR}/public/student-qr",
        headers={"X-Forwarded-For": "198.51.100.12"},
        json={
            "student_number": "S" * 51,
            "first_name": "Jane",
            "last_name": "Student",
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid lookup input."


def test_public_qr_lookup_returns_not_found_for_unknown_student(
    client: TestClient,
) -> None:
    public_student_qr._attempts.clear()
    response = client.post(
        f"{settings.API_V1_STR}/public/student-qr",
        headers={"X-Forwarded-For": "198.51.100.13"},
        json={
            "student_number": "UNKNOWN-QR-TEST",
            "first_name": "Jane",
            "last_name": "Student",
        },
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Student record not found."


def test_public_qr_lookup_returns_credential_for_normalized_identity(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers
    years = client.get(
        f"{settings.API_V1_STR}/academic-registry/academic-years", headers=headers
    )
    year = next(row for row in years.json()["data"] if row["label"] == "2026-2027")
    sections = client.get(
        f"{settings.API_V1_STR}/academic-registry/sections", headers=headers
    )
    section = next(
        row
        for row in sections.json()["data"]
        if row["program_code"] == "BSIT"
        and row["section_name"] == "WMAD 3A"
        and row["academic_year_id"] == year["id"]
    )
    student_number = f"PUBLIC-QR-{random_lower_string()[:8].upper()}"
    created = client.post(
        f"{settings.API_V1_STR}/academic-registry/students",
        headers=headers,
        json={
            "student_number": student_number,
            "first_name": "Casey",
            "middle_name": "R",
            "last_name": "Learner",
            "name_extension": "Jr.",
            "section_id": section["id"],
            "academic_year_id": year["id"],
        },
    )
    assert created.status_code == 200, created.text

    public_student_qr._attempts.clear()
    response = client.post(
        f"{settings.API_V1_STR}/public/student-qr",
        headers={"X-Forwarded-For": "198.51.100.21"},
        json={
            "student_number": student_number,
            "first_name": "  CASEY ",
            "middle_name": " r ",
            "last_name": " LEARNER ",
            "name_extension": " jr. ",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["student_number"] == student_number
    assert response.json()["full_name"] == "Casey R Learner Jr."
    assert response.json()["section"] == "BSIT WMAD 3A"
    assert response.json()["credential_value"]


def test_public_qr_lookup_rejects_identity_mismatch_and_rate_limits(
    client: TestClient,
) -> None:
    public_student_qr._attempts.clear()
    payload = {
        "student_number": "UNKNOWN-QR-MISMATCH",
        "first_name": "Wrong",
        "last_name": "Identity",
    }
    for attempt in range(public_student_qr.MAX_ATTEMPTS):
        response = client.post(
            f"{settings.API_V1_STR}/public/student-qr",
            headers={"X-Forwarded-For": "198.51.100.22"},
            json=payload,
        )
        assert response.status_code == 404, f"Attempt {attempt + 1}: {response.text}"

    limited = client.post(
        f"{settings.API_V1_STR}/public/student-qr",
        headers={"X-Forwarded-For": "198.51.100.22"},
        json=payload,
    )
    assert limited.status_code == 429
    assert "Too many attempts" in limited.json()["detail"]
    public_student_qr._attempts.clear()
