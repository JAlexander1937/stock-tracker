/**
 * Pokémon Center keyword search using Ulixee Hero.
 * Called from Python: node pokemon_center_search.js "<keyword>"
 * Outputs JSON to stdout: [{name, url, price, in_stock, retailer}]
 */
const Hero = require('@ulixee/hero-playground');

async function main() {
  const keyword = process.argv[2];
  if (!keyword) {
    console.error('Usage: node pokemon_center_search.js "<keyword>"');
    process.exit(1);
  }

  const results = [];
  const hero = new Hero({ showChrome: false });

  try {
    const searchUrl = `https://www.pokemoncenter.com/search?q=${encodeURIComponent(keyword)}`;
    await hero.goto(searchUrl);
    await hero.waitForPaintingStable();
    await hero.waitForMillis(2000);

    const tiles = await hero.document.querySelectorAll(
      '.product-tile, [class*="ProductTile"], [data-testid*="product"]'
    );

    for (const tile of tiles) {
      try {
        const linkEl = await tile.querySelector('a[href]');
        const nameEl = await tile.querySelector('.product-tile__name, [class*="name"], h2, h3');
        const priceEl = await tile.querySelector('[class*="price"] .money, [class*="price"]');

        const href = linkEl ? await linkEl.getAttribute('href') : null;
        if (!href) continue;
        const url = href.startsWith('http') ? href : `https://www.pokemoncenter.com${href}`;
        const name = nameEl ? (await nameEl.textContent).trim() : null;
        let price = null;
        if (priceEl) {
          const m = (await priceEl.textContent).replace(/,/g, '').match(/[\d.]+/);
          if (m) price = parseFloat(m[0]);
        }
        results.push({ name, url, price, in_stock: true, retailer: 'pokemon_center' });
      } catch (_) {}
    }

    process.stderr.write(`PokemonCenter search: found ${results.length} items\n`);

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
