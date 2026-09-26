import uuid
from datetime import datetime
from enum import StrEnum

from sqlmodel import Field, SQLModel

from app.models import get_datetime_utc


class AcademicMajorCode(StrEnum):
    AMG = "AMG"
    SMP = "SMP"
    WMAD = "WMAD"
    IS = "IS"


class AcademicMajorBase(SQLModel):
    program_id: uuid.UUID = Field(
        foreign_key="academic_programs.id", nullable=False, ondelete="CASCADE"
    )
    code: AcademicMajorCode = Field(max_length=20)
    name: str = Field(max_length=255)
    display_in_section_name: bool = True


class AcademicMajorCreate(AcademicMajorBase):
    pass


class AcademicMajorUpdate(SQLModel):
    program_id: uuid.UUID | None = None
    code: AcademicMajorCode | None = None
    name: str | None = Field(default=None, max_length=255)
    display_in_section_name: bool | None = None


class AcademicMajor(AcademicMajorBase, table=True):
    __tablename__ = "academic_majors"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(default_factory=get_datetime_utc)
    updated_at: datetime | None = Field(default_factory=get_datetime_utc)


class AcademicMajorPublic(AcademicMajorBase):
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AcademicMajorsPublic(SQLModel):
    data: list[AcademicMajorPublic]
    count: int


class AcademicSectionMajorBase(SQLModel):
    section_id: uuid.UUID = Field(
        foreign_key="academic_sections.id", nullable=False, ondelete="CASCADE", unique=True
    )
    major_id: uuid.UUID = Field(
        foreign_key="academic_majors.id", nullable=False, ondelete="RESTRICT"
    )


class AcademicSectionMajorCreate(AcademicSectionMajorBase):
    pass


class AcademicSectionMajorUpdate(SQLModel):
    major_id: uuid.UUID | None = None


class AcademicSectionMajor(AcademicSectionMajorBase, table=True):
    __tablename__ = "academic_section_majors"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(default_factory=get_datetime_utc)
    updated_at: datetime | None = Field(default_factory=get_datetime_utc)


class AcademicSectionMajorPublic(AcademicSectionMajorBase):
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None
    major: AcademicMajorPublic | None = None
