"""Shared pytest fixtures for the backend test suite."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app

# ---------------------------------------------------------------------------
# In-memory SQLite database – isolated per test session
# ---------------------------------------------------------------------------
SQLALCHEMY_TEST_URL = "sqlite://"

engine = create_engine(
    SQLALCHEMY_TEST_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def create_tables():
    """Create all tables once for the test session."""
    # Import all models so that Base.metadata is populated
    import app.models.usuario  # noqa: F401
    import app.models.anuncio  # noqa: F401
    import app.models.categoria  # noqa: F401
    import app.models.mensagem  # noqa: F401
    import app.models.denuncia  # noqa: F401
    import app.models.decisao_administrativa  # noqa: F401
    import app.models.chat  # noqa: F401

    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db_session(create_tables):
    """Yield a SQLAlchemy session that is rolled back after each test.

    An outer connection-level transaction is started before the test.  An
    initial SAVEPOINT is opened immediately so that every ``session.commit()``
    call inside application code only releases a SAVEPOINT (and never commits
    the outer transaction).  The ``after_transaction_end`` event listener
    re-opens the SAVEPOINT after each release so subsequent commits in the
    same test also stay within the outer transaction.  At teardown the outer
    transaction is rolled back, leaving the in-memory database clean.

    This pattern is used instead of SQLAlchemy 2.0's
    ``join_transaction_mode="create_savepoint"`` because that mode does not
    reliably isolate tests when using an in-memory SQLite database with
    ``StaticPool`` (the connection lifecycle prevents proper rollback).
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    nested = connection.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def reopen_savepoint(sess, trans):
        nonlocal nested
        if not nested.is_active:
            nested = connection.begin_nested()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(db_session):
    """FastAPI TestClient with the DB dependency overridden."""

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
