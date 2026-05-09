from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import httpx


class TwelveLabsError(RuntimeError):
    pass


@dataclass(frozen=True)
class TaskStatus:
    task_id: str
    status: str  # pending | indexing | ready | failed
    video_id: Optional[str]
    duration: Optional[float]
    title: Optional[str]
    error: Optional[str]


@dataclass(frozen=True)
class SearchHit:
    video_id: str
    start: float
    end: float
    score: float
    thumbnail_url: Optional[str]


class TwelveLabsClient:
    def __init__(
        self,
        api_key: str,
        index_id: str,
        base_url: str = "https://api.twelvelabs.io/v1.3",
        timeout: float = 30.0,
    ):
        self._api_key = api_key
        self._index_id = index_id
        self._base_url = base_url
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={"x-api-key": api_key},
            timeout=timeout,
        )

    async def __aenter__(self) -> "TwelveLabsClient":
        return self

    async def __aexit__(self, *exc) -> None:
        await self._client.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def create_ingest_task_from_file(self, file_path: str) -> str:
        with open(file_path, "rb") as fh:
            files = {"video_file": (file_path, fh, "video/mp4")}
            data = {"index_id": self._index_id}
            r = await self._client.post("/tasks", data=data, files=files)
        if r.status_code >= 400:
            raise TwelveLabsError(f"upload task failed: {r.status_code} {r.text}")
        return r.json()["_id"]

    async def get_task_status(self, task_id: str) -> TaskStatus:
        r = await self._client.get(f"/tasks/{task_id}")
        if r.status_code >= 400:
            raise TwelveLabsError(f"get task failed: {r.status_code} {r.text}")
        b = r.json()
        meta = b.get("metadata") or {}
        return TaskStatus(
            task_id=b["_id"],
            status=b["status"],
            video_id=b.get("video_id"),
            duration=meta.get("duration"),
            title=meta.get("filename"),
            error=b.get("error"),
        )

    async def search(
        self,
        video_id: str,
        query: str,
        top_k: int = 8,
        min_score: float = 0.5,
    ) -> list[SearchHit]:
        r = await self._client.post(
            "/search",
            json={
                "index_id": self._index_id,
                "video_ids": [video_id],
                "query_text": query,
                "search_options": ["visual", "audio"],
                "page_limit": top_k,
            },
        )
        if r.status_code >= 400:
            raise TwelveLabsError(f"search failed: {r.status_code} {r.text}")
        body = r.json()
        hits: list[SearchHit] = []
        for d in body.get("data", []):
            score = float(d.get("score", 0.0))
            if score < min_score:
                continue
            hits.append(
                SearchHit(
                    video_id=d["video_id"],
                    start=float(d["start"]),
                    end=float(d["end"]),
                    score=score,
                    thumbnail_url=d.get("thumbnail_url"),
                )
            )
        return hits
