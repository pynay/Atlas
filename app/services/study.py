import json
import re
from dataclasses import dataclass

import anthropic

from app.config import get_settings
from app.services.twelvelabs import TwelveLabsClient

# Broad queries to harvest transcription clips across the whole video
_HARVEST_QUERIES = [
    "introduction explain definition",
    "example formula equation",
    "key concept important",
    "conclusion summary result",
]


@dataclass(frozen=True)
class Flashcard:
    question: str
    answer: str


async def _collect_transcript(twelvelabs_video_id: str) -> str:
    """Gather transcription clips from broad searches, return sorted deduped text."""
    settings = get_settings()
    seen: set[tuple[float, float]] = set()
    clips: list[tuple[float, str]] = []

    import httpx
    async with httpx.AsyncClient(
        base_url=settings.twelvelabs_base_url,
        headers={"x-api-key": settings.twelvelabs_api_key},
        timeout=30.0,
    ) as client:
        for query in _HARVEST_QUERIES:
            r = await client.post(
                "/search",
                files=[
                    ("index_id", (None, settings.twelvelabs_index_id)),
                    ("query_text", (None, query)),
                    ("search_options", (None, "transcription")),
                    ("page_limit", (None, "50")),
                ],
            )
            if r.status_code >= 400:
                continue
            for d in r.json().get("data", []):
                if d.get("video_id") != twelvelabs_video_id:
                    continue
                transcript = d.get("transcription") or ""
                if not transcript:
                    continue
                key = (round(float(d.get("start", 0)), 1), round(float(d.get("end", 0)), 1))
                if key not in seen:
                    seen.add(key)
                    clips.append((float(d.get("start", 0)), f"[{d['start']:.0f}s] {transcript}"))

    clips.sort(key=lambda x: x[0])
    return "\n".join(text for _, text in clips)


async def generate_notes(twelvelabs_video_id: str) -> str:
    transcript = await _collect_transcript(twelvelabs_video_id)
    if not transcript:
        return "_No transcript clips could be retrieved for this video._"

    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    msg = await client.messages.create(
        model=settings.claude_model,
        max_tokens=4096,
        system=(
            "You are an expert study assistant. The user provides timestamped transcript clips "
            "from an educational video. Generate thorough, detailed study notes in markdown.\n\n"
            "Structure:\n"
            "- Start with a # Title summarising the video topic\n"
            "- Use ## for major topics, ### for subtopics\n"
            "- Under each section: explain the concept clearly in 2-4 sentences, then bullet key facts\n"
            "- **Bold** every important term on first use and give its definition\n"
            "- Use $LaTeX$ inline for all symbols and equations, $$...$$ for display equations\n"
            "- Include worked examples where relevant\n"
            "- End with a ## Key Takeaways section summarising the 4-6 most important points\n\n"
            "Be thorough — this should be a complete reference a student can study from."
        ),
        messages=[{"role": "user", "content": f"Transcript clips:\n\n{transcript}"}],
    )
    return msg.content[0].text  # type: ignore[index]


async def generate_flashcards(twelvelabs_video_id: str) -> list[Flashcard]:
    transcript = await _collect_transcript(twelvelabs_video_id)
    if not transcript:
        return []

    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    msg = await client.messages.create(
        model=settings.claude_model,
        max_tokens=8000,
        system=(
            "You are a study assistant. The user provides timestamped transcript clips "
            "from a video. Generate 8-12 flashcards covering the key concepts.\n\n"
            "For each card:\n"
            "- question: specific and testable — a term, formula, 'why', 'how', or 'what is the difference' question\n"
            "- answer: 3-5 sentences minimum. Structure it as: "
            "(1) clear definition or direct answer, "
            "(2) explanation of the underlying reason or mechanism, "
            "(3) a concrete example, analogy, or formula that makes it tangible. "
            "Write as if explaining to a student who needs to truly understand, not just memorize. "
            "Never give a one-liner answer.\n\n"
            "Output ONLY a JSON array — no markdown fence, no preamble.\n"
            'Format: [{"question": "...", "answer": "..."}]'
        ),
        messages=[{"role": "user", "content": f"Transcript clips:\n\n{transcript}"}],
    )
    raw = msg.content[0].text  # type: ignore[index]
    return parse_flashcards(raw)


def parse_flashcards(raw: str) -> list[Flashcard]:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    match = re.search(r"\[\s*\{[\s\S]*\}\s*\]", text)
    if not match:
        raise ValueError(f"no flashcard JSON array found in: {raw[:200]!r}")
    arr = json.loads(match.group(0))
    cards: list[Flashcard] = []
    for item in arr:
        if not isinstance(item, dict):
            continue
        q = str(item.get("question") or item.get("q") or "").strip()
        a = str(item.get("answer") or item.get("a") or "").strip()
        if q and a:
            cards.append(Flashcard(question=q, answer=a))
    return cards
