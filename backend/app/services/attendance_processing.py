import uuid
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, select, update

from app.models import (
    Attendance,
    AttendanceMode,
    AttendanceResultCode,
    AttendanceSession,
    AttendanceSessionStatus,
    AttendanceSessionType,
    AttendanceStatus,
    Event,
    EventRegistration,
    EventStatus,
    RegistrationStatus,
    ScanMethod,
    User,
    get_datetime_utc,
)


def resolve_attendance_session(
    *, session, event: Event, session_id: uuid.UUID | None = None
) -> AttendanceSession:
    if session_id:
        attendance_session = session.get(AttendanceSession, session_id)
        if not attendance_session or attendance_session.event_id != event.id:
            raise HTTPException(status_code=404, detail="Attendance session not found")
        return attendance_session

    active = session.exec(
        select(AttendanceSession).where(
            col(AttendanceSession.event_id) == event.id,
            col(AttendanceSession.is_active).is_(True),
        )
    ).first()
    if active:
        return active

    # Compatibility path for events created by older versions.
    fallback = session.exec(
        select(AttendanceSession)
        .where(col(AttendanceSession.event_id) == event.id)
        .order_by(col(AttendanceSession.display_order))
    ).first()
    if fallback:
        return fallback

    fallback = AttendanceSession(
        event_id=event.id,
        session_date=event.event_date,
        name="Default Attendance",
        session_type=AttendanceSessionType.time_in,
        start_time=event.start_time,
        end_time=event.end_time,
        status=AttendanceSessionStatus.open
        if event.status == EventStatus.open
        else AttendanceSessionStatus.scheduled,
        display_order=0,
        is_active=event.status == EventStatus.open,
    )
    session.add(fallback)
    session.flush()
    return fallback


def _late_status(attendance_session: AttendanceSession, now: datetime) -> bool:
    if attendance_session.session_type == AttendanceSessionType.time_out:
        return False
    if not attendance_session.late_cutoff:
        return False
    try:
        hour, minute = attendance_session.late_cutoff.split(":", 1)
        cutoff_minutes = int(hour) * 60 + int(minute)
        return now.hour * 60 + now.minute > cutoff_minutes
    except TypeError, ValueError:
        return False


def record_registered_attendance(
    *,
    session,
    event: Event,
    registration: EventRegistration,
    current_user: User,
    scan_method: ScanMethod,
    attendance_session_id: uuid.UUID | None = None,
    now: datetime | None = None,
) -> tuple[Attendance, str, AttendanceResultCode]:
    if registration.registration_status == RegistrationStatus.cancelled:
        raise HTTPException(
            status_code=400, detail="Attendee registration is cancelled for this event"
        )

    attendance_session = resolve_attendance_session(
        session=session, event=event, session_id=attendance_session_id
    )
    if (
        attendance_session.status != AttendanceSessionStatus.open
        or not attendance_session.is_active
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Attendance session is not open",
        )

    now = now or get_datetime_utc()
    existing = session.exec(
        select(Attendance).where(
            col(Attendance.registration_id) == registration.id,
            col(Attendance.attendance_session_id) == attendance_session.id,
        )
    ).first()

    # Preserve the existing combined Time-In/Time-Out behavior for legacy events.
    if existing:
        if (
            attendance_session.session_type == AttendanceSessionType.time_in
            and event.attendance_mode == AttendanceMode.time_in_time_out
            and existing.time_out is None
            and existing.time_in is not None
        ):
            stmt = (
                update(Attendance)
                .where(
                    col(Attendance.id) == existing.id,
                    col(Attendance.time_out).is_(None),
                )
                .values(
                    time_out=now,
                    status=AttendanceStatus.completed,
                    scanned_by=current_user.id,
                    scan_method=scan_method,
                    updated_at=now,
                )
            )
            result = session.exec(stmt)
            session.commit()
            if result.rowcount == 0:
                session.refresh(existing)
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Attendance already completed",
                )
            session.refresh(existing)
            return existing, "Time-Out Recorded", AttendanceResultCode.success
        detail = (
            f"Already Completed - In: {existing.time_in} / Out: {existing.time_out}"
            if existing.time_out
            else f"Already Recorded - In: {existing.time_in}"
        )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

    if attendance_session.session_type == AttendanceSessionType.time_out:
        record = Attendance(
            academic_year_id=event.academic_year_id,
            registration_id=registration.id,
            attendance_session_id=attendance_session.id,
            time_in=None,
            time_out=now,
            status=AttendanceStatus.completed,
            scan_method=scan_method,
            is_late=False,
            scanned_by=current_user.id,
        )
        message = "Time-Out Recorded"
    else:
        record = Attendance(
            academic_year_id=event.academic_year_id,
            registration_id=registration.id,
            attendance_session_id=attendance_session.id,
            time_in=now,
            time_out=None,
            status=(
                AttendanceStatus.time_in_only
                if event.attendance_mode == AttendanceMode.time_in_time_out
                and attendance_session.session_type == AttendanceSessionType.time_in
                else AttendanceStatus.present
            ),
            scan_method=scan_method,
            is_late=_late_status(attendance_session, now),
            scanned_by=current_user.id,
        )
        message = "Time-In Recorded"

    session.add(record)
    try:
        session.commit()
        session.refresh(record)
        return record, message, AttendanceResultCode.success
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Attendance already recorded for this session",
        )
