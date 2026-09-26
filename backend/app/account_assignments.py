import uuid
from datetime import datetime
from enum import StrEnum

from sqlmodel import Field, SQLModel

from app.models import get_datetime_utc


class AssignmentStatus(StrEnum):
    active = "active"
    inactive = "inactive"


class OrganizationMembershipBase(SQLModel):
    user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    organization_id: uuid.UUID = Field(
        foreign_key="organizations.id", nullable=False, ondelete="CASCADE"
    )
    academic_year: str = Field(max_length=50)
    position: str = Field(max_length=255)
    status: AssignmentStatus = AssignmentStatus.active


class OrganizationMembership(OrganizationMembershipBase, table=True):
    __tablename__ = "organization_memberships"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(default_factory=get_datetime_utc)
    updated_at: datetime | None = Field(default_factory=get_datetime_utc)


class OrganizationMembershipPublic(OrganizationMembershipBase):
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None


class UserSectionAssignmentBase(SQLModel):
    user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    section_id: uuid.UUID = Field(
        foreign_key="academic_sections.id", nullable=False, ondelete="CASCADE"
    )
    academic_year: str = Field(max_length=50)
    status: AssignmentStatus = AssignmentStatus.active


class UserSectionAssignment(UserSectionAssignmentBase, table=True):
    __tablename__ = "user_section_assignments"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(default_factory=get_datetime_utc)
    updated_at: datetime | None = Field(default_factory=get_datetime_utc)


class UserSectionAssignmentPublic(UserSectionAssignmentBase):
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None
