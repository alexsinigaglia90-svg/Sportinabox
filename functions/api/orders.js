import { json, unauthorized, badRequest, getCookie, jwtVerify, uid, nowISO } from "./_util.js";

async function authUserId(request, env){
  const token = getCookie(request, "sib_token");
  const payload = await jwtVerify(token, env.AUTH_SECRET);
  return payload?.sub || null;
}

export async function onRequestGet({ request, env }){
  if(!env.DB) return json({ error: "DB binding missing (D1)" }, 500);
  const userId = await authUserId(request, env);
  if(!userId) return unauthorized();

  const orders = await env.DB.prepare(
    "SELECT id, user_id, status, currency, subtotal_cents, shipping_cents, total_cents, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
  ).bind(userId).all();

  const out = [];
  for(const o of (orders.results||[])){
    const items = await env.DB.prepare(
      "SELECT product_id, title, price_cents, qty, image_url FROM order_items WHERE order_id = ?"
    ).bind(o.id).all();
    out.push({ ...o, items: items.results || [] });
  }

  return json({ ok:true, orders: out });
}

export async function onRequestPost({ request, env }){
  if(!env.DB) return json({ error: "DB binding missing (D1)" }, 500);
  const userId = await authUserId(request, env);
  if(!userId) return unauthorized();

  const body = await request.json().catch(()=>null);
  if(!body) return badRequest("Invalid JSON");

  const items = Array.isArray(body.items) ? body.items : [];
  if(items.length === 0) return badRequest("items required");

  const currency = String(body.currency||"EUR").toUpperCase();
  const totals = body.totals || {};
  const subtotal_cents = Number(totals.subtotal_cents||0);
  const shipping_cents = Number(totals.shipping_cents||0);
  const total_cents = Number(totals.total_cents|| (subtotal_cents + shipping_cents));
  const shipping_address_id = String(body.shipping_address_id||"").trim();
  if(!shipping_address_id) return badRequest("shipping_address_id required");

  // verify address belongs to user
  const addr = await env.DB.prepare("SELECT id FROM addresses WHERE id = ? AND user_id = ?").bind(shipping_address_id, userId).first();
  if(!addr) return badRequest("Invalid address");

  const id = uid();
  await env.DB.prepare(
    "INSERT INTO orders (id, user_id, status, currency, subtotal_cents, shipping_cents, total_cents, shipping_address_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, userId, "placed", currency, subtotal_cents, shipping_cents, total_cents, shipping_address_id, nowISO()).run();

  const stmt = env.DB.prepare("INSERT INTO order_items (id, order_id, product_id, title, price_cents, qty, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for(const it of items){
    const iid = uid();
    const product_id = String(it.product_id||"").slice(0,80);
    const title = String(it.title||"").slice(0,200);
    const price_cents = Number(it.price_cents||0);
    const qty = Number(it.qty||0);
    const image_url = String(it.image_url||"").slice(0,500);
    if(!title || qty<=0) continue;
    await stmt.bind(iid, id, product_id, title, price_cents, qty, image_url).run();
  }

  return json({ ok:true, order_id: id });
}
