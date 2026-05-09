import json
from typing import AsyncIterator

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from sse_starlette.sse import EventSourceResponse

from app.config import get_settings
from app.db import get_session
from app.models import Conversation, Message, Video
from app.schemas import CreateMessageRequest
from app.services.chat_stream import stream_with_svg_buffer
from app.services.claude_client import build_system_prompt, stream_claude_tokens
from app.services.sanitize import sanitize_svg
from app.services.twelvelabs import SearchHit, TwelveLabsClient

router = APIRouter(prefix="/conversations", tags=["messages"])


async def _search_clips(video_id: str, query: str) -> list[SearchHit]:
    settings = get_settings()
    async with TwelveLabsClient(
        api_key=settings.twelvelabs_api_key,
        index_id=settings.twelvelabs_index_id,
        base_url=settings.twelvelabs_base_url,
    ) as c:
        return await c.search(video_id=video_id, query=query)


async def _stream_tokens(
    *, system: str, messages: list[dict]
) -> AsyncIterator[str]:
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    async for tok in stream_claude_tokens(
        client=client,
        model=settings.claude_model,
        system=system,
        messages=messages,
    ):
        yield tok


def _format_clip_context(hits: list[SearchHit]) -> str:
    if not hits:
        return "(no relevant clips were retrieved)"
    lines = ["Retrieved clips from the video:"]
    for h in hits:
        lines.append(f"- [{h.start:.1f}s–{h.end:.1f}s, score={h.score:.2f}]")
    return "\n".join(lines)


def _build_messages(history: list[Message], clips: list[SearchHit], question: str) -> list[dict]:
    msgs: list[dict] = []
    for m in history:
        if m.role in ("user", "assistant"):
            msgs.append({"role": m.role, "content": m.content})
    user_block = f"{_format_clip_context(clips)}\n\nQuestion: {question}"
    msgs.append({"role": "user", "content": user_block})
    return msgs


@router.post("/{conversation_id}/messages")
async def post_message(
    conversation_id: int,
    req: CreateMessageRequest,
    session: Session = Depends(get_session),
) -> EventSourceResponse:
    conv = session.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="conversation not found")
    video = session.get(Video, conv.video_id)
    if video is None:
        raise HTTPException(status_code=404, detail="video not found")
    if video.status != "ready" or not video.twelvelabs_video_id:
        raise HTTPException(status_code=409, detail=f"video not ready (status={video.status})")

    history = session.exec(
        select(Message).where(Message.conversation_id == conversation_id).order_by(Message.id)
    ).all()

    user_msg = Message(conversation_id=conversation_id, role="user", content=req.content)
    session.add(user_msg)
    session.commit()
    session.refresh(user_msg)

    hits = await _search_clips(video.twelvelabs_video_id, req.content)
    messages_payload = _build_messages(history, hits, req.content)
    system = build_system_prompt()

    async def event_gen():
        text_chunks: list[str] = []
        svg_payload: str | None = None
        token_iter = _stream_tokens(system=system, messages=messages_payload)
        async for kind, payload in stream_with_svg_buffer(token_iter):
            if kind == "text":
                text_chunks.append(payload)
                yield {"event": "text_delta", "data": json.dumps({"delta": payload})}
            elif kind == "svg":
                cleaned = sanitize_svg(payload)
                if cleaned is not None:
                    svg_payload = cleaned
                    yield {"event": "svg", "data": json.dumps({"svg": cleaned})}

        refs = [
            {
                "start": h.start,
                "end": h.end,
                "score": h.score,
                "thumbnail_url": h.thumbnail_url,
            }
            for h in hits
        ]
        yield {"event": "sources", "data": json.dumps({"refs": refs})}

        # Persist assistant message
        full_text = "".join(text_chunks)
        asst = Message(
            conversation_id=conversation_id,
            role="assistant",
            content=full_text,
            svg=svg_payload,
            source_refs=refs or None,
        )
        session.add(asst)
        session.commit()
        session.refresh(asst)

        yield {"event": "done", "data": json.dumps({"message_id": asst.id})}

    return EventSourceResponse(event_gen())
