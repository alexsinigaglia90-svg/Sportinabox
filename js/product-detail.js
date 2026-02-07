// js/product-detail.js — volledige versie (uniforme global toast + badge support)

(() => {
  const API_BASE = "https://sportinabox-api.alex-sinigaglia90.workers.dev";
  const CART_KEY = "sib_cart_v1";

  const $ = (id) => document.getElementById(id);

  // Page blocks
  const elLoading = $("loading");
  const elError = $("error");
  const elProduct = $("product");

  // Gallery
  const elMainImage = $("mainImage");
  const elThumbs = $("thumbs");

  // Content
  const elCategory = $("category");
  const elName = $("name");
  const elPrice = $("price");
  const elDescription = $("description");
  const elHighlights = $("highlights");
  const elSpecGrid = $("specGrid");

  // Actions
  const btnAdd = $("addToCart");
  const btnCopy = $("copyLink");

  // Global toast (rechte onder)
  const elGlobalToast = $("globalToast");

  // Badge (in nav)
  const elCartBadge = $("cartBadge");

  // Old inline toast (we gebruiken hem niet meer, maar we verstoppen hem defensief)
  const elAddedMsg = $("addedMsg");

  function setVisible(el, visible) {
    if (!el) return;
    el.classList.toggle("state--hidden", !visible);
  }

  function getSlug() {
    const url = new URL(window.location.href);
    return (url.searchParams.get("slug") || "").trim();
  }

  function formatPrice(priceCents, currency) {
    const value = (Number(priceCents || 0) / 100);
    try {
      return new Intl.NumberFormat("nl-NL", { style: "currency", currency: currency || "EUR" }).format(value);
    } catch {
      return `${value.toFixed(2)} ${currency || "EUR"}`;
    }
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

  function updateCartBadge() {
    if (!elCartBadge) return;
    const cart = readCart();
    const qty = cart.items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);

    if (qty > 0) {
      elCartBadge.textContent = String(qty);
      elCartBadge.style.display = "inline-flex";
      elCartBadge.setAttribute("aria-hidden", "false");
    } else {
      elCartBadge.textContent = "";
      elCartBadge.style.display = "none";
      elCartBadge.setAttribute("aria-hidden", "true");
    }
  }

  // ✅ Uniforme premium toast rechtsonder (zelfde als index/cart)
  function toast(text = "Added to cart") {
    if (!elGlobalToast) return;
    elGlobalToast.textContent = text;
    elGlobalToast.classList.add("is-visible");

    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => {
      elGlobalToast.classList.remove("is-visible");
    }, 1200);
  }

  function normalizeImageList(imagesJsonOrArray) {
    // Support: images_json string OR array
    if (Array.isArray(imagesJsonOrArray)) {
      return imagesJsonOrArray
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean);
    }
    const arr = safeJsonParse(imagesJsonOrArray, []);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
  }

  function labelize(key) {
    return String(key)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function toHighlights(specsObj) {
    const preferredKeys = ["hygiene_level", "material", "use_case", "size", "weight", "color", "indoor", "outdoor"];
    const out = [];

    for (const k of preferredKeys) {
      if (specsObj && Object.prototype.hasOwnProperty.call(specsObj, k)) {
        const v = specsObj[k];
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out.push([k, v]);
      }
      if (out.length >= 4) break;
    }

    if (out.length < 4 && specsObj && typeof specsObj === "object") {
      for (const [k, v] of Object.entries(specsObj)) {
        if (out.some(([ek]) => ek === k)) continue;
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out.push([k, v]);
        if (out.length >= 4) break;
      }
    }

    return out;
  }

  function renderHighlights(specsObj) {
    if (!elHighlights) return;
    elHighlights.innerHTML = "";
    const items = toHighlights(specsObj);
    if (!items.length) return;

    for (const [k, v] of items) {
      const pill = document.createElement("div");
      pill.className = "pill";
      pill.textContent = `${labelize(k)}: ${typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}`;
      elHighlights.appendChild(pill);
    }
  }

  function renderSpecs(specsObj) {
    if (!elSpecGrid) return;
    elSpecGrid.innerHTML = "";

    if (!specsObj || typeof specsObj !== "object") {
      elSpecGrid.innerHTML = `<p class="muted">Geen specs beschikbaar.</p>`;
      return;
    }

    const entries = Object.entries(specsObj).filter(([, v]) => v != null && v !== "").slice(0, 60);
    if (!entries.length) {
      elSpecGrid.innerHTML = `<p class="muted">Geen specs beschikbaar.</p>`;
      return;
    }

    for (const [k, v] of entries) {
      const row = document.createElement("div");
      row.className = "spec-row";
      row.innerHTML = `
        <div class="spec-k">${labelize(k)}</div>
        <div class="spec-v">${typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}</div>
      `;
      elSpecGrid.appendChild(row);
    }
  }

  function renderGallery(images, name) {
    if (!elThumbs || !elMainImage) return;

    const fallback =
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
          <rect width="100%" height="100%" fill="#0b0f19"/>
          <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9aa6bf" font-family="system-ui" font-size="44">
            No image
          </text>
        </svg>
      `);

    const list = images.length ? images : [fallback];

    const setMain = (src) => {
      elMainImage.src = src;
      elMainImage.alt = name ? `${name} afbeelding` : "Product afbeelding";
    };

    setMain(list[0]);
    elThumbs.innerHTML = "";

    list.forEach((src, idx) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "thumb";
      b.setAttribute("aria-label", `Afbeelding ${idx + 1}`);
      b.innerHTML = `<img src="${src}" alt="" loading="lazy" />`;

      b.addEventListener("click", () => {
        setMain(src);
        [...elThumbs.children].forEach((c) => c.classList.remove("thumb--active"));
        b.classList.add("thumb--active");
      });

      if (idx === 0) b.classList.add("thumb--active");
      elThumbs.appendChild(b);
    });
  }

  async function fetchProduct(slug) {
    const res = await fetch(`${API_BASE}/products/${encodeURIComponent(slug)}`, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    return await res.json();
  }

  function addToCart(product) {
    const cart = readCart();
    const images = normalizeImageList(product.images_json ?? product.images);

    const existing = cart.items.find((it) => it.id === product.id);
    if (existing) {
      existing.qty = (Number(existing.qty) || 1) + 1;
    } else {
      cart.items.push({
        id: product.id,
        slug: product.slug,
        name: product.name,
        price_cents: product.price_cents,
        currency: product.currency || "EUR",
        qty: 1,
        image: images[0] || "",
        meta: {}
      });
    }

    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartBadge();

    // ✅ Uniforme global toast
    toast("Added to cart");
  }

  async function init() {
    // Hide the old inline toast element if it exists (we don't use it anymore)
    setVisible(elAddedMsg, false);

    updateCartBadge();

    const slug = getSlug();
    if (!slug) {
      setVisible(elLoading, false);
      setVisible(elProduct, false);
      setVisible(elError, true);
      return;
    }

    try {
      const p = await fetchProduct(slug);

      document.title = `${p.name} — Sport in a Box`;

      if (elCategory) elCategory.textContent = p.category ? String(p.category) : "";
      if (elName) elName.textContent = p.name || "";
      if (elPrice) elPrice.textContent = formatPrice(p.price_cents, p.currency);
      if (elDescription) elDescription.textContent = p.description || "";

      const specs = safeJsonParse(p.specs_json, {});
      renderHighlights(specs);
      renderSpecs(specs);

      const images = normalizeImageList(p.images_json ?? p.images);
      renderGallery(images, p.name);

      if (btnAdd) btnAdd.onclick = () => addToCart(p);

      if (btnCopy) {
        btnCopy.onclick = async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            toast("Link copied");
          } catch {
            // fallback: do nothing
          }
        };
      }

      setVisible(elLoading, false);
      setVisible(elError, false);
      setVisible(elProduct, true);
    } catch (e) {
      console.error(e);
      setVisible(elLoading, false);
      setVisible(elProduct, false);
      setVisible(elError, true);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
