const API_BASE = "https://sportinabox-api.alex-sinigaglia90.workers.dev";

async function fetchProducts() {
  const r = await fetch(`${API_BASE}/products`, { headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error("Products API failed");
  const data = await r.json();
  return data.results || [];
}

function euro(cents, currency="EUR") {
  const n = (Number(cents||0) / 100);
  try { return new Intl.NumberFormat("nl-NL", { style:"currency", currency }).format(n); }
  catch { return `${n.toFixed(2)} ${currency}`; }
}

function esc(s){ return String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m])); }

function card(p) {
  const img = (p.images && p.images.length) ? p.images[0] : "";
  return `
  <article class="product-card" data-slug="${esc(p.slug)}">
    <div class="product-media">
      ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" />` : `<div class="media-fallback">Sportinabox</div>`}
    </div>
    <div class="product-body">
      <div class="product-top">
        <h3 class="product-title">${esc(p.name)}</h3>
        <div class="product-price">${euro(p.price_cents, p.currency || "EUR")}</div>
      </div>
      <p class="product-desc">${esc((p.description||"").slice(0, 110))}</p>
      <div class="product-actions">
        <a class="btn btn-primary" href="./hygiene.html">Configureer</a>
        <button class="btn btn-ghost" type="button" data-add="${esc(p.slug)}">Add to cart</button>
      </div>
    </div>
  </article>`;
}

async function mountProducts() {
  const grid = document.querySelector("[data-products-grid]");
  const state = document.querySelector("[data-products-state]");
  if (!grid || !state) return;

  state.textContent = "Laden…";

  try {
    const products = await fetchProducts();
    if (!products.length) {
      state.textContent = "Nog geen producten (public). Voeg in Admin een product toe en zet status op published.";
      return;
    }
    grid.innerHTML = products.map(card).join("");
    state.textContent = `${products.length} producten`;
  } catch (e) {
    state.textContent = "Kon producten niet laden. Check API /products.";
    console.error(e);
  }
}

document.addEventListener("DOMContentLoaded", mountProducts);
