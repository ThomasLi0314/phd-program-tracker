"""Claude-powered extraction and summarization (optional stage).

Uses the official Anthropic Python SDK with structured outputs
(client.messages.parse + Pydantic) so responses are schema-validated.
The pipeline runs without this module via --no-llm; heuristics then fill
what they can and everything else is emitted as "Unknown/Verify".

Credentials resolve from the environment (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN
or an `ant auth login` profile) — never hardcode a key.
"""

from __future__ import annotations

import logging
from typing import Literal, Optional

log = logging.getLogger("gradintel.llm")

MODEL = "claude-opus-4-8"

# Cap page text sent to the model. Program pages are far below this; if a page
# exceeds it we log a warning rather than silently truncating something big.
MAX_PAGE_CHARS = 60_000

try:
    import anthropic
    from pydantic import BaseModel, Field

    SDK_AVAILABLE = True
except ImportError:  # anthropic/pydantic not installed
    anthropic = None  # type: ignore[assignment]
    SDK_AVAILABLE = False

    class BaseModel:  # type: ignore[no-redef]
        pass

    def Field(*args, **kwargs):  # type: ignore[no-redef]
        return None


UNKNOWN = "Unknown/Verify"


class ProgramRequirementsLLM(BaseModel):
    """Program hard metrics as read from official pages. Use 'Unknown/Verify' (or null) when a metric is not stated — never guess."""

    deadline_iso: Optional[str] = Field(
        None, description="Application deadline as YYYY-MM-DD if a full date is stated, else null"
    )
    deadline_display: str = Field(
        ..., description="Deadline as human-readable text, e.g. 'Dec 1, 2026', or 'Unknown/Verify'"
    )
    application_fee_usd: Optional[float] = Field(
        None, description="Application fee converted to approximate USD; null if not stated"
    )
    fee_display: str = Field(..., description="Fee in original currency, e.g. '$125' or 'CHF 150', or 'Unknown/Verify'")
    gre: Literal["Required", "Optional", "Not Accepted", "Unknown/Verify"]
    letters: Optional[int] = Field(None, description="Number of recommendation letters; null if not stated")
    english: str = Field(..., description="English test requirement summary incl. exemptions, or 'Unknown/Verify'")
    admission_model: Literal[
        "Rotation", "Direct Advisor Match", "Committee-Based", "Coursework First", "Unknown/Verify"
    ]
    admission_model_note: str = Field(..., description="1-2 sentence explanation of how students match with advisors")
    funding_status: Literal["Fully Funded", "Partial / Merit-Based", "Self-Funded / Mixed", "Unknown/Verify"]
    funding_years: Optional[int] = Field(None, description="Guaranteed funding years; null if not stated")
    funding_note: str = Field(..., description="1-2 sentence funding summary")
    pre_application_contact: Literal["Encouraged", "Neutral / Not Required", "Discouraged", "Unknown/Verify"]
    contact_note: str = Field(..., description="What the program says about contacting faculty before applying")
    ects: Optional[int] = Field(None, description="ECTS credits for European degrees; null otherwise")
    duration: str = Field(..., description="Nominal program duration, e.g. '5 years' or '2 years (120 ECTS)'")


class FacultyProfileLLM(BaseModel):
    """Faculty research profile distilled from their homepage/profile text."""

    tags: list[str] = Field(..., description="3-5 short research keyword tags")
    summary: str = Field(
        ..., description="~100-word summary of their research based on recent (last 3-5 years) work"
    )
    recruitment_status: Literal["Looking for Students", "Not Advising", "Unknown/Verify"] = Field(
        ...,
        description=(
            "'Looking for Students' ONLY if the page explicitly says they are recruiting; "
            "'Not Advising' only if explicitly stated (retired/emeritus/not taking students); "
            "otherwise 'Unknown/Verify'"
        ),
    )
    sub_field: str = Field(..., description="Short sub-field label for grouping, e.g. 'Physical Oceanography'")


class LLMExtractor:
    """Thin wrapper around the Anthropic client for the two pipeline calls."""

    def __init__(self, model: str = MODEL):
        if not SDK_AVAILABLE:
            raise RuntimeError(
                "The 'anthropic' package is not installed. "
                "pip install anthropic, or run the pipeline with --no-llm."
            )
        self.model = model
        self.client = anthropic.Anthropic()

    @staticmethod
    def _clip(text: str, label: str) -> str:
        if len(text) > MAX_PAGE_CHARS:
            log.warning("%s: page text is %d chars; sending first %d", label, len(text), MAX_PAGE_CHARS)
            return text[:MAX_PAGE_CHARS]
        return text

    def extract_requirements(self, program_label: str, pages: list[tuple[str, str]]) -> ProgramRequirementsLLM:
        """pages: list of (url, visible_text)."""
        blocks = "\n\n".join(
            f"<page url=\"{url}\">\n{self._clip(text, url)}\n</page>" for url, text in pages
        )
        response = self.client.messages.parse(
            model=self.model,
            max_tokens=16000,
            system=(
                "You extract graduate-program admission metrics from official university pages. "
                "Data integrity is critical: if a metric is not explicitly stated in the provided "
                "pages, output 'Unknown/Verify' (or null for numeric fields). Never guess or use "
                "outside knowledge."
            ),
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Extract the admission requirements for: {program_label}\n\n"
                        f"Source pages:\n{blocks}"
                    ),
                }
            ],
            output_format=ProgramRequirementsLLM,
        )
        return response.parsed_output

    def summarize_faculty(self, name: str, title: str, page_text: str) -> FacultyProfileLLM:
        response = self.client.messages.parse(
            model=self.model,
            max_tokens=4000,
            system=(
                "You write concise faculty research profiles for a PhD-applicant intelligence tool. "
                "Base the summary only on the provided page text. Recruitment status must be "
                "'Unknown/Verify' unless the page explicitly states they are or are not taking students."
            ),
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Faculty member: {name} ({title})\n\n"
                        f"Profile/homepage text:\n{self._clip(page_text, name)}"
                    ),
                }
            ],
            output_format=FacultyProfileLLM,
        )
        return response.parsed_output
