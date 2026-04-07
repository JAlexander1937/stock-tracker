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
        "retailer": "target",
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

            # Intercept Target's API calls for product data
            product_data = {}

            async def handle_response(response):
                if "api.target.com" in response.url and "pdp_client_v1" in response.url:
                    try:
                        body = await response.json()
                        nonlocal product_data
                        product_data = body
                    except Exception:
                        pass

            page.on("response", handle_response)
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(2000)  # Let API calls complete

            # Try API data first
            if product_data:
                try:
                    product = product_data.get("data", {}).get("product", {})
                    result["name"] = product.get("item", {}).get("product_description", {}).get("title")
                    price_info = product.get("price", {})
                    result["price"] = price_info.get("current_retail") or price_info.get("formatted_current_price_type")
                    if isinstance(result["price"], str):
                        match = re.search(r"[\d.]+", result["price"].replace(",", ""))
                        result["price"] = float(match.group()) if match else None
                    avail = product.get("availability", {})
                    result["in_stock"] = avail.get("availability_status") in ("IN_STOCK", "LIMITED_STOCK")
                    result["quantity"] = avail.get("stores", [{}])[0].get("location_available_to_promise_quantity") if avail.get("stores") else None
                except Exception:
                    pass

            # Fallback: DOM selectors
            if not result["name"]:
                try:
                    name_el = await page.query_selector(
                        "h1[data-test='product-title'], h1.styles__StyledProductTitle"
                    )
                    if name_el:
                        result["name"] = (await name_el.inner_text()).strip()
                except Exception:
                    pass

            if result["price"] is None:
                try:
                    price_el = await page.query_selector(
                        "[data-test='product-price'], .styles__CurrentPrice"
                    )
                    if price_el:
                        price_text = (await price_el.inner_text()).strip()
                        match = re.search(r"[\d.]+", price_text.replace(",", ""))
                        if match:
                            result["price"] = float(match.group())
                except Exception:
                    pass

            if not result["in_stock"]:
                try:
                    add_btn = await page.query_selector(
                        "button[data-test='shipItButton']:not([disabled]),"
                        "button[data-test='addToCartButton']:not([disabled])"
                    )
                    oos = await page.query_selector("[data-test='outOfStockMessage']")
                    result["in_stock"] = add_btn is not None and oos is None
                except Exception:
                    pass

            await browser.close()
    except Exception as e:
        logger.error("Target scrape failed for %s: %s", url, e)

    return result
