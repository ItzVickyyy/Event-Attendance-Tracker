import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, require_admin
from app.models import (
    Attendee,
    AttendeeCredential,
    AttendeeCredentialCreate,
    AttendeeCredentialPublic,
    AttendeeCredentialsPublic,
    AttendeeCredentialUpdate,
    CredentialType,
    get_datetime_utc,
)

router = APIRouter(prefix="/attendee-credentials", tags=["attendee-credentials"])


@router.get("/", response_model=AttendeeCredentialsPublic)
def read_attendee_credentials(
    session: SessionDep,
    _current_user: CurrentUser,
    attendee_id: uuid.UUID | None = None,
    credential_type: CredentialType | None = None,
    is_active: bool | None = None,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    count_statement = select(func.count()).select_from(AttendeeCredential)
    statement = select(AttendeeCredential)

    if attendee_id:
        count_statement = count_statement.where(
            col(AttendeeCredential.attendee_id) == attendee_id
        )
        statement = statement.where(col(AttendeeCredential.attendee_id) == attendee_id)
    if credential_type:
        count_statement = count_statement.where(
            col(AttendeeCredential.credential_type) == credential_type
        )
        statement = statement.where(
            col(AttendeeCredential.credential_type) == credential_type
        )
    if is_active is not None:
        count_statement = count_statement.where(
            col(AttendeeCredential.is_active) == is_active
        )
        statement = statement.where(col(AttendeeCredential.is_active) == is_active)

    count = session.exec(count_statement).one()
    statement = (
        statement.order_by(col(AttendeeCredential.created_at).desc())
        .offset(skip)
        .limit(limit)
    )
    credentials = session.exec(statement).all()
    return AttendeeCredentialsPublic(
        data=[AttendeeCredentialPublic.model_validate(c) for c in credentials],
        count=count,
    )


@router.post(
    "/", response_model=AttendeeCredentialPublic, dependencies=[Depends(require_admin)]
)
def create_attendee_credential(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    credential_in: AttendeeCredentialCreate,
) -> Any:
    attendee = session.get(Attendee, credential_in.attendee_id)
    if not attendee:
        raise HTTPException(status_code=404, detail="Attendee not found")

    existing = session.exec(
        select(AttendeeCredential).where(
            AttendeeCredential.credential_value == credential_in.credential_value
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="A credential with this value already exists.",
        )

    credential = AttendeeCredential.model_validate(credential_in)
    session.add(credential)
    session.commit()
    session.refresh(credential)
    return credential


@router.get("/lookup/{credential_value}", response_model=AttendeeCredentialPublic)
def lookup_credential(
    session: SessionDep, _current_user: CurrentUser, credential_value: str
) -> Any:
    credential = session.exec(
        select(AttendeeCredential).where(
            AttendeeCredential.credential_value == credential_value
        )
    ).first()
    if not credential:
        raise HTTPException(status_code=404, detail="Credential not found")
    return credential


@router.get("/{credential_id}", response_model=AttendeeCredentialPublic)
def read_attendee_credential(
    session: SessionDep, _current_user: CurrentUser, credential_id: uuid.UUID
) -> Any:
    credential = session.get(AttendeeCredential, credential_id)
    if not credential:
        raise HTTPException(status_code=404, detail="Attendee credential not found")
    return credential


@router.patch(
    "/{credential_id}",
    response_model=AttendeeCredentialPublic,
    dependencies=[Depends(require_admin)],
)
def update_attendee_credential(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    credential_id: uuid.UUID,
    credential_in: AttendeeCredentialUpdate,
) -> Any:
    credential = session.get(AttendeeCredential, credential_id)
    if not credential:
        raise HTTPException(status_code=404, detail="Attendee credential not found")

    update_dict = credential_in.model_dump(exclude_unset=True)
    if (
        "credential_value" in update_dict
        and update_dict["credential_value"] != credential.credential_value
    ):
        existing = session.exec(
            select(AttendeeCredential).where(
                col(AttendeeCredential.credential_value)
                == update_dict["credential_value"],
                col(AttendeeCredential.id) != credential_id,
            )
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="A credential with this value already exists.",
            )

    if (
        "attendee_id" in update_dict
        and update_dict["attendee_id"] != credential.attendee_id
    ):
        attendee = session.get(Attendee, update_dict["attendee_id"])
        if not attendee:
            raise HTTPException(status_code=404, detail="Attendee not found")

    credential.sqlmodel_update(update_dict)
    credential.updated_at = get_datetime_utc()
    session.add(credential)
    session.commit()
    session.refresh(credential)
    return credential


@router.delete("/{credential_id}", dependencies=[Depends(require_admin)])
def delete_attendee_credential(
    session: SessionDep, _current_user: CurrentUser, credential_id: uuid.UUID
) -> dict[str, str]:
    credential = session.get(AttendeeCredential, credential_id)
    if not credential:
        raise HTTPException(status_code=404, detail="Attendee credential not found")
    session.delete(credential)
    session.commit()
    return {"message": "Attendee credential deleted successfully"}
