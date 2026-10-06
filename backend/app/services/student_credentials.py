"""Student credential provisioning.

Every operational student receives one stable QR credential through this
service. Re-importing a student reuses the existing active credential.
"""

import secrets

from sqlmodel import Session, col, select

from app.models import (
    Attendee,
    AttendeeCredential,
    AttendeeType,
    CredentialType,
    Student,
)


def ensure_student_qr_credential(
    session: Session,
    student: Student,
) -> AttendeeCredential:
    """Ensure a student has an active QR credential and return it.

    The credential is stable for the lifetime of the attendee. If an
    inactive QR credential already exists, it is reactivated instead of
    generating a replacement.
    """
    attendee = session.exec(
        select(Attendee).where(col(Attendee.person_id) == student.person_id)
    ).first()

    if attendee is None:
        attendee = Attendee(
            person_id=student.person_id,
            attendee_type=AttendeeType.student,
        )
        session.add(attendee)
        session.flush()

    credential = session.exec(
        select(AttendeeCredential)
        .where(
            col(AttendeeCredential.attendee_id) == attendee.id,
            col(AttendeeCredential.credential_type) == CredentialType.qr,
        )
        .order_by(col(AttendeeCredential.created_at).asc())
    ).first()

    if credential is not None:
        if not credential.is_active:
            credential.is_active = True
            session.add(credential)
            session.flush()
        return credential

    credential = AttendeeCredential(
        attendee_id=attendee.id,
        credential_type=CredentialType.qr,
        credential_value=_new_qr_value(session),
        is_active=True,
    )
    session.add(credential)
    session.flush()
    return credential


def _new_qr_value(session: Session) -> str:
    """Generate a short opaque QR credential with collision protection."""
    while True:
        value = f"QR-{secrets.token_hex(12).upper()}"
        existing = session.exec(
            select(AttendeeCredential.id).where(
                col(AttendeeCredential.credential_value) == value
            )
        ).first()
        if existing is None:
            return value
