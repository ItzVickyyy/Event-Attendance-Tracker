import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, col, select

from app.api.deps import SessionDep, require_scanner_permission
from app.models import (
    Attendee,
    AttendeeCredential,
    Event,
    EventRegistration,
    Person,
    RegistrationStatus,
    RosterCredential,
    RosterEntry,
    RostersPublic,
    Student,
)

router = APIRouter(
    prefix="/events/{event_id}/roster",
    tags=["events"],
    dependencies=[Depends(require_scanner_permission)],
)


@router.get("/", response_model=RostersPublic)
def read_event_roster(*, session: SessionDep, event_id: uuid.UUID) -> Any:
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    entries = _build_roster_entries(session=session, event_id=event.id)
    return RostersPublic(data=entries, count=len(entries))


def _build_roster_entries(session: Session, event_id: uuid.UUID) -> list[RosterEntry]:
    registrations = session.exec(
        select(EventRegistration).where(
            col(EventRegistration.event_id) == event_id,
            col(EventRegistration.registration_status) == RegistrationStatus.registered,
        )
    ).all()

    attendee_ids = {reg.attendee_id for reg in registrations}
    attendee_by_id: dict[uuid.UUID, Attendee] = {}
    person_by_id: dict[uuid.UUID, Person] = {}
    student_number_by_person_id: dict[uuid.UUID, str] = {}
    credentials_by_attendee_id: dict[uuid.UUID, list[RosterCredential]] = {}

    if attendee_ids:
        attendees = session.exec(
            select(Attendee).where(col(Attendee.id).in_(attendee_ids))
        ).all()
        attendee_by_id = {attendee.id: attendee for attendee in attendees}

        person_ids = {attendee.person_id for attendee in attendees}
        people = session.exec(
            select(Person).where(col(Person.id).in_(person_ids))
        ).all()
        person_by_id = {person.id: person for person in people}

        students = session.exec(
            select(Student).where(col(Student.person_id).in_(person_ids))
        ).all()
        student_number_by_person_id = {
            student.person_id: student.student_number for student in students
        }

        credentials = session.exec(
            select(AttendeeCredential).where(
                col(AttendeeCredential.attendee_id).in_(attendee_ids),
                col(AttendeeCredential.is_active).is_(True),
            )
        ).all()
        for credential in credentials:
            credentials_by_attendee_id.setdefault(credential.attendee_id, []).append(
                RosterCredential(
                    credential_type=credential.credential_type,
                    credential_value=credential.credential_value,
                    is_active=credential.is_active,
                )
            )

    entries: list[RosterEntry] = []
    for reg in registrations:
        attendee = attendee_by_id.get(reg.attendee_id)
        if not attendee:
            continue
        person = person_by_id.get(attendee.person_id)
        person_name = f"{person.first_name} {person.last_name}" if person else "Unknown"
        entries.append(
            RosterEntry(
                event_id=reg.event_id,
                attendee_id=reg.attendee_id,
                registration_status=reg.registration_status,
                person_name=person_name,
                student_number=student_number_by_person_id.get(attendee.person_id),
                credentials=credentials_by_attendee_id.get(reg.attendee_id, []),
            )
        )

    return entries
