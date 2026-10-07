"""Public student QR self-service lookup.

Students can retrieve their existing QR credential without creating an account.
The lookup requires an exact student number and normalized full name match.
"""

import re
import time
from collections import defaultdict
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text

from app.api.deps import SessionDep

router = APIRouter(prefix="/public/student-qr", tags=["public-student-qr"])

WINDOW_SECONDS = 60
MAX_ATTEMPTS = 12
_attempts: dict[str, list[float]] = defaultdict(list)


class StudentQrLookupRequest(BaseModel):
    student_number: str
    first_name: str
    middle_name: str = ""
    last_name: str
    name_extension: str = ""


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()).casefold()


def _allow_request(client_key: str) -> bool:
    now = time.monotonic()
    recent = [stamp for stamp in _attempts[client_key] if now - stamp < WINDOW_SECONDS]
    if len(recent) >= MAX_ATTEMPTS:
        _attempts[client_key] = recent
        return False
    recent.append(now)
    _attempts[client_key] = recent
    return True


@router.post("")
def lookup_student_qr(
    payload: StudentQrLookupRequest,
    session: SessionDep,
    request: Request,
) -> dict[str, Any]:
    """Verify a student's identity and return their stable QR credential."""
    forwarded = request.headers.get("x-forwarded-for")
    client_key = (forwarded.split(",")[0].strip() if forwarded else None) or (
        request.client.host if request.client else "unknown"
    )
    if not _allow_request(client_key):
        raise HTTPException(
            status_code=429, detail="Too many attempts. Please try again later."
        )

    student_number = payload.student_number.strip()
    first_name = _normalize(payload.first_name)
    middle_name = _normalize(payload.middle_name)
    last_name = _normalize(payload.last_name)
    name_extension = _normalize(payload.name_extension)

    if not student_number or not first_name or not last_name:
        raise HTTPException(
            status_code=422,
            detail="Student number, first name, and last name are required.",
        )
    if len(student_number) > 50 or any(
        len(value) > 255
        for value in (first_name, middle_name, last_name, name_extension)
    ):
        raise HTTPException(status_code=400, detail="Invalid lookup input.")

    row = (
        session.execute(
            text(
                """
            SELECT
                s.student_number,
                p.first_name,
                p.middle_name,
                p.last_name,
                p.name_extension,
                sec.section_name,
                prog.program_code,
                c.credential_value
            FROM students s
            JOIN people p ON p.id = s.person_id
            JOIN student_enrollments se ON se.student_id = s.id
            JOIN academic_sections sec ON sec.id = se.section_id
            JOIN academic_programs prog ON prog.id = sec.program_id
            JOIN attendees a ON a.person_id = s.person_id
            JOIN attendee_credentials c
              ON c.attendee_id = a.id
             AND CAST(c.credential_type AS TEXT) = 'qr'
             AND c.is_active = true
            WHERE s.student_number = :student_number
              AND s.archived_at IS NULL
              AND se.student_status IS NOT NULL
            ORDER BY se.created_at DESC
            LIMIT 1
            """
            ),
            {"student_number": student_number},
        )
        .mappings()
        .first()
    )

    if not row:
        raise HTTPException(status_code=404, detail="Student record not found.")

    parts = [
        row["first_name"],
        row["middle_name"],
        row["last_name"],
        row["name_extension"],
    ]
    stored = {
        "first_name": _normalize(str(row["first_name"] or "")),
        "middle_name": _normalize(str(row["middle_name"] or "")),
        "last_name": _normalize(str(row["last_name"] or "")),
        "name_extension": _normalize(str(row["name_extension"] or "")),
    }
    supplied = {
        "first_name": first_name,
        "middle_name": middle_name,
        "last_name": last_name,
        "name_extension": name_extension,
    }
    if stored != supplied:
        raise HTTPException(status_code=404, detail="Student record not found.")

    return {
        "student_number": row["student_number"],
        "full_name": " ".join(str(part) for part in parts if part),
        "section": f"{row['program_code']} {row['section_name']}",
        "credential_value": row["credential_value"],
    }
