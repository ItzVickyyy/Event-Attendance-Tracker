import platform
import sys
import time
from datetime import UTC, datetime
from typing import Any

import fastapi
from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text
from sqlmodel import func, select

from app.api.deps import DeveloperUser, SessionDep
from app.core.config import settings
from app.models import (
    Attendance,
    AttendanceCorrection,
    AttendanceSession,
    Event,
    ImportBatch,
    Student,
    User,
)

router = APIRouter(prefix="/developer", tags=["developer"])


class SystemHealthResponse(BaseModel):
    status: str
    database_status: str
    database_latency_ms: float
    server_time_utc: datetime
    environment: str
    python_version: str
    fastapi_version: str
    platform_system: str


class SystemDiagnosticsResponse(BaseModel):
    database_engine: str
    total_users: int
    total_students: int
    total_events: int
    total_attendance_records: int
    total_attendance_sessions: int
    total_attendance_corrections: int
    total_import_batches: int
    server_time_utc: datetime


@router.get("/health", response_model=SystemHealthResponse)
def get_system_health(
    session: SessionDep,
    _current_user: DeveloperUser,
) -> Any:
    """Return runtime and database health details for Developers."""
    started = time.perf_counter()
    database_status = "connected"
    try:
        session.exec(text("SELECT 1"))  # type: ignore[call-overload]
    except Exception:
        session.rollback()
        database_status = "error"

    return SystemHealthResponse(
        status="healthy" if database_status == "connected" else "degraded",
        database_status=database_status,
        database_latency_ms=round((time.perf_counter() - started) * 1000, 2),
        server_time_utc=datetime.now(UTC),
        environment=settings.FASTAPI_ENV or "production",
        python_version=sys.version.split()[0],
        fastapi_version=fastapi.__version__,
        platform_system=platform.system(),
    )


@router.get("/diagnostics", response_model=SystemDiagnosticsResponse)
def get_system_diagnostics(
    session: SessionDep,
    _current_user: DeveloperUser,
) -> Any:
    """Return aggregate application metrics without exposing personal records."""
    engine_name = session.bind.dialect.name if session.bind else "unknown"

    def count_rows(model: type[Any]) -> int:
        return session.exec(select(func.count()).select_from(model)).one()

    return SystemDiagnosticsResponse(
        database_engine=engine_name,
        total_users=count_rows(User),
        total_students=count_rows(Student),
        total_events=count_rows(Event),
        total_attendance_records=count_rows(Attendance),
        total_attendance_sessions=count_rows(AttendanceSession),
        total_attendance_corrections=count_rows(AttendanceCorrection),
        total_import_batches=count_rows(ImportBatch),
        server_time_utc=datetime.now(UTC),
    )
