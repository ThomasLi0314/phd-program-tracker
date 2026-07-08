"""Pipeline CLI: scrape configured programs and emit schema-valid tracker JSON.

Usage:
    python -m gradintel.pipeline --config config/targets.yaml --out output/programs.json
    python -m gradintel.pipeline --config config/targets.yaml --no-llm
    python -m gradintel.pipeline --validate ../frontend/src/data/mock_data.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import sys
from pathlib import Path

import requests
import yaml

from . import schemas
from .extractors import extract_all, visible_text
from .faculty import parse_directory, slugify
from .fetcher import Fetcher, RobotsDisallowed

log = logging.getLogger("gradintel.pipeline")

UNKNOWN = schemas.UNKNOWN

# Rough conversion for the fee *filter* only; fee_display keeps the original currency.
APPROX_TO_USD = {"USD": 1.0, "EUR": 1.1, "GBP": 1.3, "CHF": 1.1}


def _empty_requirements() -> dict:
    return {
        "deadline": None,
        "deadline_display": UNKNOWN,
        "application_fee_usd": None,
        "fee_display": UNKNOWN,
        "gre": UNKNOWN,
        "letters": None,
        "english": UNKNOWN,
        "admission_model": UNKNOWN,
        "admission_model_note": UNKNOWN,
        "funding": {"status": UNKNOWN, "years": None, "note": UNKNOWN},
        "pre_application_contact": UNKNOWN,
        "contact_note": UNKNOWN,
        "ects": None,
        "duration": UNKNOWN,
    }


def _apply_heuristics(req: dict, extractions: dict) -> None:
    """Fill requirement fields from heuristic extractions (only where still unknown)."""
    ex = extractions.get("deadline")
    if ex and req["deadline_display"] == UNKNOWN:
        req["deadline_display"] = str(ex.value)

    ex = extractions.get("fee")
    if ex and req["application_fee_usd"] is None:
        amount, cur = ex.value["amount"], ex.value["currency"]
        rate = APPROX_TO_USD.get(cur)
        if rate:
            req["application_fee_usd"] = round(amount * rate)
        symbol = {"USD": "$", "EUR": "€", "GBP": "£"}.get(cur, cur + " ")
        req["fee_display"] = f"{symbol}{amount:g}"

    ex = extractions.get("gre")
    if ex and req["gre"] == UNKNOWN:
        req["gre"] = ex.value

    ex = extractions.get("letters")
    if ex and req["letters"] is None:
        req["letters"] = ex.value

    ex = extractions.get("ects")
    if ex and req["ects"] is None:
        req["ects"] = ex.value


def _apply_llm(req: dict, parsed) -> None:
    """Overlay LLM-extracted requirements (authoritative when present)."""
    req["deadline"] = parsed.deadline_iso
    req["deadline_display"] = parsed.deadline_display
    req["application_fee_usd"] = parsed.application_fee_usd
    req["fee_display"] = parsed.fee_display
    req["gre"] = parsed.gre
    req["letters"] = parsed.letters
    req["english"] = parsed.english
    req["admission_model"] = parsed.admission_model
    req["admission_model_note"] = parsed.admission_model_note
    req["funding"] = {
        "status": parsed.funding_status,
        "years": parsed.funding_years,
        "note": parsed.funding_note,
    }
    req["pre_application_contact"] = parsed.pre_application_contact
    req["contact_note"] = parsed.contact_note
    req["ects"] = parsed.ects
    req["duration"] = parsed.duration


def _fetch_pages(fetcher: Fetcher, urls: list[str]) -> list[tuple[str, str]]:
    pages: list[tuple[str, str]] = []
    for url in urls:
        try:
            result = fetcher.get(url)
            pages.append((url, visible_text(result.text)))
        except RobotsDisallowed as exc:
            log.warning("skipped (robots.txt): %s", exc)
        except requests.RequestException as exc:
            log.warning("fetch failed for %s: %s", url, exc)
    return pages


def build_program(entry: dict, fetcher: Fetcher, llm, max_faculty: int) -> dict:
    label = f"{entry['university']} — {entry['program_name']}"
    log.info("=== %s ===", label)

    # 1. Requirements
    req = _empty_requirements()
    req_urls = entry.get("pages", {}).get("requirements", [])
    pages = _fetch_pages(fetcher, req_urls)
    combined = " ".join(text for _, text in pages)
    if combined:
        _apply_heuristics(req, extract_all(combined))
    if llm is not None and pages:
        try:
            _apply_llm(req, llm.extract_requirements(label, pages))
        except Exception as exc:  # keep heuristics on LLM failure
            log.error("LLM requirements extraction failed for %s: %s", label, exc)

    # Static overrides from config always win (curated facts, e.g. known ECTS).
    for key, value in (entry.get("overrides") or {}).items():
        if key == "funding" and isinstance(value, dict):
            req["funding"].update(value)
        else:
            req[key] = value

    # 2. Faculty
    faculty: list[dict] = []
    directory = entry.get("pages", {}).get("faculty_directory")
    if directory:
        try:
            result = fetcher.get(directory["url"])
            stubs = parse_directory(result.text, directory["url"], directory["selectors"])
        except (RobotsDisallowed, requests.RequestException) as exc:
            log.warning("faculty directory failed for %s: %s", label, exc)
            stubs = []

        if max_faculty > 0:
            dropped = len(stubs) - max_faculty
            if dropped > 0:
                log.warning("capping faculty at %d (dropping %d) for %s", max_faculty, dropped, label)
            stubs = stubs[:max_faculty]

        for stub in stubs:
            fac = {
                "id": slugify(stub.name),
                "name": stub.name,
                "title": stub.title or UNKNOWN,
                "sub_field": "General",
                "tags": [UNKNOWN, UNKNOWN, UNKNOWN],
                "summary": UNKNOWN,
                "recruitment_status": UNKNOWN,
                "links": {"homepage": stub.profile_url, "scholar": None},
            }
            if llm is not None and stub.profile_url:
                try:
                    profile = fetcher.get(stub.profile_url)
                    parsed = llm.summarize_faculty(stub.name, stub.title, visible_text(profile.text))
                    fac["tags"] = parsed.tags[:5]
                    fac["summary"] = parsed.summary
                    fac["recruitment_status"] = parsed.recruitment_status
                    fac["sub_field"] = parsed.sub_field
                except (RobotsDisallowed, requests.RequestException) as exc:
                    log.warning("profile fetch failed for %s: %s", stub.name, exc)
                except Exception as exc:
                    log.error("LLM faculty summary failed for %s: %s", stub.name, exc)
            faculty.append(fac)

    return {
        "id": entry["id"],
        "university": entry["university"],
        "program_name": entry["program_name"],
        "degree_type": entry["degree_type"],
        "region": entry["region"],
        "country": entry["country"],
        "discipline": entry["discipline"],
        "requirements": req,
        "links": entry.get("links", {"program": req_urls[0] if req_urls else ""}),
        "data_currency": entry.get(
            "data_currency",
            f"Scraped {dt.date.today().isoformat()} — verify against official pages before applying.",
        ),
        "faculty": faculty,
    }


def run(config_path: Path, out_path: Path, use_llm: bool, max_faculty: int, cache_dir: str, delay: float) -> int:
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    fetcher = Fetcher(cache_dir=cache_dir, delay_seconds=delay)

    llm = None
    if use_llm:
        try:
            from .llm import LLMExtractor

            llm = LLMExtractor()
            log.info("LLM extraction enabled (model=%s)", llm.model)
        except RuntimeError as exc:
            log.warning("%s — continuing with heuristics only", exc)

    programs = [
        build_program(entry, fetcher, llm, max_faculty) for entry in config.get("programs", [])
    ]

    dataset = {
        "meta": {
            "version": 1,
            "generated_at": dt.date.today().isoformat(),
            "cycle": config.get("cycle", "Unknown/Verify"),
            "source": "pipeline" + ("" if llm else " (heuristics only)"),
            "note": "Automated scrape — verify Unknown/Verify fields against official pages.",
        },
        "programs": programs,
    }

    errors = schemas.validate_dataset(dataset)
    if errors:
        for err in errors:
            log.error("schema: %s", err)
        log.error("output failed validation with %d error(s); not writing %s", len(errors), out_path)
        return 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(dataset, indent=2, ensure_ascii=False), encoding="utf-8")
    log.info("wrote %d program(s) to %s", len(programs), out_path)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="gradintel", description=__doc__)
    parser.add_argument("--config", type=Path, default=Path("config/targets.yaml"))
    parser.add_argument("--out", type=Path, default=Path("output/programs.json"))
    parser.add_argument("--no-llm", action="store_true", help="skip Claude extraction; heuristics only")
    parser.add_argument("--max-faculty", type=int, default=25, help="cap faculty per program (0 = unlimited)")
    parser.add_argument("--cache-dir", default=".cache")
    parser.add_argument("--delay", type=float, default=2.0, help="per-domain seconds between requests")
    parser.add_argument("--validate", type=Path, help="validate an existing JSON file against the schema and exit")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )

    if args.validate:
        data = json.loads(args.validate.read_text(encoding="utf-8"))
        errors = schemas.validate_dataset(data)
        if errors:
            for err in errors:
                print(f"INVALID  {err}")
            return 1
        n_prog = len(data.get("programs", []))
        n_fac = sum(len(p.get("faculty", [])) for p in data.get("programs", []))
        print(f"VALID  {args.validate} — {n_prog} programs, {n_fac} faculty profiles")
        return 0

    return run(args.config, args.out, not args.no_llm, args.max_faculty, args.cache_dir, args.delay)


if __name__ == "__main__":
    sys.exit(main())
