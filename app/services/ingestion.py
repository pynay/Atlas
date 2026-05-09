import asyncio
import logging
from typing import Optional, Protocol

from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.config import get_settings
from app.models import Video
from app.services.twelvelabs import TaskStatus, TwelveLabsClient

logger = logging.getLogger(__name__)


class _StatusFetcher(Protocol):
    async def get_task_status(self, task_id: str) -> TaskStatus: ...
    async def get_video_hls_url(self, video_id: str) -> Optional[str]: ...


async def poll_once(engine: Engine, client: _StatusFetcher) -> None:
    """Update all videos currently in 'indexing' state."""
    with Session(engine) as session:
        rows = session.exec(
            select(Video).where(Video.status == "indexing")
        ).all()
        for v in rows:
            if not v.twelvelabs_task_id:
                continue
            try:
                st = await client.get_task_status(v.twelvelabs_task_id)
            except Exception as e:  # noqa: BLE001 — never let one row stop the loop
                logger.warning("poll error for video %s: %s", v.id, e)
                continue
            if st.status == "ready":
                v.status = "ready"
                v.twelvelabs_video_id = st.video_id
                v.duration = st.duration
                v.title = st.title
                if st.video_id:
                    try:
                        v.hls_url = await client.get_video_hls_url(st.video_id)
                    except Exception as e:  # noqa: BLE001
                        logger.warning("hls fetch failed for video %s: %s", v.id, e)
            elif st.status == "failed":
                v.status = "failed"
                v.error = st.error or "ingestion failed"
            # else: still pending/indexing, leave row as-is
            session.add(v)
        session.commit()


async def run_polling_loop(engine: Engine) -> None:
    settings = get_settings()
    while True:
        try:
            async with TwelveLabsClient(
                api_key=settings.twelvelabs_api_key,
                index_id=settings.twelvelabs_index_id,
                base_url=settings.twelvelabs_base_url,
            ) as c:
                await poll_once(engine, c)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            logger.exception("polling loop iteration failed: %s", e)
        await asyncio.sleep(settings.poll_interval_seconds)
