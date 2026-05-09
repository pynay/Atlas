import httpx
import pytest
import respx

from app.services.twelvelabs import (
    SearchHit,
    TaskStatus,
    TwelveLabsClient,
    TwelveLabsError,
)


@pytest.mark.asyncio
async def test_create_ingest_task_from_file(tmp_path):
    f = tmp_path / "video.mp4"
    f.write_bytes(b"fake mp4 bytes")

    with respx.mock(base_url="https://api.twelvelabs.io/v1.3") as mock:
        mock.post("/tasks").mock(
            return_value=httpx.Response(201, json={"_id": "task_123", "status": "pending"})
        )
        async with TwelveLabsClient(api_key="k", index_id="idx") as c:
            task_id = await c.create_ingest_task_from_file(str(f))
        assert task_id == "task_123"


@pytest.mark.asyncio
async def test_get_task_status_ready():
    with respx.mock(base_url="https://api.twelvelabs.io/v1.3") as mock:
        mock.get("/tasks/task_123").mock(
            return_value=httpx.Response(
                200,
                json={
                    "_id": "task_123",
                    "status": "ready",
                    "video_id": "v_456",
                    "metadata": {"duration": 120.5, "filename": "abc.mp4"},
                },
            )
        )
        async with TwelveLabsClient(api_key="k", index_id="idx") as c:
            status = await c.get_task_status("task_123")
        assert status == TaskStatus(
            task_id="task_123",
            status="ready",
            video_id="v_456",
            duration=120.5,
            title="abc.mp4",
            error=None,
        )


@pytest.mark.asyncio
async def test_get_task_status_failed():
    with respx.mock(base_url="https://api.twelvelabs.io/v1.3") as mock:
        mock.get("/tasks/task_99").mock(
            return_value=httpx.Response(
                200,
                json={"_id": "task_99", "status": "failed", "error": "bad codec"},
            )
        )
        async with TwelveLabsClient(api_key="k", index_id="idx") as c:
            status = await c.get_task_status("task_99")
        assert status.status == "failed"
        assert status.error == "bad codec"


@pytest.mark.asyncio
async def test_search_returns_hits():
    payload = {
        "data": [
            {
                "video_id": "v_456",
                "start": 12.0,
                "end": 18.5,
                "score": 0.91,
                "thumbnail_url": "https://t.example/1.jpg",
            },
            {
                "video_id": "v_456",
                "start": 30.0,
                "end": 35.0,
                "score": 0.42,
                "thumbnail_url": "https://t.example/2.jpg",
            },
        ]
    }
    with respx.mock(base_url="https://api.twelvelabs.io/v1.3") as mock:
        mock.post("/search").mock(return_value=httpx.Response(200, json=payload))
        async with TwelveLabsClient(api_key="k", index_id="idx") as c:
            hits = await c.search(video_id="v_456", query="overshoot", min_score=0.5)
        assert len(hits) == 1
        assert hits[0] == SearchHit(
            video_id="v_456",
            start=12.0,
            end=18.5,
            score=0.91,
            thumbnail_url="https://t.example/1.jpg",
        )


@pytest.mark.asyncio
async def test_analyze_returns_data_field():
    with respx.mock(base_url="https://api.twelvelabs.io/v1.3") as mock:
        route = mock.post("/analyze").mock(
            return_value=httpx.Response(200, json={"id": "g_1", "data": "## Notes\n- foo"})
        )
        async with TwelveLabsClient(api_key="k", index_id="idx") as c:
            text = await c.analyze("v_1", "summarize please")
    assert text == "## Notes\n- foo"
    sent = route.calls.last.request
    assert sent.headers.get("content-type", "").startswith("application/json")
    body = sent.content.decode("utf-8", errors="replace")
    assert "v_1" in body
    assert "summarize please" in body


@pytest.mark.asyncio
async def test_raises_on_http_error(tmp_path):
    f = tmp_path / "video.mp4"
    f.write_bytes(b"fake")
    with respx.mock(base_url="https://api.twelvelabs.io/v1.3") as mock:
        mock.post("/tasks").mock(return_value=httpx.Response(401, json={"error": "auth"}))
        async with TwelveLabsClient(api_key="k", index_id="idx") as c:
            with pytest.raises(TwelveLabsError):
                await c.create_ingest_task_from_file(str(f))
