from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.db import get_session
from app.main import app
from app.models import Video
from app.services.study import Flashcard


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    from sqlmodel import Session

    def _override():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_create_video_starts_ingestion(client):
    with patch("app.routes.videos._start_ingestion", new=AsyncMock(return_value="task_xyz")):
        r = client.post("/videos", json={"url": "https://youtu.be/abc"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "indexing"
    assert isinstance(body["id"], int)


def test_get_video(client):
    with patch("app.routes.videos._start_ingestion", new=AsyncMock(return_value="task_xyz")):
        created = client.post("/videos", json={"url": "https://youtu.be/abc"}).json()
    r = client.get(f"/videos/{created['id']}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == created["id"]
    assert body["source_url"] == "https://youtu.be/abc"
    assert body["status"] == "indexing"


def test_get_video_404(client):
    r = client.get("/videos/9999")
    assert r.status_code == 404


def test_create_video_marks_failed_on_ingest_error(client):
    async def boom(*a, **kw):
        raise RuntimeError("nope")

    with patch("app.routes.videos._start_ingestion", new=AsyncMock(side_effect=boom)):
        r = client.post("/videos", json={"url": "https://youtu.be/zzz"})
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "failed"
    assert "nope" in (body.get("error") or "")


@pytest.fixture
def client_and_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    def _override():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _override
    with TestClient(app) as c:
        yield c, engine
    app.dependency_overrides.clear()


def _seed_ready_video(engine) -> int:
    with Session(engine) as s:
        v = Video(source_url="u", status="ready", twelvelabs_video_id="v_tl_1")
        s.add(v)
        s.commit()
        s.refresh(v)
        return v.id


def _seed_indexing_video(engine) -> int:
    with Session(engine) as s:
        v = Video(source_url="u", status="indexing")
        s.add(v)
        s.commit()
        s.refresh(v)
        return v.id


def test_post_notes(client_and_engine):
    client, engine = client_and_engine
    vid = _seed_ready_video(engine)
    fake = AsyncMock(return_value="## Topic\n- key fact")
    with patch("app.routes.videos.generate_notes", new=fake):
        r = client.post(f"/videos/{vid}/notes")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["video_id"] == vid
    assert body["notes"].startswith("## Topic")
    fake.assert_awaited_once_with("v_tl_1")


def test_post_notes_404(client_and_engine):
    client, _ = client_and_engine
    r = client.post("/videos/9999/notes")
    assert r.status_code == 404


def test_post_notes_409_when_not_ready(client_and_engine):
    client, engine = client_and_engine
    vid = _seed_indexing_video(engine)
    r = client.post(f"/videos/{vid}/notes")
    assert r.status_code == 409


def test_post_flashcards(client_and_engine):
    client, engine = client_and_engine
    vid = _seed_ready_video(engine)
    fake = AsyncMock(
        return_value=[
            Flashcard(question="Q1?", answer="A1."),
            Flashcard(question="Q2?", answer="A2."),
        ]
    )
    with patch("app.routes.videos.generate_flashcards", new=fake):
        r = client.post(f"/videos/{vid}/flashcards")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["video_id"] == vid
    assert len(body["cards"]) == 2
    assert body["cards"][0]["question"] == "Q1?"


def test_post_flashcards_409_when_not_ready(client_and_engine):
    client, engine = client_and_engine
    vid = _seed_indexing_video(engine)
    r = client.post(f"/videos/{vid}/flashcards")
    assert r.status_code == 409
