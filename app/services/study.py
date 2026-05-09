import json
import re
from dataclasses import dataclass

import anthropic
import httpx

from app.config import get_settings

# Broad queries to harvest transcription clips across the whole video
_HARVEST_QUERIES = [
    "introduction explain definition",
    "example formula equation",
    "key concept important",
    "conclusion summary result",
]


NOTES_SYSTEM_PROMPT = """You are an expert study assistant. The user provides timestamped transcript clips from an educational video. Generate thorough, detailed study notes in markdown.

Structure:
- Start with a # Title summarising the video topic
- Use ## for major topics, ### for subtopics
- Under each section: explain the concept clearly in 2-4 sentences, then bullet key facts
- **Bold** every important term on first use and give its definition
- Use $LaTeX$ inline for all symbols and equations, $$...$$ for display equations
- Include worked examples where relevant
- End with a ## Key Takeaways section summarising the 4-6 most important points

Be thorough — this should be a complete reference a student can study from."""


FLASHCARDS_SYSTEM_PROMPT = """You are a study assistant. The user provides timestamped transcript clips from a video. Generate 8-12 flashcards covering the key concepts.

For each card:
- question: specific and testable — a term, formula, 'why', 'how', or 'what is the difference' question
- answer: 3-5 sentences minimum. Structure it as: (1) clear definition or direct answer, (2) explanation of the underlying reason or mechanism, (3) a concrete example, analogy, or formula that makes it tangible. Write as if explaining to a student who needs to truly understand, not just memorize. Never give a one-liner answer.

Output ONLY a JSON array — no markdown fence, no preamble.
Format: [{"question": "...", "answer": "..."}]"""


PROBLEMS_SYSTEM_PROMPT = """You are a study assistant. The user provides timestamped transcript clips from an educational video. Generate 5-8 practice problems that test application of the concepts.

For each problem:
- question: a specific, solvable problem that exercises understanding (favor "calculate", "derive", "apply", "explain why this happens", "what would change if"). Avoid pure recall — that's what flashcards are for.
- answer: a fully worked solution. Show the steps, name the principle being applied, and end with the final result clearly stated. Use $LaTeX$ inline for symbols/equations and $$...$$ for display math. The answer should be detailed enough that a student who got stuck can learn from it.

Stay within what the video covers. Mix difficulties (a couple straightforward, a couple harder).

Output ONLY a JSON array — no markdown fence, no preamble.
Format: [{"question": "...", "answer": "..."}]"""


INSIGHTS_SYSTEM_PROMPT = """You are a tutor sitting next to a student as they watch an educational video. The user provides timestamped transcript clips. Divide the video into 4-8 logical chapters and write a short tutor-voice annotation for each — what's being covered, why it matters, and what to listen for.

For each chapter:
- start: start time in seconds (float, drawn from the earliest clip in the chapter)
- end: end time in seconds (float, drawn from the last clip)
- title: 4-8 word title naming the concept or section. Use Title Case.
- body: 2-4 sentences in tutor voice. Briefly say what's happening here, name the key term being introduced, and point out one thing the student should notice. Use **bold** for the key term. Use $LaTeX$ for inline symbols/equations. Don't summarise the whole video — focus only on this chapter.

Choose chapter boundaries where the topic genuinely shifts. Cover the whole video — the chapters should tile [0, duration] with no large gaps and no overlaps.

Output ONLY a JSON array — no markdown fence, no preamble.
Format: [{"start": 0.0, "end": 45.0, "title": "...", "body": "..."}]"""


@dataclass(frozen=True)
class Flashcard:
    question: str
    answer: str


@dataclass(frozen=True)
class Problem:
    question: str
    answer: str


@dataclass(frozen=True)
class Insight:
    start: float
    end: float
    title: str
    body: str


async def _collect_transcript(twelvelabs_video_id: str) -> str:
    """Gather transcription clips from broad searches, return sorted deduped text."""
    settings = get_settings()
    seen: set[tuple[float, float]] = set()
    clips: list[tuple[float, str]] = []

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


async def _claude_complete(system: str, user: str, max_tokens: int) -> str:
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    msg = await client.messages.create(
        model=settings.claude_model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return msg.content[0].text  # type: ignore[index]


async def generate_notes(twelvelabs_video_id: str) -> str:
    transcript = await _collect_transcript(twelvelabs_video_id)
    if not transcript:
        return "_No transcript clips could be retrieved for this video._"
    return await _claude_complete(
        NOTES_SYSTEM_PROMPT, f"Transcript clips:\n\n{transcript}", max_tokens=4096
    )


async def generate_flashcards(twelvelabs_video_id: str) -> list[Flashcard]:
    transcript = await _collect_transcript(twelvelabs_video_id)
    if not transcript:
        return []
    raw = await _claude_complete(
        FLASHCARDS_SYSTEM_PROMPT, f"Transcript clips:\n\n{transcript}", max_tokens=8000
    )
    return [Flashcard(question=q, answer=a) for q, a in _parse_qa_array(raw)]


async def generate_problems(twelvelabs_video_id: str) -> list[Problem]:
    transcript = await _collect_transcript(twelvelabs_video_id)
    if not transcript:
        return []
    raw = await _claude_complete(
        PROBLEMS_SYSTEM_PROMPT, f"Transcript clips:\n\n{transcript}", max_tokens=8000
    )
    return [Problem(question=q, answer=a) for q, a in _parse_qa_array(raw)]


async def generate_insights(twelvelabs_video_id: str) -> list[Insight]:
    transcript = await _collect_transcript(twelvelabs_video_id)
    if not transcript:
        return []
    raw = await _claude_complete(
        INSIGHTS_SYSTEM_PROMPT, f"Transcript clips:\n\n{transcript}", max_tokens=4096
    )
    return parse_insights(raw)


def parse_flashcards(raw: str) -> list[Flashcard]:
    return [Flashcard(question=q, answer=a) for q, a in _parse_qa_array(raw)]


def parse_problems(raw: str) -> list[Problem]:
    return [Problem(question=q, answer=a) for q, a in _parse_qa_array(raw)]


def parse_insights(raw: str) -> list[Insight]:
    """Extract a JSON array of {start, end, title, body} from Claude output."""
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    match = re.search(r"\[\s*\{[\s\S]*\}\s*\]", text)
    if not match:
        raise ValueError(f"no insight JSON array found in: {raw[:200]!r}")
    arr = json.loads(match.group(0))
    out: list[Insight] = []
    for item in arr:
        if not isinstance(item, dict):
            continue
        try:
            start = float(item.get("start", 0))
            end = float(item.get("end", 0))
        except (TypeError, ValueError):
            continue
        title = str(item.get("title") or "").strip()
        body = str(item.get("body") or item.get("description") or "").strip()
        if not title or not body or end <= start:
            continue
        out.append(Insight(start=start, end=end, title=title, body=body))
    out.sort(key=lambda i: i.start)
    return out


def _parse_qa_array(raw: str) -> list[tuple[str, str]]:
    """Extract a JSON array of {question, answer} pairs from a Claude response.

    Tolerates leading/trailing prose, markdown code fences, and short keys.
    """
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    match = re.search(r"\[\s*\{[\s\S]*\}\s*\]", text)
    if not match:
        raise ValueError(f"no JSON array found in: {raw[:200]!r}")
    arr = json.loads(match.group(0))
    out: list[tuple[str, str]] = []
    for item in arr:
        if not isinstance(item, dict):
            continue
        q = str(item.get("question") or item.get("q") or "").strip()
        a = str(item.get("answer") or item.get("a") or "").strip()
        if q and a:
            out.append((q, a))
    return out
