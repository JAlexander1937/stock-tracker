/**
 * Target keyword search using Ulixee Hero.
 * Called from Python: node target_search.js "<keyword>"
 * Outputs JSON to stdout: [{name, url, price, in_stock, retailer}]
 */
const Hero = require('@ulixee/hero-playground');

const IN_STOCK_STATUSES = new Set(['IN_STOCK', 'LIMITED_STOCK', 'AVAILABLE', 'PICKUP_AVAILABLE', 'SHIPPING_AVAILABLE']);

async function main() {
  const keyword = process.argv[2];
  if (!keyword) {
    console.error('Usage: node target_search.js "<keyword>"');
    process.exit(1);
  }

  const results = [];
  const hero = new Hero({ showChrome: false });

  try {
    let apiData = null;
    hero.activeTab.on('resource', async resource => {
      try {
        if (resource.url.includes('api.target.com') && resource.url.includes('search_term')) {
          const body = await resource.response.json;
          if (body) apiData = body;
        }
      } catch (_) {}
    });

    const searchUrl = `https://www.target.com/s?searchTerm=${encodeURIComponent(keyword)}`;
    await hero.goto(searchUrl);
    await hero.waitForPaintingStable();
    await hero.waitForMillis(3000);

    // ── API data (primary) ──────────────────────────────────────────────────
    if (apiData) {
      try {
        const items = apiData?.data?.search?.products?.Item ?? [];
        for (const item of items) {
          try {
            const tcin = item.tcin;
            let url = item?.item?.enrichment?.buy_url ?? '';
            if (!url && tcin) url = `https://www.target.com/p/-/A-${tcin}`;
            if (!url) continue;
            if (!url.startsWith('http')) url = 'https://www.target.com' + url;

            const price = item?.price?.current_retail ?? item?.price?.reg_retail ?? null;
            const status = (item?.availability?.availability_status ?? '').toUpperCase();
            const name = item?.item?.product_description?.title ?? null;

            results.push({ name, url, price: typeof price === 'number' ? price : null, in_stock: IN_STOCK_STATUSES.has(status), retailer: 'target' });
          } catch (_) {}
        }
        if (results.length > 0) {
          process.stderr.write(`Target search API: found ${results.length} items\n`);
          await hero.close();
          console.log(JSON.stringify(results));
          return;
        }
      } catch (e) {
        process.stderr.write(`Target search API parse error: ${e.message}\n`);
      }
    }

    // ── DOM fallback ────────────────────────────────────────────────────────
    const cards = await hero.document.querySelectorAll('[data-test="product-details"]');
    for (const card of cards) {
      try {
        const linkEl = await card.querySelector('a[href]');
        const nameEl = await card.querySelector('[data-test="product-title"]');
        const priceEl = await card.querySelector('[data-test="current-price"]');
        const href = linkEl ? await linkEl.getAttribute('href') : null;
        if (!href) continue;
        const url = href.startsWith('http') ? href : `https://www.target.com${href}`;
        const name = nameEl ? (await nameEl.textContent).trim() : null;
        let price = null;
        if (priceEl) {
          const m = (await priceEl.textContent).replace(/[^0-9.]/g, '');
          if (m) price = parseFloat(m);
        }
        results.push({ name, url, price, in_stock: true, retailer: 'target' });
      } catch (_) {}
    }
    process.stderr.write(`Target search DOM fallback: found ${results.length} items\n`);

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
