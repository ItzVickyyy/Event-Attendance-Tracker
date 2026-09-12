import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, require_admin
from app.models import (
    Attendee,
    AttendeeRelationship,
    AttendeeRelationshipCreate,
    AttendeeRelationshipPublic,
    AttendeeRelationshipsPublic,
    AttendeeRelationshipUpdate,
    Student,
    get_datetime_utc,
)

router = APIRouter(prefix="/attendee-relationships", tags=["attendee-relationships"])


@router.get("/", response_model=AttendeeRelationshipsPublic)
def read_attendee_relationships(
    session: SessionDep,
    _current_user: CurrentUser,
    attendee_id: uuid.UUID | None = None,
    related_student_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    count_statement = select(func.count()).select_from(AttendeeRelationship)
    statement = select(AttendeeRelationship)

    if attendee_id:
        count_statement = count_statement.where(
            col(AttendeeRelationship.attendee_id) == attendee_id
        )
        statement = statement.where(
            col(AttendeeRelationship.attendee_id) == attendee_id
        )
    if related_student_id:
        count_statement = count_statement.where(
            col(AttendeeRelationship.related_student_id) == related_student_id
        )
        statement = statement.where(
            col(AttendeeRelationship.related_student_id) == related_student_id
        )

    count = session.exec(count_statement).one()
    statement = (
        statement.order_by(col(AttendeeRelationship.created_at).desc())
        .offset(skip)
        .limit(limit)
    )
    relationships = session.exec(statement).all()
    return AttendeeRelationshipsPublic(
        data=[AttendeeRelationshipPublic.model_validate(r) for r in relationships],
        count=count,
    )


@router.post(
    "/",
    response_model=AttendeeRelationshipPublic,
    dependencies=[Depends(require_admin)],
)
def create_attendee_relationship(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    relationship_in: AttendeeRelationshipCreate,
) -> Any:
    attendee = session.get(Attendee, relationship_in.attendee_id)
    if not attendee:
        raise HTTPException(status_code=404, detail="Attendee not found")

    student = session.get(Student, relationship_in.related_student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    existing = session.exec(
        select(AttendeeRelationship).where(
            col(AttendeeRelationship.attendee_id) == relationship_in.attendee_id,
            col(AttendeeRelationship.related_student_id)
            == relationship_in.related_student_id,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="A relationship between this attendee and student already exists.",
        )

    relationship = AttendeeRelationship.model_validate(relationship_in)
    session.add(relationship)
    session.commit()
    session.refresh(relationship)
    return relationship


@router.get("/{relationship_id}", response_model=AttendeeRelationshipPublic)
def read_attendee_relationship(
    session: SessionDep, _current_user: CurrentUser, relationship_id: uuid.UUID
) -> Any:
    relationship = session.get(AttendeeRelationship, relationship_id)
    if not relationship:
        raise HTTPException(status_code=404, detail="Attendee relationship not found")
    return relationship


@router.patch(
    "/{relationship_id}",
    response_model=AttendeeRelationshipPublic,
    dependencies=[Depends(require_admin)],
)
def update_attendee_relationship(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    relationship_id: uuid.UUID,
    relationship_in: AttendeeRelationshipUpdate,
) -> Any:
    relationship = session.get(AttendeeRelationship, relationship_id)
    if not relationship:
        raise HTTPException(status_code=404, detail="Attendee relationship not found")

    update_dict = relationship_in.model_dump(exclude_unset=True)
    if "attendee_id" in update_dict:
        attendee = session.get(Attendee, update_dict["attendee_id"])
        if not attendee:
            raise HTTPException(status_code=404, detail="Attendee not found")
    if "related_student_id" in update_dict:
        student = session.get(Student, update_dict["related_student_id"])
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")

    relationship.sqlmodel_update(update_dict)
    relationship.updated_at = get_datetime_utc()
    session.add(relationship)
    session.commit()
    session.refresh(relationship)
    return relationship


@router.delete("/{relationship_id}", dependencies=[Depends(require_admin)])
def delete_attendee_relationship(
    session: SessionDep, _current_user: CurrentUser, relationship_id: uuid.UUID
) -> dict[str, str]:
    relationship = session.get(AttendeeRelationship, relationship_id)
    if not relationship:
        raise HTTPException(status_code=404, detail="Attendee relationship not found")
    session.delete(relationship)
    session.commit()
    return {"message": "Attendee relationship deleted successfully"}
    relationship = session.get(AttendeeRelationship, relationship_id)
    if not relationship:
        raise HTTPException(status_code=404, detail="Attendee relationship not found")
    session.delete(relationship)
    session.commit()
    return {"message": "Attendee relationship deleted successfully"}
