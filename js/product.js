// js/product.js — Ultra high-end product detail page (Premium Image Engine)
//
// Changes vs your version:
// - Uses Worker presets:
//    - /img/contain for HERO (detail page) => never crops product, premium look
//    - /img/cover for THUMBS => consistent thumbs
// - Uses same preset-based cfImage signature as products.js (less mistakes)
// - Adds dpr support (retina crisp) + keeps optional overrides
//
// Requirements:
// - Worker supports: GET /img/cover and /img/contain
// - product.html loads this file
// - cart badge updater is optional (works if present)

const API_BASE = "https://sportinabox-api.alex-sinigaglia90.workers.dev";
const CART_KEY = "sib_cart_v1";

/** Use Worker image engine presets */
function cfImage(url, opts = {}) {
  if (!url) return "";

  const {
    preset = "cover", // "cover" | "contain"
    w,
    h,
    q,
    dpr
  } = opts;

  const endpoint = preset === "contain" ? "/img/contain" : "/img/cover";
  const u = new URL(API_BASE + endpoint);

  u.searchParams.set("src", url);
  if (w) u.searchParams.set("w", String(w));
  if (h) u.searchParams.set("h", String(h));
  if (q) u.searchParams.set("q", String(q));
  if (dpr) u.searchParams.set("dpr", String(dpr));

  return u.toString();
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

function euro(cents, currency = "EUR") {
  const n = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

function getSlug() {
  const url = new URL(window.location.href);
  return (url.searchParams.get("slug") || "").trim();
}

async function fetchProduct(slug) {
  const r = await fetch(`${API_BASE}/products/${encodeURIComponent(slug)}`, {
    headers: { Accept: "application/json" }
  });
  if (!r.ok) return null;
  return await r.json();
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
  if (typeof window.updateCartBadge === "function") window.updateCartBadge();
}

function toast(text = "Added to cart") {
  const el = document.getElementById("globalToast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("is-visible");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => el.classList.remove("is-visible"), 1200);
}

function addToCart(p) {
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

function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt ?? "";
}

function show(elId, yes) {
  const el = document.getElementById(elId);
  if (!el) return;

  // Bulletproof: set both hidden + display
  el.hidden = !yes;
  el.style.display = yes ? "" : "none";
}

function renderThumbs(images, onPick) {
  const thumbs = document.getElementById("pdThumbs");
  if (!thumbs) return;
  thumbs.innerHTML = "";

  images.forEach((rawUrl, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pd__thumb";
    btn.setAttribute("aria-label", `Afbeelding ${idx + 1}`);

    // ✅ Premium thumbs: consistent 4:3 cover
    const thumbUrl = cfImage(rawUrl, { preset: "cover", w: 320, h: 240, q: 82, dpr: 2 });

    btn.innerHTML = `<img class="pd__thumbImg" alt="" src="${esc(thumbUrl)}" loading="lazy">`;
    btn.addEventListener("click", () => onPick(idx));
    thumbs.appendChild(btn);
  });
}

function setActiveThumb(index) {
  const thumbs = Array.from(document.querySelectorAll(".pd__thumb"));
  thumbs.forEach((t, i) => t.classList.toggle("is-active", i === index));
}

function renderSpecs(p) {
  const specs = document.getElementById("pdSpecs");
  if (!specs) return;

  const rows = [];
  rows.push(["Merk", "Sport in a Box"]);
  if (p.sku) rows.push(["SKU", String(p.sku)]);
  rows.push(["Status", String(p.status || "published")]);
  rows.push(["Prijs", euro(p.price_cents, p.currency || "EUR")]);

  specs.innerHTML = rows.map(([k, v]) => `
    <div class="pd__specRow">
      <div class="pd__specKey">${esc(k)}</div>
      <div class="pd__specVal">${esc(v)}</div>
    </div>
  `).join("");
}

function renderHighlights(p) {
  const ul = document.getElementById("pdHighlights");
  if (!ul) return;

  const items = [];
  const desc = (p.description || "").trim();
  if (desc) items.push("Premium formule voor dagelijks gebruik");
  items.push("Consistente prestaties — ontworpen voor sport & hygiëne");
  items.push("Strakke verpakking, direct leverbaar");

  ul.innerHTML = items.map((x) => `<li>${esc(x)}</li>`).join("");
}

async function init() {
  const slug = getSlug();
  if (!slug) {
    show("pdSkeleton", false);
    show("pdContent", false);
    show("pdNotFound", true);
    return;
  }

  show("pdNotFound", false);
  show("pdSkeleton", true);
  show("pdContent", false);

  const p = await fetchProduct(slug);

  if (!p || p.error) {
    show("pdSkeleton", false);
    show("pdContent", false);
    show("pdNotFound", true);
    return;
  }

  if (p.status && String(p.status) !== "published") {
    show("pdSkeleton", false);
    show("pdContent", false);
    show("pdNotFound", true);
    return;
  }

  // Populate
  setText("pdCrumbName", p.name || "Product");
  setText("pdTitle", p.name || "—");
  setText("pdPrice", euro(p.price_cents, p.currency || "EUR"));
  setText("pdDesc", p.description || "");

  document.title = `${p.name || "Product"} — Sport in a Box`;

  const images = normalizeImageList(p.images_json ?? p.images);
  const hero = document.getElementById("pdHeroImg");

  let activeIndex = 0;
  function setHero(idx) {
    activeIndex = idx;
    if (!hero) return;

    const raw = images[idx] || images[0] || "";

    // ✅ Premium HERO: contain (never crop), dark background handled by Worker
    // Also pass explicit size (optional) for predictable cache keys
    hero.src = raw ? cfImage(raw, { preset: "contain", w: 1400, h: 1050, q: 85, dpr: 2 }) : "";
    hero.alt = p.name || "";
    setActiveThumb(idx);
  }

  if (images.length) {
    renderThumbs(images, setHero);
    setHero(0);
  } else if (hero) {
    hero.remove();
  }

  renderHighlights(p);
  renderSpecs(p);

  // CTA
  const btnAdd = document.getElementById("pdAddToCart");
  if (btnAdd) {
    btnAdd.addEventListener("click", () => {
      addToCart(p);
      toast("Added to cart");
    });
  }

  const btnCopy = document.getElementById("pdCopyLink");
  if (btnCopy) {
    btnCopy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast("Link copied");
      } catch {
        toast("Copy failed");
      }
    });
  }

  show("pdSkeleton", false);
  show("pdContent", true);
}

document.addEventListener("DOMContentLoaded", init);
