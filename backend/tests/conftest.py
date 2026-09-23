from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, delete

from app.core.config import settings
from app.core.db import engine, init_db
from app.main import app
from app.models import (
    AcademicProgram,
    AcademicSection,
    Attendance,
    AttendanceCorrection,
    Attendee,
    AttendeeCredential,
    AttendeeRelationship,
    Event,
    EventRegistration,
    ImportBatch,
    Organization,
    Person,
    Student,
    StudentImportRecord,
    User,
)
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import get_superuser_token_headers


@pytest.fixture(scope="session", autouse=True)
def db() -> Generator[Session]:
    with Session(engine) as session:
        init_db(session)
        yield session
        for model in [
            StudentImportRecord,
            ImportBatch,
            AttendanceCorrection,
            Attendance,
            EventRegistration,
            Event,
            AttendeeRelationship,
            AttendeeCredential,
            Attendee,
            Student,
            AcademicSection,
            AcademicProgram,
            Person,
            Organization,
            User,
        ]:
            session.execute(delete(model))
        session.commit()


@pytest.fixture
def db_session(db: Session) -> Generator[Session]:
    """Per-test, transactionally-isolated database session.

    `db` (above) is a single session-scoped connection/session shared by the
    whole pytest run, so anything a test leaves uncommitted - or a
    transaction a test leaves in a failed/rolled-back state - persists and
    can contaminate every later test. This fixture instead opens its own
    DBAPI connection and starts an explicit outer transaction on it for the
    duration of a single test, then rolls that outer transaction back at
    teardown, discarding everything the test did regardless of whether the
    test itself called session.commit()/rollback() or raised partway
    through.

    Application code under test (e.g. StudentImportService,
    StudentPromotionService) is free to call session.commit() as normal:
    join_transaction_mode="create_savepoint" makes the Session satisfy those
    calls with a SAVEPOINT instead of ending the real transaction, so the
    outer transaction - and this fixture's teardown rollback - stays intact
    no matter what the code under test does.

    `db` is still depended on (and is still session-scoped/autouse) purely
    to guarantee schema creation and the first-superuser row exist before
    this connection is opened; this fixture does not read or write through
    that shared session.
    """
    connection = engine.connect()
    outer_transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        outer_transaction.rollback()
        connection.close()


@pytest.fixture(scope="module")
def client() -> Generator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def superuser_token_headers(client: TestClient) -> dict[str, str]:
    return get_superuser_token_headers(client)


@pytest.fixture(scope="module")
def normal_user_token_headers(client: TestClient, db: Session) -> dict[str, str]:
    return authentication_token_from_email(
        client=client, email=settings.EMAIL_TEST_USER, db=db
    )
