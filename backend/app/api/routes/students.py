import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, require_admin
from app.models import (
    AcademicSection,
    Attendee,
    Person,
    Student,
    StudentCreate,
    StudentPublic,
    StudentsPublic,
    StudentUpdate,
    get_datetime_utc,
)

router = APIRouter(prefix="/students", tags=["students"])


@router.get("/", response_model=StudentsPublic)
def read_students(
    session: SessionDep,
    _current_user: CurrentUser,
    section_id: uuid.UUID | None = None,
    person_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
) -> Any:
    count_statement = select(func.count()).select_from(Student).where(text("students.archived_at IS NULL"))
    statement = (
        select(Student, Person, Attendee)
        .join(Person, col(Student.person_id) == Person.id)
        .join(Attendee, col(Attendee.person_id) == Person.id, isouter=True)
        .where(text("students.archived_at IS NULL"))
    )

    if section_id:
        count_statement = count_statement.where(col(Student.section_id) == section_id)
        statement = statement.where(col(Student.section_id) == section_id)

    if person_id:
        count_statement = count_statement.where(col(Student.person_id) == person_id)
        statement = statement.where(col(Student.person_id) == person_id)

    if search:
        pattern = f"%{search}%"
        count_statement = count_statement.join(Person, isouter=True).where(
            col(Student.student_number).ilike(pattern)
            | col(Person.first_name).ilike(pattern)
            | col(Person.last_name).ilike(pattern)
        )
        statement = statement.where(
            col(Student.student_number).ilike(pattern)
            | col(Person.first_name).ilike(pattern)
            | col(Person.last_name).ilike(pattern)
        )

    count = session.exec(count_statement).one()
    statement = (
        statement.order_by(col(Student.student_number).asc()).offset(skip).limit(limit)
    )
    rows = session.exec(statement).all()
    return StudentsPublic(
        data=[
            StudentPublic(
                **student.model_dump(),
                person_name=f"{person.first_name} {person.last_name}".strip(),
                attendee_id=attendee.id if attendee else None,
            )
            for student, person, attendee in rows
        ],
        count=count,
    )


@router.post("/", response_model=StudentPublic, dependencies=[Depends(require_admin)])
def create_student(
    *, session: SessionDep, _current_user: CurrentUser, student_in: StudentCreate
) -> Any:
    person = session.get(Person, student_in.person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    existing_person = session.exec(
        select(Student).where(Student.person_id == student_in.person_id)
    ).first()
    if existing_person:
        raise HTTPException(
            status_code=400,
            detail="A student record already exists for this person.",
        )

    existing_number = session.exec(
        select(Student).where(Student.student_number == student_in.student_number)
    ).first()
    if existing_number:
        raise HTTPException(
            status_code=400,
            detail="A student with this student number already exists.",
        )

    if student_in.section_id:
        section = session.get(AcademicSection, student_in.section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Academic section not found")

    student = Student.model_validate(student_in)
    session.add(student)
    session.commit()
    session.refresh(student)
    return student


@router.get("/{student_id}", response_model=StudentPublic)
def read_student(
    session: SessionDep, _current_user: CurrentUser, student_id: uuid.UUID
) -> Any:
    student = session.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    archived = session.execute(text("SELECT archived_at FROM students WHERE id = :id"), {"id": student_id}).scalar_one_or_none()
    if archived is not None:
        raise HTTPException(status_code=404, detail="Student not found")
    return student


@router.patch(
    "/{student_id}", response_model=StudentPublic, dependencies=[Depends(require_admin)]
)
def update_student(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    student_id: uuid.UUID,
    student_in: StudentUpdate,
) -> Any:
    student = session.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    archived = session.execute(text("SELECT archived_at FROM students WHERE id = :id"), {"id": student_id}).scalar_one_or_none()
    if archived is not None:
        raise HTTPException(status_code=404, detail="Student is archived")

    update_dict = student_in.model_dump(exclude_unset=True)

    if (
        "student_number" in update_dict
        and update_dict["student_number"] != student.student_number
    ):
        existing = session.exec(
            select(Student).where(
                col(Student.student_number) == update_dict["student_number"],
                col(Student.id) != student_id,
            )
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="A student with this student number already exists.",
            )

    if "section_id" in update_dict and update_dict["section_id"] is not None:
        section = session.get(AcademicSection, update_dict["section_id"])
        if not section:
            raise HTTPException(status_code=404, detail="Academic section not found")

    if "person_id" in update_dict and update_dict["person_id"] != student.person_id:
        person = session.get(Person, update_dict["person_id"])
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")
        existing_person = session.exec(
            select(Student).where(
                col(Student.person_id) == update_dict["person_id"],
                col(Student.id) != student_id,
            )
        ).first()
        if existing_person:
            raise HTTPException(
                status_code=400,
                detail="A student record already exists for this person.",
            )

    student.sqlmodel_update(update_dict)
    student.updated_at = get_datetime_utc()
    session.add(student)
    session.commit()
    session.refresh(student)
    return student


@router.delete("/{student_id}", dependencies=[Depends(require_admin)])
def delete_student(
    session: SessionDep, _current_user: CurrentUser, student_id: uuid.UUID
) -> dict[str, str]:
    student = session.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    session.execute(
        text("UPDATE students SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = :id AND archived_at IS NULL"),
        {"id": student_id},
    )
    session.commit()
    return {"message": "Student archived successfully"}
