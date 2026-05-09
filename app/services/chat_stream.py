from typing import AsyncIterator, Tuple

OPEN = "<svg"
CLOSE = "</svg>"
HOLDBACK = max(len(OPEN), len(CLOSE))  # 6
# Characters that may legitimately follow "<svg" in a real opening tag.
_OPEN_DELIMS = {">", "/", " ", "\t", "\n", "\r"}


async def stream_with_svg_buffer(
    tokens: AsyncIterator[str],
) -> AsyncIterator[Tuple[str, str]]:
    """Consume an async stream of token chunks; yield ("text", s) and ("svg", s) events.

    Buffers any <svg>...</svg> block until complete, then emits it as one ("svg", ...) event.
    Holds back trailing characters that could be the prefix of "<svg" or "</svg>" so partial
    tags never leak into text events. An unclosed <svg> at end-of-stream is dropped.
    """
    buf = ""
    in_svg = False
    svg_buf = ""

    async for chunk in tokens:
        if in_svg:
            svg_buf += chunk
        else:
            buf += chunk

        # Process as long as we can make progress.
        while True:
            if in_svg:
                # Note: we look for the exact byte sequence "</svg>". A close tag with
                # internal whitespace like "</svg >" or "</svg\n>" will NOT match — but
                # Claude's system prompt (Task 10) commits to emitting only canonical tags.
                idx = svg_buf.find(CLOSE)
                if idx == -1:
                    break
                end = idx + len(CLOSE)
                yield ("svg", svg_buf[:end])
                buf = svg_buf[end:]
                svg_buf = ""
                in_svg = False
                continue

            # Find a real "<svg" opener. We can't fully disambiguate prose mentions of
            # "<svg>" from actual SVG elements without semantic context; the system prompt
            # (Task 10) instructs Claude not to mention "<svg>" in prose. As a syntactic
            # guard we also require the char after "<svg" to be a tag delimiter, so that
            # things like "<svgfoo>" don't trip the buffer.
            search_from = 0
            opener_idx = -1
            need_more = False
            while True:
                idx = buf.find(OPEN, search_from)
                if idx == -1:
                    break
                next_pos = idx + len(OPEN)
                if next_pos >= len(buf):
                    # Match sits at the end of buf — wait for the next chunk to see
                    # the delimiter char before deciding.
                    need_more = True
                    opener_idx = idx
                    break
                if buf[next_pos] in _OPEN_DELIMS:
                    opener_idx = idx
                    break
                # False match (e.g. "<svgfoo"); keep scanning.
                search_from = idx + 1

            if need_more:
                # Emit text up to (but not including) the tentative opener; hold the rest.
                if opener_idx > 0:
                    yield ("text", buf[:opener_idx])
                    buf = buf[opener_idx:]
                break

            if opener_idx != -1:
                if opener_idx > 0:
                    yield ("text", buf[:opener_idx])
                svg_buf = buf[opener_idx:]
                buf = ""
                in_svg = True
                continue

            # Not in svg, no <svg found. Emit what's safe.
            safe_len = max(0, len(buf) - HOLDBACK)
            if safe_len > 0:
                yield ("text", buf[:safe_len])
                buf = buf[safe_len:]
            break

    # Flush
    if not in_svg and buf:
        yield ("text", buf)
    # Unclosed svg: drop silently.
