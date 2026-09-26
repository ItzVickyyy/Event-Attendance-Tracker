"""Tests for POST /import-batches/{batch_id}/upload"""

from collections.abc import Generator
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlmodel import Session

from app.core.config import settings
from app.models import ImportBatch, ImportBatchStatus


def _make_xlsx(sheet_name: str, headers: list, rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


@pytest.fixture
def make_import_batch(db: Session) -> Generator:
    """Creates an ImportBatch via the same shared `db` session/connection the
    `client` fixture's app instance actually commits through (unlike the
    isolated, rolled-back-at-teardown `db_session` fixture used elsewhere in
    this project). Anything committed this way is visible to every other
    connection for the rest of the pytest run, so this fixture deletes what
    it created (StudentImportRecord rows cascade-delete with their
    ImportBatch) once the test finishes, to avoid leaking rows into
    unrelated tests such as test_student_import.py's
    test_parse_clean_workbook, which asserts an unscoped
    `select(StudentImportRecord)` count.
    """
    created_ids = []

    def _factory(**kwargs) -> ImportBatch:
        batch = ImportBatch(
            source_filename=kwargs.pop("source_filename", "masterlist.xlsx"),
            academic_year=kwargs.pop("academic_year", "2026-2027"),
            **kwargs,
        )
        db.add(batch)
        db.commit()
        db.refresh(batch)
        created_ids.append(batch.id)
        return batch

    yield _factory

    for batch_id in created_ids:
        obj = db.get(ImportBatch, batch_id)
        if obj is not None:
            db.delete(obj)
    db.commit()


HEADERS = ["No.", "Student Number", "Last Name", "First Name", "Status"]


def test_upload_valid_workbook_creates_staging_records(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
    make_import_batch,
) -> None:
    batch = make_import_batch(source_filename="upload_success.xlsx")

    xlsx_bytes = _make_xlsx(
        "BSCS 1A",
        HEADERS,
        [
            [1, "80001", "Cruz", "Ana", "Regular"],
            [2, "80002", "Santos", "Maria", "Regular"],
        ],
    )

    response = client.post(
        f"{settings.API_V1_STR}/import-batches/{batch.id}/upload",
        headers=superuser_token_headers,
        files={
            "file": (
                "masterlist.xlsx",
                xlsx_bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["import_batch_id"] == str(batch.id)
    assert body["status"] == ImportBatchStatus.validated.value
    assert body["total_rows"] == 2
    assert body["valid_rows"] == 2
    assert body["invalid_rows"] == 0
    assert body["conflict_rows"] == 0

    db.refresh(batch)
    assert batch.status == ImportBatchStatus.validated

    # Staging records were actually persisted (not just reported).
    detail_response = client.get(
        f"{settings.API_V1_STR}/import-batches/{batch.id}",
        headers=superuser_token_headers,
    )
    assert detail_response.status_code == 200


def test_upload_requires_authentication(client: TestClient, make_import_batch) -> None:
    batch = make_import_batch(source_filename="upload_noauth.xlsx")
    xlsx_bytes = _make_xlsx(
        "BSCS 1A", HEADERS, [[1, "80101", "Cruz", "Ana", "Regular"]]
    )

    response = client.post(
        f"{settings.API_V1_STR}/import-batches/{batch.id}/upload",
        files={"file": ("masterlist.xlsx", xlsx_bytes)},
    )

    assert response.status_code == 401


def test_upload_requires_admin_role(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
    make_import_batch,
) -> None:
    batch = make_import_batch(source_filename="upload_forbidden.xlsx")
    xlsx_bytes = _make_xlsx(
        "BSCS 1A", HEADERS, [[1, "80102", "Cruz", "Ana", "Regular"]]
    )

    response = client.post(
        f"{settings.API_V1_STR}/import-batches/{batch.id}/upload",
        headers=normal_user_token_headers,
        files={"file": ("masterlist.xlsx", xlsx_bytes)},
    )

    assert response.status_code == 403


def test_upload_nonexistent_batch_returns_404(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    xlsx_bytes = _make_xlsx(
        "BSCS 1A", HEADERS, [[1, "80103", "Cruz", "Ana", "Regular"]]
    )

    response = client.post(
        f"{settings.API_V1_STR}/import-batches/00000000-0000-0000-0000-000000000000/upload",
        headers=superuser_token_headers,
        files={"file": ("masterlist.xlsx", xlsx_bytes)},
    )

    assert response.status_code == 404


def test_upload_empty_file_returns_400(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    make_import_batch,
) -> None:
    batch = make_import_batch(source_filename="upload_empty.xlsx")

    response = client.post(
        f"{settings.API_V1_STR}/import-batches/{batch.id}/upload",
        headers=superuser_token_headers,
        files={"file": ("empty.xlsx", b"")},
    )

    assert response.status_code == 400


def test_upload_malformed_workbook_returns_400(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    make_import_batch,
) -> None:
    batch = make_import_batch(source_filename="upload_malformed.xlsx")

    response = client.post(
        f"{settings.API_V1_STR}/import-batches/{batch.id}/upload",
        headers=superuser_token_headers,
        files={
            "file": (
                "not_a_workbook.xlsx",
                b"this is not a valid xlsx file, just plain text bytes",
            )
        },
    )

    assert response.status_code == 400
    assert "detail" in response.json()


def test_upload_reports_invalid_and_conflict_rows(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    make_import_batch,
) -> None:
    batch = make_import_batch(source_filename="upload_conflicts.xlsx")

    wb = Workbook()
    ws1 = wb.active
    ws1.title = "BSCS 1A"
    ws1.append(HEADERS)
    ws1.append([1, "80201", "Rivera", "Carlos", "Regular"])

    ws2 = wb.create_sheet("BSIT 1A")
    ws2.append(HEADERS)
    ws2.append([1, "80201", "Rivera", "Carlos", "Regular"])  # cross-program conflict

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    response = client.post(
        f"{settings.API_V1_STR}/import-batches/{batch.id}/upload",
        headers=superuser_token_headers,
        files={"file": ("masterlist.xlsx", buffer.getvalue())},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total_rows"] == 2
    assert body["conflict_rows"] == 2
    assert body["valid_rows"] == 0
