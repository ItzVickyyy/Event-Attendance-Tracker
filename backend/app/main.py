from pathlib import Path

import re
import time
from uuid import UUID

import jwt
import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.routing import APIRoute
from starlette.middleware.cors import CORSMiddleware

from app.api.main import api_router
from app.core.config import settings
from app.core.db import engine, test_engine
from app.core import security
from app.models import AuditLog, User
from sqlmodel import Session

FRONTEND_DIR = Path(__file__).parent / "frontend"


def custom_generate_unique_id(route: APIRoute) -> str:
    return f"{route.tags[0]}-{route.name}"


if settings.SENTRY_DSN and settings.FASTAPI_ENV != "development":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    generate_unique_id_function=custom_generate_unique_id,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_HOST],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def record_api_mutations(request: Request, call_next):
    """Record authenticated API writes without capturing request or response bodies."""
    started = time.perf_counter()
    response = await call_next(request)
    path = request.url.path
    method = request.method.upper()
    api_prefix = settings.API_V1_STR.rstrip("/")

    if (
        method not in {"POST", "PUT", "PATCH", "DELETE"}
        or not path.startswith(f"{api_prefix}/")
        or path.startswith(f"{api_prefix}/login/")
        or path.startswith(f"{api_prefix}/developer/")
    ):
        return response

    actor_id = None
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        try:
            payload = jwt.decode(
                authorization.split(" ", 1)[1],
                settings.SECRET_KEY,
                algorithms=[security.ALGORITHM],
            )
            actor_id = UUID(str(payload.get("sub")))
        except (jwt.InvalidTokenError, ValueError, TypeError):
            actor_id = None

    if actor_id is None:
        return response

    # Replace UUID path segments so the audit resource remains consistent and
    # avoids retaining per-record identifiers unnecessarily.
    normalized_path = re.sub(
        r"/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?=/|$)",
        "/{id}",
        path,
    )
    resource = normalized_path.removeprefix(f"{api_prefix}/")[:255]
    action = f"{method} {resource.split('/', 1)[0]}"[:100]
    target_engine = test_engine if settings.FASTAPI_ENV == "test" else engine
    try:
        with Session(target_engine) as session:
            if session.get(User, actor_id) is not None:
                session.add(
                    AuditLog(
                        actor_user_id=actor_id,
                        action=action,
                        resource=resource,
                        method=method,
                        path=normalized_path[:500],
                        status_code=response.status_code,
                        outcome="success" if response.status_code < 400 else "failure",
                        duration_ms=round((time.perf_counter() - started) * 1000, 2),
                    )
                )
                session.commit()
    except Exception:
        # Audit storage must not turn an otherwise successful API response into
        # an application outage. Database failures remain visible in monitoring.
        pass

    return response


app.include_router(api_router, prefix=settings.API_V1_STR)
app.frontend("/", directory=FRONTEND_DIR)
