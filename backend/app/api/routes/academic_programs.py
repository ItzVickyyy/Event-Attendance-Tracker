import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, require_admin
from app.models import (
    AcademicProgram,
    AcademicProgramCreate,
    AcademicProgramPublic,
    AcademicProgramsPublic,
    AcademicProgramUpdate,
    get_datetime_utc,
)

router = APIRouter(prefix="/academic-programs", tags=["academic-programs"])


@router.get("/", response_model=AcademicProgramsPublic)
def read_academic_programs(
    session: SessionDep,
    _current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
) -> Any:
    count_statement = select(func.count()).select_from(AcademicProgram)
    statement = select(AcademicProgram)

    if search:
        pattern = f"%{search}%"
        count_statement = count_statement.where(
            col(AcademicProgram.program_code).ilike(pattern)
            | col(AcademicProgram.program_name).ilike(pattern)
        )
        statement = statement.where(
            col(AcademicProgram.program_code).ilike(pattern)
            | col(AcademicProgram.program_name).ilike(pattern)
        )

    count = session.exec(count_statement).one()
    statement = (
        statement.order_by(col(AcademicProgram.program_code).asc())
        .offset(skip)
        .limit(limit)
    )
    programs = session.exec(statement).all()
    return AcademicProgramsPublic(
        data=[AcademicProgramPublic.model_validate(p) for p in programs],
        count=count,
    )


@router.post(
    "/", response_model=AcademicProgramPublic, dependencies=[Depends(require_admin)]
)
def create_academic_program(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    program_in: AcademicProgramCreate,
) -> Any:
    existing = session.exec(
        select(AcademicProgram).where(
            AcademicProgram.program_code == program_in.program_code
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="An academic program with this code already exists.",
        )

    program = AcademicProgram.model_validate(program_in)
    session.add(program)
    session.commit()
    session.refresh(program)
    return program


@router.get("/{program_id}", response_model=AcademicProgramPublic)
def read_academic_program(
    session: SessionDep, _current_user: CurrentUser, program_id: uuid.UUID
) -> Any:
    program = session.get(AcademicProgram, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Academic program not found")
    return program


@router.patch(
    "/{program_id}",
    response_model=AcademicProgramPublic,
    dependencies=[Depends(require_admin)],
)
def update_academic_program(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    program_id: uuid.UUID,
    program_in: AcademicProgramUpdate,
) -> Any:
    program = session.get(AcademicProgram, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Academic program not found")

    update_dict = program_in.model_dump(exclude_unset=True)
    if (
        "program_code" in update_dict
        and update_dict["program_code"] != program.program_code
    ):
        existing = session.exec(
            select(AcademicProgram).where(
                col(AcademicProgram.program_code) == update_dict["program_code"],
                col(AcademicProgram.id) != program_id,
            )
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="An academic program with this code already exists.",
            )

    program.sqlmodel_update(update_dict)
    program.updated_at = get_datetime_utc()
    session.add(program)
    session.commit()
    session.refresh(program)
    return program


@router.delete("/{program_id}", dependencies=[Depends(require_admin)])
def delete_academic_program(
    session: SessionDep, _current_user: CurrentUser, program_id: uuid.UUID
) -> dict[str, str]:
    program = session.get(AcademicProgram, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Academic program not found")
    session.delete(program)
    session.commit()
    return {"message": "Academic program deleted successfully"}
