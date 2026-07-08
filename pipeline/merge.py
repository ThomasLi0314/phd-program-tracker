"""Merge program JSON into a tracker dataset.

Two modes:

  Program upsert (default) — replace/insert whole programs by id:
      python merge.py <target.json> <source1.json> [source2.json ...]

  Faculty-only append — add faculty to EXISTING programs (matched by program id)
  without touching their curated requirements; dedupes by faculty id:
      python merge.py --faculty-only <target.json> <source1.json> ...

Sources may be a full dataset ({"meta":…, "programs":[…]}) or a bare JSON array
of program objects. Faculty are always deduped by id within each program. The
result is schema-validated before writing — an invalid merge leaves the target
untouched.
"""

from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

from gradintel.schemas import validate_dataset


def load_programs(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        return data.get("programs", [])
    if isinstance(data, list):
        return data
    raise ValueError(f"{path}: expected a dataset object or a JSON array")


def dedupe_faculty(program: dict) -> int:
    """Drop duplicate faculty (by id), keeping first occurrence. Returns #dropped."""
    seen: set[str] = set()
    kept: list[dict] = []
    for fac in program.get("faculty", []):
        fid = fac.get("id")
        if fid in seen:
            continue
        seen.add(fid)
        kept.append(fac)
    dropped = len(program.get("faculty", [])) - len(kept)
    program["faculty"] = kept
    return dropped


def main(argv: list[str]) -> int:
    args = argv[1:]
    faculty_only = False
    if args and args[0] == "--faculty-only":
        faculty_only = True
        args = args[1:]
    if len(args) < 2:
        print(__doc__)
        return 2

    target_path = Path(args[0])
    dataset = json.loads(target_path.read_text(encoding="utf-8"))
    by_id = {p["id"]: i for i, p in enumerate(dataset["programs"])}

    added, replaced, faculty_added, skipped = [], [], [], []

    for src in args[1:]:
        for prog in load_programs(Path(src)):
            pid = prog.get("id", "<missing id>")

            if faculty_only:
                if pid not in by_id:
                    skipped.append(pid)
                    continue
                target = dataset["programs"][by_id[pid]]
                existing_ids = {f["id"] for f in target.get("faculty", [])}
                new_faculty = [f for f in prog.get("faculty", []) if f.get("id") not in existing_ids]
                target.setdefault("faculty", []).extend(new_faculty)
                dedupe_faculty(target)
                if new_faculty:
                    faculty_added.append(f"{pid} (+{len(new_faculty)})")
                continue

            dedupe_faculty(prog)
            if pid in by_id:
                dataset["programs"][by_id[pid]] = prog
                replaced.append(pid)
            else:
                by_id[pid] = len(dataset["programs"])
                dataset["programs"].append(prog)
                added.append(pid)

    dataset["meta"]["generated_at"] = dt.date.today().isoformat()
    if added or replaced or faculty_added:
        dataset["meta"]["source"] = "mock + researched"

    errors = validate_dataset(dataset)
    if errors:
        for err in errors[:30]:
            print(f"INVALID  {err}")
        print(f"\nmerge aborted: {len(errors)} schema error(s); {target_path} left untouched")
        return 1

    target_path.write_text(json.dumps(dataset, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"merged into {target_path}")
    if faculty_only:
        print(f"  faculty appended: {', '.join(faculty_added) or '-'}")
        if skipped:
            print(f"  skipped (no such program id): {', '.join(skipped)}")
    else:
        print(f"  added    ({len(added)}): {', '.join(added) or '-'}")
        print(f"  replaced ({len(replaced)}): {', '.join(replaced) or '-'}")
    total_fac = sum(len(p.get("faculty", [])) for p in dataset["programs"])
    print(f"  total: {len(dataset['programs'])} programs, {total_fac} faculty")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
