from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import Conversation, Message, Video
from app.schemas import (
    ConversationDetailResponse,
    ConversationResponse,
    ConversationSummaryItem,
    CreateConversationRequest,
    MessageResponse,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


_PREVIEW_MAX = 100


def _preview(text: str | None) -> str | None:
    if not text:
        return None
    text = text.strip()
    if len(text) <= _PREVIEW_MAX:
        return text
    return text[:_PREVIEW_MAX].rstrip() + "…"


@router.post(
    "", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED
)
def create_conversation(
    req: CreateConversationRequest,
    session: Session = Depends(get_session),
) -> ConversationResponse:
    if session.get(Video, req.video_id) is None:
        raise HTTPException(status_code=404, detail="video not found")
    c = Conversation(video_id=req.video_id)
    session.add(c)
    session.commit()
    session.refresh(c)
    return ConversationResponse(id=c.id, video_id=c.video_id, created_at=c.created_at)


@router.get("", response_model=list[ConversationSummaryItem])
def list_conversations(
    session: Session = Depends(get_session),
) -> list[ConversationSummaryItem]:
    convs = session.exec(
        select(Conversation).order_by(Conversation.created_at.desc())
    ).all()
    out: list[ConversationSummaryItem] = []
    for c in convs:
        v = session.get(Video, c.video_id)
        msgs = session.exec(
            select(Message)
            .where(Message.conversation_id == c.id)
            .order_by(Message.id)
        ).all()
        first_user_msg = next((m for m in msgs if m.role == "user"), None)
        out.append(
            ConversationSummaryItem(
                id=c.id,
                video_id=c.video_id,
                video_title=(v.title if v else None),
                source_url=(v.source_url if v else ""),
                created_at=c.created_at,
                message_count=len(msgs),
                last_message_at=(msgs[-1].created_at if msgs else None),
                preview=_preview(first_user_msg.content if first_user_msg else None),
            )
        )
    return out


@router.get("/{conversation_id}", response_model=ConversationDetailResponse)
def get_conversation(
    conversation_id: int,
    session: Session = Depends(get_session),
) -> ConversationDetailResponse:
    c = session.get(Conversation, conversation_id)
    if c is None:
        raise HTTPException(status_code=404, detail="conversation not found")
    msgs = session.exec(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.id)
    ).all()
    return ConversationDetailResponse(
        id=c.id,
        video_id=c.video_id,
        created_at=c.created_at,
        messages=[
            MessageResponse(
                id=m.id,
                role=m.role,
                content=m.content,
                svg=m.svg,
                source_refs=m.source_refs,
                created_at=m.created_at,
            )
            for m in msgs
        ],
    )
