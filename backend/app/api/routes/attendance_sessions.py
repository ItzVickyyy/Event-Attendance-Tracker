import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app.api.deps import (
    CurrentUser,
    SessionDep,
    require_admin,
    require_scanner_permission,
)
from app.models import (
    AttendanceSession,
    AttendanceSessionCreate,
    AttendanceSessionPublic,
    AttendanceSessionsPublic,
    AttendanceSessionStatus,
    AttendanceSessionUpdate,
    Event,
    EventStatus,
    get_datetime_utc,
)

router = APIRouter(prefix="/attendance-sessions", tags=["attendance-sessions"])


def _validate_event(session, event_id: uuid.UUID) -> Event:
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.get(
    "/",
    response_model=AttendanceSessionsPublic,
    dependencies=[Depends(require_scanner_permission)],
)
def read_attendance_sessions(
    session: SessionDep,
    _current_user: CurrentUser,
    event_id: uuid.UUID | None = None,
    status: AttendanceSessionStatus | None = None,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    count_statement = select(func.count()).select_from(AttendanceSession)
    statement = select(AttendanceSession)
    if event_id:
        count_statement = count_statement.where(
            col(AttendanceSession.event_id) == event_id
        )
        statement = statement.where(col(AttendanceSession.event_id) == event_id)
    if status:
        count_statement = count_statement.where(col(AttendanceSession.status) == status)
        statement = statement.where(col(AttendanceSession.status) == status)
    count = session.exec(count_statement).one()
    records = session.exec(
        statement.order_by(
            col(AttendanceSession.display_order), col(AttendanceSession.session_date)
        )
        .offset(skip)
        .limit(limit)
    ).all()
    return AttendanceSessionsPublic(
        data=[AttendanceSessionPublic.model_validate(record) for record in records],
        count=count,
    )


@router.get(
    "/active/{event_id}",
    response_model=AttendanceSessionPublic,
    dependencies=[Depends(require_scanner_permission)],
)
def read_active_attendance_session(
    session: SessionDep, _current_user: CurrentUser, event_id: uuid.UUID
) -> Any:
    _validate_event(session, event_id)
    record = session.exec(
        select(AttendanceSession).where(
            col(AttendanceSession.event_id) == event_id,
            col(AttendanceSession.is_active).is_(True),
            col(AttendanceSession.status) == AttendanceSessionStatus.open,
        )
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="No active attendance session")
    return record


@router.post(
    "/", response_model=AttendanceSessionPublic, dependencies=[Depends(require_admin)]
)
def create_attendance_session(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    session_in: AttendanceSessionCreate,
) -> Any:
    event = _validate_event(session, session_in.event_id)
    if event.status == EventStatus.closed:
        raise HTTPException(
            status_code=400, detail="Cannot create a session for a closed event"
        )
    if session_in.is_active and session_in.status != AttendanceSessionStatus.open:
        raise HTTPException(status_code=400, detail="An active session must be open")
    if session_in.is_active:
        active_sessions = session.exec(
            select(AttendanceSession).where(
                col(AttendanceSession.event_id) == event.id,
                col(AttendanceSession.is_active).is_(True),
            )
        ).all()
        for active in active_sessions:
            active.is_active = False
            active.status = AttendanceSessionStatus.closed
            active.updated_at = get_datetime_utc()
    record = AttendanceSession.model_validate(session_in)
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


@router.get(
    "/{session_id}",
    response_model=AttendanceSessionPublic,
    dependencies=[Depends(require_scanner_permission)],
)
def read_attendance_session(
    session: SessionDep, _current_user: CurrentUser, session_id: uuid.UUID
) -> Any:
    record = session.get(AttendanceSession, session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Attendance session not found")
    return record


@router.patch(
    "/{session_id}",
    response_model=AttendanceSessionPublic,
    dependencies=[Depends(require_admin)],
)
def update_attendance_session(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    session_id: uuid.UUID,
    session_in: AttendanceSessionUpdate,
) -> Any:
    record = session.get(AttendanceSession, session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Attendance session not found")
    update_dict = session_in.model_dump(exclude_unset=True)
    if update_dict.get("status") == AttendanceSessionStatus.open:
        update_dict["is_active"] = True
    if update_dict.get("status") in (
        AttendanceSessionStatus.closed,
        AttendanceSessionStatus.cancelled,
    ):
        update_dict["is_active"] = False

    will_be_active = update_dict.get("is_active", record.is_active)
    if will_be_active:
        active_sessions = session.exec(
            select(AttendanceSession).where(
                col(AttendanceSession.event_id) == record.event_id,
                col(AttendanceSession.is_active).is_(True),
                col(AttendanceSession.id) != record.id,
            )
        ).all()
        for active in active_sessions:
            active.is_active = False
            active.status = AttendanceSessionStatus.closed
            active.updated_at = get_datetime_utc()

    record.sqlmodel_update(update_dict)
    record.updated_at = get_datetime_utc()
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


@router.post(
    "/{session_id}/activate",
    response_model=AttendanceSessionPublic,
    dependencies=[Depends(require_admin)],
)
def activate_attendance_session(
    *, session: SessionDep, _current_user: CurrentUser, session_id: uuid.UUID
) -> Any:
    record = session.get(AttendanceSession, session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Attendance session not found")
    event = _validate_event(session, record.event_id)
    if event.status != EventStatus.open:
        raise HTTPException(
            status_code=400,
            detail="Event must be open before a session can be activated",
        )
    active_sessions = session.exec(
        select(AttendanceSession).where(
            col(AttendanceSession.event_id) == record.event_id,
            col(AttendanceSession.is_active).is_(True),
            col(AttendanceSession.id) != record.id,
        )
    ).all()
    for active in active_sessions:
        active.is_active = False
        active.status = AttendanceSessionStatus.closed
        active.updated_at = get_datetime_utc()
    session.flush()
    record.is_active = True
    record.status = AttendanceSessionStatus.open
    record.updated_at = get_datetime_utc()
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


@router.post(
    "/{session_id}/close",
    response_model=AttendanceSessionPublic,
    dependencies=[Depends(require_admin)],
)
def close_attendance_session(
    *, session: SessionDep, _current_user: CurrentUser, session_id: uuid.UUID
) -> Any:
    record = session.get(AttendanceSession, session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Attendance session not found")
    record.status = AttendanceSessionStatus.closed
    record.is_active = False
    record.updated_at = get_datetime_utc()
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


@router.delete("/{session_id}", dependencies=[Depends(require_admin)])
def delete_attendance_session(
    *, session: SessionDep, _current_user: CurrentUser, session_id: uuid.UUID
) -> dict[str, str]:
    record = session.get(AttendanceSession, session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Attendance session not found")
    if record.is_active:
        raise HTTPException(
            status_code=400, detail="Close the active session before deleting it"
        )
    session.delete(record)
    session.commit()
    return {"message": "Attendance session deleted successfully"}
