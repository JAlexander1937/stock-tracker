/**
 * Walmart product page scraper using Ulixee Hero.
 * Called from Python: node walmart_product.js "<url>"
 * Outputs JSON to stdout: {name, url, price, in_stock, quantity, retailer}
 */
const Hero = require('@ulixee/hero-playground');

const IN_STOCK_STATUSES = new Set([
  'IN_STOCK', 'AVAILABLE', 'LIMITED_STOCK',
  'PICKUP_ONLY', 'AVAILABLE_FOR_PICKUP',
  'IN_STOCK_ONLY', 'SHIP_ONLY',
]);

function deepFind(obj, key, depth = 0) {
  if (depth > 12 || obj === null || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) {
    const found = deepFind(v, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function extractPrice(obj) {
  if (typeof obj === 'number' && obj > 0) return obj;
  if (obj && typeof obj === 'object') {
    for (const k of ['price', 'priceValue', 'currentPrice', 'value', 'amount']) {
      const v = obj[k];
      if (typeof v === 'number' && v > 0) return v;
      if (v && typeof v === 'object') {
        const p = extractPrice(v);
        if (p) return p;
      }
    }
  }
  return null;
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node walmart_product.js "<url>"');
    process.exit(1);
  }

  const result = { name: null, url, price: null, in_stock: false, quantity: null, retailer: 'walmart' };
  const hero = new Hero({ showChrome: false });

  try {
    await hero.goto(url);
    await hero.waitForPaintingStable();

    // Check for bot challenge
    const bodyText = await hero.document.body.innerText;
    if (bodyText.includes('Robot or human') || bodyText.includes('PRESS & HOLD')) {
      process.stderr.write('Bot challenge detected on product page\n');
      await hero.close();
      console.log(JSON.stringify(result));
      return;
    }

    // ── __NEXT_DATA__ (primary) ─────────────────────────────────────────────
    const nextDataEl = await hero.document.querySelector('#__NEXT_DATA__');
    if (nextDataEl) {
      try {
        const raw = await nextDataEl.textContent;
        const data = JSON.parse(raw);

        // Canonical path
        let product = data?.props?.pageProps?.initialData?.data?.product;

        // Deep-search fallback
        if (!product) product = deepFind(data, 'product');

        if (product && typeof product === 'object') {
          result.name = product.name ?? deepFind(product, 'name') ?? null;

          const priceInfo = product.priceInfo ?? {};
          result.price = (
            extractPrice(priceInfo.currentPrice) ??
            extractPrice(priceInfo.wasPrice) ??
            extractPrice(priceInfo) ??
            extractPrice(deepFind(product, 'priceInfo'))
          );

          const availability = (
            product.availabilityStatus ??
            deepFind(product, 'availabilityStatus') ??
            ''
          ).toUpperCase();
          result.in_stock = IN_STOCK_STATUSES.has(availability);

          process.stderr.write(`__NEXT_DATA__: availability=${availability} price=${result.price} in_stock=${result.in_stock}\n`);

          await hero.close();
          console.log(JSON.stringify(result));
          return;
        }
      } catch (e) {
        process.stderr.write(`__NEXT_DATA__ parse error: ${e.message}\n`);
      }
    }

    // ── DOM fallback ────────────────────────────────────────────────────────
    try {
      const h1 = await hero.document.querySelector('h1');
      if (h1) result.name = (await h1.textContent).trim() || null;
    } catch (_) {}

    try {
      const priceEl = await hero.document.querySelector('[itemprop="price"][content]');
      if (priceEl) {
        const content = await priceEl.getAttribute('content');
        const m = content && content.match(/[\d.]+/);
        if (m) result.price = parseFloat(m[0]);
      }
    } catch (_) {}

    if (result.price === null) {
      try {
        const priceEl = await hero.document.querySelector(
          '[data-testid="price-wrap"] span, [class*="PriceDisplay"] span'
        );
        if (priceEl) {
          const text = (await priceEl.textContent).replace(/[^0-9.]/g, '');
          if (text) result.price = parseFloat(text);
        }
      } catch (_) {}
    }

    try {
      const addBtn = await hero.document.querySelector(
        'button[data-testid="add-to-cart-btn"]:not([disabled]),' +
        '[data-testid="fulfillment-add-to-cart-btn"]:not([disabled])'
      );
      const oosEl = await hero.document.querySelector('[data-testid="out-of-stock-message"]');
      result.in_stock = !!addBtn && !oosEl;
    } catch (_) {}

    process.stderr.write(`DOM fallback: name=${result.name} price=${result.price} in_stock=${result.in_stock}\n`);

  } catch (err) {
    process.stderr.write(`Hero error: ${err.message}\n`);
  } finally {
    await hero.close();
  }

  console.log(JSON.stringify(result));
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  console.log(JSON.stringify({ name: null, url: process.argv[2], price: null, in_stock: false, quantity: null, retailer: 'walmart' }));
  process.exit(1);
});
