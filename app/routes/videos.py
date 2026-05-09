import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.config import get_settings
from app.db import get_session
from app.models import Video
from app.schemas import (
    CreateVideoRequest,
    FlashcardItem,
    FlashcardsResponse,
    InsightItem,
    InsightsResponse,
    NotesResponse,
    ProblemItem,
    ProblemsResponse,
    VideoResponse,
)
from app.services.study import (
    generate_flashcards,
    generate_insights,
    generate_notes,
    generate_problems,
)
from app.services.twelvelabs import TwelveLabsClient, TwelveLabsError
from app.services.youtube import download_to_tmp

router = APIRouter(prefix="/videos", tags=["videos"])


async def _start_ingestion(url: str) -> str:
    settings = get_settings()
    local_path = await download_to_tmp(url)
    async with TwelveLabsClient(
        api_key=settings.twelvelabs_api_key,
        index_id=settings.twelvelabs_index_id,
        base_url=settings.twelvelabs_base_url,
    ) as c:
        return await c.create_ingest_task_from_file(local_path)


def _to_response(v: Video) -> VideoResponse:
    return VideoResponse(
        id=v.id,
        source_url=v.source_url,
        title=v.title,
        duration=v.duration,
        status=v.status,
        error=v.error,
        hls_url=v.hls_url,
        created_at=v.created_at,
    )


@router.post("", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
async def create_video(
    req: CreateVideoRequest,
    session: Session = Depends(get_session),
) -> VideoResponse:
    settings = get_settings()
    v = Video(
        source_url=str(req.url),
        twelvelabs_index_id=settings.twelvelabs_index_id,
        status="pending",
    )
    session.add(v)
    session.commit()
    session.refresh(v)

    try:
        task_id = await _start_ingestion(str(req.url))
        v.twelvelabs_task_id = task_id
        v.status = "indexing"
    except (TwelveLabsError, Exception) as e:
        v.status = "failed"
        v.error = str(e)

    session.add(v)
    session.commit()
    session.refresh(v)
    return _to_response(v)


@router.get("/{video_id}", response_model=VideoResponse)
async def get_video(
    video_id: int,
    session: Session = Depends(get_session),
) -> VideoResponse:
    v = session.get(Video, video_id)
    if v is None:
        raise HTTPException(status_code=404, detail="video not found")

    # Backfill HLS URL for videos indexed before this field existed
    if v.status == "ready" and v.twelvelabs_video_id and not v.hls_url:
        settings = get_settings()
        async with TwelveLabsClient(
            api_key=settings.twelvelabs_api_key,
            index_id=settings.twelvelabs_index_id,
            base_url=settings.twelvelabs_base_url,
        ) as c:
            v.hls_url = await c.get_video_hls_url(v.twelvelabs_video_id)
        session.add(v)
        session.commit()
        session.refresh(v)

    return _to_response(v)


def _require_ready_video(video_id: int, session: Session) -> Video:
    v = session.get(Video, video_id)
    if v is None:
        raise HTTPException(status_code=404, detail="video not found")
    if v.status != "ready" or not v.twelvelabs_video_id:
        raise HTTPException(
            status_code=409, detail=f"video not ready (status={v.status})"
        )
    return v


@router.get("/{video_id}/define")
async def define_term(
    video_id: int,
    term: str,
    session: Session = Depends(get_session),
) -> dict:
    v = session.get(Video, video_id)
    if not v or v.status != "ready" or not v.twelvelabs_video_id:
        return {"context": None}
    settings = get_settings()
    try:
        async with TwelveLabsClient(
            api_key=settings.twelvelabs_api_key,
            index_id=settings.twelvelabs_index_id,
            base_url=settings.twelvelabs_base_url,
        ) as c:
            hits = await c.search(v.twelvelabs_video_id, term, top_k=5)
        for hit in hits:
            if hit.transcription and hit.transcription.strip():
                return {"context": hit.transcription, "start": hit.start, "end": hit.end}
    except Exception:
        pass
    return {"context": None}


@router.post("/{video_id}/notes", response_model=NotesResponse)
async def post_video_notes(
    video_id: int,
    session: Session = Depends(get_session),
) -> NotesResponse:
    v = _require_ready_video(video_id, session)
    if v.notes_cache:
        return NotesResponse(video_id=video_id, notes=v.notes_cache)
    notes = await generate_notes(v.twelvelabs_video_id)
    v.notes_cache = notes
    session.add(v)
    session.commit()
    return NotesResponse(video_id=video_id, notes=notes)


@router.post("/{video_id}/flashcards", response_model=FlashcardsResponse)
async def post_video_flashcards(
    video_id: int,
    session: Session = Depends(get_session),
) -> FlashcardsResponse:
    v = _require_ready_video(video_id, session)
    if v.flashcards_cache:
        data = json.loads(v.flashcards_cache)
        return FlashcardsResponse(
            video_id=video_id,
            cards=[FlashcardItem(question=c["question"], answer=c["answer"]) for c in data],
        )
    cards = await generate_flashcards(v.twelvelabs_video_id)
    v.flashcards_cache = json.dumps([{"question": c.question, "answer": c.answer} for c in cards])
    session.add(v)
    session.commit()
    return FlashcardsResponse(
        video_id=video_id,
        cards=[FlashcardItem(question=c.question, answer=c.answer) for c in cards],
    )


@router.post("/{video_id}/problems", response_model=ProblemsResponse)
async def post_video_problems(
    video_id: int,
    session: Session = Depends(get_session),
) -> ProblemsResponse:
    v = _require_ready_video(video_id, session)
    if v.problems_cache:
        data = json.loads(v.problems_cache)
        return ProblemsResponse(
            video_id=video_id,
            problems=[ProblemItem(question=p["question"], answer=p["answer"]) for p in data],
        )
    problems = await generate_problems(v.twelvelabs_video_id)
    v.problems_cache = json.dumps([{"question": p.question, "answer": p.answer} for p in problems])
    session.add(v)
    session.commit()
    return ProblemsResponse(
        video_id=video_id,
        problems=[ProblemItem(question=p.question, answer=p.answer) for p in problems],
    )


@router.post("/{video_id}/insights", response_model=InsightsResponse)
async def post_video_insights(
    video_id: int,
    session: Session = Depends(get_session),
) -> InsightsResponse:
    v = _require_ready_video(video_id, session)
    if v.insights_cache:
        data = json.loads(v.insights_cache)
        return InsightsResponse(
            video_id=video_id,
            insights=[InsightItem(start=i["start"], end=i["end"], title=i["title"], body=i["body"]) for i in data],
        )
    insights = await generate_insights(v.twelvelabs_video_id)
    v.insights_cache = json.dumps([{"start": i.start, "end": i.end, "title": i.title, "body": i.body} for i in insights])
    session.add(v)
    session.commit()
    return InsightsResponse(
        video_id=video_id,
        insights=[InsightItem(start=i.start, end=i.end, title=i.title, body=i.body) for i in insights],
    )
