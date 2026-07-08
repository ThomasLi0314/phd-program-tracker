"""Heuristic (regex/keyword) extraction of program hard metrics from page text.

Every extractor returns an Extraction (value + evidence snippet) or None.
Callers map None to the "Unknown/Verify" sentinel — heuristics never guess.
The optional LLM pass (llm.py) can override these with higher-quality reads;
heuristics remain the zero-cost fallback and a cross-check.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

MONTHS = (
    "January|February|March|April|May|June|July|August|September|October|November|December|"
    "Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec"
)


@dataclass
class Extraction:
    value: object
    evidence: str  # snippet of source text supporting the value


def visible_text(html: str) -> str:
    """Strip markup/scripts and return normalized visible text."""
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript", "template"]):
        tag.decompose()
    text = soup.get_text(separator=" ")
    return re.sub(r"\s+", " ", text).strip()


def _window(text: str, match: re.Match, before: int = 80, after: int = 120) -> str:
    start = max(0, match.start() - before)
    end = min(len(text), match.end() + after)
    return text[start:end].strip()


# -- deadline ---------------------------------------------------------------

_DEADLINE_DATE = re.compile(
    rf"(?P<date>(?:{MONTHS})\.?\s+\d{{1,2}}(?:\s*,\s*\d{{4}})?|\d{{4}}-\d{{2}}-\d{{2}})",
    re.IGNORECASE,
)


def extract_deadline(text: str) -> Extraction | None:
    """Find a date within a window of the word 'deadline'/'due'/'applications close'."""
    for kw in re.finditer(r"deadline|applications?\s+(?:are\s+)?due|applications?\s+close", text, re.IGNORECASE):
        start = max(0, kw.start() - 120)
        end = min(len(text), kw.end() + 160)
        window = text[start:end]
        m = _DEADLINE_DATE.search(window)
        if m:
            return Extraction(value=m.group("date").strip(), evidence=window.strip())
    return None


# -- application fee ---------------------------------------------------------

_FEE = re.compile(
    r"(?:application\s+fee|fee\s+of|nonrefundable\s+fee)[^.$€£]{0,60}?"
    r"(?P<cur>[$€£]|USD|EUR|GBP|CHF)\s?(?P<amount>\d{1,4}(?:[.,]\d{2})?)",
    re.IGNORECASE,
)
_FEE_REVERSED = re.compile(
    r"(?P<cur>[$€£]|USD|EUR|GBP|CHF)\s?(?P<amount>\d{1,4})(?:\s?(?:nonrefundable|non-refundable))?"
    r"[^.]{0,60}?application\s+fee",
    re.IGNORECASE,
)


def extract_fee(text: str) -> Extraction | None:
    for pattern in (_FEE, _FEE_REVERSED):
        m = pattern.search(text)
        if m:
            amount = float(m.group("amount").replace(",", "."))
            cur = m.group("cur").upper()
            cur = {"$": "USD", "€": "EUR", "£": "GBP"}.get(cur, cur)
            return Extraction(value={"amount": amount, "currency": cur}, evidence=_window(text, m))
    return None


# -- GRE ----------------------------------------------------------------------

def extract_gre(text: str) -> Extraction | None:
    patterns: list[tuple[str, str]] = [
        (r"GRE[^.]{0,120}?(?:not\s+(?:be\s+)?accepted|will\s+not\s+be\s+(?:accepted|considered)|not\s+considered)", "Not Accepted"),
        (r"GRE[^.]{0,120}?(?:is\s+)?not\s+required", "Optional"),
        (r"GRE[^.]{0,120}?optional", "Optional"),
        (r"GRE[^.]{0,120}?(?:is\s+|are\s+)?required", "Required"),
    ]
    for pattern, status in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            return Extraction(value=status, evidence=_window(text, m))
    return None


# -- letters of recommendation ------------------------------------------------

_WORD_NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5}


def extract_letters(text: str) -> Extraction | None:
    m = re.search(
        r"(?P<num>\d|one|two|three|four|five)\s+(?:letters?|recommendations?)\s+(?:of\s+recommendation\s*)?",
        text,
        re.IGNORECASE,
    )
    if not m:
        m = re.search(
            r"letters?\s+of\s+recommendation[^.]{0,60}?(?P<num>\d|one|two|three|four|five)",
            text,
            re.IGNORECASE,
        )
    if m:
        raw = m.group("num").lower()
        num = _WORD_NUM.get(raw, None)
        if num is None:
            try:
                num = int(raw)
            except ValueError:
                return None
        if 1 <= num <= 5:
            return Extraction(value=num, evidence=_window(text, m))
    return None


# -- ECTS -----------------------------------------------------------------------

def extract_ects(text: str) -> Extraction | None:
    m = re.search(r"(?P<num>\d{2,3})\s*ECTS", text, re.IGNORECASE)
    if m:
        return Extraction(value=int(m.group("num")), evidence=_window(text, m))
    return None


def extract_all(text: str) -> dict[str, Extraction | None]:
    """Run every heuristic over the given visible text."""
    return {
        "deadline": extract_deadline(text),
        "fee": extract_fee(text),
        "gre": extract_gre(text),
        "letters": extract_letters(text),
        "ects": extract_ects(text),
    }
