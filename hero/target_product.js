/**
 * Target product page scraper using Ulixee Hero.
 * Called from Python: node target_product.js "<url>"
 * Outputs JSON to stdout: {name, url, price, in_stock, quantity, retailer}
 */
const Hero = require('@ulixee/hero-playground');

const IN_STOCK_STATUSES = new Set([
  'IN_STOCK', 'LIMITED_STOCK', 'AVAILABLE',
  'PICKUP_AVAILABLE', 'SHIPPING_AVAILABLE',
]);

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node target_product.js "<url>"');
    process.exit(1);
  }

  const result = { name: null, url, price: null, in_stock: false, quantity: null, retailer: 'target' };
  const hero = new Hero({ showChrome: false });

  try {
    // Intercept Target's internal API response for product data
    let apiData = null;
    hero.activeTab.on('resource', async resource => {
      try {
        if (
          resource.url.includes('api.target.com') &&
          (resource.url.includes('pdp_client') || resource.url.includes('products/v4'))
        ) {
          const body = await resource.response.json;
          if (body) apiData = body;
        }
      } catch (_) {}
    });

    await hero.goto(url);
    await hero.waitForPaintingStable();
    // Give API calls a moment to complete
    await hero.waitForMillis(2000);

    // ── API data (primary) ──────────────────────────────────────────────────
    if (apiData) {
      try {
        const product = apiData?.data?.product ?? apiData?.product ?? null;
        if (product) {
          result.name = product?.item?.product_description?.title ?? null;

          const priceInfo = product?.price ?? {};
          const rawPrice = priceInfo.current_retail ?? priceInfo.reg_retail ?? null;
          if (typeof rawPrice === 'number') {
            result.price = rawPrice;
          } else if (typeof rawPrice === 'string') {
            const m = rawPrice.match(/[\d.]+/);
            if (m) result.price = parseFloat(m[0]);
          }

          const avail = product?.availability ?? {};
          const status = (avail.availability_status ?? '').toUpperCase();
          result.in_stock = IN_STOCK_STATUSES.has(status);
          if (avail.stores?.length) {
            result.quantity = avail.stores[0].location_available_to_promise_quantity ?? null;
          }

          process.stderr.write(`Target API: status=${status} price=${result.price} in_stock=${result.in_stock}\n`);
          await hero.close();
          console.log(JSON.stringify(result));
          return;
        }
      } catch (e) {
        process.stderr.write(`Target API parse error: ${e.message}\n`);
      }
    }

    // ── DOM fallback ────────────────────────────────────────────────────────
    try {
      const el = await hero.document.querySelector('[data-test="product-title"]');
      if (el) result.name = (await el.textContent).trim() || null;
    } catch (_) {}

    try {
      const el = await hero.document.querySelector('[data-test="product-price"], [data-test="current-price"] span');
      if (el) {
        const text = (await el.textContent).replace(/[^0-9.]/g, '');
        if (text) result.price = parseFloat(text);
      }
    } catch (_) {}

    try {
      const addBtn = await hero.document.querySelector(
        'button[data-test="shipItButton"]:not([disabled]),' +
        'button[data-test="addToCartButton"]:not([disabled]),' +
        'button[data-test="orderPickupButton"]:not([disabled])'
      );
      const oos = await hero.document.querySelector(
        '[data-test="outOfStockMessage"],[data-test="OOS-message"]'
      );
      result.in_stock = !!addBtn && !oos;
    } catch (_) {}

    process.stderr.write(`Target DOM fallback: name=${result.name} price=${result.price} in_stock=${result.in_stock}\n`);

  } catch (err) {
    process.stderr.write(`Hero error: ${err.message}\n`);
  } finally {
    await hero.close();
  }

  console.log(JSON.stringify(result));
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  console.log(JSON.stringify({ name: null, url: process.argv[2], price: null, in_stock: false, quantity: null, retailer: 'target' }));
  process.exit(1);
});
