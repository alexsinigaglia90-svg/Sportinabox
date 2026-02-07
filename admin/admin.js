(() => {
  "use strict";

  const API_BASE = "https://sportinabox-api.alex-sinigaglia90.workers.dev";
  const TOKEN_KEY = "sib_admin_jwt";

  const $ = (id) => document.getElementById(id);

  // Views
  const loginView = $("loginView");
  const appView = $("appView");

  // Login
  const loginEmail = $("loginEmail");
  const loginPassword = $("loginPassword");
  const loginBtn = $("loginBtn");

  // Session
  const logoutBtn = $("logoutBtn");
  const meLabel = $("meLabel");

  // Nav
  const navProducts = $("navProducts");
  const navAnalytics = $("navAnalytics");
  const navSettings = $("navSettings");
  const navCount = $("navCount");

  // Sections
  const viewProducts = $("viewProducts");
  const viewAnalytics = $("viewAnalytics");
  const viewSettings = $("viewSettings");

  // Products table
  const productsTbody = $("productsTbody");
  const productsState = $("productsState");
  const refreshBtn = $("refreshBtn");
  const newProductBtn = $("newProductBtn");

  // Editor
  const editorWrap = $("editorWrap");
  const editorTitle = $("editorTitle");
  const editorSub = $("editorSub");
  const cancelEditBtn = $("cancelEditBtn");
  const saveBtn = $("saveBtn");

  // Fields
  const fName = $("fName");
  const fSlug = $("fSlug");
  const fCategory = $("fCategory");
  const fCurrency = $("fCurrency");
  const fPrice = $("fPrice");
  const fDescription = $("fDescription");
  const fHighlights = $("fHighlights");
  const fSpecsJson = $("fSpecsJson");
  const fStatus = $("fStatus");

  // Images
  const fImageFiles = $("fImageFiles");
  const uploadImagesBtn = $("uploadImagesBtn");
  const uploadState = $("uploadState");
  const imageGrid = $("imageGrid");

  // Toast
  const globalToast = $("globalToast");

  // Basic guards (als er iets niet bestaat, dan niet hard crashen)
  if (!loginView || !appView) {
    console.error("Admin UI: loginView/appView not found. Check admin/index.html ids.");
    return;
  }

  let state = {
    me: null,
    products: [],
    editing: null, // product object
    images: [], // array of URLs
    activeTab: "core",
  };

  function token() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function show(el, yes) {
    if (!el) return;
    el.classList.toggle("state--hidden", !yes);
  }

  function toast(msg) {
    if (!globalToast) return;
    globalToast.textContent = String(msg || "");
    globalToast.classList.add("is-visible");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => globalToast.classList.remove("is-visible"), 1400);
  }

  function authHeaders() {
    const t = token();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[m]));
  }

  function slugify(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  function priceToCents(input) {
    // accepteert "29,99" of "29.99" of "2999"
    const raw = String(input || "").trim();
    if (!raw) return 0;
    if (/^\d+$/.test(raw) && raw.length >= 3) return Number(raw); // al cents
    const norm = raw.replace(".", ",");
    const parts = norm.split(",");
    const euros = Number(parts[0] || 0);
    const cents = Number((parts[1] || "0").padEnd(2, "0").slice(0, 2));
    return euros * 100 + cents;
  }

  function centsToPretty(cents) {
    const n = (Number(cents || 0) / 100);
    return n.toFixed(2).replace(".", ",");
  }

  function safeJsonParse(text, fallback) {
    if (text == null) return fallback;
    if (typeof text === "object") return text;
    try { return JSON.parse(text); } catch { return fallback; }
  }

  async function api(path, opts = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers: {
        Accept: "application/json",
        ...(opts.headers || {}),
      },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`API ${path} ${res.status} ${txt}`);
    }
    return res.json();
  }

  async function login() {
    if (!loginEmail || !loginPassword) throw new Error("Login fields missing in HTML.");
    const email = loginEmail.value.trim();
    const password = loginPassword.value;

    const data = await api("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!data.token) throw new Error("No token returned");
    localStorage.setItem(TOKEN_KEY, data.token);
  }

  async function fetchMe() {
    return api("/auth/me", { headers: { ...authHeaders() } });
  }

  async function fetchAdminProducts() {
    return api("/admin/products", { headers: { ...authHeaders() } });
  }

  function setRoute(hash) {
    const h = (hash || "#products").toLowerCase();

    if (navProducts) navProducts.classList.toggle("is-active", h.startsWith("#products"));
    if (navAnalytics) navAnalytics.classList.toggle("is-active", h.startsWith("#analytics"));
    if (navSettings) navSettings.classList.toggle("is-active", h.startsWith("#settings"));

    show(viewProducts, h.startsWith("#products"));
    show(viewAnalytics, h.startsWith("#analytics"));
    show(viewSettings, h.startsWith("#settings"));
  }

  function renderProductsTable() {
    if (!productsTbody) return;
    productsTbody.innerHTML = "";

    const rows = state.products || [];
    if (navCount) navCount.textContent = rows.length ? String(rows.length) : "0";

    for (const p of rows) {
      const tr = document.createElement("tr");
      const tagClass = p.status === "published" ? "tag published" : "tag draft";
      const price = `€ ${centsToPretty(p.price_cents)}`;

      tr.innerHTML = `
        <td><b>${escapeHtml(p.name || "")}</b></td>
        <td>${escapeHtml(p.slug || "")}</td>
        <td>${escapeHtml(p.category || "")}</td>
        <td><span class="${tagClass}">${escapeHtml(p.status || "")}</span></td>
        <td>${price}</td>
        <td>
          <button class="pillbtn" data-edit="${p.id}" type="button">Edit</button>
          <button class="pillbtn" data-del="${p.id}" type="button">Delete</button>
        </td>
      `;
      productsTbody.appendChild(tr);
    }

    if (productsState) {
      productsState.textContent = rows.length
        ? `${rows.length} product(en)`
        : "Nog geen producten.";
    }
  }

  function setActiveTab(tab) {
    state.activeTab = tab;

    document.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-tab") === tab);
    });

    ["core", "content", "images", "specs", "publish"].forEach((t) => {
      const el = document.getElementById(`tab_${t}`);
      if (el) el.style.display = (t === tab) ? "block" : "none";
    });
  }

  function renderImageGrid() {
    if (!imageGrid) return;
    imageGrid.innerHTML = "";

    const list = state.images || [];
    if (!list.length) {
      imageGrid.innerHTML = `<p class="muted">Nog geen images. Upload vanaf je schijf.</p>`;
      return;
    }

    list.forEach((url, idx) => {
      const card = document.createElement("div");
      card.className = "imgcard";
      card.innerHTML = `
        <img src="${url}" alt="" />
        <div class="imgactions">
          <button class="iconbtn" type="button" data-up="${idx}" title="Move up">↑</button>
          <button class="iconbtn" type="button" data-down="${idx}" title="Move down">↓</button>
          <button class="iconbtn" type="button" data-rm="${idx}" title="Remove">✕</button>
        </div>
      `;
      imageGrid.appendChild(card);
    });
  }

  function openEditor(product) {
    if (!editorWrap) return;

    editorWrap.classList.remove("state--hidden");
    state.editing = product || {
      id: null,
      slug: "",
      name: "",
      description: "",
      price_cents: 0,
      currency: "EUR",
      category: "",
      specs_json: "{}",
      images_json: "[]",
      status: "draft",
    };

    const p = state.editing;

    if (editorTitle) editorTitle.textContent = p.id ? "Edit product" : "New product";
    if (editorSub) editorSub.textContent = p.id ? `ID: ${p.id}` : "Nog niet opgeslagen";

    if (fName) fName.value = p.name || "";
    if (fSlug) fSlug.value = p.slug || "";
    if (fCategory) fCategory.value = p.category || "";
    if (fCurrency) fCurrency.value = p.currency || "EUR";
    if (fPrice) fPrice.value = centsToPretty(p.price_cents || 0);
    if (fDescription) fDescription.value = p.description || "";

    const specs = safeJsonParse(p.specs_json, {});
    const hl = Array.isArray(specs.highlights) ? specs.highlights.join("\n") : "";
    if (fHighlights) fHighlights.value = hl;

    // Specs editor: laat de specs zo “mooi” mogelijk zien
    if (fSpecsJson) fSpecsJson.value = JSON.stringify(specs || {}, null, 2);

    if (fStatus) fStatus.value = p.status || "draft";

    // Images
    state.images = safeJsonParse(p.images_json, []);
    renderImageGrid();

    if (uploadState) uploadState.textContent = "—";
    if (fImageFiles) fImageFiles.value = "";

    setActiveTab("core");
  }

  function closeEditor() {
    if (editorWrap) editorWrap.classList.add("state--hidden");
    state.editing = null;
    state.images = [];
  }

  function validateSpecsJson() {
    const raw = (fSpecsJson?.value || "").trim();
    if (!raw) return { ok: true, obj: {} };
    try {
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return { ok: false, msg: "Specs JSON must be an object." };
      return { ok: true, obj };
    } catch {
      return { ok: false, msg: "Invalid JSON (check commas/quotes)." };
    }
  }

  function collectEditorPayload() {
    const name = (fName?.value || "").trim();
    const slug = (fSlug?.value || "").trim();
    const category = (fCategory?.value || "").trim();
    const currency = ((fCurrency?.value || "EUR").trim() || "EUR").toUpperCase();
    const price_cents = priceToCents(fPrice?.value || "");

    const description = (fDescription?.value || "").trim();
    const status = (fStatus?.value || "draft").trim();

    const v = validateSpecsJson();
    if (!v.ok) throw new Error(v.msg);

    // highlights: store in specs as array
    const highlights = (fHighlights?.value || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const specsObj = { ...(v.obj || {}) };
    if (highlights.length) specsObj.highlights = highlights;
    else delete specsObj.highlights;

    const specs_json = JSON.stringify(specsObj);
    const images_json = JSON.stringify(state.images || []);

    if (!name) throw new Error("Name is required");
    if (!slug) throw new Error("Slug is required");
    if (!category) throw new Error("Category is required");
    if (!Number.isFinite(price_cents) || price_cents <= 0) throw new Error("Price is required");

    return {
      slug,
      name,
      description,
      price_cents,
      currency,
      category,
      specs_json,
      images_json,
      status,
    };
  }

  async function saveProduct() {
    const p = state.editing;
    if (!p) return;

    const payload = collectEditorPayload();

    if (p.id) {
      await api(`/admin/products/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      toast("Saved");
    } else {
      await api(`/admin/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      toast("Created");
    }

    await loadProducts();
    closeEditor();
  }

  async function deleteProduct(id) {
    await api(`/admin/products/${id}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    });
    toast("Deleted");
    await loadProducts();
  }

  async function loadProducts() {
    if (productsState) productsState.textContent = "Loading…";
    const data = await fetchAdminProducts();
    state.products = data.results || [];
    renderProductsTable();
    if (productsState) productsState.textContent = "—";
  }

  async function uploadSelectedImages() {
    if (!fImageFiles) return;

    const files = fImageFiles.files;
    if (!files || !files.length) {
      if (uploadState) uploadState.textContent = "Selecteer eerst één of meerdere images.";
      return;
    }

    if (uploadState) uploadState.textContent = `Uploading ${files.length} image(s)…`;

    for (const file of files) {
      const form = new FormData();
      form.append("file", file, file.name);

      const res = await fetch(`${API_BASE}/admin/images`, {
        method: "POST",
        headers: { ...authHeaders() },
        body: form,
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Upload failed (${res.status}) ${t}`);
      }

      const data = await res.json().catch(() => null);
      if (!data || !data.url) throw new Error("Upload response missing url");

      state.images.push(data.url);
      renderImageGrid();
    }

    if (uploadState) uploadState.textContent = "Upload complete.";
    fImageFiles.value = "";
    toast("Images uploaded");
  }

  function wireEditorTabs() {
    document.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => setActiveTab(btn.getAttribute("data-tab")));
    });
  }

  function wireTableActions() {
    if (!productsTbody) return;

    productsTbody.addEventListener("click", async (e) => {
      const edit = e.target.closest("[data-edit]");
      const del = e.target.closest("[data-del]");

      if (edit) {
        const id = Number(edit.getAttribute("data-edit"));
        const p = (state.products || []).find((x) => x.id === id);
        if (p) openEditor(p);
      }

      if (del) {
        const id = Number(del.getAttribute("data-del"));
        if (!Number.isFinite(id)) return;
        if (!confirm("Delete this product?")) return;
        await deleteProduct(id);
      }
    });

    if (!imageGrid) return;
    imageGrid.addEventListener("click", (e) => {
      const up = e.target.closest("[data-up]");
      const down = e.target.closest("[data-down]");
      const rm = e.target.closest("[data-rm]");

      if (up) {
        const i = Number(up.getAttribute("data-up"));
        if (i > 0) {
          const tmp = state.images[i - 1];
          state.images[i - 1] = state.images[i];
          state.images[i] = tmp;
          renderImageGrid();
        }
      }
      if (down) {
        const i = Number(down.getAttribute("data-down"));
        if (i < state.images.length - 1) {
          const tmp = state.images[i + 1];
          state.images[i + 1] = state.images[i];
          state.images[i] = tmp;
          renderImageGrid();
        }
      }
      if (rm) {
        const i = Number(rm.getAttribute("data-rm"));
        state.images.splice(i, 1);
        renderImageGrid();
      }
    });
  }

  function wireCoreUX() {
    if (!fName || !fSlug) return;

    let slugTouched = false;
    fSlug.addEventListener("input", () => { slugTouched = true; });

    fName.addEventListener("input", () => {
      if (!slugTouched) fSlug.value = slugify(fName.value);
    });
  }

  async function startApp() {
    show(loginView, false);
    show(appView, true);

    state.me = await fetchMe();
    if (meLabel) {
      meLabel.textContent = state.me?.email ? `Signed in as ${state.me.email}` : "Signed in";
    }

    await loadProducts();
  }

  async function boot() {
    // Routing
    window.addEventListener("hashchange", () => setRoute(location.hash));
    setRoute(location.hash || "#products");

    wireEditorTabs();
    wireTableActions();
    wireCoreUX();

    if (loginBtn) {
      loginBtn.addEventListener("click", async () => {
        try {
          await login();
          await startApp();
          toast("Logged in");
        } catch (e) {
          console.error(e);
          toast(e?.message || "Login failed");
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        localStorage.removeItem(TOKEN_KEY);
        location.hash = "#products";
        show(appView, false);
        show(loginView, true);
      });
    }

    if (refreshBtn) refreshBtn.addEventListener("click", loadProducts);
    if (newProductBtn) newProductBtn.addEventListener("click", () => openEditor(null));
    if (cancelEditBtn) cancelEditBtn.addEventListener("click", closeEditor);

    if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
        try {
          await saveProduct();
        } catch (e) {
          console.error(e);
          toast(e?.message || "Save failed");
        }
      });
    }

    if (uploadImagesBtn) {
      uploadImagesBtn.addEventListener("click", async () => {
        try {
          await uploadSelectedImages();
        } catch (e) {
          console.error(e);
          if (uploadState) uploadState.textContent = e?.message || "Upload failed";
          toast(e?.message || "Upload failed");
        }
      });
    }

    // Auto-login attempt
    if (token()) {
      try {
        await startApp();
      } catch (e) {
        console.error(e);
        show(loginView, true);
        show(appView, false);
        toast("Session expired — please login");
      }
    } else {
      show(loginView, true);
      show(appView, false);
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
