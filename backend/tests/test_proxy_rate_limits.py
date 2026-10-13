from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def test_compose_rate_limits_public_and_authentication_routes() -> None:
    compose = (REPOSITORY_ROOT / "compose.yml").read_text()
    deploy = (REPOSITORY_ROOT / "compose.deploy.yml").read_text()

    assert (
        "traefik.http.middlewares.public-lookup-ratelimit.ratelimit.average=12"
        in compose
    )
    assert "traefik.http.middlewares.signup-ratelimit.ratelimit.average=5" in compose
    assert "traefik.http.middlewares.login-ratelimit.ratelimit.average=10" in compose
    assert (
        "traefik.http.middlewares.password-recovery-ratelimit.ratelimit.average=3"
        in compose
    )

    for route in (
        "public-student-qr",
        "public-credential-lookup",
        "signup",
        "login",
        "password-recovery",
    ):
        assert f"traefik.http.routers.{route}-http.middlewares=" in compose
        assert f"traefik.http.routers.{route}-https.middlewares=" in deploy


def test_deployed_backend_is_not_published_outside_the_proxy() -> None:
    deploy = (REPOSITORY_ROOT / "compose.deploy.yml").read_text()

    assert "ports: !reset []" in deploy
