from typing import AsyncIterator

import pytest

from app.services.chat_stream import stream_with_svg_buffer


async def _aiter(chunks: list[str]) -> AsyncIterator[str]:
    for c in chunks:
        yield c


async def _collect(stream):
    return [evt async for evt in stream]


@pytest.mark.asyncio
async def test_plain_text_passes_through():
    out = await _collect(stream_with_svg_buffer(_aiter(["Hello", " world"])))
    kinds = [k for k, _ in out]
    text = "".join(v for k, v in out if k == "text")
    assert kinds == ["text", "text"] or "".join(text) == "Hello world"
    assert text == "Hello world"


@pytest.mark.asyncio
async def test_buffers_complete_svg_in_one_chunk():
    chunks = ['Look: <svg viewBox="0 0 1 1"><rect/></svg> done']
    out = await _collect(stream_with_svg_buffer(_aiter(chunks)))
    kinds = [k for k, _ in out]
    assert "svg" in kinds
    svg_payload = next(v for k, v in out if k == "svg")
    assert svg_payload.startswith("<svg")
    assert svg_payload.endswith("</svg>")
    text_combined = "".join(v for k, v in out if k == "text")
    assert "Look:" in text_combined
    assert "done" in text_combined


@pytest.mark.asyncio
async def test_buffers_svg_split_across_chunks():
    chunks = ["before <s", "vg vie", 'wBox="0 0 1 1"><re', "ct/></sv", "g> after"]
    out = await _collect(stream_with_svg_buffer(_aiter(chunks)))
    svgs = [v for k, v in out if k == "svg"]
    assert len(svgs) == 1
    assert svgs[0].startswith("<svg")
    assert svgs[0].endswith("</svg>")
    text_combined = "".join(v for k, v in out if k == "text")
    assert "before " in text_combined
    assert "after" in text_combined
    # No fragment of the svg leaks into text events
    assert "<svg" not in text_combined
    assert "</svg>" not in text_combined


@pytest.mark.asyncio
async def test_partial_lt_does_not_leak():
    # Trailing "<" must be held back until we know whether it starts <svg
    chunks = ["abc <"]
    out = await _collect(stream_with_svg_buffer(_aiter(chunks)))
    text_combined = "".join(v for k, v in out if k == "text")
    assert text_combined == "abc <"


@pytest.mark.asyncio
async def test_unclosed_svg_is_dropped():
    chunks = ["start <svg viewBox=\"0 0 1 1\"><rect/>"]
    out = await _collect(stream_with_svg_buffer(_aiter(chunks)))
    svgs = [v for k, v in out if k == "svg"]
    assert svgs == []
    text_combined = "".join(v for k, v in out if k == "text")
    assert text_combined == "start "


@pytest.mark.asyncio
async def test_text_before_svg_emitted_before_svg():
    chunks = ["intro <svg viewBox=\"0 0 1 1\"></svg>"]
    out = await _collect(stream_with_svg_buffer(_aiter(chunks)))
    # intro text comes before svg event
    types_in_order = [k for k, _ in out]
    assert types_in_order.index("text") < types_in_order.index("svg")
