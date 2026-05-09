import json
import re
from dataclasses import dataclass

from app.config import get_settings
from app.services.twelvelabs import TwelveLabsClient

NOTES_PROMPT = """Generate concise study notes covering the main concepts taught in this video.
Output as well-formatted markdown:
- Use ## for major topics, ### for subtopics
- Use bullet points for key facts
- Bold important terms (e.g. **alkane**)
- Include any equations or formulas inline

Keep it focused — main ideas only. Output the markdown directly with no preamble."""

FLASHCARDS_PROMPT = """Generate 8 to 12 study flashcards covering the main concepts in this video.
Each flashcard tests recall of a key term, definition, fact, or relationship.

Output ONLY a JSON array — no markdown code fence, no preamble, no commentary.
Format:
[{"question": "...", "answer": "..."}]

Make questions specific. Keep answers concise (1-3 sentences)."""


@dataclass(frozen=True)
class Flashcard:
    question: str
    answer: str


async def generate_notes(twelvelabs_video_id: str) -> str:
    settings = get_settings()
    async with TwelveLabsClient(
        api_key=settings.twelvelabs_api_key,
        index_id=settings.twelvelabs_index_id,
        base_url=settings.twelvelabs_base_url,
    ) as c:
        return (await c.analyze(twelvelabs_video_id, NOTES_PROMPT)).strip()


async def generate_flashcards(twelvelabs_video_id: str) -> list[Flashcard]:
    settings = get_settings()
    async with TwelveLabsClient(
        api_key=settings.twelvelabs_api_key,
        index_id=settings.twelvelabs_index_id,
        base_url=settings.twelvelabs_base_url,
    ) as c:
        raw = await c.analyze(twelvelabs_video_id, FLASHCARDS_PROMPT)
    return parse_flashcards(raw)


def parse_flashcards(raw: str) -> list[Flashcard]:
    """Extract a JSON array of {question, answer} from Pegasus output.

    Tolerates leading/trailing prose, markdown code fences, and minor key variants.
    """
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
        q = item.get("question") or item.get("q") or ""
        a = item.get("answer") or item.get("a") or ""
        q = str(q).strip()
        a = str(a).strip()
        if q and a:
            cards.append(Flashcard(question=q, answer=a))
    return cards
