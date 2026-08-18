/**
 * GameStop product page scraper using Ulixee Hero.
 * Called from Python: node gamestop_product.js "<url>"
 * Outputs JSON to stdout: {name, url, price, in_stock, quantity, retailer}
 */
const Hero = require('@ulixee/hero-playground');

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node gamestop_product.js "<url>"');
    process.exit(1);
  }

  const result = { name: null, url, price: null, in_stock: false, quantity: null, retailer: 'gamestop' };
  const hero = new Hero({ showChrome: false });

  try {
    await hero.goto(url);
    await hero.waitForPaintingStable();
    await hero.waitForMillis(5000);

    try {
      const nameEl = await hero.document.querySelector('[class*="product-name" i]');
      if (nameEl) result.name = (await nameEl.textContent).trim() || null;
    } catch (_) {}

    try {
      const priceEl = await hero.document.querySelector('.selling-price-redesign, [class*="actual-price" i]');
      if (priceEl) {
        const m = (await priceEl.textContent).match(/[\d,]+\.\d{2}/);
        if (m) result.price = parseFloat(m[0].replace(/,/g, ''));
      }
    } catch (_) {}

    // GameStop has two product-page layouts: a simple ship-only Add to Cart
    // button, or a richer pickup-vs-delivery panel with a top-level
    // .global-availability summary. Check both; text is the more durable signal.
    try {
      const addBtn = await hero.document.querySelector('button.add-to-cart:not([disabled])');
      let inStock = !!addBtn;

      const availEl = await hero.document.querySelector('.global-availability, .availability-msg');
      if (availEl) {
        const availText = (await availEl.textContent).trim().toLowerCase();
        if (availText.includes('in stock')) inStock = true;
        if (availText.includes('out of stock') || availText.includes('sold out')) inStock = false;
      }
      result.in_stock = inStock;
    } catch (_) {}

    process.stderr.write(`GameStop: name=${result.name} price=${result.price} in_stock=${result.in_stock}\n`);

  } catch (err) {
    process.stderr.write(`Hero error: ${err.message}\n`);
  } finally {
    await hero.close();
  }

  console.log(JSON.stringify(result));
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  console.log(JSON.stringify({ name: null, url: process.argv[2], price: null, in_stock: false, quantity: null, retailer: 'gamestop' }));
  process.exit(1);
});
