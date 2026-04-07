from .pokemon_center import scrape as scrape_pokemon_center
from .walmart import scrape as scrape_walmart
from .target import scrape as scrape_target


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
    if retailer == "pokemon_center":
        return await scrape_pokemon_center(url)
    if retailer == "walmart":
        return await scrape_walmart(url)
    if retailer == "target":
        return await scrape_target(url)
