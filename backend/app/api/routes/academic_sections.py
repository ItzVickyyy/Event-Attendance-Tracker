import io
import uuid
import zipfile
from typing import Any
from xml.sax.saxutils import escape

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


def _section_rows(session: SessionDep, section_id: uuid.UUID):
    return session.exec(
        select(Student, Person)
        .join(Person, Person.id == Student.person_id)
        .where(Student.section_id == section_id)
        .order_by(col(Student.student_number).asc())
    ).all()


def _student_status(student: Student) -> str:
    return student.academic_status.value if student.academic_status else ""


def _docx_cell(value: object) -> str:
    text = escape(str(value or ""))
    return f"<w:tc><w:tcPr/><w:p><w:r><w:t xml:space=\"preserve\">{text}</w:t></w:r></w:p></w:tc>"


def _build_docx(program_code: str, section: AcademicSection, rows: list[tuple[Student, Person]]) -> io.BytesIO:
    table_rows = [
        ["#", "Student Number", "Last Name", "First Name", "Middle Name", "Extension", "Email", "Contact Number", "Academic Status"],
    ]
    table_rows.extend(
        [
            index,
            student.student_number,
            person.last_name,
            person.first_name,
            person.middle_name or "",
            person.name_extension or "",
            person.email or "",
            person.contact_number or "",
            _student_status(student),
        ]
        for index, (student, person) in enumerate(rows, start=1)
    )
    table_xml = "<w:tbl><w:tblPr><w:tblBorders><w:top w:val=\"single\"/><w:left w:val=\"single\"/><w:bottom w:val=\"single\"/><w:right w:val=\"single\"/><w:insideH w:val=\"single\"/><w:insideV w:val=\"single\"/></w:tblBorders></w:tblPr>"
    for row_index, row in enumerate(table_rows):
        cells = "".join(_docx_cell(value) for value in row)
        table_xml += f"<w:tr>{cells}</w:tr>"
    table_xml += "</w:tbl>"

    document_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>{escape(program_code)} {escape(section.section_name)}</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>College of Computer Studies · {escape(section.year_level)} · Academic Year {escape(section.academic_year)}</w:t></w:r></w:p>
{table_xml}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>
</w:body></w:document>'''

    content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'''
    rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'''
    document_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'''

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", rels)
        archive.writestr("word/document.xml", document_xml)
        archive.writestr("word/_rels/document.xml.rels", document_rels)
    buffer.seek(0)
    return buffer


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
        count_statement = count_statement.where(col(AcademicSection.program_id) == program_id)
        statement = statement.where(col(AcademicSection.program_id) == program_id)
    if year_level:
        count_statement = count_statement.where(col(AcademicSection.year_level) == year_level)
        statement = statement.where(col(AcademicSection.year_level) == year_level)
    if academic_year:
        count_statement = count_statement.where(col(AcademicSection.academic_year) == academic_year)
        statement = statement.where(col(AcademicSection.academic_year) == academic_year)
    count = session.exec(count_statement).one()
    statement = statement.order_by(col(AcademicSection.section_name).asc()).offset(skip).limit(limit)
    sections = session.exec(statement).all()
    return AcademicSectionsPublic(data=[AcademicSectionPublic.model_validate(s) for s in sections], count=count)


@router.post("/", response_model=AcademicSectionPublic, dependencies=[Depends(require_admin)])
def create_academic_section(*, session: SessionDep, _current_user: CurrentUser, section_in: AcademicSectionCreate) -> Any:
    program = session.get(AcademicProgram, section_in.program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Academic program not found")
    existing = session.exec(select(AcademicSection).where(
        col(AcademicSection.program_id) == section_in.program_id,
        col(AcademicSection.year_level) == section_in.year_level,
        col(AcademicSection.section_name) == section_in.section_name,
        col(AcademicSection.academic_year) == section_in.academic_year,
    )).first()
    if existing:
        raise HTTPException(status_code=400, detail="A section with this program, year level, name, and academic year already exists.")
    section = AcademicSection.model_validate(section_in)
    session.add(section)
    session.commit()
    session.refresh(section)
    return section


@router.get("/{section_id}", response_model=AcademicSectionPublic)
def read_academic_section(session: SessionDep, _current_user: CurrentUser, section_id: uuid.UUID) -> Any:
    section = session.get(AcademicSection, section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Academic section not found")
    return section


@router.get("/{section_id}/export/xlsx", dependencies=[Depends(require_admin)])
def export_academic_section_xlsx(session: SessionDep, _current_user: CurrentUser, section_id: uuid.UUID) -> StreamingResponse:
    section = session.get(AcademicSection, section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Academic section not found")
    program = session.get(AcademicProgram, section.program_id)
    rows = _section_rows(session, section_id)
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Students"
    sheet.append(["#", "Student Number", "Last Name", "First Name", "Middle Name", "Extension", "Email", "Contact Number", "Academic Status"])
    for index, (student, person) in enumerate(rows, start=1):
        sheet.append([index, student.student_number, person.last_name, person.first_name, person.middle_name or "", person.name_extension or "", person.email or "", person.contact_number or "", _student_status(student)])
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    sheet.column_dimensions["A"].width = 6
    for column in "BCDEFGHI":
        sheet.column_dimensions[column].width = 24
    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    filename = f"{program.program_code if program else 'Section'}-{section.section_name}-{section.academic_year}.xlsx"
    return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/{section_id}/export/docx", dependencies=[Depends(require_admin)])
def export_academic_section_docx(session: SessionDep, _current_user: CurrentUser, section_id: uuid.UUID) -> StreamingResponse:
    section = session.get(AcademicSection, section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Academic section not found")
    program = session.get(AcademicProgram, section.program_id)
    rows = _section_rows(session, section_id)
    buffer = _build_docx(program.program_code if program else "Section", section, rows)
    filename = f"{program.program_code if program else 'Section'}-{section.section_name}-{section.academic_year}.docx"
    return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.patch("/{section_id}", response_model=AcademicSectionPublic, dependencies=[Depends(require_admin)])
def update_academic_section(*, session: SessionDep, _current_user: CurrentUser, section_id: uuid.UUID, section_in: AcademicSectionUpdate) -> Any:
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
def delete_academic_section(session: SessionDep, _current_user: CurrentUser, section_id: uuid.UUID) -> dict[str, str]:
    section = session.get(AcademicSection, section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Academic section not found")
    session.delete(section)
    session.commit()
    return {"message": "Academic section deleted successfully"}
