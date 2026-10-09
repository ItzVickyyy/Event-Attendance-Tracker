"""Helpers for generating human-readable reference codes."""

from sqlalchemy import text
from sqlmodel import Session


def next_user_reference_code(session: Session) -> str:
    """Allocate the next USR reference code from the database sequence."""
    return str(
        session.connection()
        .execute(
            text(
                "SELECT 'USR-' || LPAD(nextval('user_reference_code_seq'::regclass)::text, 6, '0')"
            )
        )
        .scalar_one()
    )


def next_student_reference_code(session: Session) -> str:
    """Allocate the next STU reference code from the database sequence.

    PostgreSQL sequences are concurrency-safe and intentionally allow gaps.
    The database remains the source of truth for the numeric allocation.
    """
    return str(
        session.connection()
        .execute(
            text(
                "SELECT 'STU-' || LPAD(nextval('student_reference_code_seq'::regclass)::text, 6, '0')"
            )
        )
        .scalar_one()
    )
