from .hero_runner import run_hero


def detect_retailer(url: str) -> str:
    url_lower = url.lower()
    if "pokemoncenter.com" in url_lower:
        return "pokemon_center"
    if "walmart.com" in url_lower:
        return "walmart"
    if "target.com" in url_lower:
        return "target"
    raise ValueError(f"Unsupported retailer URL: {url}")


async def scrape(url: str) -> dict:
    retailer = detect_retailer(url)
    result = await run_hero(f"{retailer}_product", url)
    # Ensure required keys are always present
    defaults = {"name": None, "price": None, "in_stock": False, "quantity": None, "url": url, "retailer": retailer}
    return {**defaults, **result}
