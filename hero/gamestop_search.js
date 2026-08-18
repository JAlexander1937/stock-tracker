/**
 * GameStop keyword search using Ulixee Hero.
 * Called from Python: node gamestop_search.js "<keyword>"
 * Outputs JSON to stdout: [{name, url, price, in_stock, retailer}]
 */
const Hero = require('@ulixee/hero-playground');

async function main() {
  const keyword = process.argv[2];
  if (!keyword) {
    console.error('Usage: node gamestop_search.js "<keyword>"');
    process.exit(1);
  }

  const results = [];
  const hero = new Hero({ showChrome: false });

  try {
    const searchUrl = `https://www.gamestop.com/search/?q=${encodeURIComponent(keyword)}`;
    await hero.goto(searchUrl);
    await hero.waitForPaintingStable();
    await hero.waitForMillis(5000);

    const tiles = await hero.document.querySelectorAll('.product-tile');
    for (const tile of tiles) {
      try {
        const link = await tile.querySelector('a.product-tile-link');
        if (!link) continue;
        const href = await link.getAttribute('href');
        if (!href) continue;
        const url = href.startsWith('http') ? href : `https://www.gamestop.com${href}`;
        const name = (await link.getAttribute('aria-label')) || null;

        const priceEl = await tile.querySelector('[class*="sale-price" i], [class*="selling-price" i], [class*="actual-price" i]');
        let price = null;
        if (priceEl) {
          const m = (await priceEl.textContent).match(/[\d,]+\.\d{2}/);
          if (m) price = parseFloat(m[0].replace(/,/g, ''));
        }

        const tileText = (await tile.textContent).toLowerCase();
        const soldOut = tileText.includes('sold out') || tileText.includes('out of stock');

        results.push({ name, url, price, in_stock: !soldOut, retailer: 'gamestop' });
      } catch (_) {}
    }
    process.stderr.write(`GameStop search: found ${results.length} items\n`);

  } catch (err) {
    process.stderr.write(`Hero error: ${err.message}\n`);
  } finally {
    await hero.close();
  }

  console.log(JSON.stringify(results));
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  console.log(JSON.stringify([]));
  process.exit(1);
});
