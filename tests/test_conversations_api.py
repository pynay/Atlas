import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.db import get_session
from app.main import app
from app.models import Conversation, Message, Video


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


def _seed_video(engine, status: str = "ready") -> int:
    with Session(engine) as s:
        v = Video(source_url="u", status=status)
        s.add(v)
        s.commit()
        s.refresh(v)
        return v.id


def test_create_conversation(client_and_engine):
    client, engine = client_and_engine
    vid = _seed_video(engine)
    r = client.post("/conversations", json={"video_id": vid})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["video_id"] == vid
    assert isinstance(body["id"], int)


def test_create_conversation_404_for_missing_video(client_and_engine):
    client, _ = client_and_engine
    r = client.post("/conversations", json={"video_id": 9999})
    assert r.status_code == 404


def test_get_conversation_returns_messages(client_and_engine):
    client, engine = client_and_engine
    vid = _seed_video(engine)
    with Session(engine) as s:
        c = Conversation(video_id=vid)
        s.add(c); s.commit(); s.refresh(c)
        s.add(Message(conversation_id=c.id, role="user", content="hi"))
        s.add(
            Message(
                conversation_id=c.id,
                role="assistant",
                content="hello",
                svg="<svg/>",
                source_refs=[{"start": 1, "end": 2, "score": 0.9}],
            )
        )
        s.commit()
        cid = c.id

    r = client.get(f"/conversations/{cid}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == cid
    assert body["video_id"] == vid
    assert len(body["messages"]) == 2
    assert body["messages"][0]["role"] == "user"
    assert body["messages"][1]["svg"] == "<svg/>"


def test_get_conversation_404(client_and_engine):
    client, _ = client_and_engine
    r = client.get("/conversations/9999")
    assert r.status_code == 404


def test_list_conversations_empty(client_and_engine):
    client, _ = client_and_engine
    r = client.get("/conversations")
    assert r.status_code == 200
    assert r.json() == []


def test_list_conversations_returns_metadata(client_and_engine):
    client, engine = client_and_engine
    with Session(engine) as s:
        v = Video(source_url="https://yt/abc", status="ready", title="Alkanes 101")
        s.add(v); s.commit(); s.refresh(v)
        c = Conversation(video_id=v.id)
        s.add(c); s.commit(); s.refresh(c)
        s.add(Message(conversation_id=c.id, role="user", content="What's an alkane?"))
        s.add(Message(conversation_id=c.id, role="assistant", content="A saturated hydrocarbon."))
        s.commit()
        cid = c.id

    r = client.get("/conversations")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    item = body[0]
    assert item["id"] == cid
    assert item["video_title"] == "Alkanes 101"
    assert item["source_url"] == "https://yt/abc"
    assert item["message_count"] == 2
    assert item["preview"] == "What's an alkane?"


def test_list_conversations_truncates_long_preview(client_and_engine):
    client, engine = client_and_engine
    long_msg = "Q. " + "x" * 200
    with Session(engine) as s:
        v = Video(source_url="u", status="ready")
        s.add(v); s.commit(); s.refresh(v)
        c = Conversation(video_id=v.id)
        s.add(c); s.commit(); s.refresh(c)
        s.add(Message(conversation_id=c.id, role="user", content=long_msg))
        s.commit()

    r = client.get("/conversations")
    assert r.status_code == 200
    preview = r.json()[0]["preview"]
    assert preview is not None
    assert preview.endswith("…")
    assert len(preview) <= 101  # 100 chars + ellipsis


def test_list_conversations_orders_newest_first(client_and_engine):
    client, engine = client_and_engine
    from datetime import datetime, timezone, timedelta
    with Session(engine) as s:
        v = Video(source_url="u", status="ready")
        s.add(v); s.commit(); s.refresh(v)
        older = Conversation(
            video_id=v.id,
            created_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        newer = Conversation(video_id=v.id)
        s.add_all([older, newer])
        s.commit()
        s.refresh(older); s.refresh(newer)

    r = client.get("/conversations")
    assert r.status_code == 200
    ids = [item["id"] for item in r.json()]
    assert ids == [newer.id, older.id]


def test_list_conversations_no_user_message_yields_null_preview(client_and_engine):
    client, engine = client_and_engine
    with Session(engine) as s:
        v = Video(source_url="u", status="ready")
        s.add(v); s.commit(); s.refresh(v)
        c = Conversation(video_id=v.id)
        s.add(c); s.commit()
    r = client.get("/conversations")
    assert r.status_code == 200
    item = r.json()[0]
    assert item["message_count"] == 0
    assert item["preview"] is None
    assert item["last_message_at"] is None
