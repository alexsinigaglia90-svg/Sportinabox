import { json, unauthorized, badRequest, getCookie, jwtVerify } from "./_util.js";

async function auth(request, env){
  const token = getCookie(request, "sib_token");
  const payload = await jwtVerify(token, env.AUTH_SECRET);
  if(!payload?.sub) return null;
  const user = await env.DB.prepare("SELECT id, email, name, phone, created_at FROM users WHERE id = ?").bind(payload.sub).first();
  return user || null;
}

export async function onRequestGet({ request, env }){
  if(!env.DB) return json({ error: "DB binding missing (D1)" }, 500);
  const user = await auth(request, env);
  if(!user) return unauthorized();
  return json({ ok:true, user });
}

export async function onRequestPut({ request, env }){
  if(!env.DB) return json({ error: "DB binding missing (D1)" }, 500);
  const user = await auth(request, env);
  if(!user) return unauthorized();

  const body = await request.json().catch(()=>null);
  if(!body) return badRequest("Invalid JSON");

  const name = String(body.name||"").trim().slice(0,120);
  const phone = String(body.phone||"").trim().slice(0,40);

  await env.DB.prepare("UPDATE users SET name = ?, phone = ? WHERE id = ?").bind(name, phone, user.id).run();
  const updated = await env.DB.prepare("SELECT id, email, name, phone, created_at FROM users WHERE id = ?").bind(user.id).first();
  return json({ ok:true, user: updated });
}
