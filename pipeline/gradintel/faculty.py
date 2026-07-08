"""Faculty directory parsing driven by per-site CSS selectors from targets.yaml."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from urllib.parse import urljoin

from bs4 import BeautifulSoup

log = logging.getLogger("gradintel.faculty")


@dataclass
class FacultyStub:
    """A faculty entry as scraped from a directory page (pre-enrichment)."""

    name: str
    title: str = ""
    profile_url: str | None = None
    extra: dict = field(default_factory=dict)


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "unknown"


def parse_directory(html: str, base_url: str, selectors: dict) -> list[FacultyStub]:
    """Parse a faculty directory page.

    `selectors` (from targets.yaml):
      card:  CSS selector for one faculty entry (required)
      name:  selector within card for the person's name (required)
      title: selector within card for their title (optional)
      link:  selector within card for the profile <a> (optional, defaults to first <a>)
    """
    soup = BeautifulSoup(html, "lxml")
    cards = soup.select(selectors["card"])
    stubs: list[FacultyStub] = []
    for card in cards:
        name_el = card.select_one(selectors["name"])
        if name_el is None:
            continue
        name = " ".join(name_el.get_text(" ", strip=True).split())
        if not name:
            continue

        title = ""
        if selectors.get("title"):
            title_el = card.select_one(selectors["title"])
            if title_el is not None:
                title = " ".join(title_el.get_text(" ", strip=True).split())

        link_sel = selectors.get("link", "a")
        link_el = card.select_one(link_sel)
        profile_url = None
        if link_el is not None and link_el.get("href"):
            profile_url = urljoin(base_url, link_el["href"])

        stubs.append(FacultyStub(name=name, title=title, profile_url=profile_url))

    log.info("parsed %d faculty entries from %s", len(stubs), base_url)
    return stubs
