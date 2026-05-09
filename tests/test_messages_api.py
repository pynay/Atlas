import json
from typing import AsyncIterator
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.db import get_session
from app.main import app
from app.models import Conversation, Message, Video
from app.services.twelvelabs import SearchHit


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


def _seed_conversation(engine) -> tuple[int, int]:
    with Session(engine) as s:
        v = Video(
            source_url="u",
            status="ready",
            twelvelabs_video_id="v_1",
            duration=60.0,
        )
        s.add(v); s.commit(); s.refresh(v)
        c = Conversation(video_id=v.id)
        s.add(c); s.commit(); s.refresh(c)
        return v.id, c.id


def _parse_sse(body: str) -> list[tuple[str, dict | str]]:
    events: list[tuple[str, dict | str]] = []
    cur_event = None
    cur_data: list[str] = []
    for line in body.splitlines():
        if line.startswith("event:"):
            cur_event = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            cur_data.append(line.split(":", 1)[1].strip())
        elif line == "":
            if cur_event is not None:
                raw = "\n".join(cur_data)
                try:
                    events.append((cur_event, json.loads(raw)))
                except json.JSONDecodeError:
                    events.append((cur_event, raw))
            cur_event = None
            cur_data = []
    return events


async def _fake_tokens(*args, **kwargs) -> AsyncIterator[str]:
    for t in [
        "It overshoots, ",
        "see ",
        '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="3"/></svg>',
        " then settles.",
    ]:
        yield t


def test_post_message_streams_sse(client_and_engine):
    client, engine = client_and_engine
    vid, cid = _seed_conversation(engine)

    fake_search = AsyncMock(
        return_value=[
            SearchHit(
                video_id="v_1", start=12.0, end=18.5, score=0.91,
                thumbnail_url="https://t/1.jpg",
            )
        ]
    )

    with patch("app.routes.messages._search_clips", new=fake_search), patch(
        "app.routes.messages._stream_tokens", new=_fake_tokens
    ):
        r = client.post(f"/conversations/{cid}/messages", json={"content": "what happens?"})
    assert r.status_code == 200
    events = _parse_sse(r.text)
    kinds = [k for k, _ in events]
    assert "text_delta" in kinds
    assert "svg" in kinds
    assert "sources" in kinds
    assert kinds[-1] == "done"

    text_combined = "".join(
        v["delta"] for k, v in events if k == "text_delta" and isinstance(v, dict)
    )
    assert "It overshoots" in text_combined
    assert "settles" in text_combined
    # SVG event payload
    svg_event = next(v for k, v in events if k == "svg")
    assert "<svg" in svg_event["svg"]
    # Sources
    sources_event = next(v for k, v in events if k == "sources")
    assert sources_event["refs"][0]["start"] == 12.0


def test_post_message_persists_assistant_message(client_and_engine):
    client, engine = client_and_engine
    vid, cid = _seed_conversation(engine)

    fake_search = AsyncMock(return_value=[])
    with patch("app.routes.messages._search_clips", new=fake_search), patch(
        "app.routes.messages._stream_tokens", new=_fake_tokens
    ):
        client.post(f"/conversations/{cid}/messages", json={"content": "q"})

    with Session(engine) as s:
        msgs = s.exec(
            select(Message).where(Message.conversation_id == cid)
        ).all()
    roles = [m.role for m in msgs]
    assert roles == ["user", "assistant"]
    asst = msgs[1]
    assert "It overshoots" in asst.content
    assert asst.svg is not None
    assert "<svg" in asst.svg


def test_post_message_404_for_missing_conversation(client_and_engine):
    client, _ = client_and_engine
    r = client.post("/conversations/9999/messages", json={"content": "q"})
    assert r.status_code == 404


def test_post_message_409_when_video_not_ready(client_and_engine):
    client, engine = client_and_engine
    with Session(engine) as s:
        v = Video(source_url="u", status="indexing")
        s.add(v); s.commit(); s.refresh(v)
        c = Conversation(video_id=v.id)
        s.add(c); s.commit(); s.refresh(c)
        cid = c.id

    r = client.post(f"/conversations/{cid}/messages", json={"content": "q"})
    assert r.status_code == 409
