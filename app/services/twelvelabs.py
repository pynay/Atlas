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
    rank: int
    thumbnail_url: Optional[str]
    transcription: Optional[str]


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
            r = await self._client.post(
                "/tasks",
                data=data,
                files=files,
                timeout=600.0,
            )
        if r.status_code >= 400:
            raise TwelveLabsError(f"upload task failed: {r.status_code} {r.text}")
        return r.json()["_id"]

    async def analyze(self, video_id: str, prompt: str, temperature: float = 0.2) -> str:
        """Run Pegasus open-ended generation against a single video."""
        r = await self._client.post(
            "/analyze",
            json={"video_id": video_id, "prompt": prompt, "temperature": temperature},
            timeout=120.0,
        )
        if r.status_code >= 400:
            raise TwelveLabsError(f"analyze failed: {r.status_code} {r.text}")
        body = r.json()
        return body.get("data") or body.get("text") or body.get("result") or ""

    async def get_video_hls_url(self, video_id: str) -> Optional[str]:
        r = await self._client.get(f"/indexes/{self._index_id}/videos/{video_id}")
        if r.status_code >= 400:
            return None
        body = r.json()
        return (body.get("hls") or {}).get("video_url")

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
    ) -> list[SearchHit]:
        r = await self._client.post(
            "/search",
            files=[
                ("index_id", (None, self._index_id)),
                ("query_text", (None, query)),
                ("search_options", (None, "visual")),
                ("search_options", (None, "audio")),
                ("search_options", (None, "transcription")),
                ("page_limit", (None, str(top_k))),
            ],
        )
        if r.status_code >= 400:
            raise TwelveLabsError(f"search failed: {r.status_code} {r.text}")
        body = r.json()
        hits: list[SearchHit] = []
        for d in body.get("data", []):
            if d.get("video_id") != video_id:
                continue
            hits.append(
                SearchHit(
                    video_id=d["video_id"],
                    start=float(d["start"]),
                    end=float(d["end"]),
                    rank=int(d.get("rank", 99)),
                    thumbnail_url=d.get("thumbnail_url"),
                    transcription=d.get("transcription"),
                )
            )
        return hits
