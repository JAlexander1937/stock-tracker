import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "stock_tracker.db")


def get_db_path():
    return os.path.abspath(DB_PATH)


@contextmanager
def get_conn():
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS products (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT,
                url         TEXT NOT NULL UNIQUE,
                retailer    TEXT NOT NULL,
                max_price   REAL,
                desired_qty INTEGER DEFAULT 1,
                active      INTEGER DEFAULT 1,
                added_at    TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS snapshots (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                price       REAL,
                in_stock    INTEGER NOT NULL,
                quantity    INTEGER,
                scraped_at  TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS actions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
                action_type TEXT NOT NULL,
                result      TEXT,
                created_at  TEXT DEFAULT (datetime('now'))
            );
        """)
