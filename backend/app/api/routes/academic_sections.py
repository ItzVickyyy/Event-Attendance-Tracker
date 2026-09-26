import io
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, require_admin
from app.models import (
    AcademicProgram,
    AcademicSection,
    AcademicSectionCreate,
    AcademicSectionPublic,
    AcademicSectionsPublic,
    AcademicSectionUpdate,
    Person,
    Student,
    get_datetime_utc,
)

router = APIRouter(prefix="/academic-sections", tags=["academic-sections"])


@router.get("/", response_model=AcademicSectionsPublic)
def read_academic_sections(
    session: SessionDep,
    _current_user: CurrentUser,
    program_id: uuid.UUID | None = None,
    year_level: str | None = None,
    academic_year: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    count_statement = select(func.count()).select_from(AcademicSection)
    statement = select(AcademicSection)

    if program_id:
        count_statement = count_statement.where(
            col(AcademicSection.program_id) == program_id
        )
        statement = statement.where(col(AcademicSection.program_id) == program_id)
    if year_level:
        count_statement = count_statement.where(
            col(AcademicSection.year_level) == year_level
        )
        statement = statement.where(col(AcademicSection.year_level) == year_level)
    if academic_year:
        count_statement = count_statement.where(
            col(AcademicSection.academic_year) == academic_year
        )
        statement = statement.where(col(AcademicSection.academic_year) == academic_year)

    count = session.exec(count_statement).one()
    statement = (
        statement.order_by(col(AcademicSection.section_name).asc())
        .offset(skip)
        .limit(limit)
    )
    sections = session.exec(statement).all()
    return AcademicSectionsPublic(
        data=[AcademicSectionPublic.model_validate(s) for s in sections],
        count=count,
    )


@router.post(
    "/", response_model=AcademicSectionPublic, dependencies=[Depends(require_admin)]
)
def create_academic_section(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    section_in: AcademicSectionCreate,
) -> Any:
    program = session.get(AcademicProgram, section_in.program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Academic program not found")

    existing = session.exec(
        select(AcademicSection).where(
            col(AcademicSection.program_id) == section_in.program_id,
            col(AcademicSection.year_level) == section_in.year_level,
            col(AcademicSection.section_name) == section_in.section_name,
            col(AcademicSection.academic_year) == section_in.academic_year,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="A section with this program, year level, name, and academic year already exists.",
        )

    section = AcademicSection.model_validate(section_in)
    session.add(section)
    session.commit()
    session.refresh(section)
    return section


@router.get("/{section_id}", response_model=AcademicSectionPublic)
def read_academic_section(
    session: SessionDep, _current_user: CurrentUser, section_id: uuid.UUID
) -> Any:
    section = session.get(AcademicSection, section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Academic section not found")
    return section


@router.get("/{section_id}/export/xlsx", dependencies=[Depends(require_admin)])
def export_academic_section_xlsx(
    session: SessionDep, _current_user: CurrentUser, section_id: uuid.UUID
) -> StreamingResponse:
    section = session.get(AcademicSection, section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Academic section not found")
    program = session.get(AcademicProgram, section.program_id)
    rows = session.exec(
        select(Student, Person)
        .join(Person, Person.id == Student.person_id)
        .where(Student.section_id == section_id)
        .order_by(col(Student.student_number).asc())
    ).all()

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Students"
    sheet.append(
        [
            "#",
            "Student Number",
            "Last Name",
            "First Name",
            "Middle Name",
            "Extension",
            "Email",
            "Contact Number",
            "Academic Status",
        ]
    )
    for index, (student, person) in enumerate(rows, start=1):
        sheet.append(
            [
                index,
                student.student_number,
                person.last_name,
                person.first_name,
                person.middle_name or "",
                person.name_extension or "",
                person.email or "",
                person.contact_number or "",
                student.academic_status.value if student.academic_status else "",
            ]
        )
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    sheet.column_dimensions["A"].width = 6
    for column in "BCDEFGHI":
        sheet.column_dimensions[column].width = 24

    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    filename = f"{program.program_code if program else 'Section'}-{section.section_name}-{section.academic_year}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch(
    "/{section_id}",
    response_model=AcademicSectionPublic,
    dependencies=[Depends(require_admin)],
)
def update_academic_section(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    section_id: uuid.UUID,
    section_in: AcademicSectionUpdate,
) -> Any:
    section = session.get(AcademicSection, section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Academic section not found")

    update_dict = section_in.model_dump(exclude_unset=True)
    if "program_id" in update_dict:
        program = session.get(AcademicProgram, update_dict["program_id"])
        if not program:
            raise HTTPException(status_code=404, detail="Academic program not found")

    section.sqlmodel_update(update_dict)
    section.updated_at = get_datetime_utc()
    session.add(section)
    session.commit()
    session.refresh(section)
    return section


@router.delete("/{section_id}", dependencies=[Depends(require_admin)])
def delete_academic_section(
    session: SessionDep, _current_user: CurrentUser, section_id: uuid.UUID
) -> dict[str, str]:
    section = session.get(AcademicSection, section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Academic section not found")
    session.delete(section)
    session.commit()
    return {"message": "Academic section deleted successfully"}
