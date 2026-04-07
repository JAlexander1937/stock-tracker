from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

from .database import get_conn
from .scrapers import scrape, detect_retailer
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


async def run_scheduler(interval_seconds: int = 60):
    logger.info("Scheduler started — polling every %ds", interval_seconds)
    while True:
        try:
            await poll_once()
        except Exception as e:
            logger.error("Poll cycle error: %s", e)
        await asyncio.sleep(interval_seconds)
