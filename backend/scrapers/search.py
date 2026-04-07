"""
Search-results scrapers for each retailer.
Each function returns a list of dicts: {name, url, price, in_stock, retailer}
"""
from __future__ import annotations

import json
import logging
import re
from urllib.parse import quote_plus

from playwright.async_api import async_playwright
from playwright_stealth import Stealth

logger = logging.getLogger(__name__)


async def _new_page(p):
    browser = await p.chromium.launch(headless=True)
    context = await browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
    )
    page = await context.new_page()
    await Stealth().apply_stealth_async(page)
    return browser, page


# ── Pokémon Center ────────────────────────────────────────────────────────────

async def search_pokemon_center(keyword: str) -> list:
    results = []
    url = f"https://www.pokemoncenter.com/search?q={quote_plus(keyword)}"
    try:
        async with async_playwright() as p:
            browser, page = await _new_page(p)
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(2000)

            tiles = await page.query_selector_all(
                ".product-tile, [class*='ProductTile'], [data-testid*='product']"
            )
            for tile in tiles:
                try:
                    link_el = await tile.query_selector("a[href]")
                    name_el = await tile.query_selector(
                        ".product-tile__name, [class*='name'], h2, h3"
                    )
                    price_el = await tile.query_selector(
                        "[class*='price'] .money, [class*='price']"
                    )

                    href = await link_el.get_attribute("href") if link_el else None
                    if not href:
                        continue
                    product_url = href if href.startswith("http") else f"https://www.pokemoncenter.com{href}"
                    name = (await name_el.inner_text()).strip() if name_el else None
                    price = None
                    if price_el:
                        price_text = (await price_el.inner_text()).strip()
                        m = re.search(r"[\d,]+\.?\d*", price_text.replace(",", ""))
                        if m:
                            price = float(m.group())

                    results.append({
                        "name": name,
                        "url": product_url,
                        "price": price,
                        "in_stock": True,  # listed = likely available; product scraper confirms
                        "retailer": "pokemon_center",
                    })
                except Exception:
                    continue
            await browser.close()
    except Exception as e:
        logger.error("Pokemon Center search failed for '%s': %s", keyword, e)
    return results


# ── Walmart ───────────────────────────────────────────────────────────────────
# Walmart's search page uses Akamai Bot Manager with an interactive press-and-hold
# challenge that cannot be bypassed by headless or non-headless browsers without
# paid proxy/CAPTCHA services. Keyword search is not supported for Walmart.
# Individual product page monitoring (by URL) works fine.

async def search_walmart(keyword: str) -> list:
    raise NotImplementedError(
        "Walmart keyword search is not supported. Walmart uses enterprise-grade bot "
        "protection (Akamai) that blocks all automated search. To track a Walmart product, "
        "paste the product URL directly into the 'Add Product by URL' form."
    )


# ── Target ────────────────────────────────────────────────────────────────────

async def search_target(keyword: str) -> list:
    results = []
    url = f"https://www.target.com/s?searchTerm={quote_plus(keyword)}"
    try:
        async with async_playwright() as p:
            browser, page = await _new_page(p)

            api_data = {}

            async def capture_response(response):
                if "api.target.com" in response.url and "search_term" in response.url:
                    try:
                        body = await response.json()
                        nonlocal api_data
                        api_data = body
                    except Exception:
                        pass

            page.on("response", capture_response)
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(3000)

            # Try API data
            if api_data:
                try:
                    items = (
                        api_data.get("data", {})
                        .get("search", {})
                        .get("products", {})
                        .get("Item", [])
                    )
                    for item in items:
                        try:
                            tcin = item.get("tcin")
                            slug = item.get("item", {}).get("enrichment", {}).get("buy_url") or ""
                            if not slug and tcin:
                                slug = f"https://www.target.com/p/-/A-{tcin}"
                            if not slug:
                                continue
                            price = (
                                item.get("price", {}).get("current_retail")
                                or item.get("price", {}).get("reg_retail")
                            )
                            name = item.get("item", {}).get("product_description", {}).get("title")
                            avail = item.get("availability", {}).get("availability_status", "")
                            results.append({
                                "name": name,
                                "url": slug if slug.startswith("http") else f"https://www.target.com{slug}",
                                "price": price,
                                "in_stock": avail in ("IN_STOCK", "LIMITED_STOCK"),
                                "retailer": "target",
                            })
                        except Exception:
                            continue
                    if results:
                        await browser.close()
                        return results
                except Exception:
                    pass

            # Fallback: DOM
            cards = await page.query_selector_all(
                "[data-test='product-details'], [class*='ProductCardBody']"
            )
            for card in cards:
                try:
                    link_el = await card.query_selector("a[href]")
                    name_el = await card.query_selector("[data-test='product-title'], a[data-test='product-title']")
                    price_el = await card.query_selector("[data-test='current-price'], [class*='CurrentPrice']")
                    href = await link_el.get_attribute("href") if link_el else None
                    if not href:
                        continue
                    product_url = href if href.startswith("http") else f"https://www.target.com{href}"
                    name = (await name_el.inner_text()).strip() if name_el else None
                    price = None
                    if price_el:
                        t = (await price_el.inner_text()).strip()
                        m = re.search(r"[\d.]+", t.replace(",", ""))
                        if m:
                            price = float(m.group())
                    results.append({
                        "name": name,
                        "url": product_url,
                        "price": price,
                        "in_stock": True,
                        "retailer": "target",
                    })
                except Exception:
                    continue
            await browser.close()
    except Exception as e:
        logger.error("Target search failed for '%s': %s", keyword, e)
    return results


# ── Dispatcher ────────────────────────────────────────────────────────────────

async def search_retailer(keyword: str, retailer: str) -> list:
    if retailer == "pokemon_center":
        return await search_pokemon_center(keyword)
    if retailer == "walmart":
        return await search_walmart(keyword)
    if retailer == "target":
        return await search_target(keyword)
    raise ValueError(f"Unknown retailer: {retailer}")
