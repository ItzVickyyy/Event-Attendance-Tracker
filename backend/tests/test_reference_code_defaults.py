from sqlalchemy import text
from sqlmodel import Session

REFERENCE_CODE_DEFAULTS = (
    ("user", "USR", "user_reference_code_seq"),
    ("organizations", "ORG", "organization_reference_code_seq"),
    ("academic_programs", "PRG", "academic_program_reference_code_seq"),
    ("academic_sections", "SEC", "academic_section_reference_code_seq"),
    ("students", "STU", "student_reference_code_seq"),
    ("events", "EVT", "event_reference_code_seq"),
    ("attendance_sessions", "SES", "attendance_session_reference_code_seq"),
)


def test_reference_code_defaults_are_sql_expressions(db: Session) -> None:
    for table, prefix, sequence in REFERENCE_CODE_DEFAULTS:
        default = db.connection().execute(
            text(
                """
                SELECT column_default
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = :table_name
                  AND column_name = 'reference_code'
                """
            ),
            {"table_name": table},
        ).scalar_one_or_none()

        assert default is not None, f"{table}.reference_code has no default"
        assert sequence in default
        assert prefix in default
        assert "nextval" in default
        assert not default.lstrip().startswith("'''"), (
            f"{table}.reference_code stores the SQL expression as a string literal"
        )
