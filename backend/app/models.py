from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Optional

from pydantic import EmailStr
from sqlalchemy import DateTime, Index, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


def get_datetime_utc() -> datetime:
    return datetime.now(UTC)


# ===========================================================================
# Template Authentication & Item Models (Preserved & Extended with RBAC)
# ===========================================================================


class UserRole(StrEnum):
    developer = "developer"
    super_admin = "super_admin"
    admin = "admin"
    class_representative = "class_representative"
    student = "student"


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    role: UserRole = Field(
        default=UserRole.student,
        max_length=50,
        description="Application RBAC role",
    )
    can_scan: bool = Field(
        default=False,
        description="Explicit attendance scanning permission",
    )
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on update, all are optional
class UserUpdate(SQLModel):
    email: EmailStr | None = Field(default=None, max_length=255)
    is_active: bool | None = None
    is_superuser: bool | None = None
    role: UserRole | None = None
    can_scan: bool | None = None
    full_name: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


# Database model, database table inferred from class name: 'user'
class User(UserBase, table=True):
    __tablename__ = "user"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    items: list[Item] = Relationship(back_populates="owner", cascade_delete=True)


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID
    created_at: datetime | None = None


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# Shared properties
class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


# Properties to receive on item creation
class ItemCreate(ItemBase):
    pass


# Properties to receive on item update
class ItemUpdate(SQLModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


# Database model, database table inferred from class name: 'item'
class Item(ItemBase, table=True):
    __tablename__ = "item"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: User | None = Relationship(back_populates="items")


# Properties to return via API, id is always required
class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime | None = None


class ItemsPublic(SQLModel):
    data: list[ItemPublic]
    count: int


# Generic message
class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(SQLModel):
    sub: str | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


# ===========================================================================
# Domain Enums (Normalized 3NF Model)
# ===========================================================================


class AttendeeType(StrEnum):
    student = "student"
    faculty = "faculty"
    staff = "staff"
    parent_guardian = "parent_guardian"
    guest = "guest"


class CredentialType(StrEnum):
    nfc = "nfc"
    qr = "qr"


class RelationshipType(StrEnum):
    mother = "mother"
    father = "father"
    guardian = "guardian"
    grandparent = "grandparent"
    sibling = "sibling"
    other = "other"


class AttendanceMode(StrEnum):
    time_in_only = "time_in_only"
    time_in_time_out = "time_in_time_out"


class EventStatus(StrEnum):
    draft = "draft"
    open = "open"
    closed = "closed"


class RegistrationStatus(StrEnum):
    registered = "registered"
    cancelled = "cancelled"


class ScanMethod(StrEnum):
    nfc = "nfc"
    qr = "qr"
    manual = "manual"


class AttendanceStatus(StrEnum):
    present = "present"
    time_in_only = "time_in_only"
    completed = "completed"
    incomplete = "incomplete"


# ===========================================================================
# 1. Organization
# ===========================================================================


class OrganizationBase(SQLModel):
    name: str = Field(unique=True, index=True, max_length=255)
    description: str | None = Field(default=None, max_length=500)


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationUpdate(SQLModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=500)


class Organization(OrganizationBase, table=True):
    __tablename__ = "organizations"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    events: list[Event] = Relationship(back_populates="organization")


class OrganizationPublic(OrganizationBase):
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None


class OrganizationsPublic(SQLModel):
    data: list[OrganizationPublic]
    count: int


# ===========================================================================
# 2. Academic Program
# ===========================================================================


class AcademicProgramBase(SQLModel):
    program_code: str = Field(unique=True, index=True, max_length=50)
    program_name: str = Field(max_length=255)


class AcademicProgramCreate(AcademicProgramBase):
    pass


class AcademicProgramUpdate(SQLModel):
    program_code: str | None = Field(default=None, max_length=50)
    program_name: str | None = Field(default=None, max_length=255)


class AcademicProgram(AcademicProgramBase, table=True):
    __tablename__ = "academic_programs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    sections: list[AcademicSection] = Relationship(
        back_populates="program", cascade_delete=True
    )


class AcademicProgramPublic(AcademicProgramBase):
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AcademicProgramsPublic(SQLModel):
    data: list[AcademicProgramPublic]
    count: int


# ===========================================================================
# 3. Academic Section
# ===========================================================================


class AcademicSectionBase(SQLModel):
    program_id: uuid.UUID = Field(
        foreign_key="academic_programs.id", nullable=False, ondelete="RESTRICT"
    )
    year_level: str = Field(max_length=20)
    section_name: str = Field(max_length=50)
    academic_year: str = Field(max_length=50)


class AcademicSectionCreate(AcademicSectionBase):
    pass


class AcademicSectionUpdate(SQLModel):
    program_id: uuid.UUID | None = None
    year_level: str | None = Field(default=None, max_length=20)
    section_name: str | None = Field(default=None, max_length=50)
    academic_year: str | None = Field(default=None, max_length=50)


class AcademicSection(AcademicSectionBase, table=True):
    __tablename__ = "academic_sections"
    __table_args__ = (
        UniqueConstraint(
            "program_id",
            "year_level",
            "section_name",
            "academic_year",
            name="uq_academic_section_program_year_name_ay",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    program: AcademicProgram | None = Relationship(back_populates="sections")
    students: list[Student] = Relationship(back_populates="section")


class AcademicSectionPublic(AcademicSectionBase):
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AcademicSectionsPublic(SQLModel):
    data: list[AcademicSectionPublic]
    count: int


# ===========================================================================
# 4. Person
# ===========================================================================


class PersonBase(SQLModel):
    first_name: str = Field(max_length=255)
    middle_name: str | None = Field(default=None, max_length=255)
    last_name: str = Field(max_length=255)
    name_extension: str | None = Field(default=None, max_length=50)
    contact_number: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=255)


class PersonCreate(PersonBase):
    pass


class PersonUpdate(SQLModel):
    first_name: str | None = Field(default=None, max_length=255)
    middle_name: str | None = Field(default=None, max_length=255)
    last_name: str | None = Field(default=None, max_length=255)
    name_extension: str | None = Field(default=None, max_length=50)
    contact_number: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=255)


class Person(PersonBase, table=True):
    __tablename__ = "people"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    student: Optional["Student"] = Relationship(  # noqa: UP037, UP045
        back_populates="person", cascade_delete=True
    )
    attendee: Optional["Attendee"] = Relationship(  # noqa: UP037, UP045
        back_populates="person", cascade_delete=True
    )


class PersonPublic(PersonBase):
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PeoplePublic(SQLModel):
    data: list[PersonPublic]
    count: int


# ===========================================================================
# 5. Student
# ===========================================================================


class StudentBase(SQLModel):
    person_id: uuid.UUID = Field(
        foreign_key="people.id",
        unique=True,
        index=True,
        nullable=False,
        ondelete="CASCADE",
    )
    student_number: str = Field(unique=True, index=True, max_length=50)
    section_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="academic_sections.id",
        nullable=True,
        ondelete="SET NULL",
    )


class StudentCreate(StudentBase):
    pass


class StudentUpdate(SQLModel):
    person_id: uuid.UUID | None = None
    student_number: str | None = Field(default=None, max_length=50)
    section_id: uuid.UUID | None = None


class Student(StudentBase, table=True):
    __tablename__ = "students"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    person: Person | None = Relationship(back_populates="student")
    section: AcademicSection | None = Relationship(back_populates="students")
    guardian_relationships: list[AttendeeRelationship] = Relationship(
        back_populates="related_student", cascade_delete=True
    )


class StudentPublic(StudentBase):
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None
    person_name: str | None = None
    attendee_id: uuid.UUID | None = None


class StudentsPublic(SQLModel):
    data: list[StudentPublic]
    count: int


# ===========================================================================
# 6. Attendee
# ===========================================================================


class AttendeeBase(SQLModel):
    person_id: uuid.UUID = Field(
        foreign_key="people.id",
        unique=True,
        index=True,
        nullable=False,
        ondelete="CASCADE",
    )
    attendee_type: AttendeeType = Field(default=AttendeeType.student)


class AttendeeCreate(AttendeeBase):
    pass


class AttendeeUpdate(SQLModel):
    person_id: uuid.UUID | None = None
    attendee_type: AttendeeType | None = None


class Attendee(AttendeeBase, table=True):
    __tablename__ = "attendees"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    person: Person | None = Relationship(back_populates="attendee")
    credentials: list[AttendeeCredential] = Relationship(
        back_populates="attendee", cascade_delete=True
    )
    relationships: list[AttendeeRelationship] = Relationship(
        back_populates="attendee", cascade_delete=True
    )
    registrations: list[EventRegistration] = Relationship(
        back_populates="attendee", cascade_delete=True
    )


class AttendeePublic(AttendeeBase):
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AttendeesPublic(SQLModel):
    data: list[AttendeePublic]
    count: int


# ===========================================================================
# 7. Attendee Credential (NFC / QR)
# ===========================================================================


class AttendeeCredentialBase(SQLModel):
    attendee_id: uuid.UUID = Field(
        foreign_key="attendees.id", nullable=False, ondelete="CASCADE"
    )
    credential_type: CredentialType = Field(default=CredentialType.nfc)
    credential_value: str = Field(unique=True, index=True, max_length=255)
    is_active: bool = Field(default=True)


class AttendeeCredentialCreate(AttendeeCredentialBase):
    pass


class AttendeeCredentialUpdate(SQLModel):
    attendee_id: uuid.UUID | None = None
    credential_type: CredentialType | None = None
    credential_value: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None


class AttendeeCredential(AttendeeCredentialBase, table=True):
    __tablename__ = "attendee_credentials"
    __table_args__ = (
        Index(
            "ix_attendee_credentials_credential_type_credential_value",
            "credential_type",
            "credential_value",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    attendee: Attendee | None = Relationship(back_populates="credentials")


class AttendeeCredentialPublic(AttendeeCredentialBase):
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AttendeeCredentialsPublic(SQLModel):
    data: list[AttendeeCredentialPublic]
    count: int


# ===========================================================================
# 8. Attendee Relationship (Parent/Guardian to Student)
# ===========================================================================


class AttendeeRelationshipBase(SQLModel):
    attendee_id: uuid.UUID = Field(
        foreign_key="attendees.id", nullable=False, ondelete="CASCADE"
    )
    related_student_id: uuid.UUID = Field(
        foreign_key="students.id", nullable=False, ondelete="CASCADE"
    )
    relationship_type: RelationshipType = Field(default=RelationshipType.guardian)


class AttendeeRelationshipCreate(AttendeeRelationshipBase):
    pass


class AttendeeRelationshipUpdate(SQLModel):
    attendee_id: uuid.UUID | None = None
    related_student_id: uuid.UUID | None = None
    relationship_type: RelationshipType | None = None


class AttendeeRelationship(AttendeeRelationshipBase, table=True):
    __tablename__ = "attendee_relationships"
    __table_args__ = (
        UniqueConstraint(
            "attendee_id",
            "related_student_id",
            name="uq_attendee_student_relationship",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    attendee: Attendee | None = Relationship(back_populates="relationships")
    related_student: Student | None = Relationship(
        back_populates="guardian_relationships"
    )


class AttendeeRelationshipPublic(AttendeeRelationshipBase):
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AttendeeRelationshipsPublic(SQLModel):
    data: list[AttendeeRelationshipPublic]
    count: int


# ===========================================================================
# 9. Event
# ===========================================================================


class EventBase(SQLModel):
    event_name: str = Field(index=True, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    event_date: str = Field(max_length=20)
    start_time: str | None = Field(default=None, max_length=10)
    end_time: str | None = Field(default=None, max_length=10)
    attendance_mode: AttendanceMode = Field(default=AttendanceMode.time_in_only)
    organization_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="organizations.id",
        nullable=True,
        ondelete="SET NULL",
    )
    status: EventStatus = Field(default=EventStatus.draft)


class EventCreate(EventBase):
    pass


class EventUpdate(SQLModel):
    event_name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    event_date: str | None = Field(default=None, max_length=20)
    start_time: str | None = Field(default=None, max_length=10)
    end_time: str | None = Field(default=None, max_length=10)
    attendance_mode: AttendanceMode | None = None
    organization_id: uuid.UUID | None = None
    status: EventStatus | None = None


class Event(EventBase, table=True):
    __tablename__ = "events"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    organization: Organization | None = Relationship(back_populates="events")
    registrations: list[EventRegistration] = Relationship(
        back_populates="event", cascade_delete=True
    )


class EventPublic(EventBase):
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None


class EventsPublic(SQLModel):
    data: list[EventPublic]
    count: int


# ===========================================================================
# 10. Event Registration
# ===========================================================================


class EventRegistrationBase(SQLModel):
    event_id: uuid.UUID = Field(
        foreign_key="events.id", nullable=False, ondelete="CASCADE"
    )
    attendee_id: uuid.UUID = Field(
        foreign_key="attendees.id", nullable=False, ondelete="CASCADE"
    )
    registration_status: RegistrationStatus = Field(
        default=RegistrationStatus.registered
    )
    registered_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class EventRegistrationCreate(EventRegistrationBase):
    pass


class EventRegistrationUpdate(SQLModel):
    event_id: uuid.UUID | None = None
    attendee_id: uuid.UUID | None = None
    registration_status: RegistrationStatus | None = None


class EventRegistration(EventRegistrationBase, table=True):
    __tablename__ = "event_registrations"
    __table_args__ = (
        UniqueConstraint(
            "event_id", "attendee_id", name="uq_event_attendee_registration"
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    event: Optional["Event"] = Relationship(back_populates="registrations")  # noqa: UP037, UP045
    attendee: Optional["Attendee"] = Relationship(back_populates="registrations")  # noqa: UP037, UP045
    attendance: Optional["Attendance"] = Relationship(  # noqa: UP037, UP045
        back_populates="registration", cascade_delete=True
    )


class EventRegistrationPublic(EventRegistrationBase):
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None


class EventRegistrationsPublic(SQLModel):
    data: list[EventRegistrationPublic]
    count: int


class RosterCredential(SQLModel):
    credential_type: CredentialType
    credential_value: str
    is_active: bool


class RosterEntry(SQLModel):
    event_id: uuid.UUID
    attendee_id: uuid.UUID
    registration_status: RegistrationStatus
    person_name: str
    student_number: str | None = None
    credentials: list[RosterCredential] = Field(default_factory=list)


class RostersPublic(SQLModel):
    data: list[RosterEntry]
    count: int


# ===========================================================================
# 11. Attendance
# ===========================================================================


class AttendanceBase(SQLModel):
    registration_id: uuid.UUID = Field(
        foreign_key="event_registrations.id",
        unique=True,
        index=True,
        nullable=False,
        ondelete="CASCADE",
    )
    time_in: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    time_out: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    status: AttendanceStatus = Field(default=AttendanceStatus.present)
    scan_method: ScanMethod = Field(default=ScanMethod.nfc)
    scanned_by: uuid.UUID | None = Field(
        default=None,
        foreign_key="user.id",
        nullable=True,
        ondelete="SET NULL",
    )


class AttendanceCreate(SQLModel):
    registration_id: uuid.UUID
    time_in: datetime | None = None
    time_out: datetime | None = None
    status: AttendanceStatus | None = None
    scan_method: ScanMethod = ScanMethod.nfc
    scanned_by: uuid.UUID | None = None


class AttendanceUpdate(SQLModel):
    time_in: datetime | None = None
    time_out: datetime | None = None
    status: AttendanceStatus | None = None
    scan_method: ScanMethod | None = None


class Attendance(AttendanceBase, table=True):
    __tablename__ = "attendance"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    registration: EventRegistration | None = Relationship(back_populates="attendance")
    corrections: list[AttendanceCorrection] = Relationship(
        back_populates="attendance", cascade_delete=True
    )
    scanner_user: User | None = Relationship()


class AttendancePublic(AttendanceBase):
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AttendancesPublic(SQLModel):
    data: list[AttendancePublic]
    count: int


class ScanRequest(SQLModel):
    event_id: uuid.UUID
    credential_value: str
    scan_method: ScanMethod = ScanMethod.nfc


class ScanResponse(SQLModel):
    message: str
    attendance: AttendancePublic
    attendee_id: uuid.UUID
    person_name: str | None = None
    student_number: str | None = None


class ManualScanRequest(SQLModel):
    event_id: uuid.UUID
    attendee_id: uuid.UUID
    scan_method: ScanMethod = ScanMethod.manual


# ===========================================================================
# 12. Attendance Correction (Audit Trail)
# ===========================================================================


class AttendanceCorrectionBase(SQLModel):
    attendance_id: uuid.UUID = Field(
        foreign_key="attendance.id", nullable=False, ondelete="CASCADE"
    )
    corrected_by: uuid.UUID | None = Field(
        default=None,
        foreign_key="user.id",
        nullable=True,
        ondelete="RESTRICT",
    )
    reason: str = Field(max_length=500)
    old_time_in: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    new_time_in: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    old_time_out: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    new_time_out: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    old_status: AttendanceStatus | None = None
    new_status: AttendanceStatus | None = None
    corrected_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class AttendanceCorrectionCreate(AttendanceCorrectionBase):
    pass


class AttendanceCorrection(AttendanceCorrectionBase, table=True):
    __tablename__ = "attendance_corrections"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)

    attendance: Attendance | None = Relationship(back_populates="corrections")
    corrector_user: User | None = Relationship()


class AttendanceCorrectionPublic(AttendanceCorrectionBase):
    id: uuid.UUID


class AttendanceCorrectionsPublic(SQLModel):
    data: list[AttendanceCorrectionPublic]
    count: int
