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
  const navHome = $("navHome");
  const navProducts = $("navProducts");
  const navOrders = $("navOrders");
  const navInventory = $("navInventory");
  const navCustomers = $("navCustomers");
  const navContent = $("navContent");
  const navAnalytics = $("navAnalytics");
  const navSettings = $("navSettings");
  const navCount = $("navCount");

  // Sections
  const viewHome = $("viewHome");
  const viewProducts = $("viewProducts");
  const viewOrders = $("viewOrders");
  const viewInventory = $("viewInventory");
  const viewCustomers = $("viewCustomers");
  const viewContent = $("viewContent");
  const viewAnalytics = $("viewAnalytics");
  const viewSettings = $("viewSettings");

  // Products table
  const productsTbody = $("productsTbody");
  const productsListPanel = $("productsListPanel");
  const pagePrev = $("pagePrev");
  const pageNext = $("pageNext");
  const pageInfo = $("pageInfo");
  const pageSize = $("pageSize");
  const saveState = $("saveState");

  const productsState = $("productsState");
  const refreshBtn = $("refreshBtn");
  const newProductBtn = $("newProductBtn");

  // Products toolbar
  const productsSearch = $("productsSearch");
  const filterAll = $("filterAll");
  const filterPublished = $("filterPublished");
  const filterDraft = $("filterDraft");
  const selectAll = $("selectAll");
  const quickPublishBtn = $("quickPublishBtn");
  const duplicateBtn = $("duplicateBtn");

  // Editor
  const editorWrap = $("editorWrap");
  const editorTitle = $("editorTitle");
  const editorSub = $("editorSub");
  const cancelEditBtn = $("cancelEditBtn");
  const saveBtn = $("saveBtn");
  const discardBtn = $("discardBtn");
  const unsavedBadge = $("unsavedBadge");

  const formErrors = $("formErrors");
  const slugError = $("slugError");

  // Preview
  const previewImg = $("previewImg");
  const previewStatus = $("previewStatus");
  const previewName = $("previewName");
  const previewMeta = $("previewMeta");
  const previewPrice = $("previewPrice");
  const previewDesc = $("previewDesc");

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
  const fVendor = $("fVendor");
  const fType = $("fType");
  const fCollections = $("fCollections");
  const fTags = $("fTags");
  const fTrackQty = $("fTrackQty");
  const fQuantity = $("fQuantity");

  // Images
  const fImageFiles = $("fImageFiles");
  const pickImagesBtn = $("pickImagesBtn");
  const dropzone = $("dropzone");
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
    listQuery: "",
    listStatus: "all", // all | published | draft
    page: 1,
    pageSize: 25,
    selected: new Set(),
    pendingImageFiles: [],
    dirty: false,
    originalPayload: null,
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

  function setDirty(yes) {
    state.dirty = !!yes;
    if (unsavedBadge) show(unsavedBadge, state.dirty);
    if (saveBtn) saveBtn.disabled = !state.dirty;
  }

  function snapshotPayload() {
    try { return JSON.stringify(collectEditorPayload()); } catch { return null; }
  }

  function bindDirtyTracking() {
    const els = [fName,fSlug,fCategory,fCurrency,fPrice,fDescription,fHighlights,fSpecsJson,fStatus,fVendor,fType,fCollections,fTags,fTrackQty,fQuantity];
    for (const el of els) {
      if (!el) continue;
      const ev = (el.type === "checkbox" || el.tagName === "SELECT") ? "change" : "input";
      el.addEventListener(ev, () => {
        if (el === fTrackQty && fQuantity) { fQuantity.disabled = !fTrackQty.checked; }
        const now = snapshotPayload();
        if (state.originalPayload == null) { setDirty(true); }
        else if (now != null) { setDirty(now !== state.originalPayload);
        if (saveState) saveState.textContent = state.dirty ? "Unsaved changes" : "Saved";
        scheduleLocalAutosave(); }
        else { setDirty(false);
    if (saveState) saveState.textContent = "Saved"; }
        updatePreview();
      });
    }
  }

  function setFormError(msg) {
    if (!formErrors) return;
    if (!msg) {
      formErrors.textContent = "";
      formErrors.classList.add("state--hidden");
      return;
    }
    formErrors.textContent = String(msg);
    formErrors.classList.remove("state--hidden");
  }

  function markFieldInvalid(fieldEl, yes) {
    const wrap = fieldEl?.closest?.(".field");
    if (!wrap) return;
    wrap.classList.toggle("is-invalid", !!yes);
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

  function isSlugTaken(slug, ignoreId) {
    const s = String(slug || "").trim().toLowerCase();
    if (!s) return false;
    return (state.products || []).some((p) => {
      if (ignoreId != null && String(p.id) === String(ignoreId)) return false;
      return String(p.slug || "").toLowerCase() === s;
    });
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

  function prettyToCurrency(cents) {
    return `€ ${centsToPretty(cents)}`;
  }

  
  function filteredProducts() {
    const query = String(state.listQuery || "").trim().toLowerCase();
    const statusFilter = state.listStatus;

    return (state.products || []).filter((p) => {
      if (statusFilter !== "all" && String(p.status || "").toLowerCase() !== statusFilter) return false;
      if (!query) return true;
      const hay = `${p.name || ""} ${p.slug || ""} ${p.category || ""}`.toLowerCase();
      return hay.includes(query);
    });
  }

  function clampPage() {
    const total = filteredProducts().length;
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    return pages;
  }

  function renderPager() {
    const total = filteredProducts().length;
    const pages = clampPage();
    const from = total ? (state.page - 1) * state.pageSize + 1 : 0;
    const to = Math.min(total, state.page * state.pageSize);

    if (pageInfo) pageInfo.textContent = total ? `Showing ${from}–${to} of ${total} (page ${state.page}/${pages})` : "No products";
    if (pagePrev) pagePrev.disabled = state.page <= 1;
    if (pageNext) pageNext.disabled = state.page >= pages;
  }

  function setProductsMode(mode) {
    if (productsListPanel) show(productsListPanel, mode === "list");
  }

  function parseProductsSubroute(hash) {
    const h = (hash || "#products").toLowerCase();
    if (!h.startsWith("#products")) return { kind: "list" };
    let rest = h.slice("#products".length);
    rest = rest.replace(/^\/+/, "");
    if (!rest || rest.startsWith("?") || rest.startsWith("&")) return { kind: "list" };
    const seg = rest.split(/[?&]/)[0];
    if (seg === "new") return { kind: "new" };
    return { kind: "edit", id: seg };
  }

  async function ensureProductsLoaded() {
    if (state.products && Array.isArray(state.products) && state.products.length) return;
    await loadProducts();
  }

  async function handleProductsRoute(hash) {
    const sub = parseProductsSubroute(hash);

    if (sub.kind === "list") {
      setProductsMode("list");
      closeEditor(true);
      return;
    }

    setProductsMode("editor");
    await ensureProductsLoaded();

    if (sub.kind === "new") {
      openEditor(null);
      if (location.hash.toLowerCase() !== "#products/new") location.hash = "#products/new";
      restoreLocalDraftIfAny();
      return;
    }

    const id = decodeURIComponent(String(sub.id || ""));
    const p = (state.products || []).find((x) => String(x.id) === String(id));
    if (!p) {
      toast("Product not found");
      location.hash = "#products";
      return;
    }
    openEditor(p);
    restoreLocalDraftIfAny();
  }

  function draftKey() {
    const id = state.editing && state.editing.id ? String(state.editing.id) : "new";
    return `sib_admin_draft_${id}`;
  }

  let autosaveTimer = null;
  function scheduleLocalAutosave() {
    if (!state.dirty) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try {
        const payload = snapshotPayload();
        if (!payload) return;
        localStorage.setItem(draftKey(), payload);
        if (saveState) saveState.textContent = "Saved locally";
      } catch (_) {}
    }, 700);
  }

  function restoreLocalDraftIfAny() {
    try {
      const raw = localStorage.getItem(draftKey());
      if (!raw) return;
      if (state.originalPayload && raw === state.originalPayload) return;

      const d = JSON.parse(raw);

      if (fName && typeof d.name === "string") fName.value = d.name;
      if (fSlug && typeof d.slug === "string") fSlug.value = d.slug;
      if (fCategory && typeof d.category === "string") fCategory.value = d.category;
      if (fCurrency && typeof d.currency === "string") fCurrency.value = d.currency;
      if (fPrice && typeof d.price_cents === "number") fPrice.value = centsToPretty(d.price_cents);
      if (fDescription && typeof d.description === "string") fDescription.value = d.description;
      if (fStatus && typeof d.status === "string") fStatus.value = d.status;

      const specs = safeJsonParse(d.specs_json || "{}", {});
      if (fVendor && typeof specs.vendor === "string") fVendor.value = specs.vendor;
      if (fType && typeof specs.type === "string") fType.value = specs.type;
      if (fCollections && typeof specs.collections === "string") fCollections.value = specs.collections;
      if (fTags && typeof specs.tags === "string") fTags.value = specs.tags;

      if (saveState) saveState.textContent = "Restored local draft";
      toast("Restored local draft");
      updateSlugValidation();
      updatePreview();
      setDirty(true);
    } catch (_) {}
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

    const is = (prefix) => h === prefix || h.startsWith(prefix + "/") || h.startsWith(prefix + "?") || h.startsWith(prefix + "&") || h.startsWith(prefix);

    if (navHome) navHome.classList.toggle("is-active", is("#home"));
    if (navProducts) navProducts.classList.toggle("is-active", is("#products"));
    if (navOrders) navOrders.classList.toggle("is-active", is("#orders"));
    if (navInventory) navInventory.classList.toggle("is-active", is("#inventory"));
    if (navCustomers) navCustomers.classList.toggle("is-active", is("#customers"));
    if (navContent) navContent.classList.toggle("is-active", is("#content"));
    if (navAnalytics) navAnalytics.classList.toggle("is-active", is("#analytics"));
    if (navSettings) navSettings.classList.toggle("is-active", is("#settings"));

    show(viewHome, is("#home"));
    show(viewProducts, is("#products"));
    show(viewOrders, is("#orders"));
    show(viewInventory, is("#inventory"));
    show(viewCustomers, is("#customers"));
    show(viewContent, is("#content"));
    show(viewAnalytics, is("#analytics"));
    show(viewSettings, is("#settings"));
  }

  
  function renderProductsTable() {
    if (!productsTbody) return;
    productsTbody.innerHTML = "";

    const rowsAll = filteredProducts();
    clampPage();
    const startIdx = (state.page - 1) * state.pageSize;
    const rows = rowsAll.slice(startIdx, startIdx + state.pageSize);

    if (productsState) {
      productsState.textContent = rowsAll.length ? `Filtered: ${rowsAll.length} • Selected: ${state.selected.size}` : "No products";
    }
    renderPager();

    rows.forEach((p) => {
      const tr = document.createElement("tr");

      const tdSel = document.createElement("td");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.selected.has(String(p.id));
      cb.addEventListener("change", () => {
        if (cb.checked) state.selected.add(String(p.id));
        else state.selected.delete(String(p.id));
        updateBulkBar();
        renderProductsTable();
      });
      tdSel.appendChild(cb);
      tr.appendChild(tdSel);

      const tdName = document.createElement("td");
      tdName.innerHTML = `<div style="font-weight:600;">${escapeHtml(p.name || "—")}</div><div class="muted" style="font-size:12px;">${escapeHtml(p.slug || "")}</div>`;
      tr.appendChild(tdName);

      const tdCat = document.createElement("td");
      tdCat.textContent = p.category || "—";
      tr.appendChild(tdCat);

      const tdPrice = document.createElement("td");
      tdPrice.textContent = centsToPretty(Number(p.price_cents || 0), p.currency || "EUR");
      tr.appendChild(tdPrice);

      const tdStatus = document.createElement("td");
      const pill = document.createElement("span");
      pill.className = "statuspill " + (String(p.status).toLowerCase() === "published" ? "is-live" : "is-draft");
      pill.textContent = String(p.status || "draft");
      tdStatus.appendChild(pill);
      tr.appendChild(tdStatus);

      const tdUpdated = document.createElement("td");
      tdUpdated.textContent = p.updated_at ? new Date(p.updated_at).toLocaleString() : "—";
      tr.appendChild(tdUpdated);

      const tdAct = document.createElement("td");
      const edit = document.createElement("button");
      edit.className = "pillbtn is-quiet";
      edit.type = "button";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => {
        location.hash = `#products/${encodeURIComponent(p.id)}`;
      });

      const dup = document.createElement("button");
      dup.className = "pillbtn is-quiet";
      dup.type = "button";
      dup.textContent = "Duplicate";
      dup.style.marginLeft = "8px";
      dup.addEventListener("click", () => duplicateProduct(p));

      tdAct.appendChild(edit);
      tdAct.appendChild(dup);
      tr.appendChild(tdAct);

      productsTbody.appendChild(tr);
    });

    // Products sub-routing
    if (is("#products")) { handleProductsRoute(h).catch((e)=>toast(e?.message||"Route error")); }

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

  // --- Images: drag & drop reorder + remove ---
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
      card.setAttribute("draggable", "true");
      card.dataset.idx = String(idx);

      card.innerHTML = `
        <img src="${url}" alt="" />
        <div class="imgactions">
          <button class="iconbtn" type="button" data-rm="${idx}" title="Remove">✕</button>
        </div>
      `;

      card.addEventListener("dragstart", (e) => {
        card.classList.add("is-dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(idx));
      });

      card.addEventListener("dragend", () => {
        card.classList.remove("is-dragging");
        imageGrid
          .querySelectorAll(".imgcard")
          .forEach((el) => el.classList.remove("is-drop-target"));
      });

      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        card.classList.add("is-drop-target");
      });

      card.addEventListener("dragleave", () => {
        card.classList.remove("is-drop-target");
      });

      card.addEventListener("drop", (e) => {
        e.preventDefault();
        card.classList.remove("is-drop-target");

        const from = Number(e.dataTransfer.getData("text/plain"));
        const to = Number(card.dataset.idx);
        if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return;

        const arr = state.images;
        const [moved] = arr.splice(from, 1);
        arr.splice(to, 0, moved);

        renderImageGrid();
        toast("Image order updated");
      });

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

    // Sidebar organization fields (stored in specs)
    if (fVendor) fVendor.value = specs.vendor || "";
    if (fType) fType.value = specs.product_type || "";
    if (fCollections) fCollections.value = Array.isArray(specs.collections) ? specs.collections.join(", ") : (specs.collections || "");
    if (fTags) fTags.value = Array.isArray(specs.tags) ? specs.tags.join(", ") : (specs.tags || "");

    // Inventory (stored in specs)
    const inv = (specs && typeof specs.inventory === "object") ? specs.inventory : {};
    const track = !!inv.track_quantity;
    const qty = Number.isFinite(Number(inv.quantity)) ? Number(inv.quantity) : 0;
    if (fTrackQty) fTrackQty.checked = track;
    if (fQuantity) { fQuantity.value = String(qty); fQuantity.disabled = !track; }

    // Specs editor: laat de specs zo “mooi” mogelijk zien
    if (fSpecsJson) fSpecsJson.value = JSON.stringify(specs || {}, null, 2);

    if (fStatus) fStatus.value = p.status || "draft";

    // Images
    state.images = safeJsonParse(p.images_json, []);
    renderImageGrid();

    if (uploadState) uploadState.textContent = "—";
    if (fImageFiles) fImageFiles.value = "";
    state.pendingImageFiles = [];
    setFormError("");
    updateSlugValidation();
    updatePreview();

    state.originalPayload = snapshotPayload();
    setDirty(false);

    setActiveTab("core");
  }

  function closeEditor() {
    if (editorWrap) editorWrap.classList.add("state--hidden");
    state.editing = null;
    state.images = [];
  }

  function updateSlugValidation() {
    if (!fSlug) return;
    const s = String(fSlug.value || "").trim();
    const taken = isSlugTaken(s, state.editing?.id);

    const slugField = fSlug.closest?.(".field");
    if (slugField) slugField.classList.toggle("is-invalid", taken);
    if (slugError) slugError.classList.toggle("state--hidden", !taken);
    return !taken;
  }

  function updatePreview() {
    // lightweight, live preview while editing
    if (!state.editing) return;

    const name = (fName?.value || "").trim() || "—";
    const category = (fCategory?.value || "").trim() || "—";
    const slug = (fSlug?.value || "").trim() || "—";
    const status = (fStatus?.value || "draft").trim();
    const desc = (fDescription?.value || "").trim() || "—";
    const priceCents = priceToCents(fPrice?.value || "");
    const cover = (state.images || [])[0] || "";

    if (previewName) previewName.textContent = name;
    if (previewMeta) previewMeta.textContent = `${category} · ${slug}`;
    if (previewStatus) previewStatus.textContent = status;
    if (previewPrice) previewPrice.textContent = priceCents > 0 ? prettyToCurrency(priceCents) : "€ —";
    if (previewDesc) previewDesc.textContent = desc;
    if (previewImg) {
      if (cover) {
        previewImg.src = cover;
        previewImg.style.opacity = "1";
      } else {
        previewImg.removeAttribute("src");
        previewImg.style.opacity = ".55";
      }
    }
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

    // Shopify-like organization fields (stored inside specs to keep API stable)
    const vendor = (fVendor?.value || "").trim();
    const ptype = (fType?.value || "").trim();
    const collections = (fCollections?.value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const tags = (fTags?.value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (vendor) specsObj.vendor = vendor;
    else delete specsObj.vendor;

    if (ptype) specsObj.product_type = ptype;
    else delete specsObj.product_type;

    if (collections.length) specsObj.collections = collections;
    else delete specsObj.collections;

    if (tags.length) specsObj.tags = tags;
    else delete specsObj.tags;

    // Inventory (stored inside specs)
    const track = !!(fTrackQty?.checked);
    const qty = Math.max(0, Number(fQuantity?.value || 0));
    specsObj.inventory = { track_quantity: track, quantity: Number.isFinite(qty) ? qty : 0 };
    if (highlights.length) specsObj.highlights = highlights;
    else delete specsObj.highlights;

    const specs_json = JSON.stringify(specsObj);
    const images_json = JSON.stringify(state.images || []);

    if (!name) throw new Error("Name is required");
    if (!slug) throw new Error("Slug is required");
    if (!updateSlugValidation()) throw new Error("Slug is al in gebruik");
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
      try { localStorage.removeItem(draftKey()); } catch(_) {}
      if (saveState) saveState.textContent = "Saved";
    }

    await loadProducts();
    // stay in editor (route-based)
    renderProductsTable();
  }

  async function bulkTogglePublish() {
    const ids = Array.from(state.selected);
    if (!ids.length) {
      toast("Selecteer eerst producten");
      return;
    }

    const updates = ids
      .map((id) => (state.products || []).find((p) => String(p.id) === String(id)))
      .filter(Boolean);

    for (const p of updates) {
      const next = p.status === "published" ? "draft" : "published";
      await api(`/admin/products/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          slug: p.slug,
          name: p.name,
          description: p.description || "",
          price_cents: p.price_cents,
          currency: p.currency || "EUR",
          category: p.category || "",
          specs_json: p.specs_json || "{}",
          images_json: p.images_json || "[]",
          status: next,
        }),
      });
    }

    toast("Updated");
      try { localStorage.removeItem(draftKey()); } catch(_) {}
      if (saveState) saveState.textContent = "Saved";
      location.hash = `#products/${encodeURIComponent(String(state.editing.id))}`;
    state.selected.clear();
    await loadProducts();
  }

  async function duplicateSelected() {
    const ids = Array.from(state.selected);
    if (ids.length !== 1) {
      toast("Selecteer precies 1 product om te dupliceren");
      return;
    }

    const p = (state.products || []).find((x) => String(x.id) === String(ids[0]));
    if (!p) return;

    let baseSlug = `${p.slug}-copy`;
    let slug = baseSlug;
    let i = 2;
    while (isSlugTaken(slug, null)) {
      slug = `${baseSlug}-${i++}`;
    }

    await api(`/admin/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        slug,
        name: `${p.name} (Copy)`,
        description: p.description || "",
        price_cents: p.price_cents,
        currency: p.currency || "EUR",
        category: p.category || "",
        specs_json: p.specs_json || "{}",
        images_json: p.images_json || "[]",
        status: "draft",
      }),
    });

    toast("Duplicated");
    state.selected.clear();
    await loadProducts();
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
    // Fill category datalist
    const dl = document.getElementById("categoryList");
    if (dl) {
      const cats = Array.from(new Set((state.products || []).map((p) => String(p.category || "").trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));
      dl.innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}"></option>`).join("");
    }
    renderProductsTable();
    if (productsState) productsState.textContent = "—";
  }

  async function uploadSelectedImages(filesOverride) {
    const files = filesOverride?.length ? filesOverride : (fImageFiles?.files || state.pendingImageFiles);
    if (!files || !files.length) {
      if (uploadState) uploadState.textContent = "Selecteer eerst één of meerdere images.";
      return;
    }

    if (uploadState) uploadState.textContent = `Uploading ${files.length} image(s)…`;

    for (const file of Array.from(files)) {
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
      updatePreview();
    }

    if (uploadState) uploadState.textContent = "Upload complete.";
    if (fImageFiles) fImageFiles.value = "";
    state.pendingImageFiles = [];
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
      const sel = e.target.closest("[data-sel]");
      const edit = e.target.closest("[data-edit]");
      const del = e.target.closest("[data-del]");

      if (sel) {
        const id = String(sel.getAttribute("data-sel"));
        if (sel.checked) state.selected.add(id);
        else state.selected.delete(id);
        renderProductsTable();
        return;
      }

      if (edit) {
        const id = edit.getAttribute("data-edit");
        const p = (state.products || []).find((x) => String(x.id) === String(id));
        if (p) openEditor(p);
      }

      if (del) {
        const id = del.getAttribute("data-del");
        if (!id) return;
        if (!confirm("Delete this product?")) return;
        await deleteProduct(id);
      }
    });

    if (!imageGrid) return;
    imageGrid.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-rm]");
      if (!rm) return;

      const i = Number(rm.getAttribute("data-rm"));
      if (!Number.isFinite(i)) return;

      state.images.splice(i, 1);
      renderImageGrid();
      toast("Image removed");
    });
  }

  function wireCoreUX() {
    if (!fName || !fSlug) return;

    let slugTouched = false;
    fSlug.addEventListener("input", () => { slugTouched = true; });

    fName.addEventListener("input", () => {
      if (!slugTouched) fSlug.value = slugify(fName.value);
      updateSlugValidation();
      updatePreview();
    });

    fSlug.addEventListener("input", () => {
      updateSlugValidation();
      updatePreview();
    });

    [fCategory, fPrice, fDescription, fStatus].forEach((el) => {
      if (!el) return;
      el.addEventListener("input", updatePreview);
    });

    if (fPrice) {
      fPrice.addEventListener("blur", () => {
        const cents = priceToCents(fPrice.value);
        if (cents > 0) fPrice.value = centsToPretty(cents);
        updatePreview();
      });
    }
  }

  function wireProductsToolbar() {
    const setFilterActive = () => {
      const s = state.listStatus;
      if (filterAll) filterAll.classList.toggle("is-active", s === "all");
      if (filterPublished) filterPublished.classList.toggle("is-active", s === "published");
      if (filterDraft) filterDraft.classList.toggle("is-active", s === "draft");
    };

    if (productsSearch) {
      productsSearch.addEventListener("input", () => {
        state.listQuery = productsSearch.value;
        renderProductsTable();
      });
    }

    if (filterAll) filterAll.addEventListener("click", () => { state.listStatus = "all"; state.page = 1; setFilterActive(); renderProductsTable(); });
    if (filterPublished) filterPublished.addEventListener("click", () => { state.listStatus = "published"; state.page = 1; setFilterActive(); renderProductsTable(); });
    if (filterDraft) filterDraft.addEventListener("click", () => { state.listStatus = "draft"; state.page = 1; setFilterActive(); renderProductsTable(); });

    if (selectAll && productsTbody) {
      selectAll.addEventListener("change", () => {
        const q = String(state.listQuery || "").trim().toLowerCase();
        const statusFilter = state.listStatus;
        const visible = (state.products || []).filter((p) => {
          if (statusFilter !== "all" && String(p.status || "") !== statusFilter) return false;
          if (!q) return true;
          const hay = `${p.name || ""} ${p.slug || ""} ${p.category || ""}`.toLowerCase();
          return hay.includes(q);
        });

        if (selectAll.checked) visible.forEach((p) => state.selected.add(String(p.id)));
        else visible.forEach((p) => state.selected.delete(String(p.id)));
        renderProductsTable();
      });
    }

    if (quickPublishBtn) quickPublishBtn.addEventListener("click", () => bulkTogglePublish().catch((e) => toast(e?.message || "Failed")));
    if (duplicateBtn) duplicateBtn.addEventListener("click", () => duplicateSelected().catch((e) => toast(e?.message || "Failed")));
    if (pagePrev) pagePrev.addEventListener("click", () => { state.page = Math.max(1, state.page - 1); renderProductsTable(); });
    if (pageNext) pageNext.addEventListener("click", () => { state.page = state.page + 1; renderProductsTable(); });
    if (pageSize) pageSize.addEventListener("change", () => {
      const n = Number(pageSize.value);
      state.pageSize = Number.isFinite(n) && n > 0 ? n : 25;
      state.page = 1;
      renderProductsTable();
    });

  }

  function wireImagesUX() {
    if (pickImagesBtn && fImageFiles) {
      pickImagesBtn.addEventListener("click", () => fImageFiles.click());
    }

    if (fImageFiles) {
      fImageFiles.addEventListener("change", () => {
        state.pendingImageFiles = Array.from(fImageFiles.files || []);
        if (uploadState) uploadState.textContent = state.pendingImageFiles.length ? `${state.pendingImageFiles.length} file(s) ready` : "—";
      });
    }

    if (dropzone) {
      const onPick = () => fImageFiles?.click();
      dropzone.addEventListener("click", (e) => {
        if (e.target.closest("button")) return; // buttons handle themselves
        onPick();
      });
      dropzone.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      });

      dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("is-dragover");
      });
      dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragover"));
      dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("is-dragover");
        const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type?.startsWith("image/"));
        state.pendingImageFiles = files;
        if (uploadState) uploadState.textContent = files.length ? `${files.length} dropped — ready to upload` : "—";
      });
    }
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
    wireProductsToolbar();
    wireImagesUX();
    bindDirtyTracking();

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
    if (newProductBtn) newProductBtn.addEventListener("click", () => { location.hash = "#products/new"; });
    if (cancelEditBtn) cancelEditBtn.addEventListener("click", () => { location.hash = "#products"; });
    if (discardBtn) discardBtn.addEventListener("click", () => {
      if (!state.editing) return;
      // reset fields back to original snapshot
      openEditor({ ...state.editing });
      setDirty(false);
      try { localStorage.removeItem(draftKey()); } catch(_) {}
      if (saveState) saveState.textContent = "Discarded";
      toast("Discarded");
    });

    if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
        try {
          setFormError("");
          await saveProduct();
        } catch (e) {
          console.error(e);
          setFormError(e?.message || "Save failed");
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
