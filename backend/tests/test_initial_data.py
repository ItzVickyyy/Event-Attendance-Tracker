import logging
from typing import Any

from sqlalchemy.sql.elements import TextClause

from app import initial_data


class RecordingSession:
    def __init__(self, _engine: Any) -> None:
        self.statements: list[str] = []
        self.commits = 0

    def __enter__(self) -> "RecordingSession":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def execute(self, statement: TextClause, *_params: Any) -> None:
        self.statements.append(str(statement))

    def commit(self) -> None:
        self.commits += 1


def test_init_seeds_catalog_and_class_representative_assignment(
    monkeypatch: Any,
) -> None:
    session = RecordingSession(initial_data.engine)
    initialized_sessions: list[RecordingSession] = []

    monkeypatch.setattr(initial_data, "Session", lambda _engine: session)
    monkeypatch.setattr(
        initial_data,
        "init_db",
        lambda current_session: initialized_sessions.append(current_session),
    )

    initial_data.init()

    assert initialized_sessions == [session]
    assert session.commits == 1
    assert len(session.statements) == 36
    assert any("INSERT INTO academic_years" in sql for sql in session.statements)
    assert any("INSERT INTO academic_programs" in sql for sql in session.statements)
    assert any("INSERT INTO academic_majors" in sql for sql in session.statements)
    assert any("INSERT INTO academic_sections" in sql for sql in session.statements)
    assert any(
        "INSERT INTO academic_section_majors" in sql for sql in session.statements
    )
    assert any(
        "INSERT INTO class_representative_assignments" in sql
        for sql in session.statements
    )


def test_main_logs_and_runs_initialization(monkeypatch: Any, caplog: Any) -> None:
    caplog.set_level(logging.INFO)
    initialized: list[bool] = []
    monkeypatch.setattr(initial_data, "init", lambda: initialized.append(True))

    initial_data.main()

    assert initialized == [True]
    assert "Creating initial data" in caplog.text
    assert "Initial data created" in caplog.text
