from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine

from app.db import get_session
from app.main import app
from app.models import Video


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
