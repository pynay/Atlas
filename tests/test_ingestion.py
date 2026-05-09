from unittest.mock import AsyncMock

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.models import Video
from app.services.ingestion import poll_once
from app.services.twelvelabs import TaskStatus


def _engine_with_video(**fields) -> tuple:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        v = Video(source_url="u", status="indexing", twelvelabs_task_id="task_a", **fields)
        s.add(v)
        s.commit()
        s.refresh(v)
        return engine, v.id


@pytest.mark.asyncio
async def test_poll_marks_ready():
    engine, vid = _engine_with_video()
    fake_client = AsyncMock()
    fake_client.get_task_status.return_value = TaskStatus(
        task_id="task_a", status="ready", video_id="v_1",
        duration=42.0, title="hello.mp4", error=None,
    )
    await poll_once(engine, fake_client)
    with Session(engine) as s:
        v = s.get(Video, vid)
        assert v.status == "ready"
        assert v.twelvelabs_video_id == "v_1"
        assert v.duration == 42.0
        assert v.title == "hello.mp4"


@pytest.mark.asyncio
async def test_poll_marks_failed():
    engine, vid = _engine_with_video()
    fake_client = AsyncMock()
    fake_client.get_task_status.return_value = TaskStatus(
        task_id="task_a", status="failed", video_id=None,
        duration=None, title=None, error="bad codec",
    )
    await poll_once(engine, fake_client)
    with Session(engine) as s:
        v = s.get(Video, vid)
        assert v.status == "failed"
        assert v.error == "bad codec"


@pytest.mark.asyncio
async def test_poll_keeps_indexing():
    engine, vid = _engine_with_video()
    fake_client = AsyncMock()
    fake_client.get_task_status.return_value = TaskStatus(
        task_id="task_a", status="indexing", video_id=None,
        duration=None, title=None, error=None,
    )
    await poll_once(engine, fake_client)
    with Session(engine) as s:
        v = s.get(Video, vid)
        assert v.status == "indexing"


@pytest.mark.asyncio
async def test_poll_swallows_client_errors():
    engine, vid = _engine_with_video()
    fake_client = AsyncMock()
    fake_client.get_task_status.side_effect = RuntimeError("network")
    # Should not raise — failures on individual videos must not stop the loop.
    await poll_once(engine, fake_client)
    with Session(engine) as s:
        v = s.get(Video, vid)
        assert v.status == "indexing"
