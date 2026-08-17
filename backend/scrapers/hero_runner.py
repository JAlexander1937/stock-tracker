"""
Generic Ulixee Hero script runner.

Convention:
  hero/{retailer}_product.js  — scrapes one product page, returns a JSON object
  hero/{retailer}_search.js   — searches by keyword, returns a JSON array

To add a new retailer:
  1. Add its domain to detect_retailer() in __init__.py
  2. Create hero/{retailer}_product.js  (outputs a single JSON object)
  3. Create hero/{retailer}_search.js   (outputs a JSON array)
  No Python files needed.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re

logger = logging.getLogger(__name__)

_HERO_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "hero")
)


async def run_hero(script: str, arg: str, timeout: int = 90) -> dict | list:
    """
    Run hero/<script>.js with a single argument.
    Returns parsed JSON (dict for product scripts, list for search scripts).
    Falls back to {} or [] on failure.
    """
    script_path = os.path.join(_HERO_DIR, f"{script}.js")
    if not os.path.exists(script_path):
        logger.error("Hero script not found: %s", script_path)
        return [] if script.endswith("_search") else {}

    try:
        proc = await asyncio.create_subprocess_exec(
            "node", script_path, arg,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)

        if stderr:
            logger.info("Hero [%s] stderr: %s", script, stderr.decode(errors="replace").strip())

        raw = stdout.decode(errors="replace").strip()

        # Hero may emit status lines before the JSON — find the first [ or {
        match = re.search(r'(\[.*\]|\{.*\})', raw, re.DOTALL)
        if not match:
            logger.error("Hero [%s] no JSON in output: %s", script, raw[:300])
            return [] if script.endswith("_search") else {}

        return json.loads(match.group(1))

    except asyncio.TimeoutError:
        logger.error("Hero [%s] timed out for: %s", script, arg)
    except Exception as e:
        logger.error("Hero [%s] error for %s: %s", script, arg, e)

    return [] if script.endswith("_search") else {}
