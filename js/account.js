// js/account.js — account page: orders + profile + addresses
(() => {
  const $ = (q)=>document.querySelector(q);
  const $$ = (q)=>Array.from(document.querySelectorAll(q));

  function toast(t){ window.SIB_AUTH_UI?.toast?.(t); }

  function fmtEUR(cents){
    const n = Number(cents||0)/100;
    try{ return new Intl.NumberFormat("nl-NL",{style:"currency",currency:"EUR"}).format(n); }
    catch{ return n.toFixed(2)+" EUR"; }
  }

  function setTab(key){
    $$(".account-side .side-item").forEach(b=>b.classList.toggle("is-active", b.dataset.tab===key));
    $$(".account-main .tab").forEach(t=>t.classList.remove("is-active"));
    const el = document.getElementById(`tab-${key}`);
    if(el) el.classList.add("is-active");
    localStorage.setItem("sib_account_tab", key);
  }

  async function loadOrders(){
    const list = $("#ordersList");
    const empty = $("#ordersEmpty");
    if(!list) return;

    list.innerHTML = "";
    try{
      const data = await window.SIB_AUTH.listOrders();
      const orders = data.orders || [];
      if(orders.length===0){
        empty?.classList.remove("is-hidden");
        return;
      }
      empty?.classList.add("is-hidden");

      for(const o of orders){
        const items = o.items || [];
        const itemsLine = items.slice(0,3).map(it=>`${it.qty}× ${it.title}`).join(" • ") + (items.length>3 ? ` • +${items.length-3} more` : "");
        const el = document.createElement("div");
        el.className = "order";
        el.innerHTML = `
          <div class="order__top">
            <div class="order__id">Order <span class="mono">#${o.id.slice(0,8).toUpperCase()}</span></div>
            <div class="order__meta">
              <span class="pill">${o.status}</span>
              <span class="muted">${new Date(o.created_at).toLocaleString("nl-NL")}</span>
            </div>
          </div>
          <div class="order__body">
            <div class="order__items">${itemsLine || "—"}</div>
            <div class="order__total">${fmtEUR(o.total_cents)}</div>
          </div>
        `;
        list.appendChild(el);
      }
    }catch(err){
      toast(err.message || "Could not load orders");
    }
  }

  async function loadProfile(){
    const form = $("#profileForm");
    if(!form) return;
    const hint = $("#profileHint");
    try{
      const me = await window.SIB_AUTH.getMe();
      $("#welcomeLine").textContent = me.user?.name ? `Welcome, ${me.user.name}` : `Welcome, ${me.user.email}`;
      form.elements.name.value = me.user.name || "";
      form.elements.phone.value = me.user.phone || "";
      form.elements.email.value = me.user.email || "";
    }catch{
      window.SIB_AUTH.requireAuth();
    }

    form.addEventListener("submit", async (e)=>{
      e.preventDefault();
      if(hint) hint.textContent = "";
      const name = String(form.elements.name.value||"").trim();
      const phone = String(form.elements.phone.value||"").trim();
      try{
        await window.SIB_AUTH.updateProfile({ name, phone });
        if(hint) hint.textContent = "Saved";
        toast("Profile saved");
      }catch(err){
        if(hint) hint.textContent = err.message || "Save failed";
      }
    });
  }

  let editingAddressId = null;

  function renderAddresses(addrs){
    const list = $("#addressList");
    if(!list) return;
    list.innerHTML = "";
    if(!addrs || addrs.length===0){
      const e = document.createElement("div");
      e.className = "empty";
      e.innerHTML = `<div class="empty-title">No addresses</div><div class="empty-sub">Add an address for faster checkout.</div>`;
      list.appendChild(e);
      return;
    }

    for(const a of addrs){
      const el = document.createElement("div");
      el.className = "address";
      el.innerHTML = `
        <div class="address__top">
          <div class="address__label">${a.label || "Address"} ${a.is_default ? '<span class="pill">Default</span>' : ""}</div>
          <div class="address__actions">
            <button class="btn sm" data-edit="${a.id}" type="button">Edit</button>
            <button class="btn sm" data-del="${a.id}" type="button">Delete</button>
          </div>
        </div>
        <div class="address__body">
          <div>${a.line1}${a.line2 ? " • "+a.line2 : ""}</div>
          <div>${a.postal} • ${a.city} • ${a.country || "NL"}</div>
        </div>
      `;
      list.appendChild(el);
    }

    list.querySelectorAll("[data-edit]").forEach(b=>{
      b.addEventListener("click", ()=> startEdit(b.getAttribute("data-edit"), addrs));
    });
    list.querySelectorAll("[data-del]").forEach(b=>{
      b.addEventListener("click", async ()=>{
        const id = b.getAttribute("data-del");
        if(!confirm("Delete this address?")) return;
        try{
          await window.SIB_AUTH.deleteAddress(id);
          toast("Address deleted");
          await loadAddresses();
        }catch(err){ toast(err.message||"Delete failed"); }
      });
    });
  }

  function startEdit(id, addrs){
    const form = $("#addressForm");
    if(!form) return;
    const a = (addrs||[]).find(x=>x.id===id);
    if(!a) return;
    editingAddressId = id;
    form.classList.remove("is-hidden");
    form.elements.id.value = a.id;
    form.elements.label.value = a.label || "";
    form.elements.country.value = a.country || "NL";
    form.elements.line1.value = a.line1 || "";
    form.elements.line2.value = a.line2 || "";
    form.elements.postal.value = a.postal || "";
    form.elements.city.value = a.city || "";
    form.elements.is_default.checked = !!a.is_default;
    form.scrollIntoView({behavior:"smooth", block:"start"});
  }

  function startNew(){
    const form = $("#addressForm");
    if(!form) return;
    editingAddressId = null;
    form.reset();
    form.elements.id.value = "";
    form.elements.country.value = "NL";
    form.classList.remove("is-hidden");
    form.scrollIntoView({behavior:"smooth", block:"start"});
  }

  async function loadAddresses(){
    const hint = $("#addressHint");
    if(hint) hint.textContent = "";
    try{
      const data = await window.SIB_AUTH.listAddresses();
      renderAddresses(data.addresses || []);
      return data.addresses || [];
    }catch(err){
      toast(err.message || "Could not load addresses");
      return [];
    }
  }

  async function initAddresses(){
    const btnAdd = $("#btnAddAddress");
    const btnCancel = $("#btnCancelAddress");
    const form = $("#addressForm");
    if(!form) return;
    btnAdd?.addEventListener("click", startNew);
    btnCancel?.addEventListener("click", ()=> form.classList.add("is-hidden"));

    let cache = await loadAddresses();

    form.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const hint = $("#addressHint");
      if(hint) hint.textContent = "";
      const payload = {
        id: String(form.elements.id.value||"").trim() || undefined,
        label: String(form.elements.label.value||"").trim(),
        country: String(form.elements.country.value||"").trim() || "NL",
        line1: String(form.elements.line1.value||"").trim(),
        line2: String(form.elements.line2.value||"").trim(),
        postal: String(form.elements.postal.value||"").trim(),
        city: String(form.elements.city.value||"").trim(),
        is_default: form.elements.is_default.checked ? 1 : 0
      };
      try{
        await window.SIB_AUTH.saveAddress(payload);
        toast("Address saved");
        form.classList.add("is-hidden");
        cache = await loadAddresses();
      }catch(err){
        if(hint) hint.textContent = err.message || "Save failed";
      }
    });

    // keep cache in sync after edits
    $("#addressList")?.addEventListener("click", async (e)=>{
      // no-op
    });
  }

  async function init(){
    // auth gate
    try{
      await window.SIB_AUTH.getMe();
    }catch{
      window.SIB_AUTH.requireAuth();
      return;
    }

    // tabs
    $$(".account-side .side-item").forEach(b=>{
      b.addEventListener("click", ()=> setTab(b.dataset.tab));
    });
    setTab(localStorage.getItem("sib_account_tab") || "orders");

    // sign out
    $("#btnSignOut")?.addEventListener("click", async ()=>{
      await window.SIB_AUTH.logout().catch(()=>{});
      toast("Signed out");
      location.href = "./index.html";
    });

    await loadProfile();
    await loadOrders();
    await initAddresses();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
