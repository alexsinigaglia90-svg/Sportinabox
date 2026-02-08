// js/contact.js — Premium contact page (WhatsApp + D1-backed form)

const API_BASE = "https://sportinabox-api.alex-sinigaglia90.workers.dev";

// Zet hier je WhatsApp nummer in international format, zonder + of spaties.
// Voorbeeld NL mobiel: 31612345678
const WHATSAPP_NUMBER = "31638383737";

function toast(text = "Done") {
  const el = document.getElementById("globalToast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("is-visible");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => el.classList.remove("is-visible"), 1400);
}

function buildWaLink(prefill) {
  const msg = encodeURIComponent(prefill || "Hi! Ik heb een vraag over Sport in a Box.");
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
}

function setWaLinks() {
  const prefill = "Hi! Ik heb een vraag over Sport in a Box.";
  const link = buildWaLink(prefill);

  const top = document.getElementById("cpWhatsAppTop");
  const side = document.getElementById("cpWhatsAppSide");
  const float = document.getElementById("waFloat");
  const btn = document.getElementById("waBtn");

  if (top) top.href = link;
  if (side) side.href = link;
  if (float) float.href = link;

  if (btn) {
    btn.addEventListener("click", () => {
      window.open(link, "_blank", "noopener");
    });
  }
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function setStatus(msg, type = "info") {
  const el = document.getElementById("formStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.dataset.type = type;
}

async function submitContact(payload) {
  const r = await fetch(`${API_BASE}/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data && data.error ? data.error : "Submit failed";
    throw new Error(msg);
  }
  return data;
}

function initCounter() {
  const ta = document.getElementById("message");
  const c = document.getElementById("msgCount");
  if (!ta || !c) return;
  const update = () => { c.textContent = String(ta.value.length); };
  ta.addEventListener("input", update);
  update();
}

function initForm() {
  const form = document.getElementById("contactFormEl");
  const btn = document.getElementById("sendBtn");
  if (!form || !btn) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const company = (document.getElementById("company")?.value || "").trim();
    if (company) {
      // Honeypot triggered
      toast("Thanks!");
      form.reset();
      return;
    }

    const name = (document.getElementById("name")?.value || "").trim();
    const email = (document.getElementById("email")?.value || "").trim();
    const phone = (document.getElementById("phone")?.value || "").trim();
    const topic = (document.getElementById("topic")?.value || "").trim();
    const message = (document.getElementById("message")?.value || "").trim();

    if (name.length < 2) return setStatus("Vul een geldige naam in.", "error");
    if (!validateEmail(email)) return setStatus("Vul een geldig e-mailadres in.", "error");
    if (!topic) return setStatus("Kies een onderwerp.", "error");
    if (message.length < 10) return setStatus("Je bericht is te kort (min. 10 tekens).", "error");

    // Premium WhatsApp prefill includes topic + first line
    const waPrefill = `Hi! Onderwerp: ${topic}. Naam: ${name}. ${message.slice(0, 160)}`;
    const waLink = buildWaLink(waPrefill);

    setStatus("");
    btn.disabled = true;
    btn.textContent = "Versturen…";

    try {
      await submitContact({ name, email, phone, topic, message, page: window.location.href });

      toast("Bericht verstuurd");
      setStatus("Ontvangen. We reageren zo snel mogelijk.", "ok");

      // Optional: also update WhatsApp links to include this message after submit
      const float = document.getElementById("waFloat");
      if (float) float.href = waLink;

      form.reset();
      initCounter(); // reset counter
    } catch (err) {
      setStatus(String(err.message || "Er ging iets mis."), "error");
      toast("Versturen mislukt");
    } finally {
      btn.disabled = false;
      btn.textContent = "Verstuur bericht";
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setWaLinks();
  initCounter();
  initForm();
});
