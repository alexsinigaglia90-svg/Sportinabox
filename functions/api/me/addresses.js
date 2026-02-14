import { json, unauthorized, badRequest, getCookie, jwtVerify, uid, nowISO } from "../_util.js";

async function auth(request, env){
  const token = getCookie(request, "sib_token");
  const payload = await jwtVerify(token, env.AUTH_SECRET);
  if(!payload?.sub) return null;
  return payload.sub;
}

export async function onRequestGet({ request, env }){
  if(!env.DB) return json({ error: "DB binding missing (D1)" }, 500);
  const userId = await auth(request, env);
  if(!userId) return unauthorized();
  const rows = await env.DB.prepare(
    "SELECT id, user_id, label, line1, line2, postal, city, country, is_default, updated_at FROM addresses WHERE user_id = ? ORDER BY is_default DESC, updated_at DESC"
  ).bind(userId).all();
  return json({ ok:true, addresses: rows.results || [] });
}

export async function onRequestPost({ request, env }){
  if(!env.DB) return json({ error: "DB binding missing (D1)" }, 500);
  const userId = await auth(request, env);
  if(!userId) return unauthorized();
  const body = await request.json().catch(()=>null);
  if(!body) return badRequest("Invalid JSON");

  const id = (body.id && String(body.id)) || uid();
  const label = String(body.label||"").trim().slice(0,60);
  const country = String(body.country||"NL").trim().slice(0,2).toUpperCase() || "NL";
  const line1 = String(body.line1||"").trim().slice(0,160);
  const line2 = String(body.line2||"").trim().slice(0,160);
  const postal = String(body.postal||"").trim().slice(0,20);
  const city = String(body.city||"").trim().slice(0,80);
  const is_default = body.is_default ? 1 : 0;

  if(!line1 || !postal || !city) return badRequest("Address line 1, postal and city are required");

  // if default, unset others
  if(is_default){
    await env.DB.prepare("UPDATE addresses SET is_default = 0 WHERE user_id = ?").bind(userId).run();
  }

  const exists = await env.DB.prepare("SELECT id FROM addresses WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if(exists){
    await env.DB.prepare(
      "UPDATE addresses SET label=?, line1=?, line2=?, postal=?, city=?, country=?, is_default=?, updated_at=? WHERE id=? AND user_id=?"
    ).bind(label, line1, line2, postal, city, country, is_default, nowISO(), id, userId).run();
  }else{
    await env.DB.prepare(
      "INSERT INTO addresses (id, user_id, label, line1, line2, postal, city, country, is_default, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, userId, label, line1, line2, postal, city, country, is_default, nowISO()).run();
  }

  const rows = await env.DB.prepare(
    "SELECT id, user_id, label, line1, line2, postal, city, country, is_default, updated_at FROM addresses WHERE user_id = ? ORDER BY is_default DESC, updated_at DESC"
  ).bind(userId).all();

  return json({ ok:true, addresses: rows.results || [] });
}

export async function onRequestDelete({ request, env }){
  if(!env.DB) return json({ error: "DB binding missing (D1)" }, 500);
  const userId = await auth(request, env);
  if(!userId) return unauthorized();

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if(!id) return badRequest("id required");

  await env.DB.prepare("DELETE FROM addresses WHERE id = ? AND user_id = ?").bind(id, userId).run();
  const rows = await env.DB.prepare(
    "SELECT id, user_id, label, line1, line2, postal, city, country, is_default, updated_at FROM addresses WHERE user_id = ? ORDER BY is_default DESC, updated_at DESC"
  ).bind(userId).all();
  return json({ ok:true, addresses: rows.results || [] });
}
