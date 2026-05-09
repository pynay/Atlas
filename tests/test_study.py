import pytest

from app.services.study import Flashcard, parse_flashcards


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
