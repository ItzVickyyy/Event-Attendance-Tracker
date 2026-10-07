import logging
import re
import time
from collections.abc import Awaitable, Callable
from pathlib import Path
from uuid import UUID, uuid4

import jwt
import sentry_sdk
from fastapi import FastAPI, Request, Response
from fastapi.routing import APIRoute
from sqlmodel import Session
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from app.api.main import api_router
from app.core import security
from app.core.config import settings
from app.core.db import engine, test_engine
from app.models import AuditLog, User

logger = logging.getLogger(__name__)

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
    expose_headers=["X-Request-ID"],
)


def _persist_audit_log(
    *,
    actor_id: UUID,
    action: str,
    resource: str,
    path: str,
    request_id: str,
    method: str,
    status_code: int,
    duration_ms: float,
) -> None:
    """Persist an audit entry in its own short-lived database session."""
    target_engine = (test_engine or engine) if settings.FASTAPI_ENV == "test" else engine
    with Session(target_engine) as session:
        if session.get(User, actor_id) is None:
            return
        session.add(
            AuditLog(
                actor_user_id=actor_id,
                action=action,
                resource=resource,
                method=method,
                path=path[:500],
                request_id=request_id,
                status_code=status_code,
                outcome="success" if status_code < 400 else "failure",
                duration_ms=duration_ms,
            )
        )
        session.commit()


async def _audit_mutation(
    request: Request,
    *,
    status_code: int,
    started: float,
    request_id: str,
) -> None:
    """Audit an authenticated mutation without persisting raw URLs or payloads."""
    path = request.url.path
    method = request.method.upper()
    api_prefix = settings.API_V1_STR.rstrip("/")
    if (
        method not in {"POST", "PUT", "PATCH", "DELETE"}
        or not path.startswith(f"{api_prefix}/")
        or path.startswith(f"{api_prefix}/login/")
        or path.startswith(f"{api_prefix}/developer/audit-logs")
    ):
        return

    authorization = request.headers.get("authorization", "")
    if not authorization.lower().startswith("bearer "):
        return

    try:
        payload = jwt.decode(
            authorization.split(" ", 1)[1],
            settings.SECRET_KEY,
            algorithms=[security.ALGORITHM],
        )
        actor_id = UUID(str(payload.get("sub")))
    except (jwt.InvalidTokenError, ValueError, TypeError):
        return

    # Use FastAPI's matched route template, not the raw URL. This avoids
    # retaining student IDs, opaque QR tokens, or other path identifiers.
    route_template = None
    request_path = request.url.path
    request_method = request.method.upper()
    actual_segments = request_path.strip("/").split("/")
    for candidate in request.app.routes:
        candidate_path = getattr(candidate, "path", None)
        if not isinstance(candidate_path, str):
            continue
        if candidate_path.startswith(api_prefix):
            template_path = candidate_path
        elif candidate_path.startswith("/"):
            template_path = f"{api_prefix}{candidate_path}"
        else:
            continue
        methods = getattr(candidate, "methods", None)
        if methods and request_method not in methods:
            continue
        template_segments = template_path.strip("/").split("/")
        if len(template_segments) != len(actual_segments):
            continue
        matches = all(
            template == actual
            or (template.startswith("{") and template.endswith("}"))
            for template, actual in zip(template_segments, actual_segments, strict=True)
        )
        if matches:
            route_template = template_path
            break
    if route_template is None:
        route = request.scope.get("route")
        candidate_path = getattr(route, "path", None)
        route_template = (
            candidate_path
            if isinstance(candidate_path, str) and candidate_path.startswith(api_prefix)
            else f"{api_prefix}/unmatched"
        )

    resource = route_template.removeprefix(f"{api_prefix}/").strip("/") or "root"
    resource = resource[:255]
    action = f"{method} {resource.split('/', 1)[0]}"[:100]
    duration_ms = round((time.perf_counter() - started) * 1000, 2)

    try:
        await run_in_threadpool(
            _persist_audit_log,
            actor_id=actor_id,
            action=action,
            resource=resource,
            path=route_template,
            request_id=request_id,
            method=method,
            status_code=status_code,
            duration_ms=duration_ms,
        )
    except Exception:
        # Preserve application availability, but never silently hide audit failures.
        logger.exception("Failed to persist API audit log request_id=%s", request_id)


@app.middleware("http")
async def record_api_mutations(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Attach a traceable request ID and audit authenticated API mutations."""
    started = time.perf_counter()
    supplied_id = request.headers.get("x-request-id", "")
    request_id = (
        supplied_id
        if re.fullmatch(r"[A-Za-z0-9._:-]{1,64}", supplied_id)
        else str(uuid4())
    )
    request.state.request_id = request_id

    try:
        response = await call_next(request)
    except Exception:
        await _audit_mutation(
            request,
            status_code=500,
            started=started,
            request_id=request_id,
        )
        logger.exception("Unhandled API exception request_id=%s", request_id)
        sentry_sdk.capture_exception()
        if request.url.path.startswith(f"{settings.API_V1_STR}/"):
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error", "request_id": request_id},
                headers={"X-Request-ID": request_id},
            )
        raise

    response.headers["X-Request-ID"] = request_id
    await _audit_mutation(
        request,
        status_code=response.status_code,
        started=started,
        request_id=request_id,
    )
    return response


app.include_router(api_router, prefix=settings.API_V1_STR)
app.frontend("/", directory=FRONTEND_DIR)
