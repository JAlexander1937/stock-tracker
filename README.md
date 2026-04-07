# Stock Tracker

A personal tool that watches products on **Walmart**, **Target**, and **Pokémon Center** for you. When something comes back in stock or drops to your target price, it sends you a push notification, an SMS, and a desktop alert — and an AI agent (powered by Claude) decides whether to open the product page in your browser automatically.

> No coding knowledge required to run this. Just follow the steps below.

---

## What it does

- **Keyword auto-discovery** — type a search term and pick a retailer. The app searches that site every 5 minutes and automatically adds any new listings it finds to your watchlist. No copying URLs.
- **Manual URL tracking** — paste a specific product URL if you already know exactly what you want
- Set a max price per product or search — only get alerted when the price is right
- The app checks every tracked product every 60 seconds in the background
- The moment something comes back in stock or hits your price — you get notified

![Dashboard screenshot placeholder](https://placehold.co/800x400?text=Stock+Tracker+Dashboard)

---

## Before you start — what you'll need

You only need to install two things on your computer:

1. **Python** (version 3.9 or newer) — [Download here](https://www.python.org/downloads/)
   - On the installer, check the box that says **"Add Python to PATH"**
2. **Git** — [Download here](https://git-scm.com/downloads)
   - Just click through the installer with all the default options

To check if you already have them, open **Terminal** (Mac) or **Command Prompt** (Windows) and type:
```
python3 --version
git --version
```
If you see version numbers, you're good.

---

## Step 1 — Download the project

Open your Terminal (Mac) or Command Prompt (Windows) and run:

```bash
git clone https://github.com/jasonsterlingalexander/stock-tracker.git
cd stock-tracker
```

---

## Step 2 — Set up the environment

This creates an isolated Python environment just for this app (so it doesn't interfere with anything else on your computer):

**Mac / Linux:**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
```

**Windows:**
```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
```

> The `playwright install chromium` step downloads a headless browser the app uses to load product pages. It's about 150 MB and only needs to be done once.

---

## Step 3 — Add your API keys

Copy the example config file:

**Mac / Linux:**
```bash
cp .env.example .env
```

**Windows:**
```bash
copy .env.example .env
```

Now open the `.env` file in any text editor (Notepad works fine) and fill in your keys. Here's where to get each one:

---

### Anthropic API Key (required — powers the AI agent)

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in
3. Click **API Keys** in the left sidebar → **Create Key**
4. Copy the key and paste it after `ANTHROPIC_API_KEY=`

> Without this key the app still works — it just won't use the AI agent and will default to logging only.

---

### Pushover — push notifications to your phone (optional but recommended)

Pushover sends alerts directly to your phone like a text message, but through their app.

1. Download the **Pushover** app on your phone (iOS or Android) — it's $5 one-time
2. Create an account at [pushover.net](https://pushover.net)
3. Your **User Key** is shown on the main dashboard after logging in
4. Create an application at [pushover.net/apps/build](https://pushover.net/apps/build) — name it "Stock Tracker"
5. Copy the **API Token** it gives you

Paste both into `.env`:
```
PUSHOVER_USER_KEY=your_user_key_here
PUSHOVER_API_TOKEN=your_api_token_here
```

---

### Twilio — SMS alerts (optional)

1. Sign up at [twilio.com](https://www.twilio.com) (free trial includes some credits)
2. From the Twilio Console dashboard, copy your **Account SID** and **Auth Token**
3. Get a free Twilio phone number under **Phone Numbers → Manage → Buy a Number**

Paste into `.env`:
```
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM=+15551234567   ← your Twilio number
TWILIO_TO=+15559876543     ← your personal phone number
```

---

### What a filled-in `.env` looks like

```
ANTHROPIC_API_KEY=sk-ant-api03-...
PUSHOVER_USER_KEY=abc123xyz...
PUSHOVER_API_TOKEN=def456uvw...
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxx
TWILIO_FROM=+15551234567
TWILIO_TO=+15559876543
```

> None of the notification services are required. Any with missing credentials are silently skipped. The app will still track stock and show status in the web dashboard even with no keys set.

---

## Step 4 — Run the app

Make sure your virtual environment is active (you'll see `(.venv)` at the start of your terminal line). If it's not:

**Mac / Linux:** `source .venv/bin/activate`
**Windows:** `.venv\Scripts\activate`

Then start the app:
```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Open your browser and go to: **http://localhost:8000**

You should see the Stock Tracker dashboard. The app is now running and polling every 60 seconds automatically.

> To stop the app, press `Ctrl + C` in the terminal.

---

## How to use it

### Option 1 — Keyword Auto-Discovery (recommended)

This is the easiest way. Instead of tracking one product at a time, you give the app a search term and it finds everything for you.

1. Go to the **Auto-Discovery** section at the top of the dashboard
2. Type a keyword — be as specific as you want (e.g. `Charizard ex booster bundle`, `Pokemon 151 booster box`)
3. Pick a retailer from the dropdown
4. Set a **Max Price** if you only want to be notified when the price is right
5. Click **Add Search**

The app will search that retailer every **5 minutes** and automatically add any new listings it finds to your watchlist. When a newly discovered product is already in stock, the AI agent fires immediately.

- Click **Run Now** next to any search to trigger it instantly instead of waiting
- Toggle a search off to pause it without deleting it
- The more specific your keyword, the better — `"Pokemon 151"` beats `"Pokemon"`

### Option 2 — Add a specific product URL

If you already know exactly which product page you want to track:

1. Copy the URL from your browser's address bar on Walmart, Target, or Pokémon Center
2. Paste it into the **Add Product by URL** form
3. Set a **Max Price** if you want price-drop alerts (leave blank to alert on any restock)
4. Click **Add to Watchlist**

### The watchlist table
| Column | What it means |
|---|---|
| Product | Name + link to the product page |
| Retailer | Where it's sold |
| Price | Current price from the last scrape |
| Max Price | Your target price (blank = any price) |
| Stock | Green = in stock, Red = out of stock |
| Last Checked | When the scraper last ran |
| Active | Toggle on/off — pauses checking without deleting |

### Manual scrape
Click the **Scrape** button next to any product to check it immediately without waiting for the 60-second cycle.

### Agent Actions log
The bottom of the page shows every decision the AI agent made — what triggered it, what action it took, and why.

---

## Every time you want to run the app

You don't need to redo the setup. Just:

```bash
cd stock-tracker
source .venv/bin/activate     # Mac/Linux
# OR
.venv\Scripts\activate        # Windows

python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Then open **http://localhost:8000**.

---

## Troubleshooting

**"command not found: python3"**
Python isn't installed or wasn't added to PATH. Re-run the Python installer and check "Add Python to PATH".

**The scraper returns dashes (—) for price and stock**
The retailer's bot detection blocked the headless browser. This is rare with playwright-stealth applied — if it happens, open an issue and I'll add a fix for that specific retailer.

**"ModuleNotFoundError" when starting the app**
Your virtual environment isn't active. Run `source .venv/bin/activate` (Mac/Linux) or `.venv\Scripts\activate` (Windows) first.

**Notifications aren't coming through**
Check that your keys in `.env` have no spaces around the `=` sign. Each line should look exactly like: `KEY=value` with nothing else on the line.

---

## Project layout (for the curious)

```
stock-tracker/
├── backend/
│   ├── main.py              The web server and all API endpoints
│   ├── database.py          Database setup (creates itself automatically)
│   ├── agent.py             AI agent powered by Claude
│   ├── alerts.py            Sends notifications (Pushover, SMS, desktop)
│   ├── scheduler.py         Polls products every 60s, runs searches every 5 min
│   └── scrapers/
│       ├── walmart.py       Walmart product page scraper
│       ├── target.py        Target product page scraper
│       ├── pokemon_center.py  Pokémon Center product page scraper
│       └── search.py        Keyword search scrapers for all three retailers
├── frontend/
│   ├── index.html           The web dashboard
│   ├── style.css            Styling
│   └── app.js               Dashboard logic
├── .env                     Your private API keys (never shared)
├── .env.example             Template showing what keys are needed
└── requirements.txt         Python packages the app needs
```

---

## Tech stack

| Component | Technology |
|---|---|
| Backend | Python + FastAPI |
| Database | SQLite (no setup — it's just a file) |
| Scraping | Playwright (headless Chromium) + playwright-stealth |
| AI Agent | Claude claude-sonnet-4-6 via Anthropic API |
| Push notifications | Pushover |
| SMS | Twilio |
| Desktop notifications | Plyer |
| Frontend | Plain HTML + CSS + JavaScript |
