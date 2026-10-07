import os
import platform
import sys
import time
from datetime import UTC, datetime
from uuid import UUID
from typing import Any

import fastapi
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import func, select, text

from app.api.deps import CurrentUser, SessionDep, require_developer
from app.core.config import settings
from app.models import (
    AcademicSection,
    AuditLog,
    Attendance,
    AttendanceSession,
    Event,
    Student,
    User,
    UserRole,
)

router = APIRouter(prefix="/developer", tags=["developer"])


def require_audit_log_access(current_user: CurrentUser) -> User:
    """Allow Developers and operational administrators to review audit history."""
    if (
        current_user.is_developer
        or current_user.is_superuser
        or current_user.role in (UserRole.super_admin, UserRole.admin)
    ):
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Audit log access is required",
    )



class DeveloperHealthResponse(BaseModel):
    status: str
    database_status: str
    database_latency_ms: float
    server_time_utc: datetime
    environment: str
    application_version: str
    python_version: str
    fastapi_version: str
    platform_system: str


class DeveloperDiagnosticsResponse(BaseModel):
    database_engine: str
    total_users: int
    total_events: int
    total_students: int
    total_sections: int
    total_attendance_records: int
    total_attendance_sessions: int
    server_time_utc: datetime


@router.get(
    "/health",
    response_model=DeveloperHealthResponse,
    dependencies=[Depends(require_developer)],
)
def read_system_health(session: SessionDep) -> Any:
    """Return read-only runtime and database health for Developers."""
    started = time.perf_counter()
    database_status = "connected"
    try:
        session.exec(text("SELECT 1"))
    except Exception:
        session.rollback()
        database_status = "error"

    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    return DeveloperHealthResponse(
        status="healthy" if database_status == "connected" else "degraded",
        database_status=database_status,
        database_latency_ms=latency_ms,
        server_time_utc=datetime.now(UTC),
        environment=settings.FASTAPI_ENV or "production",
        application_version=os.getenv("APP_VERSION", "unknown"),
        python_version=sys.version.split()[0],
        fastapi_version=fastapi.__version__,
        platform_system=platform.system(),
    )


@router.get(
    "/diagnostics",
    response_model=DeveloperDiagnosticsResponse,
    dependencies=[Depends(require_developer)],
)
def read_system_diagnostics(session: SessionDep) -> Any:
    """Return aggregate counts only. No user or student records are exposed."""
    engine_name = session.bind.dialect.name if session.bind else "unknown"

    def count_rows(model: type) -> int:
        return session.exec(select(func.count()).select_from(model)).one()

    return DeveloperDiagnosticsResponse(
        database_engine=engine_name,
        total_users=count_rows(User),
        total_events=count_rows(Event),
        total_students=count_rows(Student),
        total_sections=count_rows(AcademicSection),
        total_attendance_records=count_rows(Attendance),
        total_attendance_sessions=count_rows(AttendanceSession),
        server_time_utc=datetime.now(UTC),
    )



class AuditLogEntry(BaseModel):
    id: str
    actor_user_id: str | None
    action: str
    resource: str
    method: str
    path: str
    request_id: str | None
    status_code: int
    outcome: str
    duration_ms: float
    occurred_at: datetime


class AuditLogResponse(BaseModel):
    data: list[AuditLogEntry]
    count: int
    limit: int
    offset: int


@router.get(
    "/audit-logs",
    response_model=AuditLogResponse,
    dependencies=[Depends(require_audit_log_access)],
)
def read_audit_logs(
    session: SessionDep,
    limit: int = 50,
    offset: int = 0,
    action: str | None = None,
    outcome: str | None = None,
    actor_user_id: UUID | None = None,
    resource: str | None = None,
    status_code: int | None = None,
    start_at: datetime | None = None,
    end_at: datetime | None = None,
) -> AuditLogResponse:
    """Return paginated audit entries with filters and no payload data."""
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    if outcome is not None and outcome not in {"success", "failure"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Outcome must be 'success' or 'failure'",
        )
    if start_at is not None and end_at is not None and start_at > end_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="start_at must be earlier than or equal to end_at",
        )

    def apply_filters(query):
        if action and action.strip():
            query = query.where(AuditLog.action.ilike(f"%{action.strip()}%"))
        if outcome:
            query = query.where(AuditLog.outcome == outcome)
        if actor_user_id:
            query = query.where(AuditLog.actor_user_id == actor_user_id)
        if resource and resource.strip():
            query = query.where(AuditLog.resource.ilike(f"%{resource.strip()}%"))
        if status_code is not None:
            query = query.where(AuditLog.status_code == status_code)
        if start_at:
            query = query.where(AuditLog.occurred_at >= start_at)
        if end_at:
            query = query.where(AuditLog.occurred_at <= end_at)
        return query

    query = apply_filters(select(AuditLog))
    count_query = apply_filters(select(func.count()).select_from(AuditLog))
    rows = session.exec(
        query.order_by(AuditLog.occurred_at.desc()).offset(offset).limit(limit)
    ).all()
    count = session.exec(count_query).one()

    return AuditLogResponse(
        data=[
            AuditLogEntry(
                id=str(row.id),
                actor_user_id=str(row.actor_user_id) if row.actor_user_id else None,
                action=row.action,
                resource=row.resource,
                method=row.method,
                path=row.path,
                request_id=row.request_id,
                status_code=row.status_code,
                outcome=row.outcome,
                duration_ms=row.duration_ms,
                occurred_at=row.occurred_at,
            )
            for row in rows
        ],
        count=count,
        limit=limit,
        offset=offset,
    )
