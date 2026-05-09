from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.config import get_settings
from app.db import get_session
from app.models import Video
from app.schemas import CreateVideoRequest, VideoResponse
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
def get_video(
    video_id: int,
    session: Session = Depends(get_session),
) -> VideoResponse:
    v = session.get(Video, video_id)
    if v is None:
        raise HTTPException(status_code=404, detail="video not found")
    return _to_response(v)
