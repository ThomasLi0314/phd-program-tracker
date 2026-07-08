"""Weekly review-based refresh (non-destructive).

Re-checks hard admission metrics (deadline, application fee, GRE, letters, ECTS)
for each program in the dataset by re-fetching its official pages, then writes a
change report for a human to review. It NEVER edits the dataset — verified and
curated values are only overwritten if you choose to apply a change yourself.

Source URLs per program: the dataset's links.program + links.admissions, plus
(when the program id matches an entry in config/targets.yaml) that target's
deeper requirement pages. robots.txt is respected; blocked/failed fetches are
logged, not guessed.

Usage:
    python weekly_refresh.py
    python weekly_refresh.py --dataset ../frontend/src/data/mock_data.json --max 5
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
from pathlib import Path

import requests
import yaml

from gradintel.extractors import extract_all, visible_text
from gradintel.fetcher import Fetcher, RobotsDisallowed

log = logging.getLogger("gradintel.weekly")

CUR_SYMBOL = {"USD": "$", "EUR": "€", "GBP": "£"}

_MONTHS = {
    "january": "jan", "february": "feb", "march": "mar", "april": "apr",
    "june": "jun", "july": "jul", "august": "aug", "september": "sep",
    "sept": "sep", "october": "oct", "november": "nov", "december": "dec",
}


def _norm_date(text: str) -> str:
    """Lowercase, drop commas, and map full month names to 3-letter forms so
    'December 1' and 'Dec 1, 2026' compare equal on the month+day."""
    t = (text or "").lower().replace(",", " ")
    for full, abbr in _MONTHS.items():
        t = t.replace(full, abbr)
    return " ".join(t.split())


def load_target_pages(config_path: Path) -> dict[str, list[str]]:
    """Map program id -> deeper requirement page URLs from targets.yaml (if present)."""
    if not config_path.exists():
        return {}
    config = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    out: dict[str, list[str]] = {}
    for entry in config.get("programs", []):
        urls = entry.get("pages", {}).get("requirements", [])
        if urls:
            out[entry["id"]] = urls
    return out


def source_urls(program: dict, target_pages: dict[str, list[str]]) -> list[str]:
    urls: list[str] = list(target_pages.get(program["id"], []))
    links = program.get("links", {})
    for key in ("program", "admissions"):
        u = links.get(key)
        if u and u not in urls:
            urls.append(u)
    return urls


def compare(program: dict, extractions: dict) -> list[dict]:
    """Return a list of proposed-change dicts where a heuristic reading differs."""
    req = program["requirements"]
    changes: list[dict] = []

    ex = extractions.get("gre")
    if ex and ex.value != req.get("gre"):
        changes.append({"field": "gre", "current": req.get("gre"), "found": ex.value, "evidence": ex.evidence})

    ex = extractions.get("letters")
    if ex and ex.value != req.get("letters"):
        changes.append({"field": "letters", "current": req.get("letters"), "found": ex.value, "evidence": ex.evidence})

    ex = extractions.get("ects")
    if ex and ex.value != req.get("ects"):
        changes.append({"field": "ects", "current": req.get("ects"), "found": ex.value, "evidence": ex.evidence})

    ex = extractions.get("deadline")
    if ex:
        found = str(ex.value).strip()
        # Only flag if the found date (month+day) isn't already reflected in the current display.
        if _norm_date(found) not in _norm_date(req.get("deadline_display")):
            changes.append(
                {"field": "deadline", "current": req.get("deadline_display"), "found": found, "evidence": ex.evidence}
            )

    ex = extractions.get("fee")
    if ex:
        amount, cur = ex.value["amount"], ex.value["currency"]
        display = f"{CUR_SYMBOL.get(cur, cur + ' ')}{amount:g}"
        cur_fee = req.get("application_fee_usd")
        # Flag when the current fee is unknown, or the found currency-native amount
        # isn't already shown in the current fee display.
        if cur_fee is None or display not in (req.get("fee_display") or ""):
            changes.append(
                {"field": "fee", "current": req.get("fee_display"), "found": display, "evidence": ex.evidence}
            )

    return changes


def run(dataset_path: Path, config_path: Path, out_dir: Path, cache_dir: str, delay: float, limit: int) -> int:
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    programs = dataset["programs"]
    if limit > 0:
        programs = programs[:limit]

    target_pages = load_target_pages(config_path)
    fetcher = Fetcher(cache_dir=cache_dir, delay_seconds=delay)

    checked = reachable = 0
    proposals: list[dict] = []
    blocked: list[str] = []
    failed: list[str] = []

    for program in programs:
        label = f"{program['university']} — {program['program_name']}"
        checked += 1
        texts: list[str] = []
        any_ok = False
        for url in source_urls(program, target_pages):
            try:
                result = fetcher.get(url, max_age_hours=0)  # weekly run wants fresh reads
                texts.append(visible_text(result.text))
                any_ok = True
            except RobotsDisallowed:
                blocked.append(f"{label} :: {url}")
            except requests.RequestException as exc:
                failed.append(f"{label} :: {url} ({exc})")

        if not any_ok:
            continue
        reachable += 1
        changes = compare(program, extract_all(" ".join(texts)))
        if changes:
            proposals.append({"id": program["id"], "label": label, "changes": changes})
            log.info("%d proposed change(s): %s", len(changes), label)

    out_dir.mkdir(parents=True, exist_ok=True)
    today = dt.date.today().isoformat()

    (out_dir / f"proposed-{today}.json").write_text(
        json.dumps({"generated_at": today, "proposals": proposals}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    lines = [
        f"# Weekly refresh report — {today}",
        "",
        f"- Programs checked: **{checked}**",
        f"- Reachable (at least one page fetched): **{reachable}**",
        f"- Programs with proposed changes: **{len(proposals)}**",
        f"- robots.txt-blocked URLs: **{len(blocked)}**",
        f"- Failed fetches: **{len(failed)}**",
        "",
        "> Review-based: nothing was changed in the dataset. To accept a change, edit "
        "`frontend/src/data/mock_data.json` yourself (or ask the agent to), then re-validate.",
        "",
    ]
    if proposals:
        lines.append("## Proposed changes")
        for p in proposals:
            lines.append(f"\n### {p['label']}  (`{p['id']}`)")
            for c in p["changes"]:
                lines.append(f"- **{c['field']}**: current `{c['current']}` → found `{c['found']}`")
                lines.append(f"  - evidence: {c['evidence'][:200]}")
    else:
        lines.append("## Proposed changes\n\nNone — all reachable programs match the current dataset.")

    if blocked:
        lines.append("\n## robots.txt-blocked (need manual/agent research)\n")
        lines += [f"- {b}" for b in blocked]
    if failed:
        lines.append("\n## Failed fetches\n")
        lines += [f"- {f}" for f in failed]

    report = out_dir / f"refresh-report-{today}.md"
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")

    log.info(
        "checked=%d reachable=%d proposals=%d blocked=%d failed=%d",
        checked, reachable, len(proposals), len(blocked), len(failed),
    )
    log.info("report: %s", report)
    print(f"REPORT {report}  ({len(proposals)} program(s) with proposed changes)")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="weekly_refresh", description=__doc__)
    parser.add_argument("--dataset", type=Path, default=Path("../frontend/src/data/mock_data.json"))
    parser.add_argument("--config", type=Path, default=Path("config/targets.yaml"))
    parser.add_argument("--out-dir", type=Path, default=Path("review"))
    parser.add_argument("--cache-dir", default=".cache")
    parser.add_argument("--delay", type=float, default=2.0)
    parser.add_argument("--max", type=int, default=0, help="limit programs (0 = all; for testing)")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )
    return run(args.dataset, args.config, args.out_dir, args.cache_dir, args.delay, args.max)


if __name__ == "__main__":
    raise SystemExit(main())
