// js/products.js — complete, verrijkt (detail-link + cart localStorage + badge + safer parsing)

const API_BASE = "https://sportinabox-api.alex-sinigaglia90.workers.dev";
const CART_KEY = "sib_cart_v1";

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

function toast(text = "Added to cart") {
  // Minimal toast zonder extra HTML wijzigingen:
  // maakt tijdelijk een subtiele glass toast in de hoek
  const el = document.createElement("div");
  el.textContent = text;
  el.style.position = "fixed";
  el.style.right = "18px";
  el.style.bottom = "18px";
  el.style.zIndex = "9999";
  el.style.padding = "10px 12px";
  el.style.borderRadius = "14px";
  el.style.border = "1px solid rgba(255,255,255,0.12)";
  el.style.background = "rgba(0,0,0,0.30)";
  el.style.backdropFilter = "blur(14px)";
  el.style.webkitBackdropFilter = "blur(14px)";
  el.style.color = "rgba(255,255,255,0.88)";
  el.style.fontSize = "13px";
  el.style.boxShadow = "0 16px 48px rgba(0,0,0,0.35)";
  el.style.opacity = "0";
  el.style.transform = "translateY(6px)";
  el.style.transition = "opacity .16s ease, transform .16s ease";
  document.body.appendChild(el);

  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0px)";
  });

  window.setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    window.setTimeout(() => el.remove(), 220);
  }, 1100);
}

function productHref(slug) {
  return `./product.html?slug=${encodeURIComponent(slug)}`;
}

function card(p) {
  const images = normalizeImageList(p.images_json ?? p.images);
  const img = images.length ? images[0] : "";
  const href = productHref(p.slug);

  // Verrijking:
  // - hele card is klikbaar naar detail
  // - “Configureer” gaat naar configurator (als je nog hygiene.html gebruikt, laat zo)
  // - “Add to cart” werkt via localStorage + badge + toast
  return `
  <article class="product-card" data-slug="${esc(p.slug)}" role="link" tabindex="0" aria-label="${esc(p.name)}">
    <div class="product-media">
      ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" />` : `<div class="media-fallback">Sportinabox</div>`}
    </div>
    <div class="product-body">
      <div class="product-top">
        <h3 class="product-title">${esc(p.name)}</h3>
        <div class="product-price">${euro(p.price_cents, p.currency || "EUR")}</div>
      </div>
      <p class="product-desc">${esc((p.description || "").slice(0, 110))}</p>
      <div class="product-actions">
        <a class="btn btn-primary" href="./hygiene.html" data-action="configure">Configureer</a>
        <button class="btn btn-ghost" type="button" data-add="${esc(p.slug)}" data-action="add">Add to cart</button>
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

    // --- Verrijking: event delegation ---
    // 1) Add-to-cart knop
    // 2) Klik op card (niet op buttons/links) -> naar product detail
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

      // Klik op configure link: laat default navigeren
      const isActionLink = e.target.closest('a[data-action="configure"]');
      if (isActionLink) return;

      // Klik op card zelf -> detail
      const cardEl = e.target.closest(".product-card[data-slug]");
      if (cardEl) {
        // voorkom dat clicks op buttons/links in card alsnog navigeren
        const interactive = e.target.closest("button, a, input, textarea, select, label");
        if (interactive) return;

        const slug = cardEl.getAttribute("data-slug");
        if (slug) window.location.href = productHref(slug);
      }
    });

    // Keyboard support: Enter/Space op card opent detail
    grid.addEventListener("keydown", (e) => {
      const cardEl = e.target.closest(".product-card[data-slug]");
      if (!cardEl) return;

      if (e.key === "Enter" || e.key === " ") {
        const slug = cardEl.getAttribute("data-slug");
        if (!slug) return;

        // Niet triggeren als focus op knop/link zit
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
