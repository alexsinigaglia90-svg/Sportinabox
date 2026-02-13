// app.js — Sport in a Box (full, upgraded)

// Footer year (safe)
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

// Smooth scroll for in-page anchors
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (e) => {
    const href = link.getAttribute("href");
    if (!href || href === "#") return;

    const target = document.querySelector(href);
    if (!target) return;

    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth" });
  });
});

/* =========================
   Hero AI-style product search — upgraded
   - Typeahead (debounced)
   - Suggestion chips
   - Highlight matches
   - Confidence meter
   - Keyboard navigation (↑ ↓ Enter Esc)
   - Skeleton loading
   - Catalog caching
   Requires: products.js loaded first (window.SIB.getCatalogForAI)
   ========================= */
(function () {
  function euroFromCents(cents, currency = "EUR") {
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

  function extractMaxPriceEUR(q) {
    const m1 = q.match(/(?:onder|max|under)\s*€?\s*(\d+(?:[.,]\d+)?)/i);
    const m2 = q.match(/€\s*(\d+(?:[.,]\d+)?)/i);
    const raw = (m1?.[1] || m2?.[1] || "").replace(",", ".");
    const v = raw ? Number(raw) : NaN;
    return Number.isFinite(v) ? v : null;
  }

  function tokenize(q) {
    return q
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s€]/gu, " ")
      .split(/\s+/)
      .filter(Boolean);
  }

  function scoreProduct(p, tokens, maxPrice) {
    const hay = `${p.name} ${p.description || ""}`.toLowerCase();
    let score = 0;

    for (const t of tokens) {
      if (t.length < 2) continue;
      if (hay.includes(t)) score += 12;
    }

    if (maxPrice != null) {
      const eur = (Number(p.price_cents || 0) / 100);
      if (eur <= maxPrice) score += 18;
      else score -= Math.min(25, Math.round((eur - maxPrice) * 2));
    }

    // Soft intent boosts
    if (tokens.some((t) => ["hygiëne", "hygiene", "spray", "desinfect", "handgel"].includes(t))) {
      if (hay.match(/hygiëne|hygiene|spray|desinfect|handgel/)) score += 10;
    }
    if (tokens.some((t) => ["sport", "training", "fitness", "run", "rennen", "voetbal", "basketbal"].includes(t))) {
      if (hay.match(/sport|training|fitness|run|rennen|voetbal|basketbal/)) score += 8;
    }

    return score;
  }

  function highlight(text, tokens) {
    const safe = esc(text);
    const tks = tokens.filter((t) => t.length >= 2).slice(0, 6);
    if (!tks.length) return safe;

    let out = safe;
    for (const t of tks) {
      const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
      out = out.replace(re, `<span class="hero-search__hl">$1</span>`);
    }
    return out;
  }

  function skeletonsHTML(n = 6) {
    return Array.from({ length: n })
      .map(
        () => `
      <div class="hero-search__skeleton" aria-hidden="true">
        <div class="hero-search__skImg"></div>
        <div>
          <div class="hero-search__skLine lg"></div>
          <div class="hero-search__skLine md"></div>
          <div class="hero-search__skLine sm"></div>
        </div>
      </div>
    `
      )
      .join("");
  }

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  let catalogCache = null;
  let activeIndex = -1;

  async function getCatalog() {
    if (catalogCache) return catalogCache;
    catalogCache = await window.SIB.getCatalogForAI();
    return catalogCache;
  }

  function renderChips(container, onPick) {
    const suggestions = [
      "hygiëne spray",
      "handschoenen maat M",
      "Nike onder €50",
      "desinfect handgel",
      "sport tape",
      "bal"
    ];

    container.innerHTML = `
      <div class="hero-search__chips" aria-label="Suggesties">
        ${suggestions
          .map((s) => `<button type="button" class="hero-search__chip" data-q="${esc(s)}">Probeer: ${esc(s)}</button>`)
          .join("")}
      </div>
    `;

    container.querySelectorAll(".hero-search__chip").forEach((btn) => {
      btn.addEventListener("click", () => onPick(btn.getAttribute("data-q") || ""));
    });
  }

  function setActive(resultsEl, idx) {
    const cards = [...resultsEl.querySelectorAll(".hero-search__card")];
    cards.forEach((c) => c.classList.remove("is-active"));
    if (!cards.length) {
      activeIndex = -1;
      return;
    }
    activeIndex = Math.max(0, Math.min(idx, cards.length - 1));
    cards[activeIndex].classList.add("is-active");
    cards[activeIndex].scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function initHeroSearch() {
    const input = document.getElementById("heroSearchInput");
    const btn = document.getElementById("heroSearchBtn");
    const status = document.getElementById("heroSearchStatus");
    const resultsEl = document.getElementById("heroSearchResults");
    if (!input || !btn || !status || !resultsEl) return;

    if (!window.SIB || typeof window.SIB.getCatalogForAI !== "function") {
      status.textContent = "Products.js is nog niet geladen op deze pagina.";
      return;
    }

    // Add chips container right under status (no HTML changes needed)
    const chipsHost = document.createElement("div");
    status.insertAdjacentElement("afterend", chipsHost);
    renderChips(chipsHost, (q) => {
      input.value = q;
      doSearch(true);
      input.focus();
    });

    let debounceTimer = null;

    async function doSearch(force = false) {
      const query = (input.value || "").trim();

      if (!force && query.length < 2) {
        status.textContent = "Tip: typ wat je zoekt — of klik op een suggestie.";
        resultsEl.innerHTML = "";
        activeIndex = -1;
        return;
      }

      status.textContent = "Even zoeken…";
      resultsEl.innerHTML = skeletonsHTML(6);
      activeIndex = -1;

      try {
        const catalog = await getCatalog();
        const tokens = tokenize(query);
        const maxPrice = extractMaxPriceEUR(query);

        const ranked = catalog
          .map((p) => ({ p, s: scoreProduct(p, tokens, maxPrice) }))
          .sort((a, b) => b.s - a.s)
          .slice(0, 9)
          .filter((x) => x.s > 0);

        if (!ranked.length) {
          status.textContent = `Geen sterke matches voor: "${query}".`;
          resultsEl.innerHTML = "";
          return;
        }

        status.textContent = `Suggesties voor: "${query}"`;

        const maxS = Math.max(...ranked.map((x) => x.s));
        resultsEl.innerHTML = ranked
          .map(({ p, s }) => {
            const href = `./product.html?slug=${encodeURIComponent(p.slug)}`;
            const price = euroFromCents(p.price_cents, p.currency || "EUR");
            const conf = clamp01(s / (maxS || 1));
            const meterW = Math.round(25 + conf * 70); // 25–95%

            return `
              <a class="hero-search__card" href="${href}" data-card="1">
                ${p.image ? `<img class="hero-search__img" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" />` : ""}
                <div class="hero-search__body">
                  <div class="hero-search__title">${highlight(p.name, tokens)}</div>
                  <div class="hero-search__meta">${esc(price)}</div>
                  <div class="hero-search__reason">${highlight((p.description || "").slice(0, 60), tokens)}</div>
                  <div class="hero-search__meter" aria-hidden="true">
                    <div class="hero-search__meterFill" style="width:${meterW}%"></div>
                  </div>
                </div>
              </a>
            `;
          })
          .join("");

        // set first active for keyboard navigation
        setActive(resultsEl, 0);
      } catch (e) {
        console.error(e);
        status.textContent = "Zoeken mislukt. Probeer opnieuw.";
        resultsEl.innerHTML = "";
      }
    }

    // Click search button
    btn.addEventListener("click", () => doSearch(true));

    // Typeahead with debounce
    input.addEventListener("input", () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => doSearch(false), 180);
    });

    // Keyboard navigation + enter
    input.addEventListener("keydown", (e) => {
      const cards = resultsEl.querySelectorAll(".hero-search__card");

      if (e.key === "Enter") {
        if (cards.length && activeIndex >= 0) {
          e.preventDefault();
          cards[activeIndex].click();
          return;
        }
        doSearch(true);
        return;
      }

      if (e.key === "ArrowDown" && cards.length) {
        e.preventDefault();
        setActive(resultsEl, activeIndex + 1);
        return;
      }

      if (e.key === "ArrowUp" && cards.length) {
        e.preventDefault();
        setActive(resultsEl, activeIndex - 1);
        return;
      }

      if (e.key === "Escape") {
        status.textContent = "";
        resultsEl.innerHTML = "";
        activeIndex = -1;
        input.blur();
      }
    });

    // initial state
    status.textContent = "Tip: typ wat je zoekt — of klik op een suggestie.";

    // preload catalog after first paint (makes first query feel instant)
    window.setTimeout(() => {
      getCatalog().catch(() => {});
    }, 350);
  }

  // Robust init
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeroSearch);
  } else {
    initHeroSearch();
  }
})();
