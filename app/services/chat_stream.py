from typing import AsyncIterator, Tuple

OPEN = "<svg"
CLOSE = "</svg>"
HOLDBACK = max(len(OPEN), len(CLOSE))  # 6


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
                idx = svg_buf.find(CLOSE)
                if idx == -1:
                    break
                end = idx + len(CLOSE)
                yield ("svg", svg_buf[:end])
                buf = svg_buf[end:]
                svg_buf = ""
                in_svg = False
                continue

            idx = buf.find(OPEN)
            if idx != -1:
                if idx > 0:
                    yield ("text", buf[:idx])
                svg_buf = buf[idx:]
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
