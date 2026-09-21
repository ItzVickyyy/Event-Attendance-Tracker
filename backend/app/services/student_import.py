"""Student Import Service - XLSX parsing and staging"""

from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple
from uuid import UUID

from openpyxl import load_workbook
from sqlmodel import Session, select

from app.models import ImportBatch, ImportValidationStatus, StudentImportRecord


class StudentImportService:
    """Service for parsing XLSX student imports and staging records"""

    def __init__(self, session: Session):
        self.session = session

    def parse_student_import(
        self, import_batch: ImportBatch, xlsx_file: bytes
    ) -> List[Dict[str, Any]]:
        """Parse XLSX workbook and create StudentImportRecord staging rows.

        Returns:
            List of parsed row data with validation results
        """
        import io

        try:
            workbook = load_workbook(
                filename=io.BytesIO(xlsx_file), read_only=True, data_only=True
            )
        except Exception as e:
            raise ValueError(f"Failed to parse XLSX file: {str(e)}")

        parsed_rows = []

        for sheet_name in workbook.sheetnames:
            if not self._validate_sheet_name(sheet_name):
                continue

            sheet = workbook[sheet_name]
            sheet_rows = list(sheet.iter_rows(values_only=True))

            if not sheet_rows:
                continue

            header_row = sheet_rows[0]
            data_rows = sheet_rows[1:]

            for row_idx, row in enumerate(data_rows, start=2):
                if self._is_empty_row(row):
                    continue

                row_data = self._extract_row_data(sheet_name, row_idx, row, header_row)
                parsed_rows.append(row_data)

        workbook.close()

        self._validate_and_detect_conflicts(parsed_rows)

        return parsed_rows

    def _validate_sheet_name(self, sheet_name: str) -> bool:
        """Validate that the sheet name is acceptable for processing.
        
        Returns:
            True if the sheet should be processed, False if it should be skipped.
        """
        normalized = sheet_name.strip().lower()

        if normalized == "summary":
            return False

        if not sheet_name.strip():
            raise ValueError(f"Empty sheet name encountered")

        return True

    def _is_empty_row(self, row: Tuple[Any, ...]) -> bool:
        """Check if a row is empty or contains only None values"""
        return all(cell is None or str(cell).strip() == "" for cell in row)

    def _extract_row_data(
        self, sheet_name: str, row_idx: int, row: Tuple[Any, ...], header_row: Tuple[Any, ...]
    ) -> Dict[str, Any]:
        """Extract and normalize data from a single row"""
        data = {
            "source_sheet": sheet_name,
            "source_row": row_idx,
        }

        if not header_row:
            return data

        known_headers = [
            "no",
            "student number",
            "last name",
            "first name",
            "middle name",
            "section",
            "status",
            "program",
            "year level",
            "academic year",
            "semester",
            "subjects enrolled",
            "mobile number",
            "email",
        ]

        header_to_col_idx: Dict[str, int] = {}
        for col_idx, header_value in enumerate(header_row):
            if header_value is not None:
                header_name = str(header_value).strip().lower()
                for known_header in known_headers:
                    if known_header not in header_to_col_idx and (
                        header_name == known_header or header_name == f"{known_header}s"
                    ):
                        header_to_col_idx[known_header] = col_idx

        col_lookup = {
            "source_no": "no",
            "raw_student_number": "student number",
            "raw_last_name": "last name",
            "raw_first_name": "first name",
            "raw_middle_name": "middle name",
            "raw_section": "section",
            "raw_status": "status",
            "raw_program": "program",
            "raw_year_level": "year level",
            "raw_academic_year": "academic year",
            "raw_semester": "semester",
            "raw_subjects_enrolled": "subjects enrolled",
            "raw_mobile_number": "mobile number",
            "raw_email": "email",
        }

        for field_name, col_key in col_lookup.items():
            col_idx = header_to_col_idx.get(col_key)
            if col_idx is not None and col_idx < len(row):
                data[field_name] = self._safe_cell_value(row[col_idx])

        return data

    def _safe_cell_value(self, cell_value: Any) -> Optional[str]:
        """Safely extract string value from Excel cell, handling None and formatting"""
        if cell_value is None:
            return None

        if isinstance(cell_value, (int, float)):
            return str(int(cell_value) if isinstance(cell_value, int) else cell_value)

        if isinstance(cell_value, str):
            return cell_value.strip()

        return str(cell_value)

    def _validate_and_detect_conflicts(self, parsed_rows: List[Dict[str, Any]]) -> None:
        """Validate rows and detect duplicate/cross-program conflicts across the entire workbook"""
        student_to_sheets: Dict[str, Dict[str, int]] = {}
        student_to_rows: Dict[str, Dict[str, Dict[str, Any]]] = {}
        student_to_all_rows: Dict[str, List[Dict[str, Any]]] = {}

        for row_data in parsed_rows:
            student_number = row_data.get("raw_student_number")
            if not student_number:
                row_data["validation_status"] = ImportValidationStatus.invalid
                row_data["validation_errors"] = ["Missing student number"]
                row_data["conflict_key"] = None
                continue

            student_number = student_number.strip()

            if student_number not in student_to_sheets:
                student_to_sheets[student_number] = {}
                student_to_rows[student_number] = {}

            sheet_name = row_data["source_sheet"]
            if sheet_name not in student_to_sheets[student_number]:
                student_to_sheets[student_number][sheet_name] = 0
            student_to_sheets[student_number][sheet_name] += 1

            if student_number not in student_to_rows[student_number]:
                student_to_rows[student_number][sheet_name] = {}
            student_to_rows[student_number][sheet_name][row_data["source_row"]] = row_data

            if student_number not in student_to_all_rows:
                student_to_all_rows[student_number] = []
            student_to_all_rows[student_number].append(row_data)

        for row_data in parsed_rows:
            student_number = row_data.get("raw_student_number")
            if not student_number:
                continue

            student_number = student_number.strip()

            if student_number not in student_to_sheets:
                continue

            first_name = row_data.get("raw_first_name")
            last_name = row_data.get("raw_last_name")
            
            if not first_name or not last_name:
                row_data["validation_status"] = ImportValidationStatus.invalid
                row_data["validation_errors"] = ["Missing required name fields"]
                row_data["conflict_key"] = student_number
                continue

            sheet_counts = student_to_sheets[student_number]
            if len(sheet_counts) > 1:
                row_data["validation_status"] = ImportValidationStatus.conflict_cross_program
                row_data["validation_errors"] = [f"Conflict across {len(sheet_counts)} program/section sheets"]
                row_data["conflict_key"] = student_number
            elif len(sheet_counts) == 1:
                rows_in_sheet = student_to_rows[student_number].get(list(sheet_counts.keys())[0], {})
                
                if len(rows_in_sheet) > 1:
                    for other_row in rows_in_sheet.values():
                        if other_row["source_row"] != row_data["source_row"]:
                            other_row["validation_status"] = ImportValidationStatus.invalid
                            other_row["validation_errors"] = [f"Duplicate student number in import: {student_number}"]
                            other_row["conflict_key"] = student_number
                    
                    row_data["validation_status"] = ImportValidationStatus.valid
                    row_data["validation_errors"] = []
                    row_data["conflict_key"] = None
                else:
                    row_data["validation_status"] = ImportValidationStatus.valid
                    row_data["validation_errors"] = []
                    row_data["conflict_key"] = None
            else:
                row_data["validation_status"] = ImportValidationStatus.valid
                row_data["validation_errors"] = []
                row_data["conflict_key"] = None

    def create_staging_records(
        self, import_batch: ImportBatch, parsed_rows: List[Dict[str, Any]]
    ) -> List[StudentImportRecord]:
        """Create StudentImportRecord staging records from parsed rows"""
        records = []

        for row_data in parsed_rows:
            record = StudentImportRecord(
                import_batch_id=import_batch.id,
                source_sheet=row_data["source_sheet"],
                source_row=row_data["source_row"],
                source_no=row_data.get("source_no"),
                raw_student_number=row_data["raw_student_number"],
                raw_last_name=row_data["raw_last_name"],
                raw_first_name=row_data["raw_first_name"],
                raw_middle_name=row_data.get("raw_middle_name"),
                raw_mobile_number=row_data.get("raw_mobile_number"),
                raw_email=row_data.get("raw_email"),
                raw_subjects_enrolled=row_data.get("raw_subjects_enrolled"),
                raw_status=row_data.get("raw_status"),
                academic_status=None,
                validation_status=row_data["validation_status"],
                validation_errors=row_data["validation_errors"],
                conflict_key=row_data.get("conflict_key"),
            )

            self.session.add(record)
            records.append(record)

        return records

    def get_validation_summary(self, parsed_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Get validation summary from parsed rows"""
        summary = {
            "total_rows": len(parsed_rows),
            "valid_rows": 0,
            "invalid_rows": 0,
            "conflict_rows": 0,
            "rows_by_status": {},
        }

        for row_data in parsed_rows:
            status = row_data["validation_status"]

            if status == ImportValidationStatus.valid:
                summary["valid_rows"] += 1
            elif status == ImportValidationStatus.invalid:
                summary["invalid_rows"] += 1
            elif status == ImportValidationStatus.conflict_cross_program:
                summary["conflict_rows"] += 1

            summary["rows_by_status"][status] = (
                summary["rows_by_status"].get(status, 0) + 1
            )

        return summary


# Module-level functions for backward compatibility
def parse_student_import(session: Session, import_batch: ImportBatch, xlsx_file: bytes) -> List[Dict[str, Any]]:
    """Parse XLSX workbook and create StudentImportRecord staging rows.

    Returns:
        List of parsed row data with validation results
    """
    service = StudentImportService(session)
    return service.parse_student_import(import_batch, xlsx_file)


def validate_student_import(session: Session, import_batch: ImportBatch, xlsx_file: bytes) -> Dict[str, Any]:
    """Parse and validate XLSX workbook, returning validation summary."""
    service = StudentImportService(session)
    parsed_rows = service.parse_student_import(import_batch, xlsx_file)
    return service.get_validation_summary(parsed_rows)


# Export types for type hints
from typing import TypedDict

class ImportRowData(TypedDict):
    source_sheet: str
    source_row: int
