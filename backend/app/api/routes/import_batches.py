import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, require_admin
from app.models import (
    ImportBatch,
    ImportBatchCreate,
    ImportBatchPublic,
    ImportBatchesPublic,
    ImportBatchUpdate,
    get_datetime_utc,
)

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
