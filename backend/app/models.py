import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Optional

from pydantic import EmailStr
from sqlalchemy import JSON, Column, DateTime, Enum as SQLAlchemyEnum, Index, UniqueConstraint, event, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Mapper
from sqlmodel import Field, Relationship, SQLModel


def get_datetime_utc() -> datetime:
    return datetime.now(UTC)


# ===========================================================================
# Template Authentication Models (Preserved & Extended with RBAC)
# ===========================================================================


class UserRole(StrEnum):
    super_admin = "super_admin"
    admin = "admin"
    class_representative = "class_representative"
    student = "student"


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    is_developer: bool = Field(
        default=False,
        description="Technical developer dashboard access, independent of application role",
    )
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
    first_name: str | None = Field(default=None, max_length=255)
    middle_name: str | None = Field(default=None, max_length=255)
    last_name: str | None = Field(default=None, max_length=255)
    name_extension: str | None = Field(default=None, max_length=50)
    must_change_password: bool = Field(default=False)


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
    is_developer: bool | None = None
    role: UserRole | None = None
    can_scan: bool | None = None
    full_name: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    first_name: str | None = Field(default=None, max_length=255)
    middle_name: str | None = Field(default=None, max_length=255)
    last_name: str | None = Field(default=None, max_length=255)
    name_extension: str | None = Field(default=None, max_length=50)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


# Database model, database table inferred from class name: 'user'
class User(UserBase, table=True):
    __tablename__ = "user"

    reference_code: str | None = Field(
        default=None,
        unique=True,
        index=True,
        max_length=20,
        sa_column_kwargs={"server_default": text("'USR-' || LPAD(nextval('user_reference_code_seq'::regclass)::text, 6, '0')")},
    )
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class UserPublic(UserBase):
    reference_code: str | None = None
    id: uuid.UUID
    created_at: datetime | None = None


class UsersPublic(SQLModel):
    data: list[UserPublic]
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


class AttendanceSessionType(StrEnum):
    time_in = "TIME_IN"
    time_out = "TIME_OUT"
    custom = "CUSTOM"


class AttendanceSessionStatus(StrEnum):
    scheduled = "SCHEDULED"
    open = "OPEN"
    closed = "CLOSED"
    cancelled = "CANCELLED"


class AttendanceResultCode(StrEnum):
    success = "SUCCESS"
    duplicate = "DUPLICATE"
    not_found = "NOT_FOUND"
    not_registered = "NOT_REGISTERED"
    session_closed = "SESSION_CLOSED"
    invalid_credential = "INVALID_CREDENTIAL"
    offline_queued = "OFFLINE_QUEUED"
    sync_pending = "SYNC_PENDING"
    rejected = "REJECTED"
    retry = "RETRY"
    error = "ERROR"


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


class AcademicStatus(StrEnum):
    regular = "regular"
    irregular = "irregular"


class ImportValidationStatus(StrEnum):
    pending = "pending"
    valid = "valid"
    invalid = "invalid"
    conflict_cross_program = "conflict_cross_program"
    resolved = "resolved"


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

    reference_code: str | None = Field(
        default=None,
        unique=True,
        index=True,
        max_length=20,
        sa_column_kwargs={"server_default": text("'ORG-' || LPAD(nextval('organization_reference_code_seq'::regclass)::text, 6, '0')")},
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

    events: list["Event"] = Relationship(back_populates="organization")


class OrganizationPublic(OrganizationBase):
    reference_code: str | None = None
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

    reference_code: str | None = Field(
        default=None,
        unique=True,
        index=True,
        max_length=20,
        sa_column_kwargs={"server_default": text("'PRG-' || LPAD(nextval('academic_program_reference_code_seq'::regclass)::text, 6, '0')")},
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

    sections: list["AcademicSection"] = Relationship(
        back_populates="program", cascade_delete=True
    )


class AcademicProgramPublic(AcademicProgramBase):
    reference_code: str | None = None
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
    academic_year_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="academic_years.id",
        index=True,
        nullable=True,
        ondelete="RESTRICT",
    )
    section_code: str | None = Field(default=None, max_length=50)


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

    reference_code: str | None = Field(
        default=None,
        unique=True,
        index=True,
        max_length=20,
        sa_column_kwargs={"server_default": text("'SEC-' || LPAD(nextval('academic_section_reference_code_seq'::regclass)::text, 6, '0')")},
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
    students: list["Student"] = Relationship(back_populates="section")


@event.listens_for(AcademicSection, "before_insert")
def _set_academic_section_code_before_insert(
    mapper: Mapper[AcademicSection],
    connection: Connection,
    target: AcademicSection,
) -> None:
    """Keep the required database code populated for all creation paths."""
    if not target.section_code:
        target.section_code = target.section_name


@event.listens_for(AcademicSection, "before_update")
def _set_academic_section_code_before_update(
    mapper: Mapper[AcademicSection],
    connection: Connection,
    target: AcademicSection,
) -> None:
    """Backfill section codes for legacy objects updated through the ORM."""
    if not target.section_code:
        target.section_code = target.section_name


class AcademicSectionPublic(AcademicSectionBase):
    reference_code: str | None = None
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
    academic_status: AcademicStatus | None = Field(default=None)


class StudentCreate(StudentBase):
    pass


class StudentUpdate(SQLModel):
    person_id: uuid.UUID | None = None
    student_number: str | None = Field(default=None, max_length=50)
    section_id: uuid.UUID | None = None
    academic_status: AcademicStatus | None = None


class Student(StudentBase, table=True):
    __tablename__ = "students"

    reference_code: str | None = Field(
        default=None,
        unique=True,
        index=True,
        max_length=20,
        sa_column_kwargs={"server_default": text("'STU-' || LPAD(nextval('student_reference_code_seq'::regclass)::text, 6, '0')")},
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
    archived_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))  # type: ignore

    person: Person | None = Relationship(back_populates="student")
    section: AcademicSection | None = Relationship(back_populates="students")
    guardian_relationships: list["AttendeeRelationship"] = Relationship(
        back_populates="related_student", cascade_delete=True
    )


class StudentPublic(StudentBase):
    reference_code: str | None = None
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
    credentials: list["AttendeeCredential"] = Relationship(
        back_populates="attendee", cascade_delete=True
    )
    relationships: list["AttendeeRelationship"] = Relationship(
        back_populates="attendee", cascade_delete=True
    )
    registrations: list["EventRegistration"] = Relationship(
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
    academic_year_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="academic_years.id",
        index=True,
        nullable=True,
        ondelete="RESTRICT",
    )
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


class AttendanceSessionBase(SQLModel):
    event_id: uuid.UUID = Field(
        foreign_key="events.id", nullable=False, ondelete="CASCADE"
    )
    session_date: str = Field(max_length=20)
    name: str = Field(max_length=255)
    session_type: AttendanceSessionType = Field(
        default=AttendanceSessionType.time_in,
        sa_column=Column(
            SQLAlchemyEnum(
                AttendanceSessionType,
                name="attendancesessiontype",
                values_callable=lambda enum_cls: [member.value for member in enum_cls],
            ),
            nullable=False,
            server_default=text("'TIME_IN'"),
        ),
    )
    start_time: str | None = Field(default=None, max_length=10)
    end_time: str | None = Field(default=None, max_length=10)
    late_cutoff: str | None = Field(default=None, max_length=10)
    status: AttendanceSessionStatus = Field(
        default=AttendanceSessionStatus.scheduled,
        sa_column=Column(
            SQLAlchemyEnum(
                AttendanceSessionStatus,
                name="attendancesessionstatus",
                values_callable=lambda enum_cls: [member.value for member in enum_cls],
            ),
            nullable=False,
            server_default=text("'SCHEDULED'"),
        ),
    )
    display_order: int = Field(default=0)
    is_active: bool = Field(default=False)


class AttendanceSessionCreate(AttendanceSessionBase):
    pass


class AttendanceSessionUpdate(SQLModel):
    session_date: str | None = Field(default=None, max_length=20)
    name: str | None = Field(default=None, max_length=255)
    session_type: AttendanceSessionType | None = None
    start_time: str | None = Field(default=None, max_length=10)
    end_time: str | None = Field(default=None, max_length=10)
    late_cutoff: str | None = Field(default=None, max_length=10)
    status: AttendanceSessionStatus | None = None
    display_order: int | None = None


class AttendanceSession(AttendanceSessionBase, table=True):
    __tablename__ = "attendance_sessions"
    __table_args__ = (
        Index(
            "uq_attendance_sessions_active_event",
            "event_id",
            unique=True,
            postgresql_where=text("is_active = true"),
        ),
    )

    reference_code: str | None = Field(
        default=None,
        unique=True,
        index=True,
        max_length=20,
        sa_column_kwargs={"server_default": text("'SES-' || LPAD(nextval('attendance_session_reference_code_seq'::regclass)::text, 6, '0')")},
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

    event: Optional["Event"] = Relationship(back_populates="attendance_sessions")  # noqa: UP045
    attendance_records: list["Attendance"] = Relationship(
        back_populates="attendance_session", cascade_delete=True
    )


class AttendanceSessionPublic(AttendanceSessionBase):
    reference_code: str | None = None
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AttendanceSessionsPublic(SQLModel):
    data: list[AttendanceSessionPublic]
    count: int


class Event(EventBase, table=True):
    __tablename__ = "events"

    reference_code: str | None = Field(
        default=None,
        unique=True,
        index=True,
        max_length=20,
        sa_column_kwargs={"server_default": text("'EVT-' || LPAD(nextval('event_reference_code_seq'::regclass)::text, 6, '0')")},
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

    organization: Organization | None = Relationship(back_populates="events")
    registrations: list["EventRegistration"] = Relationship(
        back_populates="event", cascade_delete=True
    )
    attendance_sessions: list["AttendanceSession"] = Relationship(
        back_populates="event", cascade_delete=True
    )


class EventPublic(EventBase):
    reference_code: str | None = None
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
    attendance: list["Attendance"] = Relationship(  # noqa: UP037, UP045
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
    attendance_session_id: uuid.UUID | None = None
    attendance_status: AttendanceStatus | None = None
    time_in: datetime | None = None
    time_out: datetime | None = None
    is_late: bool = False
    scan_method: ScanMethod | None = None


class RostersPublic(SQLModel):
    data: list[RosterEntry]
    count: int


# ===========================================================================
# 11. Attendance
# ===========================================================================


class AttendanceBase(SQLModel):
    academic_year_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="academic_years.id",
        index=True,
        nullable=True,
        ondelete="RESTRICT",
    )
    registration_id: uuid.UUID = Field(
        foreign_key="event_registrations.id",
        index=True,
        nullable=False,
        ondelete="CASCADE",
    )
    attendance_session_id: uuid.UUID = Field(
        foreign_key="attendance_sessions.id",
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
    is_late: bool = Field(default=False)
    scanned_by: uuid.UUID | None = Field(
        default=None,
        foreign_key="user.id",
        nullable=True,
        ondelete="SET NULL",
    )


class AttendanceCreate(SQLModel):
    registration_id: uuid.UUID
    attendance_session_id: uuid.UUID | None = None
    time_in: datetime | None = None
    time_out: datetime | None = None
    status: AttendanceStatus | None = None
    scan_method: ScanMethod = ScanMethod.nfc
    scanned_by: uuid.UUID | None = None


class AttendanceUpdate(SQLModel):
    attendance_session_id: uuid.UUID | None = None
    time_in: datetime | None = None
    time_out: datetime | None = None
    status: AttendanceStatus | None = None
    scan_method: ScanMethod | None = None


class Attendance(AttendanceBase, table=True):
    __tablename__ = "attendance"
    __table_args__ = (
        UniqueConstraint(
            "registration_id",
            "attendance_session_id",
            name="uq_attendance_registration_session",
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

    registration: EventRegistration | None = Relationship(back_populates="attendance")
    attendance_session: AttendanceSession | None = Relationship(
        back_populates="attendance_records"
    )
    corrections: list["AttendanceCorrection"] = Relationship(
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
    attendance_session_id: uuid.UUID | None = None


class ScanResponse(SQLModel):
    message: str
    result_code: AttendanceResultCode = AttendanceResultCode.success
    attendance: AttendancePublic
    attendee_id: uuid.UUID
    person_name: str | None = None
    student_number: str | None = None
    attendance_session_id: uuid.UUID | None = None


class ManualScanRequest(SQLModel):
    event_id: uuid.UUID
    attendee_id: uuid.UUID
    scan_method: ScanMethod = ScanMethod.manual
    attendance_session_id: uuid.UUID | None = None


# ===========================================================================
# 12. Attendance Correction (Audit Trail)
# ===========================================================================


class PublicCredentialLookup(SQLModel):
    attendee_id: uuid.UUID
    attendee_type: AttendeeType
    person_name: str
    student_number: str | None = None
    section_name: str | None = None


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


class AttendanceCorrectionCreate(SQLModel):
    attendance_id: uuid.UUID
    reason: str = Field(max_length=500)
    new_time_in: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))  # type: ignore
    new_time_out: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))  # type: ignore
    new_status: AttendanceStatus | None = None
    # Legacy clients may still send these fields. The server derives the actual old values.
    old_time_in: datetime | None = None
    old_time_out: datetime | None = None
    old_status: AttendanceStatus | None = None


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


# ===========================================================================
# 13. Student Import Staging (Masterlist Import Foundation)
# ===========================================================================


class ImportBatchStatus(StrEnum):
    pending = "pending"
    validated = "validated"
    promoted = "promoted"
    cancelled = "cancelled"


class ImportBatchBase(SQLModel):
    source_filename: str = Field(max_length=255)
    academic_year: str | None = Field(default=None, max_length=50)
    default_section_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="academic_sections.id",
        nullable=True,
        ondelete="SET NULL",
    )
    semester: str | None = Field(default=None, max_length=50)
    imported_by: uuid.UUID | None = Field(
        default=None,
        foreign_key="user.id",
        nullable=True,
        ondelete="SET NULL",
    )
    status: ImportBatchStatus = Field(default=ImportBatchStatus.pending)
    notes: str | None = Field(default=None, max_length=2000)
    validation_summary: dict | None = Field(default=None, sa_column=Column(JSON, nullable=True))


class ImportBatchCreate(ImportBatchBase):
    pass


class ImportBatchUpdate(SQLModel):
    source_filename: str | None = Field(default=None, max_length=255)
    academic_year: str | None = Field(default=None, max_length=50)
    default_section_id: uuid.UUID | None = None
    semester: str | None = Field(default=None, max_length=50)
    imported_by: uuid.UUID | None = None
    status: ImportBatchStatus | None = None
    notes: str | None = Field(default=None, max_length=2000)
    validation_summary: dict | None = Field(default=None, sa_column=Column(JSON, nullable=True))


class ImportBatchPublic(ImportBatchBase):
    id: uuid.UUID
    imported_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    validation_summary: dict | None = None


class ImportBatchesPublic(SQLModel):
    data: list[ImportBatchPublic]
    count: int


class ImportBatch(ImportBatchBase, table=True):
    __tablename__ = "import_batches"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    imported_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    importer_user: User | None = Relationship()
    records: list["StudentImportRecord"] = Relationship(
        back_populates="import_batch", cascade_delete=True
    )


class StudentImportRecordBase(SQLModel):
    import_batch_id: uuid.UUID = Field(
        foreign_key="import_batches.id", nullable=False, ondelete="CASCADE"
    )
    source_sheet: str = Field(max_length=100)
    source_row: int
    source_no: int | None = Field(default=None)
    raw_student_number: str = Field(index=True, max_length=50)
    raw_last_name: str = Field(max_length=255)
    raw_first_name: str = Field(max_length=255)
    raw_middle_name: str | None = Field(default=None, max_length=255)
    raw_name_extension: str | None = Field(default=None, max_length=50)
    raw_section: str | None = Field(default=None, max_length=100)
    raw_mobile_number: str | None = Field(default=None, max_length=50)
    raw_email: str | None = Field(default=None, max_length=255)
    raw_subjects_enrolled: str | None = Field(default=None, max_length=4000)
    raw_status: str | None = Field(default=None, max_length=50)
    academic_status: AcademicStatus | None = Field(default=None)
    validation_status: ImportValidationStatus = Field(
        default=ImportValidationStatus.valid
    )
    validation_errors: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    conflict_key: str | None = Field(default=None, index=True, max_length=50)
    promoted_student_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="students.id",
        nullable=True,
        ondelete="SET NULL",
    )
    promoted_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class StudentImportRecordCreate(StudentImportRecordBase):
    pass


class StudentImportRecordUpdate(SQLModel):
    source_sheet: str | None = Field(default=None, max_length=100)
    source_row: int | None = None
    source_no: int | None = None
    raw_student_number: str | None = Field(default=None, max_length=50)
    raw_last_name: str | None = Field(default=None, max_length=255)
    raw_first_name: str | None = Field(default=None, max_length=255)
    raw_middle_name: str | None = Field(default=None, max_length=255)
    raw_name_extension: str | None = Field(default=None, max_length=50)
    raw_section: str | None = Field(default=None, max_length=100)
    raw_mobile_number: str | None = Field(default=None, max_length=50)
    raw_email: str | None = Field(default=None, max_length=255)
    raw_subjects_enrolled: str | None = Field(default=None, max_length=4000)
    raw_status: str | None = Field(default=None, max_length=50)
    academic_status: AcademicStatus | None = None
    validation_status: ImportValidationStatus | None = None
    validation_errors: list[str] | None = None
    conflict_key: str | None = Field(default=None, max_length=50)


class StudentImportRecordPublic(StudentImportRecordBase):
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None


class StudentImportRecordsPublic(SQLModel):
    data: list[StudentImportRecordPublic]
    count: int


class StudentImportRecord(StudentImportRecordBase, table=True):
    __tablename__ = "student_import_records"
    __table_args__ = (
        UniqueConstraint(
            "import_batch_id",
            "source_sheet",
            "source_row",
            name="uq_student_import_batch_sheet_row",
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

    import_batch: ImportBatch | None = Relationship(back_populates="records")


class AuditLog(SQLModel, table=True):
    """Minimal audit trail for authenticated API mutations.

    Request bodies, credentials, and response payloads are intentionally not stored.
    """

    __tablename__ = "audit_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    actor_user_id: uuid.UUID | None = Field(
        default=None, index=True, foreign_key="user.id"
    )
    action: str = Field(max_length=100, index=True)
    resource: str = Field(max_length=255, index=True)
    method: str = Field(max_length=10)
    path: str = Field(max_length=500)
    request_id: str | None = Field(default=None, max_length=64, index=True)
    status_code: int
    outcome: str = Field(max_length=20, index=True)
    duration_ms: float
    occurred_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
