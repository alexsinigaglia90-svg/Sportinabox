export function json(data, status=200, headers={}){
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type":"application/json; charset=utf-8", ...headers }
  });
}

export function badRequest(msg="Bad request"){ return json({ error: msg }, 400); }
export function unauthorized(msg="Unauthorized"){ return json({ error: msg }, 401, { "WWW-Authenticate": "Bearer" }); }
export function notFound(msg="Not found"){ return json({ error: msg }, 404); }

export function getCookie(req, name){
  const raw = req.headers.get("Cookie") || "";
  const m = raw.match(new RegExp("(^|;\s*)"+name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g,"\\$&")+"=([^;]*)"));
  return m ? decodeURIComponent(m[2]) : null;
}

export function setCookie(name, value, opts={}){
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if(opts.maxAge!=null) parts.push(`Max-Age=${opts.maxAge}`);
  if(opts.path) parts.push(`Path=${opts.path}`); else parts.push("Path=/");
  if(opts.httpOnly) parts.push("HttpOnly");
  if(opts.secure) parts.push("Secure");
  if(opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join("; ");
}

export function nowISO(){ return new Date().toISOString(); }

export function uid(){
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  const hex = [...a].map(b=>b.toString(16).padStart(2,"0")).join("");
  return hex;
}

function b64url(bytes){
  const s = btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  return s;
}
function fromB64url(str){
  str = str.replace(/-/g,"+").replace(/_/g,"/");
  while(str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  return bytes;
}

export async function jwtSign(payload, secret){
  const header = { alg:"HS256", typ:"JWT" };
  const enc = new TextEncoder();
  const h = b64url(enc.encode(JSON.stringify(header)));
  const p = b64url(enc.encode(JSON.stringify(payload)));
  const data = enc.encode(h+"."+p);
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  return `${h}.${p}.${b64url(sig)}`;
}

export async function jwtVerify(token, secret){
  const parts = String(token||"").split(".");
  if(parts.length!==3) return null;
  const [h,p,s] = parts;
  const enc = new TextEncoder();
  const data = enc.encode(h+"."+p);
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("HMAC", key, fromB64url(s), data);
  if(!ok) return null;
  const payload = JSON.parse(new TextDecoder().decode(fromB64url(p)));
  const now = Math.floor(Date.now()/1000);
  if(payload.exp && now>payload.exp) return null;
  return payload;
}

export async function pbkdf2Hash(password, saltB64){
  const enc = new TextEncoder();
  const salt = saltB64 ? fromB64url(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", salt, iterations: 120000, hash:"SHA-256" }, keyMaterial, 256);
  const hash = new Uint8Array(bits);
  return { salt: b64url(salt), hash: b64url(hash) };
}
