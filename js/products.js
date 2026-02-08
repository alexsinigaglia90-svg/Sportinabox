// js/products.js — Sport in a Box (Shop grid)
// Updates:
// - Cloudflare Image Transformations engine (/cdn-cgi/image/...) for perfect crops + optimization
// - Card image framed 4:3 + object-fit cover via inline styles (safe, no CSS dependency)
// - Removed "Configureer" button
// - Make "Add to cart" more visible (extra class + safe inline defaults)

const API_BASE = "https://sportinabox-api.alex-sinigaglia90.workers.dev";
const CART_KEY = "sib_cart_v1";

/**
 * Cloudflare Image Transformations wrapper.
 * Works when "Resize images from any origin" is enabled.
 * Source URLs are your Cloudflare Images delivery URLs (imagedelivery.net/...).
 */
function cfImage(url, opts = {}) {
  if (!url) return "";

  const {
    w = 1200,
    h = 900,
    fit = "cover",
    q = 85,
    format = "auto"
  } = opts;

  const params = `w=${w},h=${h},fit=${fit},quality=${q},format=${format}`;

  // Serve via your own domain so /cdn-cgi/image works
  return `${location.origin}/cdn-cgi/image/${params}/${url}`;
}

async function fetchProducts() {
  const r = await fetch(`${API_BASE}/products`, {
    headers: { "Accept": "application/json" }
  });
  if (!r.ok) throw new Error("Products API failed");
  const data = await r.json();
  return data.results || [];
}

function euro(cents, currency = "EUR") {
  const n = (Number(cents || 0) / 100);
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
  if (typeof maybeJson === "object") return maybeJson; // already parsed
  try {
    return JSON.parse(maybeJson);
  } catch {
    return fallback;
  }
}

function normalizeImageList(imagesJsonOrArray) {
  // Support: API might return images_json (string) or images (array) — we accept both safely
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
  // Verwacht een element met id="cartBadge" in je header (zoals op product.html)
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
      meta: {}
    });
  }

  writeCart(cart);
}

// ✅ AANGEPAST: toast gebruikt nu vaste <div id="globalToast">
function toast(text = "Added to cart") {
  const el = document.getElementById("globalToast");
  if (!el) return;

  el.textContent = text;
  el.classList.add("is-visible");

  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => {
    el.classList.remove("is-visible");
  }, 1200);
}

function productHref(slug) {
  return `./product.html?slug=${encodeURIComponent(slug)}`;
}

function card(p) {
  const images = normalizeImageList(p.images_json ?? p.images);
  const original = images.length ? images[0] : "";
  const href = productHref(p.slug);

  // optimized delivery (crop to 4:3 for cards)
  const imgOptimized = original ? cfImage(original, { w: 1200, h: 900, fit: "cover", q: 85 }) : "";

  // Inline styles are used here so this works even if your CSS doesn’t yet include the new classes.
  // You can later move these to styles.css (cleaner), but this makes it “bulletproof” now.
  const mediaStyle = "width:100%;aspect-ratio:4/3;overflow:hidden;border-radius:18px;background:rgba(255,255,255,0.06);";
  const imgStyle = "width:100%;height:100%;display:block;object-fit:cover;object-position:center;";

  return `
  <article class="product-card" data-slug="${esc(p.slug)}" role="link" tabindex="0" aria-label="${esc(p.name)}">
    <div class="product-media product-card__media" style="${mediaStyle}">
      ${imgOptimized
        ? `<img class="product-card__img" style="${imgStyle}" src="${esc(imgOptimized)}" alt="${esc(p.name)}" loading="lazy" />`
        : `<div class="media-fallback">Sportinabox</div>`}
    </div>

    <div class="product-body">
      <div class="product-top">
        <h3 class="product-title">${esc(p.name)}</h3>
        <div class="product-price">${euro(p.price_cents, p.currency || "EUR")}</div>
      </div>
      <p class="product-desc">${esc((p.description || "").slice(0, 110))}</p>

      <div class="product-actions">
        <button
          class="btn btn-ghost btn-add-to-cart"
          style="opacity:1;color:#fff;border:1px solid rgba(255,255,255,0.30);background:rgba(255,255,255,0.14);"
          type="button"
          data-add="${esc(p.slug)}"
          data-action="add"
        >Add to cart</button>
      </div>
    </div>

    <a class="sr-only" href="${href}">Open ${esc(p.name)}</a>
  </article>`;
}

async function mountProducts() {
  const grid = document.querySelector("[data-products-grid]");
  const state = document.querySelector("[data-products-state]");
  if (!grid || !state) return;

  updateCartBadge();
  state.textContent = "Laden…";

  try {
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
        if (tag === "button" || tag === "a" || tag === "input" || tag === "textarea" || tag === "select") return;

        e.preventDefault();
        window.location.href = productHref(slug);
      }
    });

  } catch (e) {
    state.textContent = "Kon producten niet laden. Check API /products.";
    console.error(e);
  }
}

document.addEventListener("DOMContentLoaded", mountProducts);
