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
  await Promise.all([loadProducts(), loadActions()]);
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

// ── Theme toggle ─────────────────────────────────────────────────────────────

const themeSwitch = document.getElementById("theme-switch");

function applyTheme(dark) {
  document.body.classList.toggle("dark", dark);
  themeSwitch.checked = dark;
}

themeSwitch.addEventListener("change", () => {
  const dark = themeSwitch.checked;
  localStorage.setItem("theme", dark ? "dark" : "light");
  applyTheme(dark);
});

// Restore saved preference (default: light)
applyTheme(localStorage.getItem("theme") === "dark");

// ── Init ─────────────────────────────────────────────────────────────────────

loadAll();
setInterval(loadAll, 30000); // refresh UI every 30s
