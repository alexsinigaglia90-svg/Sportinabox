import { json, badRequest, setCookie, uid, nowISO, pbkdf2Hash, jwtSign } from "../_util.js";

export async function onRequestPost({ request, env }){
  if(!env.DB) return json({ error: "DB binding missing (D1)" }, 500);
  const body = await request.json().catch(()=>null);
  if(!body) return badRequest("Invalid JSON");
  const email = String(body.email||"").trim().toLowerCase();
  const password = String(body.password||"");
  const name = String(body.name||"").trim();
  if(!email || !password || password.length < 8) return badRequest("Email + password (min 8 chars) required");

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if(existing) return json({ error: "Email already in use" }, 409);

  const { salt, hash } = await pbkdf2Hash(password);
  const id = uid();
  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, salt, name, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, email, hash, salt, name, "", nowISO()).run();

  const exp = Math.floor(Date.now()/1000) + 60*60*24*14; // 14 days
  const token = await jwtSign({ sub:id, email, exp }, env.AUTH_SECRET);
  const cookie = setCookie("sib_token", token, { httpOnly:true, secure:true, sameSite:"Lax", path:"/", maxAge: 60*60*24*14 });

  return json({ ok:true, user:{ id, email, name, phone:"" } }, 200, { "Set-Cookie": cookie });
}
