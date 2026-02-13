// app.js

// Year in footer (safe)
document.getElementById("year")?.textContent = new Date().getFullYear();

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

/* Hero AI-style search (scoring on live catalog from products.js)
   Requires: products.js loaded before app.js (window.SIB.getCatalogForAI)
*/
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

    if (tokens.includes("hygiëne") || tokens.includes("hygiene") || tokens.includes("spray") || tokens.includes("desinfect")) {
      if (hay.includes("hygiëne") || hay.includes("hygiene") || hay.includes("spray") || hay.includes("desinfect")) score += 10;
    }
    if (tokens.includes("sport") || tokens.includes("training") || tokens.includes("fitness")) {
      if (hay.includes("sport") || hay.includes("training") || hay.includes("fitness")) score += 8;
    }

    return score;
  }

  async function runHeroSearch() {
    const input = document.getElementById("heroSearchInput");
    const btn = document.getElementById("heroSearchBtn");
    const status = document.getElementById("heroSearchStatus");
    const resultsEl = document.getElementById("heroSearchResults");
    if (!input || !btn || !status || !resultsEl) return;

    async function doSearch() {
      const query = (input.value || "").trim();
      if (query.length < 2) return;

      status.textContent = "Even zoeken…";
      resultsEl.innerHTML = "";

      try {
        if (!window.SIB || typeof window.SIB.getCatalogForAI !== "function") {
          status.textContent = "Products.js is nog niet geladen op deze pagina.";
          return;
        }

        const catalog = await window.SIB.getCatalogForAI();
        const tokens = tokenize(query);
        const maxPrice = extractMaxPriceEUR(query);

        const ranked = catalog
          .map((p) => ({ p, s: scoreProduct(p, tokens, maxPrice) }))
          .sort((a, b) => b.s - a.s)
          .slice(0, 6)
          .filter((x) => x.s > 0);

        if (!ranked.length) {
          status.textContent = `Geen sterke matches voor: "${query}". Probeer iets specifieker.`;
          return;
        }

        status.textContent = `Top suggesties voor: "${query}"`;
        resultsEl.innerHTML = ranked.map(({ p }) => {
          const href = `./product.html?slug=${encodeURIComponent(p.slug)}`;
          const price = euroFromCents(p.price_cents, p.currency || "EUR");
          const reason = maxPrice != null
            ? ((Number(p.price_cents || 0) / 100) <= maxPrice ? `Binnen jouw budget (≤ €${maxPrice}).` : `Lijkt relevant op basis van je omschrijving.`)
            : `Lijkt relevant op basis van je omschrijving.`;

          return `
            <a class="hero-search__card" href="${href}">
              ${p.image ? `<img class="hero-search__img" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" />` : ""}
              <div class="hero-search__body">
                <div class="hero-search__title">${esc(p.name)}</div>
                <div class="hero-search__meta">${esc(price)}</div>
                <div class="hero-search__reason">${esc(reason)}</div>
              </div>
            </a>
          `;
        }).join("");
      } catch (e) {
        console.error(e);
        status.textContent = "Zoeken mislukt. Probeer opnieuw.";
      }
    }

    btn.addEventListener("click", doSearch);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSearch();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runHeroSearch);
  } else {
    runHeroSearch();
  }
})();
