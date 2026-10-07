import platform
import sys
import time
from datetime import UTC, datetime
from typing import Any

import fastapi
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import func, select, text

from app.api.deps import CurrentUser, SessionDep, require_developer
from app.core.config import settings
from app.models import (
    AcademicSection,
    Attendance,
    AttendanceSession,
    Event,
    Student,
    User,
)

router = APIRouter(prefix="/developer", tags=["developer"])


class DeveloperHealthResponse(BaseModel):
    status: str
    database_status: str
    database_latency_ms: float
    server_time_utc: datetime
    environment: str
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
        python_version=sys.version.split()[0],
        fastapi_version=fastapi.__version__,
        platform_system=platform.system(),
    )


@router.get(
    "/diagnostics",
    response_model=DeveloperDiagnosticsResponse,
    dependencies=[require_developer],
)
def read_system_diagnostics(
    session: SessionDep,
    _current_user: CurrentUser,
) -> Any:
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
