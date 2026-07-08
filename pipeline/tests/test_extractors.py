"""Self-tests for the heuristic extractors and the shared schema.

Runnable standalone (no pytest needed):
    python tests/test_extractors.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from gradintel.extractors import (  # noqa: E402
    extract_deadline,
    extract_ects,
    extract_fee,
    extract_gre,
    extract_letters,
    visible_text,
)
from gradintel.schemas import validate_dataset  # noqa: E402

FAILURES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  ok    {name}")
    else:
        print(f"  FAIL  {name}  {detail}")
        FAILURES.append(name)


def test_visible_text() -> None:
    html = "<html><head><script>var x=1;</script></head><body><p>Hello   <b>world</b></p></body></html>"
    text = visible_text(html)
    check("visible_text strips scripts", "var x" not in text)
    check("visible_text normalizes whitespace", text == "Hello world")


def test_deadline() -> None:
    ex = extract_deadline("The application deadline for the PhD program is December 1, 2026 at 11:59pm PST.")
    check("deadline full date", ex is not None and "December 1, 2026" in str(ex.value), repr(ex))

    ex = extract_deadline("Completed applications are due January 3.")
    check("deadline month-day", ex is not None and "January 3" in str(ex.value), repr(ex))

    ex = extract_deadline("Our faculty study oceans and December is a nice month.")
    check("deadline no keyword -> None", ex is None, repr(ex))


def test_fee() -> None:
    ex = extract_fee("The application fee is $125 and is nonrefundable.")
    check("fee USD", ex is not None and ex.value == {"amount": 125.0, "currency": "USD"}, repr(ex))

    ex = extract_fee("Applicants pay a nonrefundable fee of CHF 150 when submitting.")
    check("fee CHF", ex is not None and ex.value == {"amount": 150.0, "currency": "CHF"}, repr(ex))

    ex = extract_fee("There is no charge for parking.")
    check("fee absent -> None", ex is None, repr(ex))


def test_gre() -> None:
    ex = extract_gre("GRE scores will not be accepted or considered as part of the application.")
    check("gre not accepted", ex is not None and ex.value == "Not Accepted", repr(ex))

    ex = extract_gre("The Graduate Record Examination GRE General Test is not required.")
    check("gre not required -> Optional", ex is not None and ex.value == "Optional", repr(ex))

    ex = extract_gre("GRE General Test scores are required of all applicants.")
    check("gre required", ex is not None and ex.value == "Required", repr(ex))

    ex = extract_gre("We evaluate grades, letters, and research experience.")
    check("gre absent -> None", ex is None, repr(ex))


def test_letters() -> None:
    ex = extract_letters("Please arrange for three letters of recommendation from faculty.")
    check("letters word-number", ex is not None and ex.value == 3, repr(ex))

    ex = extract_letters("Submit 2 letters of recommendation electronically.")
    check("letters digit", ex is not None and ex.value == 2, repr(ex))


def test_ects() -> None:
    ex = extract_ects("The MSc comprises 120 ECTS including a 30 ECTS thesis.")
    check("ects", ex is not None and ex.value == 120, repr(ex))


def test_mock_data_schema() -> None:
    mock_path = Path(__file__).resolve().parents[2] / "frontend" / "src" / "data" / "mock_data.json"
    if not mock_path.exists():
        print(f"  skip  mock_data.json not found at {mock_path}")
        return
    data = json.loads(mock_path.read_text(encoding="utf-8"))
    errors = validate_dataset(data)
    for err in errors[:20]:
        print(f"        schema error: {err}")
    check("mock_data.json validates", not errors, f"{len(errors)} error(s)")


def main() -> int:
    for fn in [test_visible_text, test_deadline, test_fee, test_gre, test_letters, test_ects, test_mock_data_schema]:
        print(fn.__name__)
        fn()
    print()
    if FAILURES:
        print(f"{len(FAILURES)} failure(s): {FAILURES}")
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
