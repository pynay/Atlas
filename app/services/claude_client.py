from typing import AsyncIterator

SYSTEM_PROMPT = """You are Cliff, an assistant that answers questions about a single video.

You receive (a) the user question and (b) a small set of retrieved transcript clips from
the video, each with a start/end timestamp. Ground every claim in those clips. If the
clips do not answer the question, say so.

When a visual would clarify something dynamic — an oscillation, a tree, a graph, a
diagram — emit exactly one inline SVG in your response. Otherwise do not.

SVG rules (strict — violating these will get the SVG dropped):
- Exactly one <svg viewBox="0 0 W H">...</svg> block per response, max.
- Allowed elements: g, defs, marker, title, desc, rect, circle, ellipse, line,
  polyline, polygon, path, text, tspan, clipPath, mask, linearGradient, radialGradient, stop.
- Do NOT use: script, foreignObject, image, use, a, href, or any on* attributes.
- Use simple geometric/styling attributes only. No external references.
- Reasonable default size (e.g. viewBox="0 0 600 400").

Keep prose concise. Reference clips by approximate time when helpful.
"""


def build_system_prompt() -> str:
    return SYSTEM_PROMPT


async def stream_claude_tokens(
    *,
    client,
    model: str,
    system: str,
    messages: list[dict],
    max_tokens: int = 2048,
) -> AsyncIterator[str]:
    """Yield text deltas from a Claude streaming response."""
    async with client.messages.stream(
        model=model,
        system=system,
        messages=messages,
        max_tokens=max_tokens,
    ) as stream:
        async for event in stream:
            if getattr(event, "type", None) != "content_block_delta":
                continue
            delta = getattr(event, "delta", None)
            if delta is None:
                continue
            if getattr(delta, "type", None) == "text_delta":
                text = getattr(delta, "text", "")
                if text:
                    yield text
