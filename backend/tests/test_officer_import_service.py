from io import BytesIO

import pytest
from openpyxl import Workbook

from app.services.officer_import import parse_officer_import_file


HEADERS = [
    "Student ID",
    "First Name",
    "Middle Initial",
    "Last Name",
    "Extension",
    "Academic Year",
    "Section",
    "Email",
    "Organization",
    "Role",
    "Position",
]
ROW = [
    "20260001",
    "Jamie",
    "Q",
    "Example",
    "",
    "2026-2027",
    "BSIT WMAD 3A",
    "jamie@example.com",
    "CCS Student Council",
    "Admin",
    "Treasurer",
]


def test_parse_officer_csv() -> None:
    source = ",".join(HEADERS) + "\n" + ",".join(ROW) + "\n"
    parsed = parse_officer_import_file(source.encode("utf-8"), "officers.csv")
    assert len(parsed) == 1
    assert parsed[0]["source_row"] == 2
    assert parsed[0]["student_number"] == "20260001"
    assert parsed[0]["role"] == "Admin"


def test_parse_officer_xlsx() -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(HEADERS)
    sheet.append(ROW)
    buffer = BytesIO()
    workbook.save(buffer)
    parsed = parse_officer_import_file(buffer.getvalue(), "officers.xlsx")
    assert parsed[0]["email"] == "jamie@example.com"
    assert parsed[0]["position"] == "Treasurer"


def test_parse_officer_import_rejects_unsupported_file_type() -> None:
    with pytest.raises(ValueError, match="Unsupported file type"):
        parse_officer_import_file(b"data", "officers.txt")


def test_parse_officer_import_rejects_invalid_csv_encoding() -> None:
    with pytest.raises(ValueError, match="UTF-8 encoded"):
        parse_officer_import_file(b"\xff\xfe", "officers.csv")


def test_parse_officer_import_rejects_empty_file() -> None:
    with pytest.raises(ValueError, match="empty"):
        parse_officer_import_file(b"", "officers.csv")


def test_parse_officer_import_rejects_missing_columns() -> None:
    with pytest.raises(ValueError, match="Missing required columns"):
        parse_officer_import_file(b"First Name,Last Name\nJamie,Example\n", "officers.csv")


def test_parse_officer_import_rejects_invalid_xlsx() -> None:
    with pytest.raises(ValueError, match="Failed to parse XLSX"):
        parse_officer_import_file(b"not an excel file", "officers.xlsx")


def test_parse_officer_import_rejects_header_only_file() -> None:
    with pytest.raises(ValueError, match="no officer rows"):
        parse_officer_import_file(",".join(HEADERS).encode("utf-8"), "officers.csv")


def test_parse_officer_import_rejects_more_than_500_rows() -> None:
    source = ",".join(HEADERS) + "\n" + "\n".join(",".join(ROW) for _ in range(501))
    with pytest.raises(ValueError, match="limited to 500"):
        parse_officer_import_file(source.encode("utf-8"), "officers.csv")
