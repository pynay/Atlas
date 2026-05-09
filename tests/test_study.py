import pytest

from app.services.study import (
    Flashcard,
    Insight,
    Problem,
    parse_flashcards,
    parse_insights,
    parse_problems,
)


def test_parse_flashcards_clean_json():
    raw = '[{"question": "What is X?", "answer": "Y"}]'
    cards = parse_flashcards(raw)
    assert cards == [Flashcard(question="What is X?", answer="Y")]


def test_parse_flashcards_with_code_fence():
    raw = '```json\n[{"question": "Q1", "answer": "A1"}]\n```'
    cards = parse_flashcards(raw)
    assert len(cards) == 1
    assert cards[0].question == "Q1"


def test_parse_flashcards_with_preamble():
    raw = (
        "Here are the flashcards:\n\n"
        '[{"question": "Q?", "answer": "A."}, {"question": "Q2?", "answer": "A2."}]'
    )
    cards = parse_flashcards(raw)
    assert len(cards) == 2
    assert cards[1].answer == "A2."


def test_parse_flashcards_tolerates_short_keys():
    raw = '[{"q": "Qa", "a": "Aa"}]'
    cards = parse_flashcards(raw)
    assert cards == [Flashcard(question="Qa", answer="Aa")]


def test_parse_flashcards_skips_blank_entries():
    raw = '[{"question": "ok", "answer": "ok"}, {"question": "", "answer": "x"}]'
    cards = parse_flashcards(raw)
    assert len(cards) == 1


def test_parse_flashcards_no_array_raises():
    with pytest.raises(ValueError):
        parse_flashcards("no JSON here")


def test_parse_problems_clean_json():
    raw = (
        '[{"question": "Compute 2+2.", "answer": "Apply addition: 2 + 2 = 4."},'
        ' {"question": "Why is X?", "answer": "Because Y, therefore X."}]'
    )
    problems = parse_problems(raw)
    assert problems == [
        Problem(question="Compute 2+2.", answer="Apply addition: 2 + 2 = 4."),
        Problem(question="Why is X?", answer="Because Y, therefore X."),
    ]


def test_parse_problems_with_code_fence():
    raw = '```json\n[{"question": "Q?", "answer": "A: worked solution."}]\n```'
    problems = parse_problems(raw)
    assert len(problems) == 1
    assert problems[0].answer.startswith("A:")


def test_parse_problems_no_array_raises():
    with pytest.raises(ValueError):
        parse_problems("nothing here")


def test_parse_insights_clean_json():
    raw = (
        '[{"start": 0.0, "end": 30.5, "title": "Setup", "body": "Intro to **alkanes**."},'
        ' {"start": 30.5, "end": 60.0, "title": "Definition", "body": "Saturated hydrocarbons."}]'
    )
    insights = parse_insights(raw)
    assert insights == [
        Insight(start=0.0, end=30.5, title="Setup", body="Intro to **alkanes**."),
        Insight(start=30.5, end=60.0, title="Definition", body="Saturated hydrocarbons."),
    ]


def test_parse_insights_with_code_fence():
    raw = '```json\n[{"start": 0, "end": 10, "title": "T", "body": "B"}]\n```'
    insights = parse_insights(raw)
    assert len(insights) == 1
    assert insights[0].title == "T"


def test_parse_insights_skips_invalid_ranges():
    # end <= start should be dropped; missing fields too
    raw = (
        '[{"start": 10, "end": 5, "title": "Bad", "body": "x"},'
        ' {"start": 0, "end": 5, "title": "", "body": "missing title"},'
        ' {"start": 0, "end": 5, "title": "OK", "body": "ok"}]'
    )
    insights = parse_insights(raw)
    assert len(insights) == 1
    assert insights[0].title == "OK"


def test_parse_insights_sorts_by_start():
    raw = (
        '[{"start": 60, "end": 90, "title": "Z", "body": "z"},'
        ' {"start": 0, "end": 30, "title": "A", "body": "a"}]'
    )
    insights = parse_insights(raw)
    assert [i.title for i in insights] == ["A", "Z"]


def test_parse_insights_no_array_raises():
    with pytest.raises(ValueError):
        parse_insights("not JSON")
