// js/auth-ui.js — UI helpers for auth pages + nav
(function(){
  const $ = (q)=>document.querySelector(q);
  const $$ = (q)=>Array.from(document.querySelectorAll(q));

  function toast(text){
    const el = document.getElementById("globalToast");
    if(!el) return;
    el.textContent = text;
    el.classList.add("is-visible");
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>el.classList.remove("is-visible"), 1300);
  }

  async function updateNav(){
    const link = document.querySelector("[data-auth-link]");
    if(!link) return;
    try{
      const me = await window.SIB_AUTH.getMe();
      link.textContent = "Account";
      link.href = "./account.html";
      link.classList.toggle("nav__link--active", location.pathname.endsWith("account.html"));
      // optional: show small dot? keep simple
      return me;
    }catch{
      link.textContent = "Sign in";
      link.href = "./login.html";
      return null;
    }
  }

  async function initLoginPage(){
    const formLogin = document.getElementById("formLogin");
    const formRegister = document.getElementById("formRegister");
    if(!formLogin || !formRegister) return;

    // If already logged in → go to account
    try{
      await window.SIB_AUTH.getMe();
      location.href = "./account.html";
      return;
    }catch{}

    const tabLogin = document.getElementById("tabLogin");
    const tabRegister = document.getElementById("tabRegister");

    function show(which){
      const isLogin = which === "login";
      tabLogin?.classList.toggle("is-active", isLogin);
      tabRegister?.classList.toggle("is-active", !isLogin);
      formLogin.classList.toggle("is-hidden", !isLogin);
      formRegister.classList.toggle("is-hidden", isLogin);
      const lead = document.getElementById("authLead");
      if(lead) lead.textContent = isLogin ? "Log in om je orders te bekijken." : "Maak een account aan om je bestellingen en adressen te beheren.";
    }

    tabLogin?.addEventListener("click", ()=>show("login"));
    tabRegister?.addEventListener("click", ()=>show("register"));

    const returnTo = window.SIB_AUTH.qs().get("returnTo") || "./account.html";

    formLogin.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const hint = document.getElementById("loginHint");
      if(hint) hint.textContent = "";
      const fd = new FormData(formLogin);
      const email = String(fd.get("email")||"").trim();
      const password = String(fd.get("password")||"");
      try{
        await window.SIB_AUTH.login(email, password);
        toast("Signed in");
        location.href = returnTo;
      }catch(err){
        if(hint) hint.textContent = err.message || "Login failed";
      }
    });

    formRegister.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const hint = document.getElementById("registerHint");
      if(hint) hint.textContent = "";
      const fd = new FormData(formRegister);
      const name = String(fd.get("name")||"").trim();
      const email = String(fd.get("email")||"").trim();
      const password = String(fd.get("password")||"");
      const password2 = String(fd.get("password2")||"");
      if(password !== password2){
        if(hint) hint.textContent = "Passwords do not match";
        return;
      }
      try{
        await window.SIB_AUTH.register(name, email, password);
        toast("Account created");
        location.href = returnTo;
      }catch(err){
        if(hint) hint.textContent = err.message || "Registration failed";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    updateNav();
    initLoginPage();
  });

  window.SIB_AUTH_UI = { toast, updateNav };
})();
