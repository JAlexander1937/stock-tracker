from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

from .database import get_conn
from .scrapers import scrape, detect_retailer
from .scrapers.search import search_retailer
from .agent import run_agent

logger = logging.getLogger(__name__)


def get_last_snapshot(product_id: int) -> Optional[dict]:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM snapshots WHERE product_id = ? ORDER BY scraped_at DESC LIMIT 1",
            (product_id,),
        ).fetchone()
        return dict(row) if row else None


def save_snapshot(product_id: int, scrape_result: dict):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO snapshots (product_id, price, in_stock, quantity) VALUES (?, ?, ?, ?)",
            (
                product_id,
                scrape_result.get("price"),
                1 if scrape_result.get("in_stock") else 0,
                scrape_result.get("quantity"),
            ),
        )


def save_action(product_id: int, action_type: str, result: dict):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO actions (product_id, action_type, result) VALUES (?, ?, ?)",
            (product_id, action_type, json.dumps(result)),
        )


def update_product_name(product_id: int, name: str):
    with get_conn() as conn:
        conn.execute(
            "UPDATE products SET name = ? WHERE id = ? AND (name IS NULL OR name = '')",
            (name, product_id),
        )


def status_changed(prev: Optional[dict], current: dict) -> bool:
    if prev is None:
        return current.get("in_stock", False)
    prev_in_stock = bool(prev.get("in_stock"))
    curr_in_stock = bool(current.get("in_stock"))
    return prev_in_stock != curr_in_stock


def price_hit_target(product: dict, snapshot: dict) -> bool:
    max_price = product.get("max_price")
    price = snapshot.get("price")
    if max_price is None or price is None:
        return False
    return price <= max_price


async def poll_once():
    with get_conn() as conn:
        products = conn.execute(
            "SELECT * FROM products WHERE active = 1"
        ).fetchall()
        products = [dict(p) for p in products]

    for product in products:
        try:
            scrape_result = await scrape(product["url"])

            # Back-fill product name from scrape if missing
            if scrape_result.get("name") and not product.get("name"):
                update_product_name(product["id"], scrape_result["name"])
                product["name"] = scrape_result["name"]

            save_snapshot(product["id"], scrape_result)

            prev = get_last_snapshot(product["id"])
            stock_changed = status_changed(prev, scrape_result)
            price_ok = price_hit_target(product, scrape_result)

            should_run_agent = (
                (stock_changed and scrape_result.get("in_stock"))
                or (price_ok and scrape_result.get("in_stock"))
            )

            if should_run_agent:
                agent_result = run_agent(product, scrape_result)
                save_action(product["id"], agent_result["action"], agent_result)
                logger.info(
                    "Agent action for %s: %s — %s",
                    product.get("name") or product["url"],
                    agent_result["action"],
                    agent_result["reason"],
                )
            else:
                logger.debug(
                    "No change for %s (in_stock=%s price=%s)",
                    product.get("name") or product["url"],
                    scrape_result.get("in_stock"),
                    scrape_result.get("price"),
                )
        except Exception as e:
            logger.error("Error polling product %s: %s", product["url"], e)


async def discover_once():
    """Run all active searches and auto-add any newly found products."""
    with get_conn() as conn:
        searches = conn.execute(
            "SELECT * FROM searches WHERE active = 1"
        ).fetchall()
        searches = [dict(s) for s in searches]

    for search in searches:
        try:
            logger.info("Running search: '%s' on %s", search["keyword"], search["retailer"])
            found = await search_retailer(search["keyword"], search["retailer"])
            new_count = 0

            for item in found:
                url = item.get("url")
                if not url:
                    continue
                with get_conn() as conn:
                    existing = conn.execute(
                        "SELECT id FROM products WHERE url = ?", (url,)
                    ).fetchone()
                    if existing:
                        continue
                    # New product — auto-add it
                    conn.execute(
                        "INSERT INTO products (name, url, retailer, max_price, desired_qty) VALUES (?, ?, ?, ?, ?)",
                        (
                            item.get("name"),
                            url,
                            search["retailer"],
                            search.get("max_price"),
                            search.get("desired_qty", 1),
                        ),
                    )
                    new_id = conn.execute(
                        "SELECT id FROM products WHERE url = ?", (url,)
                    ).fetchone()["id"]
                new_count += 1
                logger.info("Auto-added new product: %s", item.get("name") or url)

                # Immediately scrape and run agent on new discovery
                try:
                    scrape_result = await scrape(url)
                    with get_conn() as conn:
                        conn.execute(
                            "INSERT INTO snapshots (product_id, price, in_stock, quantity) VALUES (?, ?, ?, ?)",
                            (new_id, scrape_result.get("price"), 1 if scrape_result.get("in_stock") else 0, scrape_result.get("quantity")),
                        )
                    if scrape_result.get("in_stock"):
                        product_row = {"id": new_id, "url": url, "retailer": search["retailer"],
                                       "name": item.get("name"), "max_price": search.get("max_price"),
                                       "desired_qty": search.get("desired_qty", 1)}
                        agent_result = run_agent(product_row, scrape_result)
                        save_action(new_id, agent_result["action"], agent_result)
                except Exception as e:
                    logger.error("Error scraping new product %s: %s", url, e)

            # Update last_run_at
            with get_conn() as conn:
                conn.execute(
                    "UPDATE searches SET last_run_at = datetime('now') WHERE id = ?",
                    (search["id"],),
                )
            if new_count:
                logger.info("Search '%s' on %s: %d new products found", search["keyword"], search["retailer"], new_count)
        except Exception as e:
            logger.error("Search error for '%s' on %s: %s", search["keyword"], search["retailer"], e)


async def run_scheduler(interval_seconds: int = 60, search_interval_seconds: int = 300):
    logger.info("Scheduler started — polling every %ds, searches every %ds", interval_seconds, search_interval_seconds)
    search_elapsed = search_interval_seconds  # run searches immediately on first cycle
    while True:
        try:
            await poll_once()
        except Exception as e:
            logger.error("Poll cycle error: %s", e)

        search_elapsed += interval_seconds
        if search_elapsed >= search_interval_seconds:
            search_elapsed = 0
            try:
                await discover_once()
            except Exception as e:
                logger.error("Discovery cycle error: %s", e)

        await asyncio.sleep(interval_seconds)
