// js/products.js — Sport in a Box (Shop grid + Premium Image Engine)
//
// - Grid/cards: /img/cover (uniform 4:3 cover)
// - AI catalog: window.SIB.getCatalogForAI() (for hero search in app.js)
// - Cart add + badge update + toast

const API_BASE = "https://sportinabox-api.alex-sinigaglia90.workers.dev";
const CART_KEY = "sib_cart_v1";

/** Build optimized image URL via your Worker presets */
function cfImage(url, opts = {}) {
  if (!url) return "";

  const { preset = "cover", w, h, q, dpr } = opts;
  const endpoint = preset === "contain" ? "/img/contain" : "/img/cover";
  const u = new URL(API_BASE + endpoint);

  u.searchParams.set("src", url);
  if (w) u.searchParams.set("w", String(w));
  if (h) u.searchParams.set("h", String(h));
  if (q) u.searchParams.set("q", String(q));
  if (dpr) u.searchParams.set("dpr", String(dpr));

  return u.toString();
}

async function fetchProducts() {
  const r = await fetch(`${API_BASE}/products`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("Products API failed");
  const data = await r.json();
  return data.results || [];
}

function euro(cents, currency = "EUR") {
  const n = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

function safeJsonParse(maybeJson, fallback) {
  if (maybeJson == null) return fallback;
  if (typeof maybeJson === "object") return maybeJson;
  try { return JSON.parse(maybeJson); } catch { return fallback; }
}

function normalizeImageList(imagesJsonOrArray) {
  if (Array.isArray(imagesJsonOrArray)) {
    return imagesJsonOrArray.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
  }
  const arr = safeJsonParse(imagesJsonOrArray, []);
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
}

function readCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : { items: [] };
    if (!parsed || !Array.isArray(parsed.items)) return { items: [] };
    return parsed;
  } catch {
    return { items: [] };
  }
}

function writeCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}

function updateCartBadge() {
  const badge = document.getElementById("cartBadge");
  if (!badge) return;

  const cart = readCart();
  const qty = cart.items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);

  if (qty > 0) {
    badge.textContent = String(qty);
    badge.style.display = "inline-flex";
    badge.setAttribute("aria-hidden", "false");
  } else {
    badge.textContent = "";
    badge.style.display = "none";
    badge.setAttribute("aria-hidden", "true");
  }
}

function addToCartFromProduct(p) {
  const cart = readCart();
  const images = normalizeImageList(p.images_json ?? p.images ?? p.images_raw ?? []);
  const existing = cart.items.find((it) => it.id === p.id);

  if (existing) {
    existing.qty = (Number(existing.qty) || 1) + 1;
  } else {
    cart.items.push({
      id: p.id,
      slug: p.slug,
      name: p.name,
      price_cents: p.price_cents,
      currency: p.currency || "EUR",
      qty: 1,
      image: images[0] || "",
      meta: {}
    });
  }
  writeCart(cart);
}

function toast(text = "Added to cart") {
  const el = document.getElementById("globalToast");
  if (!el) return;

  el.textContent = text;
  el.classList.add("is-visible");

  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => el.classList.remove("is-visible"), 1200);
}

function productHref(slug) {
  return `./product.html?slug=${encodeURIComponent(slug)}`;
}

function card(p) {
  // IMPORTANT: p can be either raw API product or normalized AI product.
  // Prefer raw list, then JSON/images, then p.image.
  const images = p.images_raw
    ? normalizeImageList(p.images_raw)
    : normalizeImageList(p.images_json ?? p.images);

  const raw = images[0] || "";
  const href = productHref(p.slug);

  // If we have a raw upstream image -> render via cover preset
  // If not, but p.image exists (already processed) -> use it
  const img = raw ? cfImage(raw, { preset: "cover" }) : (p.image || "");

  return `
  <article class="product-card" data-slug="${esc(p.slug)}" role="link" tabindex="0" aria-label="${esc(p.name)}">
    <div class="product-card__media">
      ${
        img
          ? `<img class="product-card__img" src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" />`
          : `<div class="media-fallback">Sportinabox</div>`
      }
    </div>

    <div class="product-body">
      <div class="product-top">
        <h3 class="product-title">${esc(p.name)}</h3>
        <div class="product-price">${euro(p.price_cents, p.currency || "EUR")}</div>
      </div>

      <p class="product-desc">${esc((p.description || "").slice(0, 110))}</p>

      <div class="product-actions">
        <button class="btn btn-ghost btn-add-to-cart" type="button" data-add="${esc(p.slug)}" data-action="add">
          Add to cart
        </button>
      </div>
    </div>

    <a class="sr-only" href="${href}">Open ${esc(p.name)}</a>
  </article>`;
}

/* =========================
   window.SIB API (used by app.js search)
   ========================= */
(function exposeSIB() {
  const cache = { products: null, t: 0 };

  async function getCatalogForAI() {
    const now = Date.now();
    if (cache.products && (now - cache.t) < 120000) return cache.products;

    const products = await fetchProducts();

    const normalized = products.map((p) => {
      const images = normalizeImageList(p.images_json ?? p.images);
      const raw = images[0] || "";

      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        description: p.description || "",
        price_cents: p.price_cents,
        currency: p.currency || "EUR",

        // ready-to-use image for small suggestion cards
        image: raw ? cfImage(raw, { preset: "cover" }) : "",
        images_raw: images
      };
    });

    cache.products = normalized;
    cache.t = now;
    return normalized;
  }

  window.SIB = window.SIB || {};
  window.SIB.getCatalogForAI = getCatalogForAI;
  window.SIB.cfImage = cfImage;
})();

async function mountProducts() {
  const grid = document.querySelector("[data-products-grid]");
  const state = document.querySelector("[data-products-state]");

  updateCartBadge();

  // If there's no grid on this page, we still want SIB available for app.js
  if (!grid || !state) {
    // warm cache (optional)
    try { await window.SIB.getCatalogForAI(); } catch {}
    return;
  }

  state.textContent = "Laden…";

  try {
    // ✅ IMPORTANT FIX: grid uses raw API products (with images_json)
    const products = await fetchProducts();

    if (!products.length) {
      state.textContent = "Nog geen producten (public). Voeg in Admin een product toe en zet status op published.";
      return;
    }

    grid.innerHTML = products.map(card).join("");
    state.textContent = `${products.length} producten`;

    grid.addEventListener("click", (e) => {
      const addBtn = e.target.closest("button[data-add]");
      if (addBtn) {
        e.preventDefault();
        e.stopPropagation();

        const slug = addBtn.getAttribute("data-add");
        const p = products.find((x) => x.slug === slug);
        if (!p) return;

        addToCartFromProduct(p);
        toast("Added to cart");
        return;
      }

      const cardEl = e.target.closest(".product-card[data-slug]");
      if (cardEl) {
        const interactive = e.target.closest("button, a, input, textarea, select, label");
        if (interactive) return;

        const slug = cardEl.getAttribute("data-slug");
        if (slug) window.location.href = productHref(slug);
      }
    });

    grid.addEventListener("keydown", (e) => {
      const cardEl = e.target.closest(".product-card[data-slug]");
      if (!cardEl) return;

      if (e.key === "Enter" || e.key === " ") {
        const slug = cardEl.getAttribute("data-slug");
        if (!slug) return;

        const tag = (e.target.tagName || "").toLowerCase();
        if (["button", "a", "input", "textarea", "select"].includes(tag)) return;

        e.preventDefault();
        window.location.href = productHref(slug);
      }
    });

    // warm AI cache (so search is instant)
    try { await window.SIB.getCatalogForAI(); } catch {}

  } catch (e) {
    state.textContent = "Kon producten niet laden. Check API /products.";
    console.error(e);
  }
}

document.addEventListener("DOMContentLoaded", mountProducts);
