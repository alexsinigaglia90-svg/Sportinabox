(() => {
  const API_BASE = "https://sportinabox-api.alex-sinigaglia90.workers.dev";
  const CART_KEY = "sib_cart_v1";

  const $ = (id) => document.getElementById(id);

  const elLoading = $("loading");
  const elError = $("error");
  const elProduct = $("product");

  const elMainImage = $("mainImage");
  const elThumbs = $("thumbs");

  const elCategory = $("category");
  const elName = $("name");
  const elPrice = $("price");
  const elDescription = $("description");
  const elHighlights = $("highlights");
  const elSpecGrid = $("specGrid");

  const btnAdd = $("addToCart");
  const btnCopy = $("copyLink");
  const elAddedMsg = $("addedMsg");
  const elCartBadge = $("cartBadge");

  function getSlug() {
    const url = new URL(window.location.href);
    return (url.searchParams.get("slug") || "").trim();
  }

  function formatPrice(priceCents, currency) {
    const value = (Number(priceCents || 0) / 100);
    // Minimal, safe formatting
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

  function setVisible(el, visible) {
    el.classList.toggle("state--hidden", !visible);
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

  function toastAdded() {
    setVisible(elAddedMsg, true);
    window.clearTimeout(toastAdded._t);
    toastAdded._t = window.setTimeout(() => setVisible(elAddedMsg, false), 1400);
  }

  function normalizeImageList(imagesJson) {
    const arr = safeJsonParse(imagesJson, []);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
  }

  function toHighlights(specsObj) {
    // Neem alleen “mooie” korte highlights
    // Prioriteit op bekende keys, anders pak first few primitives.
    const preferredKeys = ["hygiene_level", "material", "use_case", "size", "weight", "color", "indoor", "outdoor"];
    const out = [];

    for (const k of preferredKeys) {
      if (specsObj && Object.prototype.hasOwnProperty.call(specsObj, k)) {
        const v = specsObj[k];
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          out.push([k, v]);
        }
      }
      if (out.length >= 4) break;
    }

    if (out.length < 4 && specsObj && typeof specsObj === "object") {
      for (const [k, v] of Object.entries(specsObj)) {
        if (out.some(([ek]) => ek === k)) continue;
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          out.push([k, v]);
        }
        if (out.length >= 4) break;
      }
    }

    return out;
  }

  function labelize(key) {
    return String(key)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function renderGallery(images, name) {
    elThumbs.innerHTML = "";

    const fallback = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`
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

  function renderSpecs(specsObj) {
    elSpecGrid.innerHTML = "";
    if (!specsObj || typeof specsObj !== "object") {
      elSpecGrid.innerHTML = `<p class="muted">Geen specs beschikbaar.</p>`;
      return;
    }

    const entries = Object.entries(specsObj)
      .filter(([, v]) => v != null && v !== "")
      .slice(0, 60);

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

  function renderHighlights(specsObj) {
    elHighlights.innerHTML = "";
    const items = toHighlights(specsObj);
    if (!items.length) return;

    items.forEach(([k, v]) => {
      const pill = document.createElement("div");
      pill.className = "pill";
      pill.textContent = `${labelize(k)}: ${typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}`;
      elHighlights.appendChild(pill);
    });
  }

  async function fetchProduct(slug) {
    const res = await fetch(`${API_BASE}/products/${encodeURIComponent(slug)}`, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) {
      // 404/403 etc.
      throw new Error(`HTTP_${res.status}`);
    }
    return await res.json();
  }

  function addToCart(product) {
    const cart = readCart();
    const images = normalizeImageList(product.images_json);
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
        meta: {} // later: configurator snapshot
      });
    }

    writeCart(cart);
    toastAdded();
  }

  async function init() {
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

      // UI fill
      document.title = `${p.name} — Sport in a Box`;

      elCategory.textContent = p.category ? String(p.category) : "";
      elName.textContent = p.name || "";
      elPrice.textContent = formatPrice(p.price_cents, p.currency);
      elDescription.textContent = p.description || "";

      const specs = safeJsonParse(p.specs_json, {});
      renderHighlights(specs);
      renderSpecs(specs);

      const images = normalizeImageList(p.images_json);
      renderGallery(images, p.name);

      btnAdd.onclick = () => addToCart(p);
      btnCopy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          btnCopy.textContent = "Copied";
          window.setTimeout(() => (btnCopy.textContent = "Copy link"), 900);
        } catch {
          // fallback: do nothing
        }
      };

      setVisible(elLoading, false);
      setVisible(elError, false);
      setVisible(elProduct, true);
    } catch (e) {
      setVisible(elLoading, false);
      setVisible(elProduct, false);
      setVisible(elError, true);
    }
  }

  init();
})();
