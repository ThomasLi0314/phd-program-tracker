"""Polite HTTP fetcher: on-disk cache, per-domain rate limiting, robots.txt respect."""

from __future__ import annotations

import hashlib
import json
import logging
import time
import urllib.robotparser
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import requests

log = logging.getLogger("gradintel.fetcher")

DEFAULT_UA = (
    "GradIntelBot/0.1 (personal academic research tool; respects robots.txt; "
    "contact: set in config)"
)


@dataclass
class FetchResult:
    url: str
    text: str
    status: int
    from_cache: bool


class RobotsDisallowed(Exception):
    pass


class Fetcher:
    def __init__(
        self,
        cache_dir: str | Path = ".cache",
        delay_seconds: float = 2.0,
        user_agent: str = DEFAULT_UA,
        timeout: float = 30.0,
        respect_robots: bool = True,
    ):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.delay = delay_seconds
        self.timeout = timeout
        self.respect_robots = respect_robots
        self.session = requests.Session()
        self.session.headers["User-Agent"] = user_agent
        self._last_hit: dict[str, float] = {}  # domain -> monotonic timestamp
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}

    # -- internals ---------------------------------------------------------

    def _cache_path(self, url: str) -> Path:
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]
        return self.cache_dir / f"{digest}.json"

    def _read_cache(self, url: str, max_age_hours: float) -> FetchResult | None:
        path = self._cache_path(url)
        if not path.exists():
            return None
        try:
            entry = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None
        if time.time() - entry.get("fetched_at", 0) > max_age_hours * 3600:
            return None
        return FetchResult(url=url, text=entry["text"], status=entry["status"], from_cache=True)

    def _write_cache(self, url: str, text: str, status: int) -> None:
        entry = {"url": url, "fetched_at": time.time(), "status": status, "text": text}
        self._cache_path(url).write_text(json.dumps(entry), encoding="utf-8")

    def _robots_allows(self, url: str) -> bool:
        if not self.respect_robots:
            return True
        domain = urlparse(url).netloc
        if domain not in self._robots:
            rp = urllib.robotparser.RobotFileParser()
            rp.set_url(f"https://{domain}/robots.txt")
            try:
                rp.read()
                self._robots[domain] = rp
            except Exception:  # unreachable robots.txt -> assume allowed
                self._robots[domain] = None
        rp = self._robots[domain]
        if rp is None:
            return True
        return rp.can_fetch(self.session.headers["User-Agent"], url)

    def _throttle(self, url: str) -> None:
        domain = urlparse(url).netloc
        last = self._last_hit.get(domain)
        if last is not None:
            wait = self.delay - (time.monotonic() - last)
            if wait > 0:
                time.sleep(wait)
        self._last_hit[domain] = time.monotonic()

    # -- public API --------------------------------------------------------

    def get(self, url: str, max_age_hours: float = 24 * 7) -> FetchResult:
        """Fetch a URL, serving from the on-disk cache when fresh enough.

        Raises RobotsDisallowed if the site's robots.txt forbids the fetch,
        and requests.HTTPError for non-2xx responses.
        """
        cached = self._read_cache(url, max_age_hours)
        if cached is not None:
            log.debug("cache hit: %s", url)
            return cached

        if not self._robots_allows(url):
            raise RobotsDisallowed(f"robots.txt disallows fetching {url}")

        self._throttle(url)
        log.info("GET %s", url)
        resp = self.session.get(url, timeout=self.timeout)
        resp.raise_for_status()
        self._write_cache(url, resp.text, resp.status_code)
        return FetchResult(url=url, text=resp.text, status=resp.status_code, from_cache=False)
