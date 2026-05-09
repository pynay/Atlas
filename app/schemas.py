from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, HttpUrl


class CreateVideoRequest(BaseModel):
    url: HttpUrl


class VideoResponse(BaseModel):
    id: int
    source_url: str
    title: Optional[str]
    duration: Optional[float]
    status: str
    error: Optional[str]
    hls_url: Optional[str] = None
    created_at: datetime


class CreateConversationRequest(BaseModel):
    video_id: int


class ConversationResponse(BaseModel):
    id: int
    video_id: int
    created_at: datetime


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    svg: Optional[str]
    source_refs: Optional[list[dict[str, Any]]]
    created_at: datetime


class ConversationDetailResponse(BaseModel):
    id: int
    video_id: int
    created_at: datetime
    messages: list[MessageResponse]


class CreateMessageRequest(BaseModel):
    content: str


class NotesResponse(BaseModel):
    video_id: int
    notes: str


class FlashcardItem(BaseModel):
    question: str
    answer: str


class FlashcardsResponse(BaseModel):
    video_id: int
    cards: list[FlashcardItem]


class ProblemItem(BaseModel):
    question: str
    answer: str


class ProblemsResponse(BaseModel):
    video_id: int
    problems: list[ProblemItem]


class InsightItem(BaseModel):
    start: float
    end: float
    title: str
    body: str


class InsightsResponse(BaseModel):
    video_id: int
    insights: list[InsightItem]
