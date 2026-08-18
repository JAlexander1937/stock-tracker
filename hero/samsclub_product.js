/**
 * Sam's Club product page scraper using Ulixee Hero.
 * Called from Python: node samsclub_product.js "<url>"
 * Outputs JSON to stdout: {name, url, price, in_stock, quantity, retailer}
 *
 * Reads the server-rendered __NEXT_DATA__ payload (same GraphQL schema as the
 * search page — Sam's Club shares Walmart's stack) rather than scraping the DOM.
 * Sam's Club occasionally shows a PerimeterX "prove you're not a robot"
 * interstitial that self-resolves given enough time (like Target's bot-check),
 * so this retries once with a longer wait if __NEXT_DATA__ isn't there yet.
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
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node samsclub_product.js "<url>"');
    process.exit(1);
  }

  const result = { name: null, url, price: null, in_stock: false, quantity: null, retailer: 'samsclub' };
  const hero = new Hero({ showChrome: false });

  try {
    await hero.goto(url);
    await hero.waitForPaintingStable();
    await hero.waitForMillis(6000);

    let data = await readNextData(hero);
    if (!data) {
      process.stderr.write('SamsClub: __NEXT_DATA__ not present yet, waiting for bot-check to clear\n');
      await hero.waitForMillis(8000);
      data = await readNextData(hero);
    }

    if (data) {
      const product = data?.props?.pageProps?.initialData?.data?.product;
      if (product) {
        result.name = product.name ?? null;
        result.price = product.priceInfo?.currentPrice?.price ?? null;
        result.in_stock = product.availabilityStatusV2?.value === 'IN_STOCK';
        process.stderr.write(`SamsClub: name=${result.name} price=${result.price} in_stock=${result.in_stock}\n`);
      } else {
        process.stderr.write('SamsClub: __NEXT_DATA__ present but no product field\n');
      }
    } else {
      process.stderr.write('SamsClub: bot-check never cleared\n');
    }

  } catch (err) {
    process.stderr.write(`Hero error: ${err.message}\n`);
  } finally {
    await hero.close();
  }

  console.log(JSON.stringify(result));
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  console.log(JSON.stringify({ name: null, url: process.argv[2], price: null, in_stock: false, quantity: null, retailer: 'samsclub' }));
  process.exit(1);
});
