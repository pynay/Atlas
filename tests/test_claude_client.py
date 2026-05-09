from typing import AsyncIterator
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.claude_client import build_system_prompt, stream_claude_tokens


def test_system_prompt_mentions_svg_rules():
    p = build_system_prompt()
    assert "svg" in p.lower()
    assert "viewbox" in p.lower()
    # Must tell the model not to use foreignObject / script
    assert "foreignobject" in p.lower() or "no script" in p.lower() or "do not use" in p.lower()


@pytest.mark.asyncio
async def test_stream_claude_tokens_yields_text_deltas():
    # Build a fake anthropic streaming response.
    fake_event_1 = MagicMock()
    fake_event_1.type = "content_block_delta"
    fake_event_1.delta = MagicMock(type="text_delta", text="Hello")

    fake_event_2 = MagicMock()
    fake_event_2.type = "content_block_delta"
    fake_event_2.delta = MagicMock(type="text_delta", text=" world")

    fake_event_3 = MagicMock()
    fake_event_3.type = "message_stop"

    class FakeStream:
        def __init__(self, events):
            self._events = events

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        def __aiter__(self):
            return self._gen()

        async def _gen(self):
            for e in self._events:
                yield e

    fake_messages = MagicMock()
    fake_messages.stream = MagicMock(
        return_value=FakeStream([fake_event_1, fake_event_2, fake_event_3])
    )
    fake_client = MagicMock()
    fake_client.messages = fake_messages

    out: list[str] = []
    async for tok in stream_claude_tokens(
        client=fake_client,
        model="claude-opus-4-7",
        system="sys",
        messages=[{"role": "user", "content": "hi"}],
    ):
        out.append(tok)
    assert out == ["Hello", " world"]
