import re
import json
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
        "retailer": "walmart",
    }
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                extra_http_headers={
                    "Accept-Language": "en-US,en;q=0.9",
                },
            )
            page = await context.new_page()
            await Stealth().apply_stealth_async(page)
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)

            # Walmart embeds product data in a __NEXT_DATA__ script tag
            try:
                next_data = await page.evaluate(
                    "() => { const el = document.getElementById('__NEXT_DATA__'); "
                    "return el ? el.textContent : null; }"
                )
                if next_data:
                    data = json.loads(next_data)
                    # Navigate to product data — path varies by page version
                    props = data.get("props", {}).get("pageProps", {})
                    initial_data = props.get("initialData", {})
                    product = (
                        initial_data.get("data", {})
                        .get("product", {})
                    )
                    if product:
                        result["name"] = product.get("name")
                        price_info = product.get("priceInfo", {})
                        current_price = price_info.get("currentPrice", {})
                        if isinstance(current_price, dict):
                            result["price"] = current_price.get("price")
                        elif isinstance(current_price, (int, float)):
                            result["price"] = float(current_price)
                        availability = product.get("availabilityStatus", "")
                        result["in_stock"] = availability.upper() in ("IN_STOCK", "AVAILABLE")
            except Exception:
                pass

            # Fallback: DOM selectors
            if not result["name"]:
                try:
                    name_el = await page.query_selector(
                        "h1[itemprop='name'], h1.prod-ProductTitle"
                    )
                    if name_el:
                        result["name"] = (await name_el.inner_text()).strip()
                except Exception:
                    pass

            if result["price"] is None:
                try:
                    price_el = await page.query_selector(
                        "[itemprop='price'], .price-characteristic"
                    )
                    if price_el:
                        price_text = await price_el.get_attribute("content") or await price_el.inner_text()
                        match = re.search(r"[\d.]+", price_text.replace(",", ""))
                        if match:
                            result["price"] = float(match.group())
                except Exception:
                    pass

            if not result["in_stock"]:
                try:
                    add_btn = await page.query_selector(
                        "button[data-tl-id='ProductPrimaryCTA-cta_add_to_cart_button'],"
                        "button[class*='add-to-cart']:not([disabled])"
                    )
                    result["in_stock"] = add_btn is not None
                except Exception:
                    pass

            await browser.close()
    except Exception as e:
        logger.error("Walmart scrape failed for %s: %s", url, e)

    return result
