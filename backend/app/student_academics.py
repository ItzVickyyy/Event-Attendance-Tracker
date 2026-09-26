import uuid
from datetime import datetime
from enum import StrEnum

from sqlmodel import Field, SQLModel

from app.models import get_datetime_utc


class StudentStatus(StrEnum):
    regular = "regular"
    irregular = "irregular"
    inactive = "inactive"
    graduated = "graduated"
    transferred = "transferred"
    archived = "archived"


class AcademicYear(SQLModel, table=True):
    __tablename__ = "academic_years"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    label: str = Field(unique=True, index=True, max_length=20)
    start_year: int
    end_year: int
    is_current: bool = False
    created_at: datetime | None = Field(default_factory=get_datetime_utc)
    updated_at: datetime | None = Field(default_factory=get_datetime_utc)


class AcademicYearPublic(SQLModel):
    id: uuid.UUID
    label: str
    start_year: int
    end_year: int
    is_current: bool


class AcademicYearsPublic(SQLModel):
    data: list[AcademicYearPublic]
    count: int


class StudentEnrollment(SQLModel, table=True):
    __tablename__ = "student_enrollments"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    student_id: uuid.UUID = Field(foreign_key="students.id", index=True, ondelete="CASCADE")
    academic_year_id: uuid.UUID = Field(foreign_key="academic_years.id", index=True, ondelete="RESTRICT")
    section_id: uuid.UUID = Field(foreign_key="academic_sections.id", index=True, ondelete="RESTRICT")
    student_status: StudentStatus = Field(default=StudentStatus.regular, max_length=50)
    created_at: datetime | None = Field(default_factory=get_datetime_utc)
    updated_at: datetime | None = Field(default_factory=get_datetime_utc)


class StudentEnrollmentPublic(SQLModel):
    id: uuid.UUID
    student_id: uuid.UUID
    academic_year_id: uuid.UUID
    section_id: uuid.UUID
    student_status: StudentStatus
    created_at: datetime | None = None
    updated_at: datetime | None = None


class StudentEnrollmentCreate(SQLModel):
    student_id: uuid.UUID
    academic_year_id: uuid.UUID
    section_id: uuid.UUID
    student_status: StudentStatus = StudentStatus.regular


class StudentEnrollmentUpdate(SQLModel):
    section_id: uuid.UUID | None = None
    student_status: StudentStatus | None = None


class SectionRegistryRow(SQLModel):
    id: uuid.UUID
    program_id: uuid.UUID
    program_code: str
    program_name: str
    major_code: str | None = None
    major_name: str | None = None
    section_code: str
    year_level: str
    academic_year_id: uuid.UUID
    academic_year: str
    enrolled: int


class SectionRegistryPublic(SQLModel):
    data: list[SectionRegistryRow]
    count: int


class StudentRosterRow(SQLModel):
    id: uuid.UUID
    student_number: str
    last_name: str
    first_name: str
    middle_name: str | None = None
    extension: str | None = None
    email: str | None = None
    contact_number: str | None = None
    student_status: StudentStatus
    nfc_registered: bool = False
    qr_registered: bool = False
    enrollment_id: uuid.UUID


class StudentRosterPublic(SQLModel):
    data: list[StudentRosterRow]
    count: int
