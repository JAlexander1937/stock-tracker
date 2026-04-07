/**
 * Walmart keyword search using Ulixee Hero.
 * Called from Python: node walmart_search.js "<keyword>"
 * Outputs JSON to stdout: [{name, url, price, in_stock, retailer}]
 */
const Hero = require('@ulixee/hero-playground');

async function main() {
  const keyword = process.argv[2];
  if (!keyword) {
    console.error('Usage: node walmart_search.js "<keyword>"');
    process.exit(1);
  }

  const hero = new Hero({ showChrome: false });
  const results = [];

  try {
    const searchUrl = `https://www.walmart.com/search?q=${encodeURIComponent(keyword)}`;
    await hero.goto(searchUrl);
    await hero.waitForPaintingStable();

    // Wait up to 10s for product tiles to appear
    try {
      await hero.waitForElement(hero.document.querySelector('[data-item-id], a[href*="/ip/"]'), { timeoutMs: 10000 });
    } catch (_) {}

    // Check for bot challenge
    const title = await hero.document.title;
    const bodyText = await hero.document.body.innerText;

    if (bodyText.includes('PRESS & HOLD') || bodyText.includes('Robot or human')) {
      process.stderr.write('Bot challenge still present\n');
      await hero.close();
      console.log(JSON.stringify([]));
      return;
    }

    // Extract __NEXT_DATA__ for structured product data
    const nextDataEl = await hero.document.querySelector('#__NEXT_DATA__');
    if (nextDataEl) {
      const raw = await nextDataEl.textContent;
      try {
        const data = JSON.parse(raw);
        const stacks = data?.props?.pageProps?.initialData?.searchResult?.itemStacks ?? [];
        for (const stack of stacks) {
          for (const item of (stack.items ?? [])) {
            let url = item.canonicalUrl ?? item.productPageUrl ?? '';
            if (!url) continue;
            if (!url.startsWith('http')) url = 'https://www.walmart.com' + url;
            const priceInfo = item.priceInfo?.currentPrice;
            const price = typeof priceInfo === 'object' ? priceInfo?.price : null;
            const inStock = ['IN_STOCK', 'AVAILABLE'].includes((item.availabilityStatus ?? '').toUpperCase());
            results.push({ name: item.name ?? null, url, price: price ?? null, in_stock: inStock, retailer: 'walmart' });
          }
        }
        if (results.length > 0) {
          await hero.close();
          console.log(JSON.stringify(results));
          return;
        }
      } catch (_) {}
    }

    // Fallback: scrape product link elements from DOM
    const links = await hero.document.querySelectorAll('a[href*="/ip/"]');
    const seen = new Set();
    for (const link of links) {
      const href = await link.href;
      if (!href) continue;
      // Strip query params and dedupe by item ID
      const clean = href.split('?')[0].split('&')[0];
      if (seen.has(clean)) continue;
      seen.add(clean);
      let name = null;
      try { name = (await link.textContent).trim() || null; } catch (_) {}
      results.push({ name, url: clean, price: null, in_stock: true, retailer: 'walmart' });
    }

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
