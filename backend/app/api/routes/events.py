import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, require_admin
from app.models import (
    AttendanceSession,
    AttendanceSessionStatus,
    AttendanceSessionType,
    Event,
    EventCreate,
    EventPublic,
    EventsPublic,
    EventStatus,
    EventUpdate,
    Organization,
    get_datetime_utc,
)
from app.student_academics import AcademicYear

router = APIRouter(prefix="/events", tags=["events"])


@router.get("/", response_model=EventsPublic)
def read_events(
    session: SessionDep,
    _current_user: CurrentUser,
    organization_id: uuid.UUID | None = None,
    status: EventStatus | None = None,
    academic_year_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    count_statement = select(func.count()).select_from(Event)
    if _current_user.role.value == "class_representative":
        raise HTTPException(status_code=403, detail="Class Representatives do not have access to events")

    statement = select(Event)

    if organization_id:
        count_statement = count_statement.where(
            col(Event.organization_id) == organization_id
        )
        statement = statement.where(col(Event.organization_id) == organization_id)
    if status:
        count_statement = count_statement.where(col(Event.status) == status)
        statement = statement.where(col(Event.status) == status)
    if academic_year_id:
        count_statement = count_statement.where(
            col(Event.academic_year_id) == academic_year_id
        )
        statement = statement.where(col(Event.academic_year_id) == academic_year_id)

    count = session.exec(count_statement).one()
    statement = (
        statement.order_by(col(Event.created_at).desc()).offset(skip).limit(limit)
    )
    events = session.exec(statement).all()
    return EventsPublic(
        data=[EventPublic.model_validate(e) for e in events], count=count
    )


@router.post("/", response_model=EventPublic, dependencies=[Depends(require_admin)])
def create_event(
    *, session: SessionDep, _current_user: CurrentUser, event_in: EventCreate
) -> Any:
    if event_in.organization_id:
        org = session.get(Organization, event_in.organization_id)
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")

    academic_year_id = event_in.academic_year_id
    if academic_year_id is None:
        current_year = session.exec(
            select(AcademicYear).where(AcademicYear.is_current.is_(True))
        ).first()
        if not current_year:
            raise HTTPException(
                status_code=409,
                detail="No current academic year is configured",
            )
        academic_year_id = current_year.id
    elif not session.get(AcademicYear, academic_year_id):
        raise HTTPException(status_code=404, detail="Academic year not found")

    event = Event.model_validate(event_in)
    event.academic_year_id = academic_year_id
    session.add(event)
    session.flush()
    default_session = AttendanceSession(
        event_id=event.id,
        session_date=event.event_date,
        name="Default Attendance",
        session_type=AttendanceSessionType.time_in,
        start_time=event.start_time,
        end_time=event.end_time,
        status=(
            AttendanceSessionStatus.open
            if event.status == EventStatus.open
            else AttendanceSessionStatus.closed
            if event.status == EventStatus.closed
            else AttendanceSessionStatus.scheduled
        ),
        is_active=event.status == EventStatus.open,
        display_order=0,
    )
    session.add(default_session)
    session.commit()
    session.refresh(event)
    return event


@router.get("/{event_id}", response_model=EventPublic)
def read_event(
    session: SessionDep, _current_user: CurrentUser, event_id: uuid.UUID
) -> Any:
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.patch(
    "/{event_id}", response_model=EventPublic, dependencies=[Depends(require_admin)]
)
def update_event(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    event_id: uuid.UUID,
    event_in: EventUpdate,
) -> Any:
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    update_dict = event_in.model_dump(exclude_unset=True)
    if "organization_id" in update_dict and update_dict["organization_id"] is not None:
        org = session.get(Organization, update_dict["organization_id"])
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")

    previous_status = event.status
    event.sqlmodel_update(update_dict)
    event.updated_at = get_datetime_utc()
    session.add(event)
    session.flush()
    if event.status == EventStatus.open and previous_status != EventStatus.open:
        active = session.exec(
            select(AttendanceSession).where(
                col(AttendanceSession.event_id) == event.id,
                col(AttendanceSession.is_active).is_(True),
            )
        ).first()
        if active:
            active.status = AttendanceSessionStatus.open
            active.updated_at = get_datetime_utc()
        else:
            next_session = session.exec(
                select(AttendanceSession)
                .where(col(AttendanceSession.event_id) == event.id)
                .order_by(col(AttendanceSession.display_order))
            ).first()
            if next_session:
                next_session.status = AttendanceSessionStatus.open
                next_session.is_active = True
                next_session.updated_at = get_datetime_utc()
    elif event.status == EventStatus.closed and previous_status != EventStatus.closed:
        active_sessions = session.exec(
            select(AttendanceSession).where(
                col(AttendanceSession.event_id) == event.id,
                col(AttendanceSession.is_active).is_(True),
            )
        ).all()
        for active in active_sessions:
            active.status = AttendanceSessionStatus.closed
            active.is_active = False
            active.updated_at = get_datetime_utc()
    session.commit()
    session.refresh(event)
    return event


@router.delete("/{event_id}", dependencies=[Depends(require_admin)])
def delete_event(
    session: SessionDep, _current_user: CurrentUser, event_id: uuid.UUID
) -> dict[str, str]:
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    session.delete(event)
    session.commit()
    return {"message": "Event deleted successfully"}
