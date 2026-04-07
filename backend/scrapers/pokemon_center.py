import re
import logging
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

logger = logging.getLogger(__name__)


async def scrape(url: str) -> dict:
    result = {
        "name": None,
        "price": None,
        "in_stock": False,
        "quantity": None,
        "url": url,
        "retailer": "pokemon_center",
    }
    try:
        async with async_playwright() as p:
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
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)

            # Product name
            try:
                name_el = await page.query_selector("h1.product-name, h1[class*='name']")
                if name_el:
                    result["name"] = (await name_el.inner_text()).strip()
            except Exception:
                pass

            # Price
            try:
                price_el = await page.query_selector("[class*='price'] .money, .product-price")
                if price_el:
                    price_text = (await price_el.inner_text()).strip()
                    match = re.search(r"[\d,]+\.?\d*", price_text.replace(",", ""))
                    if match:
                        result["price"] = float(match.group())
            except Exception:
                pass

            # Stock status — look for add-to-cart button or out-of-stock indicator
            try:
                add_btn = await page.query_selector(
                    "button[data-testid='add-to-cart'], "
                    "button[class*='add-to-cart']:not([disabled]), "
                    ".add-to-cart-btn:not([disabled])"
                )
                oos_el = await page.query_selector(
                    "[class*='out-of-stock'], [class*='sold-out'], "
                    ".product-out-of-stock"
                )
                result["in_stock"] = add_btn is not None and oos_el is None
            except Exception:
                pass

            await browser.close()
    except Exception as e:
        logger.error("Pokemon Center scrape failed for %s: %s", url, e)

    return result
