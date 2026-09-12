import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, require_admin
from app.models import (
    Attendee,
    Event,
    EventRegistration,
    EventRegistrationCreate,
    EventRegistrationPublic,
    EventRegistrationsPublic,
    EventRegistrationUpdate,
    RegistrationStatus,
    get_datetime_utc,
)

router = APIRouter(prefix="/event-registrations", tags=["event-registrations"])


@router.get("/", response_model=EventRegistrationsPublic)
def read_event_registrations(
    session: SessionDep,
    _current_user: CurrentUser,
    event_id: uuid.UUID | None = None,
    attendee_id: uuid.UUID | None = None,
    registration_status: RegistrationStatus | None = None,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    count_statement = select(func.count()).select_from(EventRegistration)
    statement = select(EventRegistration)

    if event_id:
        count_statement = count_statement.where(
            col(EventRegistration.event_id) == event_id
        )
        statement = statement.where(col(EventRegistration.event_id) == event_id)
    if attendee_id:
        count_statement = count_statement.where(
            col(EventRegistration.attendee_id) == attendee_id
        )
        statement = statement.where(col(EventRegistration.attendee_id) == attendee_id)
    if registration_status:
        count_statement = count_statement.where(
            col(EventRegistration.registration_status) == registration_status
        )
        statement = statement.where(
            col(EventRegistration.registration_status) == registration_status
        )

    count = session.exec(count_statement).one()
    statement = (
        statement.order_by(col(EventRegistration.registered_at).desc())
        .offset(skip)
        .limit(limit)
    )
    registrations = session.exec(statement).all()
    return EventRegistrationsPublic(
        data=[EventRegistrationPublic.model_validate(r) for r in registrations],
        count=count,
    )


@router.post(
    "/", response_model=EventRegistrationPublic, dependencies=[Depends(require_admin)]
)
def create_event_registration(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    registration_in: EventRegistrationCreate,
) -> Any:
    event = session.get(Event, registration_in.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    attendee = session.get(Attendee, registration_in.attendee_id)
    if not attendee:
        raise HTTPException(status_code=404, detail="Attendee not found")

    existing = session.exec(
        select(EventRegistration).where(
            col(EventRegistration.event_id) == registration_in.event_id,
            col(EventRegistration.attendee_id) == registration_in.attendee_id,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Attendee is already registered for this event.",
        )

    registration = EventRegistration.model_validate(registration_in)
    session.add(registration)
    session.commit()
    session.refresh(registration)
    return registration


@router.get("/{registration_id}", response_model=EventRegistrationPublic)
def read_event_registration(
    session: SessionDep, _current_user: CurrentUser, registration_id: uuid.UUID
) -> Any:
    registration = session.get(EventRegistration, registration_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Event registration not found")
    return registration


@router.patch(
    "/{registration_id}",
    response_model=EventRegistrationPublic,
    dependencies=[Depends(require_admin)],
)
def update_event_registration(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    registration_id: uuid.UUID,
    registration_in: EventRegistrationUpdate,
) -> Any:
    registration = session.get(EventRegistration, registration_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Event registration not found")

    update_dict = registration_in.model_dump(exclude_unset=True)
    if "event_id" in update_dict and update_dict["event_id"] != registration.event_id:
        event = session.get(Event, update_dict["event_id"])
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
    if (
        "attendee_id" in update_dict
        and update_dict["attendee_id"] != registration.attendee_id
    ):
        attendee = session.get(Attendee, update_dict["attendee_id"])
        if not attendee:
            raise HTTPException(status_code=404, detail="Attendee not found")

    registration.sqlmodel_update(update_dict)
    registration.updated_at = get_datetime_utc()
    session.add(registration)
    session.commit()
    session.refresh(registration)
    return registration


@router.delete("/{registration_id}", dependencies=[Depends(require_admin)])
def delete_event_registration(
    session: SessionDep, _current_user: CurrentUser, registration_id: uuid.UUID
) -> dict[str, str]:
    registration = session.get(EventRegistration, registration_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Event registration not found")
    session.delete(registration)
    session.commit()
    return {"message": "Event registration deleted successfully"}
