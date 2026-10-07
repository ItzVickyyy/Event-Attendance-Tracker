from fastapi.testclient import TestClient

from app.api.routes import public_student_qr
from app.core.config import settings


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
