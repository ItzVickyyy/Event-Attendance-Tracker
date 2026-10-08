from types import SimpleNamespace
from typing import Any

from fastapi.testclient import TestClient

from app.api.routes import utils as utils_route
from app.core.config import settings


def test_health_check_returns_true(client: TestClient) -> None:
    response = client.get(f"{settings.API_V1_STR}/utils/health-check/")
    assert response.status_code == 200
    assert response.json() is True


def test_test_email_uses_generated_content_and_sends_email(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    monkeypatch: Any,
) -> None:
    sent: list[dict[str, str]] = []
    monkeypatch.setattr(
        utils_route,
        "generate_test_email",
        lambda email_to: SimpleNamespace(
            subject="Generated subject",
            html_content="<p>Generated body</p>",
        ),
    )
    monkeypatch.setattr(
        utils_route,
        "send_email",
        lambda **kwargs: sent.append(kwargs),
    )

    response = client.post(
        f"{settings.API_V1_STR}/utils/test-email/",
        params={"email_to": "recipient@example.com"},
        headers=superuser_token_headers,
    )

    assert response.status_code == 201
    assert response.json() == {"message": "Test email sent"}
    assert sent == [
        {
            "email_to": "recipient@example.com",
            "subject": "Generated subject",
            "html_content": "<p>Generated body</p>",
        }
    ]
