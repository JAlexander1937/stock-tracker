const API = "";

// ── Status bar ───────────────────────────────────────────────────────────────

let statusTimer;
function showStatus(msg, error = false) {
  const bar = document.getElementById("status-bar");
  bar.textContent = msg;
  bar.style.background = error ? "#dc2626" : "#1e293b";
  bar.classList.add("show");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => bar.classList.remove("show"), 3000);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val, prefix = "$") {
  return val != null ? `${prefix}${Number(val).toFixed(2)}` : "—";
}

function fmtDate(str) {
  if (!str) return "—";
  const d = new Date(str.endsWith("Z") ? str : str + "Z");
  return d.toLocaleString();
}

function retailerBadge(r) {
  const labels = { walmart: "Walmart", target: "Target", pokemon_center: "Pokémon Center" };
  return `<span class="retailer-pill">${labels[r] || r}</span>`;
}

function stockBadge(inStock) {
  return inStock
    ? `<span class="badge badge-green">In Stock</span>`
    : `<span class="badge badge-red">Out of Stock</span>`;
}

function actionBadge(type) {
  const map = {
    ALERT: "badge-yellow",
    OPEN_URL: "badge-blue",
    LOG: "badge-gray",
  };
  return `<span class="badge ${map[type] || "badge-gray"}">${type}</span>`;
}

// ── Load / render ─────────────────────────────────────────────────────────────

async function loadAll() {
  await Promise.all([loadSearches(), loadProducts(), loadActions()]);
}

async function loadProducts() {
  try {
    const res = await fetch(`${API}/products`);
    const products = await res.json();
    renderWatchlist(products);
  } catch (e) {
    document.getElementById("watchlist-body").innerHTML =
      `<tr><td colspan="8" class="empty">Failed to load products.</td></tr>`;
  }
}

function renderWatchlist(products) {
  const tbody = document.getElementById("watchlist-body");
  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty">No products in watchlist yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = products.map(p => {
    const name = p.name
      ? `<a href="${p.url}" target="_blank">${p.name}</a>`
      : `<a href="${p.url}" target="_blank">${p.url.slice(0, 50)}…</a>`;
    return `
      <tr>
        <td>${name}</td>
        <td>${retailerBadge(p.retailer)}</td>
        <td>${fmt(p.last_price)}</td>
        <td>${fmt(p.max_price)}</td>
        <td>${stockBadge(p.last_in_stock)}</td>
        <td>${fmtDate(p.last_scraped_at)}</td>
        <td>
          <label style="cursor:pointer">
            <input type="checkbox" onchange="toggleActive(${p.id}, this.checked)"
              ${p.active ? "checked" : ""} />
          </label>
        </td>
        <td style="white-space:nowrap">
          <button class="btn-sm btn-secondary" onclick="manualScrape(${p.id})">Scrape</button>
          <button class="btn-sm btn-danger" onclick="deleteProduct(${p.id})">✕</button>
        </td>
      </tr>`;
  }).join("");
}

async function loadActions() {
  try {
    const res = await fetch(`${API}/actions`);
    const actions = await res.json();
    renderActions(actions);
  } catch (e) {
    document.getElementById("actions-body").innerHTML =
      `<tr><td colspan="4" class="empty">Failed to load actions.</td></tr>`;
  }
}

function renderActions(actions) {
  const tbody = document.getElementById("actions-body");
  if (!actions.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty">No agent actions yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = actions.map(a => {
    const result = a.result ? JSON.parse(a.result) : {};
    return `
      <tr class="action-row">
        <td>${fmtDate(a.created_at)}</td>
        <td>${a.product_name || "—"}</td>
        <td>${actionBadge(a.action_type)}</td>
        <td>${result.reason || "—"}</td>
      </tr>`;
  }).join("");
}

// ── Searches ─────────────────────────────────────────────────────────────────

async function loadSearches() {
  try {
    const res = await fetch(`${API}/searches`);
    const searches = await res.json();
    renderSearches(searches);
  } catch {
    document.getElementById("searches-body").innerHTML =
      `<tr><td colspan="6" class="empty">Failed to load searches.</td></tr>`;
  }
}

function renderSearches(searches) {
  const tbody = document.getElementById("searches-body");
  if (!searches.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">No searches yet. Add a keyword above to start auto-discovery.</td></tr>`;
    return;
  }
  const retailerLabel = { walmart: "Walmart", target: "Target", pokemon_center: "Pokémon Center" };
  tbody.innerHTML = searches.map(s => `
    <tr>
      <td><strong>${s.keyword}</strong></td>
      <td>${retailerBadge(s.retailer)}</td>
      <td>${fmt(s.max_price)}</td>
      <td>${fmtDate(s.last_run_at)}</td>
      <td>
        <label style="cursor:pointer">
          <input type="checkbox" onchange="toggleSearch(${s.id}, this.checked)" ${s.active ? "checked" : ""} />
        </label>
      </td>
      <td style="white-space:nowrap">
        <button class="btn-sm btn-secondary" onclick="runSearchNow(${s.id})">Run Now</button>
        <button class="btn-sm btn-danger" onclick="deleteSearch(${s.id})">✕</button>
      </td>
    </tr>`).join("");
}

document.getElementById("search-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const body = { keyword: data.keyword, retailer: data.retailer };
  if (data.max_price) body.max_price = parseFloat(data.max_price);

  try {
    const res = await fetch(`${API}/searches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to add search.");
    }
    showStatus("Search added — first run in up to 5 minutes.");
    e.target.reset();
    loadSearches();
  } catch (err) {
    showStatus(err.message, true);
  }
});

async function toggleSearch(id, active) {
  await fetch(`${API}/searches/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
  showStatus(active ? "Search activated." : "Search paused.");
}

async function deleteSearch(id) {
  if (!confirm("Remove this search?")) return;
  await fetch(`${API}/searches/${id}`, { method: "DELETE" });
  showStatus("Search removed.");
  loadSearches();
}

async function runSearchNow(id) {
  showStatus("Running search…");
  try {
    const res = await fetch(`${API}/searches/${id}/run`, { method: "POST" });
    const data = await res.json();
    showStatus(`Found ${data.found} listings. New ones auto-added to watchlist.`);
    loadProducts();
    loadSearches();
  } catch {
    showStatus("Search failed.", true);
  }
}

// ── Mutations ────────────────────────────────────────────────────────────────

document.getElementById("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const body = { url: data.url };
  if (data.max_price) body.max_price = parseFloat(data.max_price);
  if (data.desired_qty) body.desired_qty = parseInt(data.desired_qty, 10);

  try {
    const res = await fetch(`${API}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to add product.");
    }
    showStatus("Product added!");
    e.target.reset();
    loadProducts();
  } catch (err) {
    showStatus(err.message, true);
  }
});

async function toggleActive(id, active) {
  try {
    await fetch(`${API}/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    showStatus(active ? "Product activated." : "Product paused.");
  } catch {
    showStatus("Failed to update.", true);
    loadProducts();
  }
}

async function deleteProduct(id) {
  if (!confirm("Remove this product from your watchlist?")) return;
  try {
    await fetch(`${API}/products/${id}`, { method: "DELETE" });
    showStatus("Product removed.");
    loadProducts();
  } catch {
    showStatus("Failed to remove.", true);
  }
}

async function manualScrape(id) {
  showStatus("Scraping…");
  try {
    const res = await fetch(`${API}/scrape/${id}`, { method: "POST" });
    const data = await res.json();
    showStatus(`Scraped: ${data.in_stock ? "In stock" : "Out of stock"} @ ${fmt(data.price)}`);
    loadProducts();
  } catch {
    showStatus("Scrape failed.", true);
  }
}

// ── Theme modal ───────────────────────────────────────────────────────────────

function chooseTheme(mode) {
  document.body.classList.toggle("dark", mode === "dark");
  document.getElementById("theme-modal").classList.add("hidden");
}

// Show modal on every load/refresh
document.getElementById("theme-modal").classList.remove("hidden");

// ── Init ─────────────────────────────────────────────────────────────────────

loadAll();
setInterval(loadAll, 30000); // refresh UI every 30s
