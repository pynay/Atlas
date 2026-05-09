from datetime import datetime, timezone
from sqlmodel import Session, SQLModel, create_engine, select

from app.models import Conversation, Message, Video


def _make_engine():
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)
    return engine


def test_create_video():
    engine = _make_engine()
    with Session(engine) as s:
        v = Video(source_url="https://youtu.be/abc", status="pending")
        s.add(v)
        s.commit()
        s.refresh(v)
        assert v.id is not None
        assert v.created_at is not None
        assert v.status == "pending"


def test_conversation_and_messages():
    engine = _make_engine()
    with Session(engine) as s:
        v = Video(source_url="u", status="ready")
        s.add(v)
        s.commit()
        s.refresh(v)

        c = Conversation(video_id=v.id)
        s.add(c)
        s.commit()
        s.refresh(c)

        m1 = Message(conversation_id=c.id, role="user", content="hi")
        m2 = Message(
            conversation_id=c.id,
            role="assistant",
            content="hello",
            svg="<svg/>",
            source_refs=[{"start": 1.0, "end": 2.0, "score": 0.9}],
        )
        s.add_all([m1, m2])
        s.commit()

        rows = s.exec(
            select(Message).where(Message.conversation_id == c.id).order_by(Message.id)
        ).all()
        assert [m.role for m in rows] == ["user", "assistant"]
        assert rows[1].source_refs[0]["score"] == 0.9
