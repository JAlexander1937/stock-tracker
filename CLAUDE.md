# Stock Tracker — Claude Code Context

Personal stock monitoring tool. Python + FastAPI backend, SQLite database,
Ulixee Hero scrapers (bypasses bot detection), Claude AI agent for alerting decisions, plain HTML/JS frontend.

## Run the app

```bash
source .venv/bin/activate
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Open http://localhost:8000

## Key files

| File | Purpose |
|---|---|
| `backend/main.py` | FastAPI app, all REST endpoints, lifespan (starts scheduler) |
| `backend/database.py` | SQLite init + `get_conn()` context manager |
| `backend/scrapers/__init__.py` | `detect_retailer()` + unified `scrape(url)` dispatcher |
| `backend/scrapers/hero_runner.py` | Generic Hero script runner — all scraping goes through this |
| `backend/scrapers/search.py` | Keyword search dispatcher — calls `hero/{retailer}_search.js` |
| `hero/walmart_product.js` | Walmart product page scraper (Hero) |
| `hero/walmart_search.js` | Walmart keyword search (Hero) |
| `hero/target_product.js` | Target product page scraper (Hero) |
| `hero/target_search.js` | Target keyword search (Hero) |
| `hero/pokemon_center_product.js` | Pokémon Center product page scraper (Hero) |
| `hero/pokemon_center_search.js` | Pokémon Center keyword search (Hero) |
| `backend/agent.py` | Calls `claude-sonnet-4-6`, returns ALERT / OPEN_URL / LOG |
| `backend/alerts.py` | Pushover, Twilio SMS, Plyer desktop — all fail gracefully |
| `backend/scheduler.py` | `poll_once()` + `run_scheduler()` async loop |
| `frontend/index.html` | Single-page UI |
| `frontend/app.js` | Fetch-based API calls, 30s auto-refresh |
| `.env` | API keys (never commit) |
| `.env.example` | Key names template |
| `stock_tracker.db` | SQLite database (auto-created on first run) |

## Database schema

- `products` — watched items (url, retailer, max_price, desired_qty, active)
- `snapshots` — every scrape result with timestamp
- `actions` — every agent decision (ALERT / OPEN_URL / LOG) with reason

## API endpoints

```
GET    /products          list all products + last snapshot
POST   /products          add product by URL
PUT    /products/{id}     update name/price/active
DELETE /products/{id}     remove product
GET    /snapshots/{id}    stock history for a product
GET    /actions           recent agent action log
POST   /scrape/{id}       manually trigger one scrape
```

## Agent behavior

The AI agent is called only when something actionable happens:
- Item goes from out-of-stock → in-stock
- Item price drops to/below user's max_price while in stock

It returns one of: `ALERT` (notify), `OPEN_URL` (notify + open browser), `LOG` (no-op).
Without `ANTHROPIC_API_KEY` it defaults to LOG.

## Adding a new retailer

All scraping uses Ulixee Hero via a generic runner. No Python scraper files needed.

1. Add domain detection in `backend/scrapers/__init__.py` → `detect_retailer()`
2. Create `hero/{retailer}_product.js` — must output a single JSON object: `{name, url, price, in_stock, quantity, retailer}`
3. Create `hero/{retailer}_search.js` — must output a JSON array: `[{name, url, price, in_stock, retailer}]`
4. Add the retailer name to `VALID_RETAILERS` in `backend/main.py`

That's it — the scheduler, agent, and search all work automatically.

## Known limitations

- **Target keyword search is disabled.** Target blocks the search-results endpoint
  (`cdui-orchestrations.target.com/.../slp`) with 421s even after its CAPTCHA/RttCheck
  bot-check passes elsewhere on the same page — unlike product pages, there's no SSR
  fallback with real data to fall back to. `search_retailer()` raises a clear error for
  `target`; track Target products by URL instead. Target *product-page* scraping works
  fine, but needs a long wait (`hero/target_product.js` waits 9s) for that same bot-check
  to self-heal before the DOM has real price/availability data.

- **Pokémon Center is fully disabled** — both product-page tracking and search.
  Every request (homepage, search, even a fresh session's first load) is served a
  DataDome CAPTCHA, and unlike Target it never self-heals — it needs an actual solved
  challenge on every request. No free/reliable bypass exists (checked: Octoparse free
  plan explicitly can't get past DataDome; no working open-source solver on GitHub —
  the one dedicated Pokémon Center scraper found, `LillyR013/PokeCenterScraper`, is
  dead for the same reason). Solving it for real means an ongoing paid CAPTCHA API
  (~$1.45–2.50 per 1,000 solves) — at a 60s poll interval that's real recurring cost,
  not a one-time fix, so it's not wired up. `detect_retailer()` raises for any
  pokemoncenter.com URL and `search_retailer()` raises for `pokemon_center`.
  `hero/pokemon_center_product.js` and `hero/pokemon_center_search.js` are dead code,
  left in place in case a real bypass becomes worth pursuing later.
