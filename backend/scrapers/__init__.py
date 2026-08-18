from .hero_runner import run_hero


def detect_retailer(url: str) -> str:
    url_lower = url.lower()
    if "pokemoncenter.com" in url_lower:
        raise ValueError(
            "Pokémon Center is not supported — it puts every request behind a DataDome "
            "CAPTCHA (confirmed on the homepage, search, and a fresh session's first "
            "request), which requires solving an interactive challenge on every scrape. "
            "There's no free or reliable bypass for this."
        )
    if "walmart.com" in url_lower:
        return "walmart"
    if "target.com" in url_lower:
        return "target"
    if "bestbuy.com" in url_lower:
        return "bestbuy"
    if "gamestop.com" in url_lower:
        return "gamestop"
    if "samsclub.com" in url_lower:
        return "samsclub"
    raise ValueError(f"Unsupported retailer URL: {url}")


async def scrape(url: str) -> dict:
    retailer = detect_retailer(url)
    result = await run_hero(f"{retailer}_product", url)
    # Ensure required keys are always present
    defaults = {"name": None, "price": None, "in_stock": False, "quantity": None, "url": url, "retailer": retailer}
    return {**defaults, **result}
