/**
 * Best Buy keyword search using Ulixee Hero.
 * Called from Python: node bestbuy_search.js "<keyword>"
 * Outputs JSON to stdout: [{name, url, price, in_stock, retailer}]
 */
const Hero = require('@ulixee/hero-playground');

async function main() {
  const keyword = process.argv[2];
  if (!keyword) {
    console.error('Usage: node bestbuy_search.js "<keyword>"');
    process.exit(1);
  }

  const results = [];
  const hero = new Hero({ showChrome: false });

  try {
    const searchUrl = `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(keyword)}`;
    await hero.goto(searchUrl);
    await hero.waitForPaintingStable();
    await hero.waitForMillis(4000);

    const cards = await hero.document.querySelectorAll('.product-list-item');
    for (const card of cards) {
      try {
        const link = await card.querySelector('a[href*="/product/"]');
        const href = link ? await link.getAttribute('href') : null;
        if (!href) continue;
        const url = href.startsWith('http') ? href : `https://www.bestbuy.com${href}`;

        const nameEl = await card.querySelector('h2, h3, [class*="title" i]');
        const name = nameEl ? (await nameEl.textContent).trim() || null : null;

        const priceEl = await card.querySelector('[data-testid*="price" i], [class*="price" i]');
        let price = null;
        if (priceEl) {
          const m = (await priceEl.textContent).match(/[\d,]+\.\d{2}/);
          if (m) price = parseFloat(m[0].replace(/,/g, ''));
        }

        const cardText = (await card.textContent).toLowerCase();
        const soldOut = cardText.includes('sold out');

        results.push({ name, url, price, in_stock: !soldOut, retailer: 'bestbuy' });
      } catch (_) {}
    }
    process.stderr.write(`BestBuy search: found ${results.length} items\n`);

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
