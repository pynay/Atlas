from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

_settings = get_settings()
_engine_kwargs: dict = {}
if _settings.database_url.startswith("sqlite"):
    _engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(_settings.database_url, **_engine_kwargs)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _migrate()


def _migrate() -> None:
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    existing = {c["name"] for c in inspector.get_columns("video")}
    new_cols = ["notes_cache", "flashcards_cache", "problems_cache", "insights_cache"]
    with engine.begin() as conn:
        for col in new_cols:
            if col not in existing:
                conn.execute(text(f"ALTER TABLE video ADD COLUMN {col} TEXT"))


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
