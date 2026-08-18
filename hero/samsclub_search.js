/**
 * Sam's Club keyword search using Ulixee Hero.
 * Called from Python: node samsclub_search.js "<keyword>"
 * Outputs JSON to stdout: [{name, url, price, in_stock, retailer}]
 *
 * Reads the server-rendered __NEXT_DATA__ payload rather than scraping the DOM.
 */
const Hero = require('@ulixee/hero-playground');

async function readNextData(hero) {
  const el = await hero.document.querySelector('#__NEXT_DATA__');
  if (!el) return null;
  try {
    return JSON.parse(await el.textContent);
  } catch (_) {
    return null;
  }
}

async function main() {
  const keyword = process.argv[2];
  if (!keyword) {
    console.error('Usage: node samsclub_search.js "<keyword>"');
    process.exit(1);
  }

  const results = [];
  const hero = new Hero({ showChrome: false });

  try {
    const searchUrl = `https://www.samsclub.com/s/${encodeURIComponent(keyword)}`;
    await hero.goto(searchUrl);
    await hero.waitForPaintingStable();
    await hero.waitForMillis(6000);

    let data = await readNextData(hero);
    if (!data) {
      process.stderr.write('SamsClub search: __NEXT_DATA__ not present yet, waiting for bot-check to clear\n');
      await hero.waitForMillis(8000);
      data = await readNextData(hero);
    }

    if (data) {
      const stacks = data?.props?.pageProps?.initialData?.searchResult?.itemStacks ?? [];
      for (const stack of stacks) {
        for (const item of (stack.items ?? [])) {
          if (!item || !item.canonicalUrl) continue;
          const url = item.canonicalUrl.startsWith('http')
            ? item.canonicalUrl
            : `https://www.samsclub.com${item.canonicalUrl}`;
          const priceStr = item.priceInfo?.linePrice ?? '';
          const priceMatch = priceStr.replace(/,/g, '').match(/[\d.]+/);
          const price = priceMatch ? parseFloat(priceMatch[0]) : null;
          results.push({
            name: item.name ?? null,
            url,
            price,
            in_stock: item.availabilityStatusV2?.value === 'IN_STOCK',
            retailer: 'samsclub',
          });
        }
      }
      process.stderr.write(`SamsClub search: found ${results.length} items\n`);
    } else {
      process.stderr.write('SamsClub search: bot-check never cleared\n');
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
