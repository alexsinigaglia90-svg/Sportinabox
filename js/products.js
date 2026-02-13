// js/products.js — Sport in a Box (Shop grid + AI catalog)
// - Uses your Worker image engine: /img (no /cdn-cgi/image)
// - Adds TWO image modes:
//    1) "cover"  -> cinematic crop (fit=cover)
//    2) "product"-> background removal + fixed background + contain (mode=product)
// - Exposes: window.SIB.getCatalogForAI() for hero search in app.js
// - Keeps: cart badge, add-to-cart, toast, card click navigation

const API_BASE = "https://sportinabox-api.alex-sinigaglia90.workers.dev";
const CART_KEY = "sib_cart_v1";

/* -------------------- Image helpers (Worker) -------------------- */

// Standard resize/crop (good for "cinematic" images)
function cfImageCover(url, opts = {}) {
  if (!url) return "";
  const { w = 1200, h = 900, q = 85, fit = "cover" } = opts;

  const u = new URL(`${API_BASE}/img`);
  u.searchParams.set("src", url);
  u.searchParams.set("w", String(w));
  u.searchParams.set("h", String(h));
  u.searchParams.set("fit", fit);
  u.searchParams.set("q", String(q));
  return u.toString();
}

// Premium product engine (background removal + fixed background + contain)
function cfImageProduct(url, opts = {}) {
  if (!url) return "";
  const { w = 1200, h = 900, q = 90, bg = "#0b0f1a" } = opts;

  const u = new URL(`${API_BASE}/img`);
  u.searchParams.set("src", url);
  u.searchParams.set("w", String(w));
  u.searchParams.set("h", String(h));
  u.searchParams.set("q", String(q));
  u.searchParams.set("mode", "product");
  if (bg) u.searchParams.set("bg", bg);
  return u.toString();
}

/* -------------------- API + utils -------------------- */

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
    "'": "&#039;",
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

function productHref(slug) {
  return `./product.html?slug=${encodeURIComponent(slug)}`;
}

/* -------------------- Cart -------------------- */

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
  const images = normalizeImageList(p.images_json ?? p.images);
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
      meta: {},
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

/* -------------------- Rendering -------------------- */

function card(p) {
  const images = normalizeImageList(p.images_json ?? p.images);
  const raw = images.length ? images[0] : "";
  const href = productHref(p.slug);

  // ✅ PREMIUM PRODUCT IMAGE: background removal + uniform background + contain
  const img = raw ? cfImageProduct(raw, { w: 1200, h: 900, q: 90, bg: "#0b0f1a" }) : "";

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

/* -------------------- Shared catalog cache -------------------- */

let _productsPromise = null;
function getProductsCached() {
  if (!_productsPromise) _productsPromise = fetchProducts();
  return _productsPromise;
}

/* -------------------- Mount grid -------------------- */

async function mountProducts() {
  const grid = document.querySelector("[data-products-grid]");
  const state = document.querySelector("[data-products-state]");
  if (!grid || !state) return;

  updateCartBadge();
  state.textContent = "Laden…";

  try {
    const products = await getProductsCached();

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
  } catch (e) {
    state.textContent = "Kon producten niet laden. Check API /products.";
    console.error(e);
  }
}

/* -------------------- AI catalog for hero search -------------------- */

async function getCatalogForAI() {
  const products = await getProductsCached();

  return products.map((p) => {
    const images = normalizeImageList(p.images_json ?? p.images);
    const raw = images[0] || "";

    return {
      id: p.id,
      slug: p.slug,
      name: p.name || "",
      description: p.description || "",
      price_cents: p.price_cents || 0,
      currency: p.currency || "EUR",
      category: p.category || "",
      image: raw ? cfImageProduct(raw, { w: 900, h: 675, q: 88, bg: "#0b0f1a" }) : "",
    };
  });
}

// Expose to window for app.js hero search
window.SIB = window.SIB || {};
window.SIB.getCatalogForAI = getCatalogForAI;
window.SIB.cfImageCover = cfImageCover;
window.SIB.cfImageProduct = cfImageProduct;

/* -------------------- Boot -------------------- */
document.addEventListener("DOMContentLoaded", mountProducts);

/* EOF */
