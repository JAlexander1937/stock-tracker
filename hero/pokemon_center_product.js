/**
 * Pokémon Center product page scraper using Ulixee Hero.
 * Called from Python: node pokemon_center_product.js "<url>"
 * Outputs JSON to stdout: {name, url, price, in_stock, quantity, retailer}
 */
const Hero = require('@ulixee/hero-playground');

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node pokemon_center_product.js "<url>"');
    process.exit(1);
  }

  const result = { name: null, url, price: null, in_stock: false, quantity: null, retailer: 'pokemon_center' };
  const hero = new Hero({ showChrome: false });

  try {
    await hero.goto(url);
    await hero.waitForPaintingStable();
    await hero.waitForMillis(1500);

    // ── Product name ────────────────────────────────────────────────────────
    try {
      for (const sel of [
        'h1.product-name', 'h1[class*="name"]',
        '[class*="ProductTitle"]', '[data-testid="product-name"]', 'h1',
      ]) {
        const el = await hero.document.querySelector(sel);
        if (el) {
          result.name = (await el.textContent).trim() || null;
          if (result.name) break;
        }
      }
    } catch (_) {}

    // ── Price ───────────────────────────────────────────────────────────────
    try {
      for (const sel of [
        '[class*="price"] .money', '.product-price',
        '[class*="ProductPrice"]', '[data-testid="product-price"]',
        '[class*="price"]',
      ]) {
        const el = await hero.document.querySelector(sel);
        if (el) {
          const text = await el.textContent;
          const m = text.replace(/,/g, '').match(/[\d.]+/);
          if (m) {
            result.price = parseFloat(m[0]);
            break;
          }
        }
      }
    } catch (_) {}

    // ── Stock status ────────────────────────────────────────────────────────
    try {
      const addBtn = await hero.document.querySelector(
        'button[data-testid="add-to-cart"]:not([disabled]),' +
        'button[class*="add-to-cart"]:not([disabled]),' +
        'button[class*="AddToCart"]:not([disabled]),' +
        '.add-to-cart-btn:not([disabled])'
      );
      const oos = await hero.document.querySelector(
        '[class*="out-of-stock"],[class*="sold-out"],' +
        '[class*="OutOfStock"],[data-testid="out-of-stock"],' +
        '.product-out-of-stock'
      );
      result.in_stock = !!addBtn && !oos;
      process.stderr.write(`PokemonCenter: addBtn=${!!addBtn} oos=${!!oos} price=${result.price} in_stock=${result.in_stock}\n`);
    } catch (_) {}

  } catch (err) {
    process.stderr.write(`Hero error: ${err.message}\n`);
  } finally {
    await hero.close();
  }

  console.log(JSON.stringify(result));
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  console.log(JSON.stringify({ name: null, url: process.argv[2], price: null, in_stock: false, quantity: null, retailer: 'pokemon_center' }));
  process.exit(1);
});
