import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, require_admin
from app.models import (
    PeoplePublic,
    Person,
    PersonCreate,
    PersonPublic,
    PersonUpdate,
    get_datetime_utc,
)

router = APIRouter(prefix="/people", tags=["people"])


@router.get("/", response_model=PeoplePublic)
def read_people(
    session: SessionDep,
    _current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
) -> Any:
    count_statement = select(func.count()).select_from(Person)
    statement = select(Person)

    if search:
        pattern = f"%{search}%"
        count_statement = count_statement.where(
            col(Person.first_name).ilike(pattern)
            | col(Person.last_name).ilike(pattern)
            | col(Person.email).ilike(pattern)
            | col(Person.contact_number).ilike(pattern)
        )
        statement = statement.where(
            col(Person.first_name).ilike(pattern)
            | col(Person.last_name).ilike(pattern)
            | col(Person.email).ilike(pattern)
            | col(Person.contact_number).ilike(pattern)
        )

    count = session.exec(count_statement).one()
    statement = (
        statement.order_by(col(Person.last_name).asc()).offset(skip).limit(limit)
    )
    people = session.exec(statement).all()
    return PeoplePublic(
        data=[PersonPublic.model_validate(p) for p in people], count=count
    )


@router.post("/", response_model=PersonPublic, dependencies=[Depends(require_admin)])
def create_person(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    person_in: PersonCreate,
) -> Any:
    person = Person.model_validate(person_in)
    session.add(person)
    session.commit()
    session.refresh(person)
    return person


@router.get("/{person_id}", response_model=PersonPublic)
def read_person(
    session: SessionDep, _current_user: CurrentUser, person_id: uuid.UUID
) -> Any:
    person = session.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


@router.patch(
    "/{person_id}", response_model=PersonPublic, dependencies=[Depends(require_admin)]
)
def update_person(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    person_id: uuid.UUID,
    person_in: PersonUpdate,
) -> Any:
    person = session.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    update_dict = person_in.model_dump(exclude_unset=True)
    person.sqlmodel_update(update_dict)
    person.updated_at = get_datetime_utc()
    session.add(person)
    session.commit()
    session.refresh(person)
    return person


@router.delete("/{person_id}", dependencies=[Depends(require_admin)])
def delete_person(
    session: SessionDep, _current_user: CurrentUser, person_id: uuid.UUID
) -> dict[str, str]:
    person = session.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    session.delete(person)
    session.commit()
    return {"message": "Person deleted successfully"}
