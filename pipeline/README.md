# gradintel — Program & Faculty Scraping Pipeline

Config-driven scraper that turns official graduate-program pages into the
schema-valid JSON consumed by the tracker frontend (`../frontend`).

## Architecture

```
targets.yaml ─▶ fetcher (cache + rate-limit + robots.txt)
                  │
                  ├─▶ extractors.py   heuristic regexes: deadline / fee / GRE / letters / ECTS
                  ├─▶ llm.py          Claude structured extraction + ~100-word faculty summaries (optional)
                  └─▶ faculty.py      CSS-selector directory parsing
                              │
                              ▼
                schemas.py validation ─▶ output/programs.json
```

Data-integrity rule: anything not explicitly found on a page is emitted as
`"Unknown/Verify"` — heuristics and the LLM prompt are both built to never guess.

## Setup

```powershell
cd tracker\pipeline
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run

```powershell
# Full run (Claude extraction; needs ANTHROPIC_API_KEY or an `ant auth login` profile)
python -m gradintel.pipeline --config config/targets.yaml --out output/programs.json

# Zero-cost run (regex heuristics only)
python -m gradintel.pipeline --no-llm

# Validate a dataset (e.g. the frontend mock data) against the shared schema
python -m gradintel.pipeline --validate ../frontend/src/data/mock_data.json

# Refresh the frontend's data with a real scrape
python -m gradintel.pipeline --out ../frontend/src/data/mock_data.json
```

Useful flags: `--max-faculty N` (default 25, 0 = unlimited), `--delay SECONDS`
(default 2.0 per domain), `--cache-dir`, `-v`.

## Tests

```powershell
python tests/test_extractors.py
```

## Adding a program

Append an entry to `config/targets.yaml` (see comments there). The
`faculty_directory.selectors` block is per-site CSS — inspect one faculty card
in the browser and adjust until the logged entry count matches the page.
`overrides:` pins curated facts (e.g. a paused-admissions notice) that must not
be overwritten by a scrape.

## Politeness / ethics

- Respects `robots.txt` (skips disallowed URLs and logs them).
- ≥2s between requests to the same domain; identifies itself with a custom User-Agent.
- Caches every fetch for 7 days (`.cache/`) so reruns don't re-hit servers.
- Scrapes only public institutional pages; intended for personal application research.
