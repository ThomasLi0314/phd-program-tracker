"""Shared data schemas for the tracker.

The JSON emitted by the pipeline (and consumed by the frontend) follows the
structure defined here. `validate_dataset` is the single source of truth used
by both the pipeline output step and the mock-data self-test.
"""

from __future__ import annotations

from typing import Any

UNKNOWN = "Unknown/Verify"

DEGREE_TYPES = {"PhD", "MSc", "MRes"}
REGIONS = {"US", "UK", "Europe", "Canada", "Asia-Pacific"}
GRE_STATUSES = {"Required", "Optional", "Not Accepted", UNKNOWN}
ADMISSION_MODELS = {
    "Rotation",
    "Direct Advisor Match",
    "Committee-Based",
    "Coursework First",
    UNKNOWN,
}
FUNDING_STATUSES = {"Fully Funded", "Partial / Merit-Based", "Self-Funded / Mixed", UNKNOWN}
CONTACT_NORMS = {"Encouraged", "Neutral / Not Required", "Discouraged", UNKNOWN}
RECRUITMENT_STATUSES = {"Looking for Students", "Not Advising", UNKNOWN}


def _err(errors: list[str], path: str, msg: str) -> None:
    errors.append(f"{path}: {msg}")


def _require(obj: dict, key: str, types: tuple, path: str, errors: list[str], allow_none: bool = False) -> Any:
    if key not in obj:
        _err(errors, path, f"missing required key '{key}'")
        return None
    val = obj[key]
    if val is None:
        if not allow_none:
            _err(errors, path, f"'{key}' must not be null")
        return None
    if not isinstance(val, types):
        _err(errors, path, f"'{key}' must be {types}, got {type(val).__name__}")
        return None
    return val


def validate_faculty(fac: dict, path: str, errors: list[str]) -> None:
    _require(fac, "id", (str,), path, errors)
    _require(fac, "name", (str,), path, errors)
    _require(fac, "title", (str,), path, errors)
    _require(fac, "sub_field", (str,), path, errors)

    tags = _require(fac, "tags", (list,), path, errors)
    if tags is not None and not (3 <= len(tags) <= 5):
        _err(errors, path, f"tags should have 3-5 entries, got {len(tags)}")

    _require(fac, "summary", (str,), path, errors)

    status = _require(fac, "recruitment_status", (str,), path, errors)
    if status is not None and status not in RECRUITMENT_STATUSES:
        _err(errors, path, f"recruitment_status '{status}' not in {sorted(RECRUITMENT_STATUSES)}")

    links = _require(fac, "links", (dict,), path, errors)
    if links is not None:
        _require(links, "homepage", (str,), f"{path}.links", errors, allow_none=True)


def validate_requirements(req: dict, path: str, errors: list[str]) -> None:
    _require(req, "deadline", (str,), path, errors, allow_none=True)  # ISO date or null
    _require(req, "deadline_display", (str,), path, errors)
    _require(req, "application_fee_usd", (int, float), path, errors, allow_none=True)
    _require(req, "fee_display", (str,), path, errors)

    gre = _require(req, "gre", (str,), path, errors)
    if gre is not None and gre not in GRE_STATUSES:
        _err(errors, path, f"gre '{gre}' not in {sorted(GRE_STATUSES)}")

    _require(req, "letters", (int,), path, errors, allow_none=True)
    _require(req, "english", (str,), path, errors)

    model = _require(req, "admission_model", (str,), path, errors)
    if model is not None and model not in ADMISSION_MODELS:
        _err(errors, path, f"admission_model '{model}' not in {sorted(ADMISSION_MODELS)}")
    _require(req, "admission_model_note", (str,), path, errors)

    funding = _require(req, "funding", (dict,), path, errors)
    if funding is not None:
        fstatus = _require(funding, "status", (str,), f"{path}.funding", errors)
        if fstatus is not None and fstatus not in FUNDING_STATUSES:
            _err(errors, f"{path}.funding", f"status '{fstatus}' not in {sorted(FUNDING_STATUSES)}")
        _require(funding, "years", (int,), f"{path}.funding", errors, allow_none=True)
        _require(funding, "note", (str,), f"{path}.funding", errors)

    contact = _require(req, "pre_application_contact", (str,), path, errors)
    if contact is not None and contact not in CONTACT_NORMS:
        _err(errors, path, f"pre_application_contact '{contact}' not in {sorted(CONTACT_NORMS)}")
    _require(req, "contact_note", (str,), path, errors)

    _require(req, "ects", (int,), path, errors, allow_none=True)
    _require(req, "duration", (str,), path, errors)


def validate_program(prog: dict, idx: int, errors: list[str]) -> None:
    path = f"programs[{idx}]"
    _require(prog, "id", (str,), path, errors)
    _require(prog, "university", (str,), path, errors)
    _require(prog, "program_name", (str,), path, errors)

    degree = _require(prog, "degree_type", (str,), path, errors)
    if degree is not None and degree not in DEGREE_TYPES:
        _err(errors, path, f"degree_type '{degree}' not in {sorted(DEGREE_TYPES)}")

    region = _require(prog, "region", (str,), path, errors)
    if region is not None and region not in REGIONS:
        _err(errors, path, f"region '{region}' not in {sorted(REGIONS)}")

    _require(prog, "country", (str,), path, errors)

    disc = _require(prog, "discipline", (dict,), path, errors)
    if disc is not None:
        _require(disc, "primary", (str,), f"{path}.discipline", errors)
        subs = _require(disc, "subs", (list,), f"{path}.discipline", errors)
        if subs is not None and len(subs) == 0:
            _err(errors, f"{path}.discipline", "subs must be non-empty")

    req = _require(prog, "requirements", (dict,), path, errors)
    if req is not None:
        validate_requirements(req, f"{path}.requirements", errors)

    links = _require(prog, "links", (dict,), path, errors)
    if links is not None:
        _require(links, "program", (str,), f"{path}.links", errors)

    _require(prog, "data_currency", (str,), path, errors)

    faculty = _require(prog, "faculty", (list,), path, errors)
    if faculty is not None:
        for j, fac in enumerate(faculty):
            if not isinstance(fac, dict):
                _err(errors, f"{path}.faculty[{j}]", "must be an object")
                continue
            validate_faculty(fac, f"{path}.faculty[{j}]", errors)


def validate_dataset(data: dict) -> list[str]:
    """Validate a full dataset dict. Returns a list of error strings (empty = valid)."""
    errors: list[str] = []
    meta = _require(data, "meta", (dict,), "$", errors)
    if meta is not None:
        _require(meta, "generated_at", (str,), "$.meta", errors)
        _require(meta, "cycle", (str,), "$.meta", errors)
        _require(meta, "source", (str,), "$.meta", errors)

    programs = _require(data, "programs", (list,), "$", errors)
    if programs is not None:
        seen_ids: set[str] = set()
        for i, prog in enumerate(programs):
            if not isinstance(prog, dict):
                _err(errors, f"programs[{i}]", "must be an object")
                continue
            validate_program(prog, i, errors)
            pid = prog.get("id")
            if isinstance(pid, str):
                if pid in seen_ids:
                    _err(errors, f"programs[{i}]", f"duplicate program id '{pid}'")
                seen_ids.add(pid)
    return errors
