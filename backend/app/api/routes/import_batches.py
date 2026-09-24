import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, require_admin
from app.models import (
    ImportBatch,
    ImportBatchCreate,
    ImportBatchesPublic,
    ImportBatchPublic,
    ImportBatchStatus,
    ImportBatchUpdate,
    ImportValidationStatus,
    StudentImportRecord,
    StudentImportRecordPublic,
    StudentImportRecordsPublic,
    get_datetime_utc,
)
from app.services.student_import import StudentImportService
from app.services.student_promotion import StudentPromotionService

router = APIRouter(prefix="/import-batches", tags=["import-batches"])

@router.get("/", response_model=ImportBatchesPublic)
def read_import_batches(
    session: SessionDep,
    _current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
) -> Any:
    count_statement = select(func.count()).select_from(ImportBatch)
    statement = select(ImportBatch)

    if search:
        pattern = f"%{search}%"
        count_statement = count_statement.where(
            col(ImportBatch.source_filename).ilike(pattern)
        )
        statement = statement.where(
            col(ImportBatch.source_filename).ilike(pattern)
        )

    count = session.exec(count_statement).one()
    statement = (
        statement.order_by(col(ImportBatch.imported_at).desc())
        .offset(skip)
        .limit(limit)
    )
    import_batches = session.exec(statement).all()
    return ImportBatchesPublic(
        data=[ImportBatchPublic.model_validate(batch) for batch in import_batches],
        count=count,
    )

@router.post("/", response_model=ImportBatchPublic, dependencies=[Depends(require_admin)])
def create_import_batch(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    import_batch_in: ImportBatchCreate,
) -> Any:
    import_batch = ImportBatch.model_validate(import_batch_in)
    session.add(import_batch)
    session.commit()
    session.refresh(import_batch)
    return import_batch

@router.get("/{batch_id}", response_model=ImportBatchPublic)
def read_import_batch(
    session: SessionDep, _current_user: CurrentUser, batch_id: uuid.UUID
) -> Any:
    import_batch = session.get(ImportBatch, batch_id)
    if not import_batch:
        raise HTTPException(status_code=404, detail="Import batch not found")
    return import_batch

@router.get("/{batch_id}/records", response_model=StudentImportRecordsPublic)
def read_import_batch_records(
    session: SessionDep,
    _current_user: CurrentUser,
    batch_id: uuid.UUID,
    validation_status: ImportValidationStatus | None = None,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    import_batch = session.get(ImportBatch, batch_id)
    if not import_batch:
        raise HTTPException(status_code=404, detail="Import batch not found")

    count_stmt = select(func.count()).select_from(StudentImportRecord).where(
        col(StudentImportRecord.import_batch_id) == batch_id
    )
    stmt = select(StudentImportRecord).where(
        col(StudentImportRecord.import_batch_id) == batch_id
    )

    if validation_status:
        count_stmt = count_stmt.where(
            col(StudentImportRecord.validation_status) == validation_status
        )
        stmt = stmt.where(
            col(StudentImportRecord.validation_status) == validation_status
        )

    count = session.exec(count_stmt).one()
    stmt = (
        stmt.order_by(
            col(StudentImportRecord.source_sheet),
            col(StudentImportRecord.source_row),
        )
        .offset(skip)
        .limit(limit)
    )
    records = session.exec(stmt).all()
    return StudentImportRecordsPublic(
        data=[StudentImportRecordPublic.model_validate(r) for r in records],
        count=count,
    )


@router.patch(
    "/{batch_id}",
    response_model=ImportBatchPublic,
    dependencies=[Depends(require_admin)],
)
def update_import_batch(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    batch_id: uuid.UUID,
    import_batch_in: ImportBatchUpdate,
) -> Any:
    import_batch = session.get(ImportBatch, batch_id)
    if not import_batch:
        raise HTTPException(status_code=404, detail="Import batch not found")

    update_dict = import_batch_in.model_dump(exclude_unset=True)

    import_batch.sqlmodel_update(update_dict)
    import_batch.updated_at = get_datetime_utc()
    session.add(import_batch)
    session.commit()
    session.refresh(import_batch)
    return import_batch

@router.delete("/{batch_id}", dependencies=[Depends(require_admin)])
def delete_import_batch(
    session: SessionDep, _current_user: CurrentUser, batch_id: uuid.UUID
) -> dict[str, str]:
    import_batch = session.get(ImportBatch, batch_id)
    if not import_batch:
        raise HTTPException(status_code=404, detail="Import batch not found")

    session.delete(import_batch)
    session.commit()
    return {"message": "Import batch deleted successfully"}


@router.post(
    "/{batch_id}/upload",
    dependencies=[Depends(require_admin)],
)
async def upload_import_batch_workbook(
    session: SessionDep,
    _current_user: CurrentUser,
    batch_id: uuid.UUID,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    import_batch = session.get(ImportBatch, batch_id)
    if not import_batch:
        raise HTTPException(status_code=404, detail="Import batch not found")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    service = StudentImportService(session)
    try:
        parsed_rows = service.parse_student_import(import_batch, contents)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # parse_student_import() already ran validation/conflict-classification
    # and persisted staging records (session.add only - not committed, per
    # the service's existing convention of leaving commits to the caller).
    # "validated" is an existing ImportBatchStatus value that nothing else
    # currently sets; per docs/SOURCE-OF-TRUTH.md's staging -> validated ->
    # live pipeline, this is where that transition belongs.
    import_batch.status = ImportBatchStatus.validated
    import_batch.updated_at = get_datetime_utc()
    session.add(import_batch)
    session.commit()
    session.refresh(import_batch)

    valid_rows = sum(
        1 for row in parsed_rows
        if row.get("validation_status") == ImportValidationStatus.valid
    )
    invalid_rows = sum(
        1 for row in parsed_rows
        if row.get("validation_status") == ImportValidationStatus.invalid
    )
    conflict_rows = sum(
        1 for row in parsed_rows
        if row.get("validation_status") == ImportValidationStatus.conflict_cross_program
    )

    return {
        "import_batch_id": str(import_batch.id),
        "status": import_batch.status.value,
        "total_rows": len(parsed_rows),
        "valid_rows": valid_rows,
        "invalid_rows": invalid_rows,
        "conflict_rows": conflict_rows,
        "summary_reconciliation": service.get_summary_reconciliation(),
    }


@router.post(
    "/{batch_id}/promote",
    dependencies=[Depends(require_admin)],
)
def promote_import_batch(
    session: SessionDep, _current_user: CurrentUser, batch_id: uuid.UUID
) -> dict[str, Any]:
    import_batch = session.get(ImportBatch, batch_id)
    if not import_batch:
        raise HTTPException(status_code=404, detail="Import batch not found")

    service = StudentPromotionService(session)
    try:
        result = service.promote_import_batch(batch_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return result.to_dict()
