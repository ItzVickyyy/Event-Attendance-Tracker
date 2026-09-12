import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, require_admin
from app.models import (
    Event,
    EventCreate,
    EventPublic,
    EventsPublic,
    EventStatus,
    EventUpdate,
    Organization,
    get_datetime_utc,
)

router = APIRouter(prefix="/events", tags=["events"])


@router.get("/", response_model=EventsPublic)
def read_events(
    session: SessionDep,
    _current_user: CurrentUser,
    organization_id: uuid.UUID | None = None,
    status: EventStatus | None = None,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    count_statement = select(func.count()).select_from(Event)
    statement = select(Event)

    if organization_id:
        count_statement = count_statement.where(
            col(Event.organization_id) == organization_id
        )
        statement = statement.where(col(Event.organization_id) == organization_id)
    if status:
        count_statement = count_statement.where(col(Event.status) == status)
        statement = statement.where(col(Event.status) == status)

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

    event = Event.model_validate(event_in)
    session.add(event)
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

    event.sqlmodel_update(update_dict)
    event.updated_at = get_datetime_utc()
    session.add(event)
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
