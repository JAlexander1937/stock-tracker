"""
Keyword search dispatcher.
Delegates to hero/{retailer}_search.js via the generic Hero runner,
then filters results so every search word appears in the product name.
"""
from __future__ import annotations

import logging
import re
import unicodedata

from .hero_runner import run_hero

logger = logging.getLogger(__name__)


def _fold(text: str) -> str:
    """Lowercase and strip accents, so 'Pokémon' matches a search for 'pokemon'."""
    normalized = unicodedata.normalize('NFKD', text.lower())
    return ''.join(c for c in normalized if not unicodedata.combining(c))


def _all_words_match(name: str | None, keyword: str) -> bool:
    """Return True if every word in keyword appears in name (case/accent-insensitive)."""
    if not name:
        return False
    name_folded = _fold(name)
    words = re.findall(r'\w+', _fold(keyword))
    return all(w in name_folded for w in words)


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
    if retailer == "pokemon_center":
        # Every request — homepage, search, even a fresh session's first load —
        # hits a DataDome CAPTCHA. Unlike Target, this isn't endpoint-specific;
        # the whole site is behind it, so there's no product-URL fallback either.
        raise ValueError(
            "Pokémon Center is not supported — every request hits a DataDome CAPTCHA "
            "with no free or reliable bypass."
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
