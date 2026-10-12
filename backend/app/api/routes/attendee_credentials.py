import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlmodel import col, func, select

from app.api.deps import (
    CurrentUser,
    SessionDep,
    class_rep_assignment,
    require_admin,
    require_scanner_permission,
)
from app.models import (
    AcademicSection,
    Attendee,
    AttendeeCredential,
    AttendeeCredentialCreate,
    AttendeeCredentialPublic,
    AttendeeCredentialsPublic,
    AttendeeCredentialUpdate,
    CredentialType,
    Person,
    PublicCredentialLookup,
    Student,
    UserRole,
    get_datetime_utc,
)

router = APIRouter(prefix="/attendee-credentials", tags=["attendee-credentials"])


@router.get(
    "/", response_model=AttendeeCredentialsPublic, dependencies=[Depends(require_admin)]
)
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


@router.post("/", response_model=AttendeeCredentialPublic)
def create_attendee_credential(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    credential_in: AttendeeCredentialCreate,
) -> Any:
    attendee = session.get(Attendee, credential_in.attendee_id)
    if not attendee:
        raise HTTPException(status_code=404, detail="Attendee not found")

    if current_user.role == UserRole.class_representative:
        assignment = class_rep_assignment(session, current_user)
        if not assignment:
            raise HTTPException(
                status_code=403, detail="No Class Representative assignment found"
            )
        allowed = session.connection().execute(
            text("""
                SELECT 1
                FROM attendees a
                JOIN students s ON s.person_id = a.person_id
                JOIN student_enrollments se ON se.student_id = s.id
                WHERE a.id = :attendee_id
                  AND s.archived_at IS NULL
                  AND se.section_id = :section_id
                  AND se.academic_year_id = :academic_year_id
                  AND se.archived_at IS NULL
                LIMIT 1
            """),
            {
                "attendee_id": attendee.id,
                "section_id": assignment["section_id"],
                "academic_year_id": assignment["academic_year_id"],
            },
        ).first()
        if not allowed:
            raise HTTPException(
                status_code=403,
                detail="You can only register Card UIDs for students in your assigned section",
            )
    elif not current_user.is_superuser and current_user.role not in (
        UserRole.super_admin,
        UserRole.admin,
    ):
        raise HTTPException(
            status_code=403,
            detail="Administrator or assigned Class Representative access is required",
        )

    credential_value = credential_in.credential_value
    if credential_in.credential_type == CredentialType.nfc:
        credential_value = credential_value.strip().upper()
        if not credential_value:
            raise HTTPException(status_code=422, detail="Card UID is required")
        if session.exec(
            select(AttendeeCredential).where(
                func.upper(AttendeeCredential.credential_value) == credential_value
            )
        ).first():
            raise HTTPException(
                status_code=409,
                detail="This Card UID is already registered.",
            )
        credential_in.credential_value = credential_value
    else:
        existing = session.exec(
            select(AttendeeCredential).where(
                AttendeeCredential.credential_value == credential_value
            )
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="A credential with this value already exists.",
            )

    if credential_in.credential_type == CredentialType.nfc:
        existing_nfc = session.exec(
            select(AttendeeCredential).where(
                AttendeeCredential.attendee_id == credential_in.attendee_id,
                AttendeeCredential.credential_type == CredentialType.nfc,
            )
        ).first()
        if existing_nfc:
            raise HTTPException(
                status_code=409,
                detail="This student already has a registered Card UID. Contact the Student Council to change it.",
            )

    credential = AttendeeCredential.model_validate(credential_in)
    if credential.credential_type == CredentialType.nfc:
        credential.is_active = True
    session.add(credential)
    session.commit()
    session.refresh(credential)
    return credential


@router.get(
    "/lookup/{credential_value}",
    response_model=AttendeeCredentialPublic,
    dependencies=[Depends(require_scanner_permission)],
)
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


@router.get("/public/{credential_value}", response_model=PublicCredentialLookup)
def public_lookup_credential(session: SessionDep, credential_value: str) -> Any:
    credential = session.exec(
        select(AttendeeCredential).where(
            col(AttendeeCredential.credential_value) == credential_value,
            col(AttendeeCredential.is_active).is_(True),
        )
    ).first()
    if not credential:
        raise HTTPException(status_code=404, detail="Credential not found")
    attendee = session.get(Attendee, credential.attendee_id)
    if not attendee:
        raise HTTPException(status_code=404, detail="Attendee not found")
    person = session.get(Person, attendee.person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    student = session.exec(
        select(Student).where(col(Student.person_id) == person.id)
    ).first()
    section = (
        session.get(AcademicSection, student.section_id)
        if student and student.section_id
        else None
    )
    return PublicCredentialLookup(
        attendee_id=attendee.id,
        attendee_type=attendee.attendee_type,
        person_name=" ".join(
            p
            for p in [
                person.first_name,
                person.middle_name,
                person.last_name,
                person.name_extension,
            ]
            if p
        ),
        student_number=student.student_number if student else None,
        section_name=section.section_name if section else None,
    )


@router.get(
    "/{credential_id}",
    response_model=AttendeeCredentialPublic,
    dependencies=[Depends(require_admin)],
)
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
    if credential.credential_type == CredentialType.nfc:
        if update_dict.get("is_active") is False:
            raise HTTPException(
                status_code=400,
                detail="Registered Card UIDs must remain active.",
            )
        if update_dict.get("credential_type", CredentialType.nfc) != CredentialType.nfc:
            raise HTTPException(
                status_code=400,
                detail="A registered Card UID cannot be changed to another credential type.",
            )
        if (
            "attendee_id" in update_dict
            and update_dict["attendee_id"] != credential.attendee_id
        ):
            raise HTTPException(
                status_code=400,
                detail="A registered Card UID cannot be reassigned to another student.",
            )

    target_credential_type = update_dict.get(
        "credential_type", credential.credential_type
    )
    target_attendee_id = update_dict.get("attendee_id", credential.attendee_id)
    if target_credential_type == CredentialType.nfc:
        existing_nfc = session.exec(
            select(AttendeeCredential).where(
                AttendeeCredential.attendee_id == target_attendee_id,
                AttendeeCredential.credential_type == CredentialType.nfc,
                col(AttendeeCredential.id) != credential_id,
            )
        ).first()
        if existing_nfc:
            raise HTTPException(
                status_code=409,
                detail="This student already has a registered Card UID.",
            )

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
