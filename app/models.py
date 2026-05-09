from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Video(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    source_url: str
    title: Optional[str] = None
    duration: Optional[float] = None
    twelvelabs_video_id: Optional[str] = None
    twelvelabs_index_id: Optional[str] = None
    twelvelabs_task_id: Optional[str] = None
    hls_url: Optional[str] = None
    status: str = "pending"  # pending | indexing | ready | failed
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=_utcnow)


class Conversation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    video_id: int = Field(foreign_key="video.id")
    created_at: datetime = Field(default_factory=_utcnow)


class Message(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="conversation.id")
    role: str  # user | assistant
    content: str
    svg: Optional[str] = None
    source_refs: Optional[list[dict[str, Any]]] = Field(
        default=None, sa_column=Column(JSON)
    )
    created_at: datetime = Field(default_factory=_utcnow)
