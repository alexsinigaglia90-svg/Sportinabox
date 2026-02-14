// js/auth-client.js — minimal auth client for Pages Functions (/api/*)
(function(){
  const API = "/api";
  function qs(){
    const u = new URL(location.href);
    return u.searchParams;
  }

  async function api(path, opts={}){
    const r = await fetch(API + path, {
      ...opts,
      headers: {
        "Accept": "application/json",
        ...(opts.body ? {"Content-Type":"application/json"} : {}),
        ...(opts.headers||{})
      },
      credentials: "include"
    });
    let data = null;
    try{ data = await r.json(); } catch {}
    if(!r.ok){
      const msg = (data && (data.error || data.message)) || `Request failed (${r.status})`;
      const err = new Error(msg);
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function getMe(){
    return api("/me", { method:"GET" });
  }

  async function login(email, password){
    return api("/auth/login", { method:"POST", body: JSON.stringify({ email, password }) });
  }

  async function register(name, email, password){
    return api("/auth/register", { method:"POST", body: JSON.stringify({ name, email, password }) });
  }

  async function logout(){
    return api("/auth/logout", { method:"POST" });
  }

  async function updateProfile(patch){
    return api("/me", { method:"PUT", body: JSON.stringify(patch) });
  }

  async function listAddresses(){
    return api("/me/addresses", { method:"GET" });
  }

  async function saveAddress(addr){
    return api("/me/addresses", { method:"POST", body: JSON.stringify(addr) });
  }

  async function deleteAddress(id){
    return api(`/me/addresses?id=${encodeURIComponent(id)}`, { method:"DELETE" });
  }

  async function listOrders(){
    return api("/orders", { method:"GET" });
  }

  async function createOrder(payload){
    return api("/orders", { method:"POST", body: JSON.stringify(payload) });
  }

  function requireAuth(){
    const returnTo = encodeURIComponent(location.pathname + location.search + location.hash);
    location.href = `./login.html?returnTo=${returnTo}`;
  }

  window.SIB_AUTH = { api, getMe, login, register, logout, updateProfile, listAddresses, saveAddress, deleteAddress, listOrders, createOrder, requireAuth, qs };
})();
