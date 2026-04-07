from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv(Path(__file__).parent.parent / ".env")

from .database import get_conn, init_db
from .scrapers import scrape, detect_retailer
from .scheduler import run_scheduler, poll_once

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    task = asyncio.create_task(run_scheduler(60))
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Stock Tracker", lifespan=lifespan)


# ── Static frontend ──────────────────────────────────────────────────────────

app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/", response_class=FileResponse)
async def root():
    return FileResponse(str(FRONTEND_DIR / "index.html"))


# ── Pydantic schemas ─────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    url: str
    max_price: Optional[float] = None
    desired_qty: int = 1


class ProductUpdate(BaseModel):
    max_price: Optional[float] = None
    desired_qty: Optional[int] = None
    active: Optional[bool] = None
    name: Optional[str] = None


# ── Products ─────────────────────────────────────────────────────────────────

@app.get("/products")
def list_products():
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT p.*,
                   s.price      AS last_price,
                   s.in_stock   AS last_in_stock,
                   s.quantity   AS last_quantity,
                   s.scraped_at AS last_scraped_at
            FROM products p
            LEFT JOIN snapshots s ON s.id = (
                SELECT id FROM snapshots WHERE product_id = p.id ORDER BY scraped_at DESC LIMIT 1
            )
            ORDER BY p.added_at DESC
        """).fetchall()
    return [dict(r) for r in rows]


@app.post("/products", status_code=201)
def add_product(body: ProductCreate):
    try:
        retailer = detect_retailer(body.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    with get_conn() as conn:
        try:
            conn.execute(
                "INSERT INTO products (url, retailer, max_price, desired_qty) VALUES (?, ?, ?, ?)",
                (body.url, retailer, body.max_price, body.desired_qty),
            )
            row = conn.execute("SELECT * FROM products WHERE url = ?", (body.url,)).fetchone()
        except Exception as e:
            if "UNIQUE" in str(e):
                raise HTTPException(status_code=409, detail="Product URL already in watchlist.")
            raise
    return dict(row)


@app.put("/products/{product_id}")
def update_product(product_id: int, body: ProductUpdate):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update.")
    # Convert bool active to int for SQLite
    if "active" in fields:
        fields["active"] = 1 if fields["active"] else 0
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [product_id]
    with get_conn() as conn:
        conn.execute(f"UPDATE products SET {set_clause} WHERE id = ?", values)
        row = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Product not found.")
    return dict(row)


@app.delete("/products/{product_id}", status_code=204)
def delete_product(product_id: int):
    with get_conn() as conn:
        result = conn.execute("DELETE FROM products WHERE id = ?", (product_id,))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Product not found.")


# ── Snapshots ────────────────────────────────────────────────────────────────

@app.get("/snapshots/{product_id}")
def get_snapshots(product_id: int, limit: int = 50):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM snapshots WHERE product_id = ? ORDER BY scraped_at DESC LIMIT ?",
            (product_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]


# ── Actions ──────────────────────────────────────────────────────────────────

@app.get("/actions")
def get_actions(limit: int = 50):
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT a.*, p.name AS product_name, p.url AS product_url
               FROM actions a
               LEFT JOIN products p ON p.id = a.product_id
               ORDER BY a.created_at DESC LIMIT ?""",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


# ── Manual scrape trigger ────────────────────────────────────────────────────

@app.post("/scrape/{product_id}")
async def manual_scrape(product_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Product not found.")
        product = dict(row)

    result = await scrape(product["url"])
    # Save snapshot
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO snapshots (product_id, price, in_stock, quantity) VALUES (?, ?, ?, ?)",
            (product_id, result.get("price"), 1 if result.get("in_stock") else 0, result.get("quantity")),
        )
        # Back-fill name
        if result.get("name") and not product.get("name"):
            conn.execute("UPDATE products SET name = ? WHERE id = ?", (result["name"], product_id))

    return result
