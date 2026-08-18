/**
 * Best Buy product page scraper using Ulixee Hero.
 * Called from Python: node bestbuy_product.js "<url>"
 * Outputs JSON to stdout: {name, url, price, in_stock, quantity, retailer}
 */
const Hero = require('@ulixee/hero-playground');

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node bestbuy_product.js "<url>"');
    process.exit(1);
  }

  const result = { name: null, url, price: null, in_stock: false, quantity: null, retailer: 'bestbuy' };
  const hero = new Hero({ showChrome: false });

  try {
    await hero.goto(url);
    await hero.waitForPaintingStable();
    await hero.waitForMillis(4000);

    try {
      const h1 = await hero.document.querySelector('h1');
      if (h1) result.name = (await h1.textContent).trim() || null;
    } catch (_) {}

    try {
      const priceEl = await hero.document.querySelector('[data-testid="price-block-customer-price"]');
      if (priceEl) {
        const text = await priceEl.textContent;
        const m = text.match(/[\d,]+\.\d{2}/);
        if (m) result.price = parseFloat(m[0].replace(/,/g, ''));
      }
    } catch (_) {}

    // Best Buy's add-to-cart/sold-out buttons carry the SKU in their test-id
    // (pdp-add-to-cart-{sku} / pdp-sold-out-{sku}), so match by prefix.
    try {
      const addBtn = await hero.document.querySelector('button[data-testid^="pdp-add-to-cart-"]');
      const soldOutBtn = await hero.document.querySelector('button[data-testid^="pdp-sold-out-"]');
      result.in_stock = !!addBtn && !soldOutBtn;
    } catch (_) {}

    process.stderr.write(`BestBuy: name=${result.name} price=${result.price} in_stock=${result.in_stock}\n`);

  } catch (err) {
    process.stderr.write(`Hero error: ${err.message}\n`);
  } finally {
    await hero.close();
  }

  console.log(JSON.stringify(result));
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  console.log(JSON.stringify({ name: null, url: process.argv[2], price: null, in_stock: false, quantity: null, retailer: 'bestbuy' }));
  process.exit(1);
});
