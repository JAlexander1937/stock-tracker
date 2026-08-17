"""
Keyword search dispatcher.
Delegates to hero/{retailer}_search.js via the generic Hero runner,
then filters results so every search word appears in the product name.
"""
from __future__ import annotations

import logging
import re

from .hero_runner import run_hero

logger = logging.getLogger(__name__)


def _all_words_match(name: str | None, keyword: str) -> bool:
    """Return True if every word in keyword appears in name (case-insensitive)."""
    if not name:
        return False
    name_lower = name.lower()
    words = re.findall(r'\w+', keyword.lower())
    return all(w in name_lower for w in words)


async def search_retailer(keyword: str, retailer: str) -> list:
    if retailer == "target":
        # Target blocks the search-results endpoint (cdui-orchestrations .../slp)
        # with 421s even after its CAPTCHA/RttCheck bot-check passes elsewhere on
        # the same page load — unlike product pages, there's no SSR fallback with
        # real data to read instead. Individual product URLs still work fine.
        raise ValueError(
            "Target keyword search is not supported — Target blocks the search results "
            "endpoint with bot protection. Track Target products by URL instead."
        )

    results = await run_hero(f"{retailer}_search", keyword)
    if not isinstance(results, list):
        logger.error("Hero search for '%s' on %s returned non-list: %s", keyword, retailer, results)
        return []

    filtered = [r for r in results if _all_words_match(r.get("name"), keyword)]
    logger.info(
        "Search '%s' on %s: %d raw → %d after keyword filter",
        keyword, retailer, len(results), len(filtered),
    )
    return filtered
