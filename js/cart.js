(() => {
  const CART_KEY = "sib_cart_v1";

  const $ = (id) => document.getElementById(id);

  const elEmpty = $("emptyState");
  const elLayout = $("cartLayout");
  const elItems = $("cartItems");
  const elSubtotal = $("subtotal");
  const elTotal = $("total");
  const elMeta = $("cartMeta");
  const elBadge = $("cartBadge");

  const btnClear = $("clearCart");
  const btnCheckout = $("checkoutBtn");

  function euro(cents, currency = "EUR") {
    const n = (Number(cents || 0) / 100);
    try {
      return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(n);
    } catch {
      return `${n.toFixed(2)} ${currency}`;
    }
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
  }

  function toast(text) {
    const el = $("globalToast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("is-visible");
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => el.classList.remove("is-visible"), 1200);
  }

  function updateBadge(cart) {
    if (!elBadge) return;
    const qty = cart.items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    if (qty > 0) {
      elBadge.textContent = String(qty);
      elBadge.style.display = "inline-flex";
      elBadge.setAttribute("aria-hidden", "false");
    } else {
      elBadge.textContent = "";
      elBadge.style.display = "none";
      elBadge.setAttribute("aria-hidden", "true");
    }
  }

  function totals(cart) {
    let sum = 0;
    let currency = "EUR";
    for (const it of cart.items) {
      currency = it.currency || currency;
      sum += (Number(it.price_cents) || 0) * (Number(it.qty) || 0);
    }
    return { sum, currency };
  }

  function render() {
    const cart = readCart();
    updateBadge(cart);

    const qtyTotal = cart.items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    elMeta.textContent = qtyTotal ? `${qtyTotal} item(s)` : "0 items";

    if (!cart.items.length) {
      elItems.innerHTML = "";
      elSubtotal.textContent = "—";
      elTotal.textContent = "—";
      elEmpty.classList.remove("state--hidden");
      elLayout.classList.add("state--hidden");
      return;
    }

    elEmpty.classList.add("state--hidden");
    elLayout.classList.remove("state--hidden");

    // Render rows
    elItems.innerHTML = cart.items.map((it) => {
      const img = it.image ? String(it.image) : "";
      const name = it.name ? String(it.name) : "Product";
      const price = euro(it.price_cents, it.currency || "EUR");
      const line = euro((Number(it.price_cents) || 0) * (Number(it.qty) || 0), it.currency || "EUR");

      return `
        <article class="cart-item" data-id="${it.id}">
          <div class="cart-item__media">
            ${img ? `<img src="${img}" alt="" loading="lazy" />` : `<div class="media-fallback">Sportinabox</div>`}
          </div>

          <div class="cart-item__main">
            <div class="cart-item__top">
              <div class="cart-item__name">${name}</div>
              <button class="icon-btn" type="button" data-remove="${it.id}" aria-label="Remove">✕</button>
            </div>

            <div class="cart-item__meta">
              <span class="muted">${price}</span>
            </div>

            <div class="cart-item__bottom">
              <div class="qty">
                <button class="qty__btn" type="button" data-dec="${it.id}" aria-label="Decrease">–</button>
                <div class="qty__val">${Number(it.qty) || 1}</div>
                <button class="qty__btn" type="button" data-inc="${it.id}" aria-label="Increase">+</button>
              </div>

              <div class="cart-item__line">${line}</div>
            </div>
          </div>
        </article>
      `;
    }).join("");

    const { sum, currency } = totals(cart);
    elSubtotal.textContent = euro(sum, currency);
    elTotal.textContent = euro(sum, currency);
  }

  function mutate(fn) {
    const cart = readCart();
    fn(cart);
    // Clean: remove zero qty
    cart.items = cart.items.filter((it) => (Number(it.qty) || 0) > 0);
    writeCart(cart);
    render();
  }

  function bindEvents() {
    elItems.addEventListener("click", (e) => {
      const inc = e.target.closest("[data-inc]");
      const dec = e.target.closest("[data-dec]");
      const rem = e.target.closest("[data-remove]");

      if (inc) {
        const id = String(inc.getAttribute("data-inc"));
        mutate((cart) => {
          const it = cart.items.find((x) => String(x.id) === id);
          if (it) it.qty = (Number(it.qty) || 0) + 1;
        });
        toast("Quantity updated");
      }

      if (dec) {
        const id = String(dec.getAttribute("data-dec"));
        mutate((cart) => {
          const it = cart.items.find((x) => String(x.id) === id);
          if (it) it.qty = Math.max(0, (Number(it.qty) || 0) - 1);
        });
        toast("Quantity updated");
      }

      if (rem) {
        const id = String(rem.getAttribute("data-remove"));
        mutate((cart) => {
          cart.items = cart.items.filter((x) => String(x.id) !== id);
        });
        toast("Removed");
      }
    });

    btnClear?.addEventListener("click", () => {
      localStorage.removeItem(CART_KEY);
      render();
      toast("Cart cleared");
    });

    btnCheckout?.addEventListener("click", async () => {
      try {
        // require login
        const me = await window.SIB_AUTH.getMe();
        const cart = readCart();
        if (!cart.items.length) return;

        // choose default address if exists
        const addrData = await window.SIB_AUTH.listAddresses().catch(() => ({ addresses: [] }));
        const addresses = addrData.addresses || [];
        const def = addresses.find(a => a.is_default) || addresses[0];
        if (!def) {
          toast("Voeg eerst een adres toe in je account");
          location.href = "./account.html#addresses";
          return;
        }

        const subtotal = cart.items.reduce((s, it) => s + (Number(it.price_cents)||0) * (Number(it.qty)||0), 0);
        const shipping = 0;
        const payload = {
          currency: "EUR",
          items: cart.items.map(it => ({
            product_id: it.id,
            title: it.name,
            price_cents: Number(it.price_cents)||0,
            qty: Number(it.qty)||0,
            image_url: it.image || ""
          })),
          totals: { subtotal_cents: subtotal, shipping_cents: shipping, total_cents: subtotal + shipping },
          shipping_address_id: def.id
        };

        await window.SIB_AUTH.createOrder(payload);
        localStorage.removeItem(CART_KEY);
        toast("Order geplaatst");
        location.href = "./account.html";
      } catch (err) {
        if (err && err.status === 401) {
          const returnTo = encodeURIComponent("./cart.html");
          location.href = `./login.html?returnTo=${returnTo}`;
          return;
        }
        toast(err.message || "Checkout failed");
      }
    });
  }

  function init() {
    bindEvents();
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
