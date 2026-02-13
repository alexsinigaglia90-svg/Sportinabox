// app.js — Sport in a Box (full, upgraded + typo-tolerant fuzzy search)

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
   Hero AI-style product search — upgraded + FUZZY TYPO MATCHING
   - Typeahead (debounced)
   - Suggestion chips
   - Highlight matches
   - Confidence meter
   - Keyboard navigation (↑ ↓ Enter Esc)
   - Skeleton loading
   - Catalog caching
   - Fuzzy matching: typos + prefix + synonyms + diacritics normalize
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

  // ---------- Fuzzy helpers ----------
  function stripDiacritics(s) {
    // "hygiëne" -> "hygiene"
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function normalizeText(s) {
    return stripDiacritics(String(s ?? "").toLowerCase())
      .replace(/[^\p{L}\p{N}\s€-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Very fast Levenshtein for short tokens (good enough for search)
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;

    const al = a.length, bl = b.length;
    // Ensure b is shorter for less memory
    if (bl > al) { const t = a; a = b; b = t; }

    const v0 = new Array(b.length + 1);
    const v1 = new Array(b.length + 1);

    for (let i = 0; i <= b.length; i++) v0[i] = i;

    for (let i = 0; i < a.length; i++) {
      v1[0] = i + 1;
      for (let j = 0; j < b.length; j++) {
        const cost = a[i] === b[j] ? 0 : 1;
        v1[j + 1] = Math.min(
          v1[j] + 1,       // insertion
          v0[j + 1] + 1,   // deletion
          v0[j] + cost     // substitution
        );
      }
      for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
    }
    return v1[b.length];
  }

  function fuzzyTokenMatchScore(token, words) {
    // Returns a score contribution for this token:
    // - exact/prefix match => strong
    // - 1–2 char typo match => medium (depending on token length)
    // - no match => 0
    if (!token || token.length < 2) return 0;

    const t = token;

    // Quick exact/prefix checks
    for (const w of words) {
      if (w === t) return 14;
      if (w.startsWith(t) && t.length >= 3) return 11;   // "bal" -> "basketbal"
      if (t.startsWith(w) && w.length >= 3) return 9;    // "basketbal" with token "basket"
      if (w.includes(t) && t.length >= 3) return 10;
    }

    // Typo tolerance via Levenshtein, only for reasonable lengths
    const maxEdits =
      t.length <= 4 ? 1 :
      t.length <= 7 ? 2 : 2;

    let best = 0;
    for (const w of words) {
      const wl = w.length;
      if (wl < 3) continue;

      // avoid expensive compares on huge mismatch
      if (Math.abs(wl - t.length) > 3) continue;

      const d = levenshtein(t, w);
      if (d <= maxEdits) {
        // closer typo -> higher score
        const sc = d === 0 ? 14 : (d === 1 ? 8 : 5);
        if (sc > best) best = sc;
      }
    }
    return best;
  }

  // Synonyms / common misspellings you can extend over time
  const SYN = {
    // hygiene
    "hygiene": ["hygiëne", "hygiene", "sanitair", "desinfect", "desinfectie", "desinfecterend", "sanitize", "sanitizer"],
    "hygiëne": ["hygiëne", "hygiene", "desinfect", "desinfectie", "sanitize", "sanitizer"],
    "desinfect": ["desinfect", "desinfectie", "desinfecterend", "sanitize", "sanitizer", "alcoholgel", "handgel"],
    "handgel": ["handgel", "alcoholgel", "sanitizer", "sanitize"],

    // sports basics
    "bal": ["bal", "voetbal", "basketbal", "handbal", "volleybal", "ball"],
    "voetbal": ["voetbal", "soccer", "bal", "football"],
    "basketbal": ["basketbal", "bal", "basket", "basketball"],

    // gloves
    "handschoen": ["handschoen", "handschoenen", "glove", "gloves"],
    "handschoenen": ["handschoenen", "handschoen", "glove", "gloves"],

    // tape
    "tape": ["tape", "sporttape", "athletic tape", "kinesio", "kinesiotape"]
  };

  function expandTokens(tokens) {
    const out = new Set(tokens);
    for (const t of tokens) {
      const key = t;
      const add = SYN[key];
      if (add) add.forEach(x => out.add(normalizeText(x)));
    }
    return [...out].filter(Boolean);
  }

  function extractMaxPriceEUR(q) {
    const m1 = q.match(/(?:onder|max|under)\s*€?\s*(\d+(?:[.,]\d+)?)/i);
    const m2 = q.match(/€\s*(\d+(?:[.,]\d+)?)/i);
    const raw = (m1?.[1] || m2?.[1] || "").replace(",", ".");
    const v = raw ? Number(raw) : NaN;
    return Number.isFinite(v) ? v : null;
  }

  function tokenize(q) {
    return normalizeText(q).split(/\s+/).filter(Boolean);
  }

  function scoreProduct(p, tokens, maxPrice) {
    const nameN = normalizeText(p.name);
    const descN = normalizeText(p.description || "");

    const nameWords = nameN.split(" ").filter(Boolean);
    const descWords = descN.split(" ").filter(Boolean);

    // tokens expanded w/ synonyms
    const tks = expandTokens(tokens);

    let score = 0;

    // Stronger weight on name matches than description
    for (const t of tks) {
      score += fuzzyTokenMatchScore(t, nameWords) * 1.15;
      score += fuzzyTokenMatchScore(t, descWords) * 0.85;
    }

    // Budget preference
    if (maxPrice != null) {
      const eur = (Number(p.price_cents || 0) / 100);
      if (eur <= maxPrice) score += 18;
      else score -= Math.min(25, Math.round((eur - maxPrice) * 2));
    }

    // Light category boosts based on intent tokens
    const joined = `${nameN} ${descN}`;
    if (tks.some(t => ["hygiëne","hygiene","spray","desinfect","desinfectie","handgel","sanitizer","sanitize"].includes(t))) {
      if (joined.match(/hygi|desinfect|spray|handgel|sanit/i)) score += 10;
    }
    if (tks.some(t => ["sport","training","fitness","run","rennen","voetbal","basketbal","bal","tape"].includes(t))) {
      if (joined.match(/sport|training|fitness|run|rennen|voetbal|basketbal|bal|tape/i)) score += 8;
    }

    return score;
  }

  function highlight(text, tokens) {
    // Highlight is best-effort (doesn't need to be fuzzy)
    const safe = esc(text);
    const tks = tokens.filter(t => t.length >= 2).slice(0, 6);
    if (!tks.length) return safe;

    let out = safe;
    for (const t of tks) {
      const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
      out = out.replace(re, `<span class="hero-search__hl">$1</span>`);
    }
    return out;
  }

  function skeletonsHTML(n = 6) {
    return Array.from({ length: n }).map(() => `
      <div class="hero-search__skeleton" aria-hidden="true">
        <div class="hero-search__skImg"></div>
        <div>
          <div class="hero-search__skLine lg"></div>
          <div class="hero-search__skLine md"></div>
          <div class="hero-search__skLine sm"></div>
        </div>
      </div>
    `).join("");
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
        ${suggestions.map(s => `<button type="button" class="hero-search__chip" data-q="${esc(s)}">Probeer: ${esc(s)}</button>`).join("")}
      </div>
    `;

    container.querySelectorAll(".hero-search__chip").forEach((btn) => {
      btn.addEventListener("click", () => onPick(btn.getAttribute("data-q") || ""));
    });
  }

  function setActive(resultsEl, idx) {
    const cards = [...resultsEl.querySelectorAll(".hero-search__card")];
    cards.forEach((c) => c.classList.remove("is-active"));
    if (!cards.length) { activeIndex = -1; return; }
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

    // Add chips under status (no HTML changes needed)
    const chipsHost = document.createElement("div");
    status.insertAdjacentElement("afterend", chipsHost);
    renderChips(chipsHost, (q) => {
      input.value = q;
      doSearch(true);
      input.focus();
    });

    let debounceTimer = null;

    async function doSearch(force = false) {
      const queryRaw = (input.value || "").trim();
      const query = normalizeText(queryRaw);

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
        const maxPrice = extractMaxPriceEUR(queryRaw);

        const ranked = catalog
          .map((p) => ({ p, s: scoreProduct(p, tokens, maxPrice) }))
          .sort((a, b) => b.s - a.s)
          .slice(0, 9)
          .filter((x) => x.s > 0);

        if (!ranked.length) {
          status.textContent = `Geen sterke matches voor: "${queryRaw}".`;
          resultsEl.innerHTML = "";
          return;
        }

        status.textContent = `Suggesties voor: "${queryRaw}"`;

        const maxS = Math.max(...ranked.map((x) => x.s));
        resultsEl.innerHTML = ranked.map(({ p, s }) => {
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
        }).join("");

        setActive(resultsEl, 0);
      } catch (e) {
        console.error(e);
        status.textContent = "Zoeken mislukt. Probeer opnieuw.";
        resultsEl.innerHTML = "";
      }
    }

    // Click search
    btn.addEventListener("click", () => doSearch(true));

    // Typeahead (debounced)
    input.addEventListener("input", () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => doSearch(false), 180);
    });

    // Keyboard navigation
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

    status.textContent = "Tip: typ wat je zoekt — of klik op een suggestie.";

    // Preload catalog after first paint
    window.setTimeout(() => { getCatalog().catch(() => {}); }, 350);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeroSearch);
  } else {
    initHeroSearch();
  }
})();

// =========================
// Mouse-tracking light physics for .product-card
// =========================
(() => {
  const cards = () => Array.from(document.querySelectorAll(".product-card"));

  function bindCard(card) {
    let raf = 0;

    const setVars = (clientX, clientY) => {
      const r = card.getBoundingClientRect();
      const x = Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
      const y = Math.min(Math.max((clientY - r.top) / r.height, 0), 1);
      card.style.setProperty("--mx", `${(x * 100).toFixed(2)}%`);
      card.style.setProperty("--my", `${(y * 100).toFixed(2)}%`);
    };

    const onMove = (e) => {
      const p = e.touches?.[0] || e;
      if (!p) return;

      // throttle via rAF
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setVars(p.clientX, p.clientY);
      });
    };

    const onEnter = () => card.style.setProperty("--int", "1");
    const onLeave = () => card.style.setProperty("--int", "0");

    // Pointer events: werkt voor mouse + pen
    card.addEventListener("pointerenter", onEnter);
    card.addEventListener("pointerleave", onLeave);
    card.addEventListener("pointermove", onMove);

    // Touch fallback (optioneel, maar veilig)
    card.addEventListener("touchstart", onEnter, { passive: true });
    card.addEventListener("touchend", onLeave, { passive: true });
    card.addEventListener("touchmove", onMove, { passive: true });
  }

  function init() {
    // bind existing cards
    cards().forEach(bindCard);

    // If products grid loads later (AJAX), observe and auto-bind new cards
    const grid = document.querySelector("[data-products-grid]");
    if (!grid) return;

    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (n.classList?.contains("product-card")) bindCard(n);
          n.querySelectorAll?.(".product-card")?.forEach(bindCard);
        });
      }
    });

    mo.observe(grid, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", init);
})();

