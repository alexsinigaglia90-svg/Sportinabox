(() => {
  const CART_KEY = "sib_cart_v1";

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

  function update() {
    const badge = document.getElementById("cartBadge");
    if (!badge) return;

    const cart = readCart();
    const qty = cart.items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);

    if (qty > 0) {
      badge.textContent = String(qty);
      badge.style.display = "inline-flex";
      badge.setAttribute("aria-hidden", "false");
    } else {
      badge.textContent = "";
      badge.style.display = "none";
      badge.setAttribute("aria-hidden", "true");
    }
  }

  document.addEventListener("DOMContentLoaded", update);

  // Optioneel: als meerdere tabs open staan
  window.addEventListener("storage", (e) => {
    if (e.key === CART_KEY) update();
  });
})();
