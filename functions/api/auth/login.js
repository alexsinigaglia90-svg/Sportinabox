import { json, badRequest, unauthorized, setCookie, pbkdf2Hash, jwtSign } from "../_util.js";

export async function onRequestPost({ request, env }){
  if(!env.DB) return json({ error: "DB binding missing (D1)" }, 500);
  const body = await request.json().catch(()=>null);
  if(!body) return badRequest("Invalid JSON");
  const email = String(body.email||"").trim().toLowerCase();
  const password = String(body.password||"");
  if(!email || !password) return badRequest("Email + password required");

  const user = await env.DB.prepare("SELECT id, email, name, phone, password_hash, salt FROM users WHERE email = ?").bind(email).first();
  if(!user) return unauthorized("Invalid credentials");

  const { hash } = await pbkdf2Hash(password, user.salt);
  if(hash !== user.password_hash) return unauthorized("Invalid credentials");

  const exp = Math.floor(Date.now()/1000) + 60*60*24*14;
  const token = await jwtSign({ sub:user.id, email:user.email, exp }, env.AUTH_SECRET);
  const cookie = setCookie("sib_token", token, { httpOnly:true, secure:true, sameSite:"Lax", path:"/", maxAge: 60*60*24*14 });

  return json({ ok:true, user:{ id:user.id, email:user.email, name:user.name, phone:user.phone } }, 200, { "Set-Cookie": cookie });
}
