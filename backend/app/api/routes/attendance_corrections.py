import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, require_admin
from app.models import (
    Attendance,
    AttendanceCorrection,
    AttendanceCorrectionCreate,
    AttendanceCorrectionPublic,
    AttendanceCorrectionsPublic,
    AttendanceSession,
    get_datetime_utc,
)

router = APIRouter(prefix="/attendance-corrections", tags=["attendance-corrections"])


@router.get(
    "/",
    response_model=AttendanceCorrectionsPublic,
    dependencies=[Depends(require_admin)],
)
def read_attendance_corrections(
    session: SessionDep,
    _current_user: CurrentUser,
    attendance_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    count_statement = select(func.count()).select_from(AttendanceCorrection)
    statement = select(AttendanceCorrection)

    if attendance_id:
        count_statement = count_statement.where(
            col(AttendanceCorrection.attendance_id) == attendance_id
        )
        statement = statement.where(
            col(AttendanceCorrection.attendance_id) == attendance_id
        )

    count = session.exec(count_statement).one()
    statement = (
        statement.order_by(col(AttendanceCorrection.corrected_at).desc())
        .offset(skip)
        .limit(limit)
    )
    corrections = session.exec(statement).all()
    return AttendanceCorrectionsPublic(
        data=[AttendanceCorrectionPublic.model_validate(c) for c in corrections],
        count=count,
    )


@router.post(
    "/",
    response_model=AttendanceCorrectionPublic,
    dependencies=[Depends(require_admin)],
)
def create_attendance_correction(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    correction_in: AttendanceCorrectionCreate,
) -> Any:
    attendance = session.get(Attendance, correction_in.attendance_id)
    if not attendance:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    now = get_datetime_utc()
    attendance_session = session.get(AttendanceSession, attendance.attendance_session_id)
    old_time_in = attendance.time_in
    old_time_out = attendance.time_out
    old_status = attendance.status
    if correction_in.new_time_in is not None:
        attendance.time_in = correction_in.new_time_in
    if correction_in.new_time_out is not None:
        attendance.time_out = correction_in.new_time_out
    if correction_in.new_status is not None:
        attendance.status = correction_in.new_status
    if attendance_session and attendance.time_in and attendance_session.late_cutoff:
        try:
            hour, minute = attendance_session.late_cutoff.split(":", 1)
            attendance.is_late = attendance.time_in.hour * 60 + attendance.time_in.minute > int(hour) * 60 + int(minute)
        except (TypeError, ValueError):
            pass
    correction = AttendanceCorrection(
        attendance_id=correction_in.attendance_id,
        reason=correction_in.reason,
        old_time_in=old_time_in,
        new_time_in=attendance.time_in,
        old_time_out=old_time_out,
        new_time_out=attendance.time_out,
        old_status=old_status,
        new_status=attendance.status,
        corrected_by=current_user.id,
        corrected_at=now,
    )
    attendance.updated_at = now
    session.add(attendance)
    session.add(correction)
    session.commit()
    session.refresh(correction)
    return correction


@router.get(
    "/{correction_id}",
    response_model=AttendanceCorrectionPublic,
    dependencies=[Depends(require_admin)],
)
def read_attendance_correction(
    session: SessionDep, _current_user: CurrentUser, correction_id: uuid.UUID
) -> Any:
    correction = session.get(AttendanceCorrection, correction_id)
    if not correction:
        raise HTTPException(status_code=404, detail="Attendance correction not found")
    return correction
