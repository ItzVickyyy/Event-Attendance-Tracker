import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app.academic_catalog import (
    AcademicMajor,
    AcademicMajorPublic,
    AcademicMajorsPublic,
    AcademicSectionMajor,
    AcademicSectionMajorCreate,
    AcademicSectionMajorPublic,
)
from app.api.deps import CurrentUser, SessionDep, require_admin, require_super_admin
from app.models import AcademicSection, User, UserRole
from app.student_academics import ClassRepresentativeAssignment

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
        count_statement = count_statement.where(
            col(AcademicMajor.program_id) == program_id
        )
    majors = session.exec(statement.order_by(col(AcademicMajor.code))).all()
    return AcademicMajorsPublic(
        data=[AcademicMajorPublic.model_validate(major) for major in majors],
        count=session.exec(count_statement).one(),
    )


@router.get(
    "/sections/{section_id}/major", response_model=AcademicSectionMajorPublic | None
)
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
        raise HTTPException(
            status_code=400, detail="Section ID does not match the path"
        )
    section = session.get(AcademicSection, section_id)
    major = session.get(AcademicMajor, assignment_in.major_id)
    if not section or not major:
        raise HTTPException(status_code=404, detail="Section or major not found")
    if section.program_id != major.program_id:
        raise HTTPException(
            status_code=400, detail="Major does not belong to the section program"
        )
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


@router.delete("/sections/{section_id}/major", dependencies=[Depends(require_admin)])
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
    dependencies=[Depends(require_admin)],
)
def read_class_representatives(
    session: SessionDep,
    _current_user: CurrentUser,
    section_id: uuid.UUID | None = None,
    academic_year: str | None = None,
) -> list[dict[str, object]]:
    query = """
        SELECT cra.id AS assignment_id, u.id, u.email, u.full_name, u.is_active,
               cra.academic_year_id, cra.section_id,
               ay.label AS academic_year, p.program_code, s.section_code, s.year_level
        FROM class_representative_assignments cra
        JOIN "user" u ON u.id = cra.user_id
        JOIN academic_years ay ON ay.id = cra.academic_year_id
        JOIN academic_sections s ON s.id = cra.section_id
        JOIN academic_programs p ON p.id = s.program_id
        WHERE u.role = 'class_representative'
    """
    params: dict[str, object] = {}
    if section_id:
        query += " AND cra.section_id = :section_id"
        params["section_id"] = section_id
    if academic_year:
        query += " AND ay.label = :academic_year"
        params["academic_year"] = academic_year
    query += " ORDER BY u.full_name, ay.start_year DESC"
    rows = session.execute(text(query), params).mappings().all()
    return [dict(row) for row in rows]


@router.post(
    "/class-representatives",
    response_model=ClassRepresentativeAssignment,
    dependencies=[Depends(require_super_admin)],
)
def assign_class_representative(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    user_id: uuid.UUID,
    section_id: uuid.UUID,
    academic_year_id: uuid.UUID,
) -> Any:
    user = session.get(User, user_id)
    section = session.get(AcademicSection, section_id)
    year = session.execute(
        text("SELECT id FROM academic_years WHERE id=:id"), {"id": academic_year_id}
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role != UserRole.class_representative:
        raise HTTPException(status_code=400, detail="User must have the class_representative role")
    if not section or not year:
        raise HTTPException(status_code=404, detail="Academic year or section not found")
    if section.academic_year_id != academic_year_id:
        raise HTTPException(status_code=400, detail="Section does not belong to the selected academic year")
    existing = session.exec(
        select(ClassRepresentativeAssignment).where(
            ClassRepresentativeAssignment.user_id == user_id,
            ClassRepresentativeAssignment.academic_year_id == academic_year_id,
        )
    ).first()
    if existing:
        existing.section_id = section_id
        existing.updated_at = __import__("app.models", fromlist=["get_datetime_utc"]).get_datetime_utc()
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing
    assignment = ClassRepresentativeAssignment(
        user_id=user_id,
        academic_year_id=academic_year_id,
        section_id=section_id,
    )
    session.add(assignment)
    session.commit()
    session.refresh(assignment)
    return assignment


@router.delete(
    "/class-representatives/{assignment_id}",
    dependencies=[Depends(require_super_admin)],
)
def remove_class_representative(
    session: SessionDep, _current_user: CurrentUser, assignment_id: uuid.UUID
) -> dict[str, str]:
    assignment = session.get(ClassRepresentativeAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Class representative assignment not found")
    session.delete(assignment)
    session.commit()
    return {"message": "Class representative assignment removed successfully"}
