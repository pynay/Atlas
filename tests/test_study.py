import pytest

from app.services.study import Flashcard, Problem, parse_flashcards, parse_problems


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
