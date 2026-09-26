import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app.account_assignments import (
    AssignmentStatus,
    UserSectionAssignment,
    UserSectionAssignmentBase,
    UserSectionAssignmentPublic,
)
from app.academic_catalog import (
    AcademicMajor,
    AcademicMajorPublic,
    AcademicMajorsPublic,
    AcademicSectionMajor,
    AcademicSectionMajorCreate,
    AcademicSectionMajorPublic,
    AcademicSectionMajorUpdate,
)
from app.api.deps import CurrentUser, SessionDep, require_admin, require_super_admin
from app.models import AcademicSection, User, UserRole

router = APIRouter(prefix="/academic-catalog", tags=["academic-catalog"])


@router.get("/majors", response_model=AcademicMajorsPublic)
def read_majors(
    session: SessionDep,
    _current_user: CurrentUser,
    program_id: uuid.UUID | None = None,
) -> Any:
    statement = select(AcademicMajor)
    count_statement = select(func.count()).select_from(AcademicMajor)
    if program_id:
        statement = statement.where(col(AcademicMajor.program_id) == program_id)
        count_statement = count_statement.where(col(AcademicMajor.program_id) == program_id)
    majors = session.exec(statement.order_by(col(AcademicMajor.code))).all()
    return AcademicMajorsPublic(
        data=[AcademicMajorPublic.model_validate(major) for major in majors],
        count=session.exec(count_statement).one(),
    )


@router.get("/sections/{section_id}/major", response_model=AcademicSectionMajorPublic | None)
def read_section_major(
    session: SessionDep, _current_user: CurrentUser, section_id: uuid.UUID
) -> Any:
    assignment = session.exec(
        select(AcademicSectionMajor).where(
            AcademicSectionMajor.section_id == section_id
        )
    ).first()
    if not assignment:
        return None
    major = session.get(AcademicMajor, assignment.major_id)
    return AcademicSectionMajorPublic(
        **assignment.model_dump(),
        major=AcademicMajorPublic.model_validate(major) if major else None,
    )


@router.put(
    "/sections/{section_id}/major",
    response_model=AcademicSectionMajorPublic,
    dependencies=[Depends(require_admin)],
)
def set_section_major(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    section_id: uuid.UUID,
    assignment_in: AcademicSectionMajorCreate,
) -> Any:
    if assignment_in.section_id != section_id:
        raise HTTPException(status_code=400, detail="Section ID does not match the path")
    section = session.get(AcademicSection, section_id)
    major = session.get(AcademicMajor, assignment_in.major_id)
    if not section or not major:
        raise HTTPException(status_code=404, detail="Section or major not found")
    if section.program_id != major.program_id:
        raise HTTPException(status_code=400, detail="Major does not belong to the section program")
    assignment = session.exec(
        select(AcademicSectionMajor).where(
            AcademicSectionMajor.section_id == section_id
        )
    ).first()
    if assignment:
        assignment.major_id = assignment_in.major_id
    else:
        assignment = AcademicSectionMajor.model_validate(assignment_in)
    session.add(assignment)
    session.commit()
    session.refresh(assignment)
    return AcademicSectionMajorPublic(
        **assignment.model_dump(), major=AcademicMajorPublic.model_validate(major)
    )


@router.delete(
    "/sections/{section_id}/major", dependencies=[Depends(require_admin)]
)
def clear_section_major(
    session: SessionDep, _current_user: CurrentUser, section_id: uuid.UUID
) -> dict[str, str]:
    assignment = session.exec(
        select(AcademicSectionMajor).where(
            AcademicSectionMajor.section_id == section_id
        )
    ).first()
    if assignment:
        session.delete(assignment)
        session.commit()
    return {"message": "Section major cleared successfully"}


@router.get(
    "/class-representatives",
    response_model=list[UserSectionAssignmentPublic],
    dependencies=[Depends(require_admin)],
)
def read_class_representatives(
    session: SessionDep,
    _current_user: CurrentUser,
    section_id: uuid.UUID | None = None,
    academic_year: str | None = None,
) -> list[UserSectionAssignmentPublic]:
    statement = select(UserSectionAssignment).join(User, User.id == UserSectionAssignment.user_id)
    statement = statement.where(User.role == UserRole.class_representative)
    if section_id:
        statement = statement.where(UserSectionAssignment.section_id == section_id)
    if academic_year:
        statement = statement.where(UserSectionAssignment.academic_year == academic_year)
    assignments = session.exec(statement).all()
    return [UserSectionAssignmentPublic.model_validate(item) for item in assignments]


@router.post(
    "/class-representatives",
    response_model=UserSectionAssignmentPublic,
    dependencies=[Depends(require_super_admin)],
)
def assign_class_representative(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    assignment_in: UserSectionAssignmentBase,
) -> Any:
    user = session.get(User, assignment_in.user_id)
    section = session.get(AcademicSection, assignment_in.section_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role != UserRole.class_representative:
        raise HTTPException(status_code=400, detail="User must have the class_representative role")
    if not section:
        raise HTTPException(status_code=404, detail="Academic section not found")
    existing = session.exec(
        select(UserSectionAssignment).where(
            UserSectionAssignment.user_id == assignment_in.user_id,
            UserSectionAssignment.section_id == assignment_in.section_id,
            UserSectionAssignment.academic_year == assignment_in.academic_year,
        )
    ).first()
    if existing:
        existing.status = AssignmentStatus.active
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing
    assignment = UserSectionAssignment.model_validate(assignment_in)
    session.add(assignment)
    session.commit()
    session.refresh(assignment)
    return assignment


@router.delete(
    "/class-representatives/{assignment_id}", dependencies=[Depends(require_super_admin)]
)
def remove_class_representative(
    session: SessionDep, _current_user: CurrentUser, assignment_id: uuid.UUID
) -> dict[str, str]:
    assignment = session.get(UserSectionAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Class representative assignment not found")
    session.delete(assignment)
    session.commit()
    return {"message": "Class representative assignment removed successfully"}
