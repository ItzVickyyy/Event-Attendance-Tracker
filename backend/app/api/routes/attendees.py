import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, require_admin
from app.models import (
    Attendee,
    AttendeeCreate,
    AttendeePublic,
    AttendeesPublic,
    AttendeeType,
    AttendeeUpdate,
    Person,
    get_datetime_utc,
)

router = APIRouter(prefix="/attendees", tags=["attendees"])


@router.get("/", response_model=AttendeesPublic)
def read_attendees(
    session: SessionDep,
    _current_user: CurrentUser,
    attendee_type: AttendeeType | None = None,
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
) -> Any:
    count_statement = select(func.count()).select_from(Attendee)
    statement = select(Attendee)

    if attendee_type:
        count_statement = count_statement.where(
            col(Attendee.attendee_type) == attendee_type
        )
        statement = statement.where(col(Attendee.attendee_type) == attendee_type)

    if search:
        pattern = f"%{search}%"
        count_statement = count_statement.join(Person, isouter=True).where(
            col(Person.first_name).ilike(pattern)
            | col(Person.last_name).ilike(pattern)
            | col(Person.email).ilike(pattern)
        )
        statement = statement.join(Person, isouter=True).where(
            col(Person.first_name).ilike(pattern)
            | col(Person.last_name).ilike(pattern)
            | col(Person.email).ilike(pattern)
        )

    count = session.exec(count_statement).one()
    statement = (
        statement.order_by(col(Attendee.created_at).desc()).offset(skip).limit(limit)
    )
    attendees = session.exec(statement).all()
    return AttendeesPublic(
        data=[AttendeePublic.model_validate(a) for a in attendees], count=count
    )


@router.post("/", response_model=AttendeePublic, dependencies=[Depends(require_admin)])
def create_attendee(
    *, session: SessionDep, _current_user: CurrentUser, attendee_in: AttendeeCreate
) -> Any:
    person = session.get(Person, attendee_in.person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    existing = session.exec(
        select(Attendee).where(Attendee.person_id == attendee_in.person_id)
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="An attendee record already exists for this person.",
        )

    attendee = Attendee.model_validate(attendee_in)
    session.add(attendee)
    session.commit()
    session.refresh(attendee)
    return attendee


@router.get("/{attendee_id}", response_model=AttendeePublic)
def read_attendee(
    session: SessionDep, _current_user: CurrentUser, attendee_id: uuid.UUID
) -> Any:
    attendee = session.get(Attendee, attendee_id)
    if not attendee:
        raise HTTPException(status_code=404, detail="Attendee not found")
    return attendee


@router.patch(
    "/{attendee_id}",
    response_model=AttendeePublic,
    dependencies=[Depends(require_admin)],
)
def update_attendee(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    attendee_id: uuid.UUID,
    attendee_in: AttendeeUpdate,
) -> Any:
    attendee = session.get(Attendee, attendee_id)
    if not attendee:
        raise HTTPException(status_code=404, detail="Attendee not found")

    update_dict = attendee_in.model_dump(exclude_unset=True)
    if "person_id" in update_dict and update_dict["person_id"] != attendee.person_id:
        person = session.get(Person, update_dict["person_id"])
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")
        existing = session.exec(
            select(Attendee).where(
                col(Attendee.person_id) == update_dict["person_id"],
                col(Attendee.id) != attendee_id,
            )
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="An attendee record already exists for this person.",
            )

    attendee.sqlmodel_update(update_dict)
    attendee.updated_at = get_datetime_utc()
    session.add(attendee)
    session.commit()
    session.refresh(attendee)
    return attendee


@router.delete("/{attendee_id}", dependencies=[Depends(require_admin)])
def delete_attendee(
    session: SessionDep, _current_user: CurrentUser, attendee_id: uuid.UUID
) -> dict[str, str]:
    attendee = session.get(Attendee, attendee_id)
    if not attendee:
        raise HTTPException(status_code=404, detail="Attendee not found")
    session.delete(attendee)
    session.commit()
    return {"message": "Attendee deleted successfully"}
